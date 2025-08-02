// src/main.rs

#[macro_use]
extern crate log;
mod common;
mod error;
mod server;
mod client;

use std::path::PathBuf; // 引入 PathBuf
use clap::{Parser, Subcommand};

use crate::client::cli;
use crate::client::cli::{SERVER_ADDR, CLIENT_USERNAME, CLIENT_DATA_DIR};

// Define the help text for environment variables
const AFTER_HELP: &str = "\
ENVIRONMENT VARIABLES:
    AICLI_SERVER_ADDR    Sets the server address (e.g., 127.0.0.1:9501)
    AICLI_USERNAME       Sets the username for authentication
";

#[derive(Parser, Debug)]
#[command(author, version, about = "A Rust-based AI Chat CLI and Server", long_about = None)]
// REMOVED: No longer need after_help on the top-level command.
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
    #[command(after_help = AFTER_HELP)] // MOVED HERE
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
    /// Add a new user with their public key from a file
    AddUser { 
        #[arg(short, long)]
        username: String, 
        
        /// Path to the user's public key file (e.g., data/user.pub)
        #[arg(short, long, value_name = "FILE_PATH")]
        key_file: PathBuf,
    },
    /// Delete a user
    DelUser { username: String },
    /// Update an existing user's public key from a file
    SetUser { 
        #[arg(short, long)]
        username: String, 
        
        /// Path to the new public key file
        #[arg(short, long, value_name = "FILE_PATH")]
        key_file: PathBuf,
    },
    /// List all registered users
    ListUsers,
}

#[derive(Subcommand, Debug)]
pub enum ClientCommands {
    /// Initialize client, creating keys and data directories
    Init, // MODIFIED

    /// Create a new chat template file
    New {
        /// The title of the new chat
        title: String,
    },

    /// Send a chat file to the server for processing
    Send {
        /// UUID of the local session to send
        uuid: String, 
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

    // Parse command line arguments
    let args = Args::parse();
    let result = match args.command {
        Commands::Server { server_cmd } => {
            // Server mode, run server logic directly
            match server_cmd {
                ServerCommands::Run => server::run().await,
                ServerCommands::Init => server::init::run(),
                // 更新这里的调用
                ServerCommands::AddUser { username, key_file } => server::user_mgnt::add_user(username, key_file).await,
                ServerCommands::DelUser { username } => server::user_mgnt::delete_user(username).await,
                ServerCommands::SetUser { username, key_file } => server::user_mgnt::set_user(username, key_file).await,
                ServerCommands::ListUsers => server::user_mgnt::list_users().await,
            }
        },
        Commands::Client { client_cmd } => {
            // Client mode, print client config and then run client logic
            println!("--- AI-CLI-RS Client Info ---");
            // MODIFIED: Improved print statements
	    println!(" -> Set with environment variable: AICLI_SERVER_ADDR， AICLI_USERNAME");
            println!("Server Address : {} (set via AICLI_SERVER_ADDR)", *SERVER_ADDR);
            println!("Username       : {} (set via AICLI_USERNAME)", *CLIENT_USERNAME);
            println!("Client Data Dir: {}", CLIENT_DATA_DIR);
            println!("-----------------------------");

            cli::handle_client_command(client_cmd).await
        },
    };

    if let Err(e) = result {
        eprintln!("Error: {}", e);
        std::process::exit(1);
    }
}
