// src/modules/init.rs

mod config;
mod utils;

use crate::cli::InitArgs;
use crate::models::WordData;
use anyhow::{anyhow, Result};
use reqwest::Client;
use serde::Deserialize;
use std::path::{Path};
use std::time::Duration;
use tokio::fs;

/// `init` 命令的主处理函数
pub async fn handle_init_command(args: InitArgs) -> Result<()> {
    let output_dir = args.output_dir;
    let template_path = args.template.unwrap_or_else(|| output_dir.join("index.json"));

    if !template_path.exists() {
        return Err(anyhow!("错误: 索引文件不存在: {}", template_path.display()));
    }
    
    utils::ensure_directories(&output_dir).await?;
    println!("目录结构已确认/创建于: {}", output_dir.display());

    let client = Client::new();

    let extension = template_path.extension().and_then(|s| s.to_str()).unwrap_or("");
    match extension {
        "json" => init_from_json(&client, &template_path, &output_dir).await?,
        "txt" => init_from_txt(&client, &template_path, &output_dir).await?,
        _ => return Err(anyhow!("不支持的文件类型: {}. 请提供 .json 或 .txt 文件。", extension)),
    }

    println!("\n===== 开始处理多媒体文件生成 =====");
    loop {
        let pending_count = init_multimedia(&client, &output_dir).await?;
        if pending_count == 0 {
            println!("所有多媒体任务处理完毕。");
            break;
        }
        println!("发现 {} 个待处理的多媒体任务，将在 {} 秒后重试...", pending_count, config::IMAGE_RETRY_DELAY_S);
        tokio::time::sleep(Duration::from_secs(config::IMAGE_RETRY_DELAY_S)).await;
    }

    Ok(())
}

#[derive(Deserialize, Debug)]
struct IndexEntry {
    name: String,
    chn: Option<String>,
    ext: Option<String>,
}

async fn init_from_json(client: &Client, template_path: &Path, output_dir: &Path) -> Result<()> {
    let content = fs::read_to_string(template_path).await?;
    let entries: Vec<IndexEntry> = serde_json::from_str(&content)?;
    
    let json_dir = output_dir.join(config::JSON_DIR);
    let mut current_unit = 1;

    for entry in entries {
        if let Ok(unit_num) = entry.name.parse::<i32>() {
            if entry.chn.is_none() && entry.ext.is_none() {
                current_unit = unit_num;
                println!("\n切换到 Unit {}", current_unit);
                continue;
            }
        }
        
        let file_path = json_dir.join(format!("{}.json", entry.name));
        if file_path.exists() {
            println!("已跳过 (已存在): {}", entry.name);
            continue;
        }

        println!("正在通过 AI 生成: {}", entry.name);
        let mut word_data = utils::ai_chat(client, &entry.name).await?;
        
        word_data.unit = Some(serde_json::Value::from(current_unit));
        if let Some(chn) = entry.chn {
            word_data.chn = Some(chn);
        }
        if let Some(ext) = entry.ext {
            let original_tips = word_data.memory_tips.unwrap_or_default();
            word_data.memory_tips = Some(format!("{}\n{}", ext, original_tips));
        }

        let json_string = serde_json::to_string_pretty(&word_data)?;
        fs::write(&file_path, json_string).await?;
    }
    Ok(())
}


async fn init_from_txt(client: &Client, template_path: &Path, output_dir: &Path) -> Result<()> {
    let content = fs::read_to_string(template_path).await?;
    let lines = content.lines();
    
    let json_dir = output_dir.join(config::JSON_DIR);
    let mut current_unit = 1;

    for line in lines {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        if trimmed.to_lowercase().starts_with("unit") {
             if let Some(num_str) = trimmed.split_whitespace().nth(1) {
                if let Ok(num) = num_str.parse::<i32>() {
                    current_unit = num;
                    println!("\n切换到 Unit {}", current_unit);
                    continue;
                }
             }
        }

        let file_path = json_dir.join(format!("{}.json", trimmed));
        if file_path.exists() {
            println!("已跳过 (已存在): {}", trimmed);
            continue;
        }
        
        println!("正在通过 AI 生成: {}", trimmed);
        let mut word_data = utils::ai_chat(client, trimmed).await?;
        word_data.unit = Some(serde_json::Value::from(current_unit));

        let json_string = serde_json::to_string_pretty(&word_data)?;
        fs::write(&file_path, json_string).await?;
    }
    Ok(())
}

async fn init_multimedia(client: &Client, output_dir: &Path) -> Result<u32> {
    let json_dir = output_dir.join(config::JSON_DIR);
    let mut read_dir = fs::read_dir(json_dir).await?;
    let mut pending_count = 0;
    
    while let Some(entry) = read_dir.next_entry().await? {
        let path = entry.path();
        if path.is_file() && path.extension().and_then(|s| s.to_str()) == Some("json") {
            let content = fs::read_to_string(&path).await?;
            let mut word_data: WordData = serde_json::from_str(&content)?;

            let needs_update = utils::generate_multimedia_for_word(client, &mut word_data, output_dir).await?;
            
            if word_data.image_taskid.is_some() {
                pending_count += 1;
            }

            if needs_update {
                let updated_content = serde_json::to_string_pretty(&word_data)?;
                fs::write(&path, updated_content).await?;
                println!("更新了JSON文件: {}", path.display());
            }
        }
    }

    Ok(pending_count)
}