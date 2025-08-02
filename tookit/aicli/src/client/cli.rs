// src/client/cli.rs

// We need the new TlsClientStream type in this file's scope
use crate::client::network::{NetworkClient, TlsClientStream};
use crate::error::{AppError, Result};
use crate::common::crypto::KeyPair;

use crate::ClientCommands;
use crate::client::local_store::{LocalStore, SyncStatus}; // REMOVED: LocalSessionInfo (unused)

use std::fs;
use std::pin::Pin;
use std::future::Future;
use std::path::Path;
use uuid::Uuid;
use once_cell::sync::Lazy;

// NEW: Use Lazy static to read env vars once
pub static SERVER_ADDR: Lazy<String> = Lazy::new(|| {
    std::env::var("AICLI_SERVER_ADDR").unwrap_or_else(|_| "127.0.0.1:9501".to_string())
});
pub static CLIENT_USERNAME: Lazy<String> = Lazy::new(|| {
    std::env::var("AICLI_USERNAME").unwrap_or_else(|_| "admin".to_string())
});

// NEW constants for paths
pub const USER_PRIVATE_KEY_PATH: &str = "data/user.key";
pub const USER_PUBLIC_KEY_PATH: &str = "data/user.pub";
pub const CLIENT_DATA_DIR: &str = "data/client";
pub const CLIENT_INDEX_PATH: &str = "data/client/index.json";

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

// Modify connect_and_run to use the correct TlsClientStream type
async fn connect_and_run<T>(cmd: impl for<'a> FnOnce(&'a mut NetworkClient<TlsClientStream>) -> BoxFuture<'a, Result<T>>) -> Result<T> {
    let mut client = NetworkClient::connect(&SERVER_ADDR, &CLIENT_USERNAME, USER_PRIVATE_KEY_PATH).await?;
    cmd(&mut client).await
}

// Main dispatcher function for all client commands
pub async fn handle_client_command(command: ClientCommands) -> Result<()> {
    // Ensure client data directory exists for downloads
    fs::create_dir_all(CLIENT_DATA_DIR)?;

    match command {
        // MODIFIED: Init command logic
        ClientCommands::Init => {
            println!("Initializing client...");

            // 1. Create directories
            fs::create_dir_all(CLIENT_DATA_DIR)
                .map_err(|e| AppError::IoWithContext { context: format!("Failed to create directory '{}'", CLIENT_DATA_DIR), source: e })?;

            // 2. Create keys if they don't exist
            if Path::new(USER_PRIVATE_KEY_PATH).exists() {
                println!(" ✓ Key pair already exists at '{}'. Skipping generation.", USER_PRIVATE_KEY_PATH);
            } else {
                let keypair = KeyPair::new();
                fs::write(USER_PRIVATE_KEY_PATH, keypair.private_key_to_bs58())?;
                fs::write(USER_PUBLIC_KEY_PATH, keypair.public_key_to_bs58())?;
                println!(" ✓ Generated new key pair.");
                println!("   - Private Key: {}", USER_PRIVATE_KEY_PATH);
                println!("   - Public Key : {}", USER_PUBLIC_KEY_PATH);
                println!("   (Share the public key with the server admin)");
            }
            
            // 3. Create index file if it doesn't exist
            if !Path::new(CLIENT_INDEX_PATH).exists() {
                 fs::write(CLIENT_INDEX_PATH, "{}")?;
                 println!(" ✓ Created empty session index at '{}'.", CLIENT_INDEX_PATH);
            } else {
                 println!(" ✓ Session index already exists at '{}'.", CLIENT_INDEX_PATH);
            }

            println!("\nInitialization complete.");
        }
        ClientCommands::New { title } => {
            let mut store = LocalStore::load()?;
            let new_log = store.create_session(title)?;
            println!("Successfully created new local session.");
            println!("UUID: {}", new_log.uuid);
        }
        ClientCommands::Tui => {
            return crate::client::tui::run().await;
        }
        // MODIFIED: Send command now takes a UUID
        ClientCommands::Send { uuid } => {
            let uuid = Uuid::parse_str(&uuid).map_err(|_| AppError::ParseError("Invalid UUID format".into()))?;
            let mut store = LocalStore::load()?;
            
            let content = store.get_session_content(uuid)?;
            println!("Sending session '{}'...", uuid);

            connect_and_run(|client| {
                Box::pin(async move {
                    client.execute_chat(&content).await
                })
            }).await?;
            
            // Update local status after successful send
            store.update_session_status(uuid, SyncStatus::Synced, None)?;
            println!("Successfully sent session to server. Status updated to 'Synced'.");
        }
        // MODIFIED: List now shows local sessions
        ClientCommands::List => {
            let store = LocalStore::load()?;
            let sessions = store.list_sessions();
            
            if sessions.is_empty() {
                println!("No local sessions found. Use 'client new <title>' to create one.");
            } else {
                println!("{:<38} {:<10} {:<10} {}", "UUID", "Status", "Remote", "Title");
                println!("{}", "-".repeat(80));
                for s in sessions {
                    let remote_status = s.remote_status.as_deref().unwrap_or("-");
                    println!("{:<38} {:<10} {:<10} {}", s.uuid, format!("{:?}", s.sync_status), remote_status, s.title);
                }
            }
        }
        // MODIFIED: Get is now a "pull/sync" operation
        ClientCommands::Get { uuid } => {
            let uuid = Uuid::parse_str(&uuid).map_err(|_| AppError::ParseError("Invalid UUID format".into()))?;
            
            println!("Fetching remote session '{}'...", uuid);
            let remote_content = connect_and_run(|client| {
                Box::pin(async move {
                    client.download_task(uuid).await
                })
            }).await?;
            
            // This is a simplified pull. A real one would fetch remote metadata first.
            let remote_task_info_for_update = crate::client::network::RemoteTask {
                uuid,
                // We parse the file to get the real title, etc.
                title: "Updated from remote".to_string(), // Placeholder
                status: "Synced".to_string(), // Placeholder
                created_at: chrono::Utc::now(), // Placeholder
                error_message: None,
            };

            let mut store = LocalStore::load()?;
            store.update_from_remote(&remote_content, &remote_task_info_for_update)?;

            println!("Successfully synced session {} from server to local storage.", uuid);
        }
        // MODIFIED: Delete acts locally and remotely
        ClientCommands::Delete { uuid } => {
            let uuid = Uuid::parse_str(&uuid).map_err(|_| AppError::ParseError("Invalid UUID format".into()))?;
            
            // 1. Request remote deletion
            println!("Requesting deletion of remote task {}...", uuid);
            connect_and_run(|client| {
                Box::pin(async move {
                    client.delete_task(uuid).await
                })
            }).await?;
            println!("Remote task deleted.");

            // 2. Delete locally
            let mut store = LocalStore::load()?;
            store.delete_session(uuid)?;
            println!("Local session files for {} deleted.", uuid);
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
