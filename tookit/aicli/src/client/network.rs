// src/client/network.rs

use crate::common::config::CONFIG;
use crate::common::frame::{encode_frame, read_frame};
use crate::common::types::PacketType;
use crate::error::{AppError, Result};

use ed25519_dalek::{Signer, SigningKey, KEYPAIR_LENGTH, SECRET_KEY_LENGTH};
use serde_json::{json, from_slice};
use std::fs;
use std::str::FromStr;
use tokio::io::{AsyncRead, AsyncWrite, AsyncWriteExt};
use tokio::net::TcpStream;
use uuid::Uuid;

// REFACTOR: This is the data structure for a task as received from the server.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct RemoteTask {
    pub uuid: Uuid,
    pub title: String,
    pub status: String,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub error_message: Option<String>,
}

// The struct holds the communication stream.
pub struct NetworkClient<S: AsyncRead + AsyncWrite + Unpin> {
    stream: S,
}

// We implement methods on a generic stream so we can test with mock streams.
impl<S: AsyncRead + AsyncWrite + Unpin> NetworkClient<S> {
    pub fn new(stream: S) -> Self {
        Self { stream }
    }

    async fn send_and_receive(&mut self, req_type: PacketType, req_payload: &[u8], expected_resp_type: PacketType) -> Result<Vec<u8>> {
        let request_frame = encode_frame(req_type, req_payload);
        self.stream.write_all(&request_frame).await?;

        if let Some(response_frame) = read_frame(&mut self.stream).await? {
            if response_frame.packet_type == expected_resp_type {
                Ok(response_frame.payload)
            } else if response_frame.packet_type == PacketType::Error {
                let error_msg = String::from_utf8_lossy(&response_frame.payload).to_string();
                Err(AppError::NetworkError(format!("Server error: {}", error_msg)))
            } else {
                Err(AppError::NetworkError(format!(
                    "Unexpected response type. Expected {:?}, got {:?}",
                    expected_resp_type, response_frame.packet_type
                )))
            }
        } else {
            Err(AppError::NetworkError("Server disconnected unexpectedly".into()))
        }
    }

    // --- NEW NETWORK FUNCTIONS ---

    pub async fn list_tasks(&mut self) -> Result<Vec<RemoteTask>> {
        let payload = self.send_and_receive(PacketType::CmdList, &[], PacketType::ResponseList).await?;
        let tasks: Vec<RemoteTask> = serde_json::from_slice(&payload)?;
        Ok(tasks)
    }

    pub async fn download_task(&mut self, uuid: Uuid) -> Result<String> {
        let payload = self.send_and_receive(PacketType::CmdGet, uuid.to_string().as_bytes(), PacketType::ResponseChatLog).await?;
        Ok(String::from_utf8(payload).map_err(|e| AppError::ParseError(e.to_string()))?)
    }

    pub async fn delete_task(&mut self, uuid: Uuid) -> Result<()> {
        self.send_and_receive(PacketType::CmdDelete, uuid.to_string().as_bytes(), PacketType::Ack).await?;
        Ok(())
    }

    pub async fn resend_task(&mut self, uuid: Uuid) -> Result<()> {
        self.send_and_receive(PacketType::CmdResend, uuid.to_string().as_bytes(), PacketType::Ack).await?;
        Ok(())
    }

    /// Sends a chat file to the server for execution.
    pub async fn execute_chat(&mut self, chat_file_content: &str) -> Result<Uuid> {
        let payload = self
            .send_and_receive(
                PacketType::CmdExec,
                chat_file_content.as_bytes(),
                PacketType::Ack,
            )
            .await?;
        
        let uuid_str = String::from_utf8(payload)
            .map_err(|_| AppError::ParseError("Server sent invalid UUID".to_string()))?;
            
        Uuid::from_str(&uuid_str)
            .map_err(|_| AppError::ParseError("Failed to parse UUID from server".to_string()))
    }

    // --- We will implement list, get, delete here later ---
}

// This is the public-facing part that deals with concrete TcpStream.
impl NetworkClient<TcpStream> {
    pub async fn connect(server_addr: &str, username: &str, private_key_path: &str) -> Result<Self> {
        // 1. Load private key
        let private_key_bs58 = fs::read_to_string(private_key_path)?;
        
        // FIX (E0599): Use the correct bs58 method `with_check` to validate checksum and version byte.
        // The private key is encoded with version 0.
        let key_bytes_vec = bs58::decode(private_key_bs58.trim())
            .with_check(Some(0)) 
            .into_vec()
            .map_err(|e| AppError::AuthError(format!("Invalid private key format or checksum: {}", e)))?;
        
        // FIX: Safely convert Vec<u8> to [u8; 32] and handle potential length errors instead of using .unwrap().
        let key_array: [u8; SECRET_KEY_LENGTH] = key_bytes_vec.try_into()
            .map_err(|_| AppError::AuthError("Private key has incorrect length".to_string()))?;
            
        let signing_key = SigningKey::from_bytes(&key_array);
        
        // 2. Connect to server
        let mut stream = TcpStream::connect(server_addr).await?;
        log::info!("Connected to server at {}", server_addr);

        // 3. Send username
        let auth_req_payload = json!({ "username": username }).to_string();
        let auth_req_frame = encode_frame(PacketType::CmdAuthRequest, auth_req_payload.as_bytes());
        stream.write_all(&auth_req_frame).await?;

        // 4. Receive challenge
        let challenge_frame = read_frame(&mut stream).await?
            .ok_or_else(|| AppError::AuthError("Server disconnected before challenge".to_string()))?;
        if challenge_frame.packet_type != PacketType::CmdAuthChallenge {
            return Err(AppError::AuthError("Expected challenge from server".to_string()));
        }
        let challenge_val: serde_json::Value = from_slice(&challenge_frame.payload)?;
        let challenge_bs58 = challenge_val["challenge"].as_str().unwrap();
        let challenge = bs58::decode(challenge_bs58).into_vec()?;

        // 5. Sign challenge and send response
        let signature = signing_key.sign(&challenge);
        let auth_resp_payload = json!({ "signature": bs58::encode(signature.to_bytes()).into_string() }).to_string();
        let auth_resp_frame = encode_frame(PacketType::CmdAuthResponse, auth_resp_payload.as_bytes());
        stream.write_all(&auth_resp_frame).await?;

        // 6. Wait for final ACK
        if let Some(frame) = read_frame(&mut stream).await? {
            if frame.packet_type == PacketType::Ack {
                log::info!("Authentication successful for user '{}'.", username);
                Ok(Self { stream })
            } else { // Handle Error packet
                let error_msg = String::from_utf8_lossy(&frame.payload);
                Err(AppError::AuthError(format!("Server rejected auth: {}", error_msg)))
            }
        } else {
            Err(AppError::AuthError("Server disconnected during auth".into()))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::common::types::PacketType;
    use tokio::io::DuplexStream;

    // Helper to create a mock stream for testing.
    fn create_mock_stream() -> (DuplexStream, DuplexStream) {
        tokio::io::duplex(1024)
    }

    #[tokio::test]
    async fn test_execute_chat_flow() {
        let (client_end, mut server_end) = create_mock_stream();
        let mut client = NetworkClient { stream: client_end };

        let server_task = tokio::spawn(async move {
            // Server side: simulate receiving CmdExec and sending Ack
            let request = read_frame(&mut server_end).await.unwrap().unwrap();
            assert_eq!(request.packet_type, PacketType::CmdExec);
            assert_eq!(String::from_utf8_lossy(&request.payload), "test chat");

            let test_uuid = Uuid::new_v4();
            let response = encode_frame(PacketType::Ack, test_uuid.to_string().as_bytes());
            server_end.write_all(&response).await.unwrap();
            test_uuid
        });

        // Client side: call the method
        let returned_uuid = client.execute_chat("test chat").await.unwrap();
        
        // Assert
        let expected_uuid = server_task.await.unwrap();
        assert_eq!(returned_uuid, expected_uuid);
    }
}
