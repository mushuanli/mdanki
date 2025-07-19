// src/cli.rs
use clap::{Args, Parser, Subcommand};
use std::path::PathBuf;

/// 一个帮助从目录生成 Anki .apkg 文件的工具
#[derive(Parser, Debug)]
#[command(name = "helper", version, about, long_about = None)]
pub struct Cli {
    #[command(subcommand)]
    pub command: Command,
}

#[derive(Subcommand, Debug)]
pub enum Command {
    /// 将指定目录打包成一个 .apkg 文件
    Pack(PackArgs),
    // 未来可以扩展新的子命令，例如：
    // Unpack(UnpackArgs),
}

/// "pack" 子命令的参数
#[derive(Args, Debug)]
pub struct PackArgs {
    /// 要打包的目录路径
    #[arg(required = true)]
    pub pack_dir: PathBuf,

    /// ankimodel.json 模板文件的路径
    #[arg(short, long, default_value = "template/ankimodel.json")]
    pub template: PathBuf,
}