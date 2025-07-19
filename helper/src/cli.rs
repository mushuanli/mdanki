// src/cli.rs
use clap::{Args, Parser, Subcommand};
use std::path::PathBuf;

/// 一个帮助从目录生成和打包 Anki .apkg 文件的工具
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
    /// 初始化项目目录，通过 AI 生成单词卡片和媒体文件
    Init(InitArgs), // <--- 新增
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

/// "init" 子命令的参数 (新增)
#[derive(Args, Debug)]
pub struct InitArgs {
    /// 要初始化的输出目录
    #[arg(required = true)]
    pub output_dir: PathBuf,

    /// 包含单词列表的索引文件路径 (txt 或 json)
    /// 如果省略，则默认为 <output-dir>/index.json
    #[arg(short, long)]
    pub template: Option<PathBuf>,
}