// src/main.rs

mod cli;
mod models;
mod modules;

use anyhow::Result;
use clap::Parser;
use cli::{Cli, Command};
use dotenvy::dotenv;

// --- 修改：使用 tokio 的异步 main 函数 ---
#[tokio::main]
async fn main() -> Result<()> {
    // 加载 .env 文件中的环境变量
    dotenv().ok();

    // 1. 解析命令行参数
    let cli = Cli::parse();

    // 2. 根据子命令进行分发
    match cli.command {
        Command::Pack(args) => {
            // pack 功能不是异步的，所以可以直接调用
            modules::pack::handle_pack_command(args)?;
        }
        Command::Init(args) => {
            // init 功能是异步的，需要 .await
            modules::init::handle_init_command(args).await?;
        }
    }

    Ok(())
}