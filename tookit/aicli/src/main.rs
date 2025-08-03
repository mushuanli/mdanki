// src/main.rs

#[macro_use]
extern crate log;
mod common;
mod error;
mod server;
mod client;

use std::path::PathBuf;
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
struct CliArgs {
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
    #[command(after_help = AFTER_HELP)]
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

#[derive(Subcommand, Debug, Clone)] // <-- 添加 Clone
pub enum ClientCommands {
    /// Initialize client, creating keys and data directories
    Init,

    /// Create a new chat template file
    New {
        /// The title of the new chat
        title: String,
    },

    /// Send a chat file to the server for processing
    Send {
        /// UUID of the local session to send
        uuid: String,
    },
    /// Run the interactive Terminal UI
    Tui,
    /// List tasks on the server
    List,
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


    // Parse command line arguments
    let args = CliArgs::parse();
    let result = match args.command {
        Commands::Server { server_cmd } => {
            // --- 添加日志初始化 ---
            // 服务器模式，使用 env_logger
            env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();
            // --- 添加结束 ---

            // Server mode, run server logic directly
            match server_cmd {
                ServerCommands::Run => server::run().await,
                ServerCommands::Init => server::init::run(),
                ServerCommands::AddUser { username, key_file } => server::user_mgnt::add_user(username, key_file).await,
                ServerCommands::DelUser { username } => server::user_mgnt::delete_user(username).await,
                ServerCommands::SetUser { username, key_file } => server::user_mgnt::set_user(username, key_file).await,
                ServerCommands::ListUsers => server::user_mgnt::list_users().await,
            }
        },
        Commands::Client { ref client_cmd } => { // 使用 ref client_cmd 避免所有权转移
            // --- 添加条件日志初始化 ---
            // 只有在非 TUI 模式下才初始化 env_logger
            if !matches!(client_cmd, ClientCommands::Tui) {
                env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();

                println!("--- AI-CLI-RS Client Info ---");
                println!(" -> Set with environment variable: AICLI_SERVER_ADDR, AICLI_USERNAME");
                println!("Server Address : {} (set via AICLI_SERVER_ADDR)", *SERVER_ADDR);
                println!("Username       : {} (set via AICLI_USERNAME)", *CLIENT_USERNAME);
                println!("Client Data Dir: {}", CLIENT_DATA_DIR);
                println!("-----------------------------");
            }
            // --- 添加结束 ---
            
            // client_cmd 的所有权已经在上面被借用，所以这里需要 clone 一下
            cli::handle_client_command(client_cmd.clone()).await
        },
    };

    if let Err(e) = result {
        eprintln!("Error: {}", e);
        std::process::exit(1);
    }
}
