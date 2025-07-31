// src/client/cli.rs

use crate::client::network::{NetworkClient, RemoteTask};
use crate::error::{AppError, Result};
use crate::common::protocol::{format_chat_log, parse_chat_file};
use crate::common::types::ChatLog;
use crate::common::crypto::KeyPair;

use crate::ClientCommands;
use std::fs;
use std::pin::Pin;
use std::future::Future;
use std::path::Path; // Add this import
use tokio::net::TcpStream;
use uuid::Uuid;

// FIX: Make the constant public so other modules in the crate can see it.
pub const SERVER_ADDR: &str = "127.0.0.1:9501";

// Helper to sanitize a title into a valid filename
fn sanitize_filename(title: &str) -> String {
    title.chars()
        .filter(|c| c.is_alphanumeric() || *c == ' ' || *c == '-')
        .collect::<String>()
        .replace(' ', "_")
        + ".txt"
}

// Add BoxFuture type alias
type BoxFuture<'a, T> = Pin<Box<dyn Future<Output = T> + Send + 'a>>;

// Modify connect_and_run to use boxed futures
async fn connect_and_run<T>(cmd: impl for<'a> FnOnce(&'a mut NetworkClient<TcpStream>) -> BoxFuture<'a, Result<T>>) -> Result<T> {
    let username = "testuser";
    // Point to the key inside the data/ directory
    let private_key_path = "data/user.key"; 
    let mut client = NetworkClient::connect(SERVER_ADDR, username, private_key_path).await?;
    cmd(&mut client).await
}

// Main dispatcher function for all client commands
pub async fn handle_client_command(command: ClientCommands) -> Result<()> {
    match command {
        ClientCommands::CreateUserKey => {
            // FIX: Ensure data directory exists
            let data_dir = Path::new("data");
            fs::create_dir_all(data_dir)?;

            // FIX: Define key file paths inside the data directory
            let private_key_file = data_dir.join("user.key");
            let public_key_file = data_dir.join("user.pub");
            
            let keypair = KeyPair::new();

            fs::write(&private_key_file, keypair.private_key_to_bs58())?;
            fs::write(&public_key_file, keypair.public_key_to_bs58())?;
            
            println!("Successfully generated user keys in 'data/' directory:");
            println!("- Private Key (DO NOT SHARE): {}", private_key_file.display());
            println!("- Public Key (Share with admin): {}", public_key_file.display());
            println!("\nYour public key is:\n{}", keypair.public_key_to_bs58());
        }
        ClientCommands::New { title } => {
            let mut new_log = ChatLog::new(title.clone());
            new_log.interactions.push(crate::common::types::Interaction::User { content: "Your first prompt here.".to_string() });
            
            let content = format_chat_log(&new_log);
            let filename = sanitize_filename(&title);

            fs::write(&filename, content)?;
            println!("Successfully created new chat template: {}", filename);
        }
        ClientCommands::Tui => {
            return crate::client::tui::run().await;
        }
        // --- FIX: Implement all missing commands ---
        ClientCommands::Send { file_path } => {
            let content = fs::read_to_string(&file_path)?;
            
            // Optional: Parse locally to validate and get title for status message
            let chat_log = parse_chat_file(&content)?;
            println!("Sending chat '{}' from file '{}'...", chat_log.title, file_path);

            let uuid = connect_and_run(|client| {
                Box::pin(async move {
                    client.execute_chat(&content).await
                })
            }).await?;
            
            println!("Successfully sent task to server. Task UUID: {}", uuid);
        }
        ClientCommands::List => {
            let tasks = connect_and_run(|client| {
                Box::pin(async move {
                    client.list_tasks().await
                })
            }).await?;
            
            if tasks.is_empty() {
                println!("No tasks found on server.");
            } else {
                println!("{:<38} {:<12} {}", "UUID", "Status", "Title");
                println!("{}", "-".repeat(80));
                for task in tasks {
                    println!("{:<38} {:<12} {}", task.uuid, task.status, task.title);
                }
            }
        }
        ClientCommands::Get { uuid } => {
            let uuid = Uuid::parse_str(&uuid).map_err(|_| AppError::ParseError("Invalid UUID format".into()))?;
            let content = connect_and_run(|client| {
                Box::pin(async move {
                    client.download_task(uuid).await
                })
            }).await?;
            
            let filename = format!("{}.txt", uuid);
            fs::write(&filename, &content)?;
            println!("Successfully downloaded task {} to file '{}'", uuid, filename);
            println!("\n--- Content ---\n{}", content);
        }
        ClientCommands::Delete { uuid } => {
            let uuid = Uuid::parse_str(&uuid).map_err(|_| AppError::ParseError("Invalid UUID format".into()))?;
            connect_and_run(|client| {
                Box::pin(async move {
                    client.delete_task(uuid).await
                })
            }).await?;
            println!("Successfully requested deletion of task {}", uuid);
        }
        ClientCommands::Resend { uuid } => {
            let uuid = Uuid::parse_str(&uuid).map_err(|_| AppError::ParseError("Invalid UUID format".into()))?;
            connect_and_run(|client| {
                Box::pin(async move {
                    client.resend_task(uuid).await
                })
            }).await?;
            println!("Successfully requested resend of task {}", uuid);
        }
    }
    Ok(())
}
