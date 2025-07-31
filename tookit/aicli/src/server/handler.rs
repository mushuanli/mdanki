// src/server/handler.rs

use crate::common::config::CONFIG;
use crate::common::protocol::{format_chat_log, parse_chat_file};
use crate::common::types::{ChatLog, Interaction, PacketType};
use crate::common::frame::{read_frame, encode_frame}; // <-- Import shared frame logic
use crate::common::crypto::verify_signature;
use crate::error::{AppError, Result};
use crate::server::db::Database;
use crate::server::worker::AiTask;
use rand::RngCore; // NEW
use serde_json::{json, from_slice}; // NEW
use std::net::SocketAddr;
use std::path::Path;
use std::sync::Arc;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;
use tokio::sync::mpsc;
use uuid::Uuid;
use std::fs;
use chrono::Utc; // FIX: Import Utc here

// ADDED: This new handler function for CmdExec
async fn handle_exec(
    stream: &mut TcpStream,
    db: &Database,
    task_sender: &mpsc::Sender<AiTask>,
    payload: &[u8],
    addr: &SocketAddr,
) -> Result<()> {
    // 1. Parse the chat log from the payload
    let content = String::from_utf8(payload.to_vec())
        .map_err(|_| AppError::ParseError("Invalid UTF-8 in chat log".into()))?;
    let chat_log = parse_chat_file(&content)?;
    
    // 2. Save the file to disk
    let file_path = Path::new(&CONFIG.storage.chat_dir)
        .join(format!("{}.txt", chat_log.uuid));
    fs::write(&file_path, &content)?;
    log::info!("Saved chat file for task {} to {:?}", chat_log.uuid, file_path);

    // 3. Create a record in the database
    db.create_chat_log(&chat_log, &addr.ip().to_string()).await?;

    // 4. Send the task to the worker queue
    task_sender.send(AiTask { uuid: chat_log.uuid, client_ip: addr.ip().to_string() }).await
        .map_err(|e| AppError::NetworkError(format!("Failed to queue task: {}", e)))?;

    // 5. Send ACK with the UUID back to the client
    let ack_frame = encode_frame(PacketType::Ack, chat_log.uuid.to_string().as_bytes());
    stream.write_all(&ack_frame).await?;
    
    Ok(())
}

pub async fn handle_connection(
    mut stream: TcpStream,
    addr: SocketAddr,
    db: Arc<Database>,
    task_sender: mpsc::Sender<AiTask>,
) -> Result<()> {
    // 1. Authenticate and get username
    let username = match authenticate(&mut stream, db.clone()).await {
        Ok(username) => username,
        Err(e) => {
            let error_frame = encode_frame(PacketType::Error, e.to_string().as_bytes());
            stream.write_all(&error_frame).await.ok(); // Best effort send
            return Err(e);
        }
    };
    log::info!("User '{}' from {} authenticated successfully.", username, addr);
    db.update_last_seen(&username).await?; // Update last seen time

    // 2. Command loop
    loop {
        // Read a frame from the client
        let frame = match read_frame(&mut stream).await {
            Ok(Some(frame)) => frame,
            Ok(None) => {
                log::info!("Client {} disconnected.", addr);
                return Ok(()); // Connection closed cleanly
            }
            Err(e) => return Err(e),
        };

        // REFACTOR: Handle all new TUI commands
        let result = match frame.packet_type {
            PacketType::CmdExec => handle_exec(&mut stream, &db, &task_sender, &frame.payload, &addr).await,
            PacketType::CmdList => handle_list(&mut stream, &db).await,
            PacketType::CmdGet => handle_get(&mut stream, &frame.payload).await,
            PacketType::CmdDelete => handle_delete(&mut stream, &db, &frame.payload).await,
            PacketType::CmdResend => handle_resend(&mut stream, &db, &task_sender, &frame.payload, &addr).await,
            _ => {
                let err_msg = format!("Unsupported command: {:?}", frame.packet_type);
                log::warn!("{}", err_msg);
                let err_frame = encode_frame(PacketType::Error, err_msg.as_bytes());
                stream.write_all(&err_frame).await?;
                Ok(())
            }
        };

        if let Err(e) = result {
            log::error!("Error processing command for {}: {}", addr, e);
            let err_frame = encode_frame(PacketType::Error, e.to_string().as_bytes());
            stream.write_all(&err_frame).await?;
        }
    }
}

// --- NEW HANDLER FUNCTIONS ---

async fn handle_list(stream: &mut TcpStream, db: &Database) -> Result<()> {
    let tasks = db.list_all_tasks().await?;
    let payload = serde_json::to_vec(&tasks)?;
    let frame = encode_frame(PacketType::ResponseList, &payload);
    stream.write_all(&frame).await?;
    Ok(())
}

async fn handle_get(stream: &mut TcpStream, payload: &[u8]) -> Result<()> {
    let uuid_str = String::from_utf8_lossy(payload);
    let file_path = Path::new(&CONFIG.storage.chat_dir).join(format!("{}.txt", uuid_str));
    let content = fs::read(file_path)?;
    let frame = encode_frame(PacketType::ResponseChatLog, &content);
    stream.write_all(&frame).await?;
    Ok(())
}

async fn handle_delete(stream: &mut TcpStream, db: &Database, payload: &[u8]) -> Result<()> {
    let uuid_str = String::from_utf8_lossy(payload);
    let uuid = Uuid::parse_str(&uuid_str)
        .map_err(|_| AppError::ParseError("Invalid UUID".into()))?;

    // Delete from DB first
    db.delete_task(&uuid).await?;
    
    // Then delete file
    let file_path = Path::new(&CONFIG.storage.chat_dir).join(format!("{}.txt", uuid_str));
    if file_path.exists() {
        fs::remove_file(file_path)?;
    }
    
    let frame = encode_frame(PacketType::Ack, &[]);
    stream.write_all(&frame).await?;
    Ok(())
}

async fn handle_resend(stream: &mut TcpStream, db: &Database, task_sender: &mpsc::Sender<AiTask>, payload: &[u8], addr: &SocketAddr) -> Result<()> {
    let uuid_str = String::from_utf8_lossy(payload);
    let uuid = Uuid::parse_str(&uuid_str).map_err(|_| AppError::ParseError("Invalid UUID".into()))?;

    // Update status to pending and clear error message
    db.update_status(&uuid, "pending", None).await?;
    
    // Add resend timestamp to the file
    let file_path = Path::new(&CONFIG.storage.chat_dir).join(format!("{}.txt", uuid_str));
    let mut content = fs::read_to_string(&file_path)?;
    content.push_str(&format!("::>resend_at: {}\n", Utc::now().to_rfc3339()));
    fs::write(&file_path, content)?;

    // Send to worker queue
    task_sender.send(AiTask { uuid, client_ip: addr.ip().to_string() }).await
        .map_err(|e| AppError::NetworkError(format!("Failed to queue task: {}", e)))?;

    let frame = encode_frame(PacketType::Ack, &[]);
    stream.write_all(&frame).await?;
    Ok(())
}

async fn authenticate(stream: &mut TcpStream, db: Arc<Database>) -> Result<String> {
    // 1. Read username from client
    let frame = read_frame(stream).await?
        .ok_or_else(|| AppError::AuthError("Client disconnected before auth".to_string()))?;

    if frame.packet_type != PacketType::CmdAuthRequest {
        return Err(AppError::AuthError("Expected auth request".to_string()));
    }

    let auth_req: serde_json::Value = from_slice(&frame.payload)?;
    let username = auth_req["username"].as_str()
        .ok_or_else(|| AppError::AuthError("Username not provided".to_string()))?
        .to_string();

    // 2. Get pubkey, generate challenge, send to client
    let pub_key = db.get_user_pubkey(&username).await?
        .ok_or_else(|| AppError::AuthError(format!("User '{}' not found", username)))?;
    
    let mut challenge = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut challenge);
    
    let challenge_payload = json!({ "challenge": bs58::encode(&challenge).into_string() }).to_string();
    let challenge_frame = encode_frame(PacketType::CmdAuthChallenge, challenge_payload.as_bytes());
    stream.write_all(&challenge_frame).await?;

    // 3. Read signature from client and verify
    let response_frame = read_frame(stream).await?
        .ok_or_else(|| AppError::AuthError("Client disconnected during challenge".to_string()))?;
    
    if response_frame.packet_type != PacketType::CmdAuthResponse {
        return Err(AppError::AuthError("Expected auth response".to_string()));
    }

    let auth_resp: serde_json::Value = from_slice(&response_frame.payload)?;
    let signature_bs58 = auth_resp["signature"].as_str()
        .ok_or_else(|| AppError::AuthError("Signature not provided".to_string()))?;
    
    let signature = bs58::decode(signature_bs58).into_vec()?;
    
    verify_signature(&pub_key, &challenge, &signature)?;

    // 4. Success! Send final ACK
    let ack_frame = encode_frame(PacketType::Ack, &[]);
    stream.write_all(&ack_frame).await?;

    Ok(username)
}

