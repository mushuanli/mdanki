// src/main.rs

// Add these to the top
#[macro_use]
extern crate log;
mod common;
mod error;
mod server;
mod client; // We'll need this later

use clap::{Parser, Subcommand};
use crate::common::crypto::KeyPair; // NEW

use client::cli; // Import the cli handler module

#[derive(Parser, Debug)]
#[command(author, version, about = "A Rust-based AI Chat CLI and Server", long_about = None)]
struct Args {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand, Debug)]
enum Commands {
    /// Server-related commands
    Server {
        #[command(subcommand)]
        server_cmd: ServerCommands,
    },
    /// Client-related commands
    Client {
        #[command(subcommand)]
        client_cmd: ClientCommands,
    },
}

#[derive(Subcommand, Debug)]
pub enum ServerCommands {
    /// Run the server (default)
    Run,
    /// Initialize server configuration (e.g., generate SSL certs)
    Init,
    /// Add a new user with their public key
    AddUser { username: String, public_key: String },
    /// Delete a user
    DelUser { username: String },
    /// Update an existing user's public key
    SetUser { username: String, public_key: String },
    /// List all registered users
    ListUsers,
}

#[derive(Subcommand, Debug)]
pub enum ClientCommands {
    /// Create a new user key pair
    CreateUserKey,

    /// Create a new chat template file
    New {
        /// The title of the new chat
        title: String,
    },

    /// Send a chat file to the server for processing
    Send {
        /// Path to the .txt chat file
        file_path: String,
        // Later we can add: #[arg(short, long)] attachments: Vec<String>
    },
    /// Run the interactive Terminal UI
    Tui,
    /// List tasks on the server
    List, // TODO: Add time range options
    /// Get (download) a completed chat file
    Get {
        /// The UUID of the chat to retrieve
        uuid: String,
    },
    /// Delete a task and its files from the server
    Delete {
        /// The UUID of the chat to delete
        uuid: String,
    },
    /// Resend a task for processing
    Resend {
        /// The UUID of the chat to resend
        uuid: String,
    },
}

#[tokio::main]
async fn main() {
    // Initialize logger
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();

    let args = Args::parse();
    let result = match args.command {
        Commands::Server { server_cmd } => match server_cmd {
            ServerCommands::Run => server::run().await,
            ServerCommands::Init => server::init::run(),
            // NEW: Handle user management commands
            ServerCommands::AddUser { username, public_key } => server::user_mgnt::add_user(username, public_key).await,
            ServerCommands::DelUser { username } => server::user_mgnt::delete_user(username).await,
            ServerCommands::SetUser { username, public_key } => server::user_mgnt::set_user(username, public_key).await,
            ServerCommands::ListUsers => server::user_mgnt::list_users().await,
        },
        Commands::Client { client_cmd } => cli::handle_client_command(client_cmd).await,
    };

    if let Err(e) = result {
        eprintln!("Error: {}", e);
        std::process::exit(1);
    }
}
