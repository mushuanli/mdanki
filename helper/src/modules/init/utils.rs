// src/modules/init/utils.rs

use super::config;
use crate::models::WordData;
use anyhow::{anyhow, Context, Result};
use reqwest::Client;
use serde_json::{json, Value};
use std::path::{Path};
use std::time::Duration;
use tokio::fs;
use tokio::process::Command;

/// 确保所有需要的子目录都存在
pub async fn ensure_directories(output_dir: &Path) -> Result<()> {
    let dirs = [
        config::AUDIO_DIR,
        config::IMAGE_DIR,
        config::JSON_DIR,
    ];
    for dir in dirs {
        let dir_path = output_dir.join(dir);
        fs::create_dir_all(&dir_path)
            .await
            .with_context(|| format!("无法创建目录: {}", dir_path.display()))?;
    }
    Ok(())
}

/// 调用 AI 生成单词的详细信息
pub async fn ai_chat(client: &Client, word: &str) -> Result<WordData> {
    let prompt = json!({
        "name": "输入的英文单词或词组",
        "symbol": "音标",
        "chn": "中文释义",
        "example_en": "一个英文例句",
        "example_cn": "example_en的中文意思",
        "word_family": "词族,单词的常用变形和常用组合",
        "memory_tips": "记忆技巧,包括词源、记忆技巧等有助于记忆的信息",
        "difficulty": "难度等级(1-5)",
        "image_prompt": "example_en 配图的详细描述",
        "collocations": "常用搭配和对应的中文意思"
    });

    let messages = json!([
        {
            "role": "system",
            "content": "你是一名英语教育专家和anki大师，精通英语单词的学习和教学，生成适合青少年学习的英语单词卡片内容。请确保输出为json格式, 不要包括markdown语法, 并且每个字段都是字符串类型。"
        },
        {
            "role": "user",
            "content": format!("请为单词 \"{}\" 生成完整的学习卡片内容, 输出格式如下: {}", word, prompt.to_string())
        }
    ]);

    let response = client
        .post(config::openai_base_url())
        .bearer_auth(config::openai_api_key())
        .json(&json!({
            "model": config::openai_model(),
            "messages": messages,
            "temperature": 0.7,
            "max_tokens": 8000,
        }))
        .send()
        .await?
        .json::<Value>()
        .await?;

    let content = response["choices"][0]["message"]["content"]
        .as_str()
        .ok_or_else(|| anyhow!("AI响应中缺少内容"))?;

    let mut word_data: WordData = serde_json::from_str(content)
        .with_context(|| format!("解析AI返回的JSON失败: {}", content))?;
    
    if word_data.name.is_none() {
        word_data.name = Some(word.to_string());
    }

    Ok(word_data)
}

/// 生成音频文件
pub async fn generate_audio(text: &str, file_path: &Path) -> Result<String> {
    if text.is_empty() {
        return Err(anyhow!("无法为\"空文本\"生成音频"));
    }

    let file_name = file_path.file_name().and_then(|s| s.to_str()).unwrap_or_default().to_string();
    let mut command_status;

    if cfg!(target_os = "macos") {
        let aiff_path = file_path.with_extension("aiff");
        // Step 1: say to .aiff
        command_status = Command::new("say")
            .arg("-o")
            .arg(&aiff_path)
            .arg(text)
            .status()
            .await?;
        if !command_status.success() {
            return Err(anyhow!("'say' 命令执行失败"));
        }
        // Step 2: lame to .mp3
        command_status = Command::new("lame")
            .arg(&aiff_path)
            .arg(file_path)
            .status()
            .await?;
        // Clean up .aiff
        fs::remove_file(aiff_path).await.ok();
    } else {
        // Use edge-tts on other systems
        command_status = Command::new("edge-tts")
            .arg("--write-media")
            .arg(file_path)
            .arg("--text")
            .arg(text)
            .status()
            .await?;
    }

    if command_status.success() {
        println!("成功生成音频: {}", file_path.display());
        Ok(file_name)
    } else {
        Err(anyhow!("音频生成命令失败: {}", text))
    }
}


/// 提交图片生成任务
pub async fn generate_image(client: &Client, prompt: &str) -> Result<String> {
    let response = client
        .post(config::FLUX_API_GEN_URL)
        .header("X-DashScope-Async", "enable")
        .header("Authorization", format!("Bearer {}", config::flux_api_key()))
        .json(&json!({
            "model": config::FLUX_API_MODEL,
            "input": { "prompt": prompt },
        }))
        .send()
        .await?
        .json::<Value>()
        .await?;
    
    response["output"]["task_id"]
        .as_str()
        .map(String::from)
        .ok_or_else(|| anyhow!("从Flux API获取task_id失败: {:?}", response))
}

/// 查询图片生成任务状态并下载
pub async fn query_and_download_image(client: &Client, task_id: &str, file_path: &Path) -> Result<Option<String>> {
    let url = format!("{}{}", config::FLUX_API_QUERY_URL, task_id);
    let response = client
        .get(url)
        .header("Authorization", format!("Bearer {}", config::flux_api_key()))
        .send()
        .await?
        .json::<Value>()
        .await?;

    match response["output"]["task_status"].as_str() {
        Some("SUCCEEDED") => {
            let image_url = response["output"]["results"][0]["url"]
                .as_str()
                .ok_or_else(|| anyhow!("图片URL未找到"))?;
            
            let image_bytes = client.get(image_url).send().await?.bytes().await?;
            fs::write(file_path, &image_bytes).await?;
            println!("成功下载图片: {}", file_path.display());
            Ok(Some(file_path.file_name().unwrap().to_str().unwrap().to_string()))
        },
        Some("FAILED") => {
             println!("图片生成失败，任务ID: {}", task_id);
             Ok(Some("".to_string())) // 表示任务已终结（失败），返回空字符串
        },
        _ => { // "PENDING", "RUNNING", etc.
            Ok(None) // 表示任务仍在进行中
        }
    }
}

/// 统一处理单个 WordData 对象的所有多媒体生成, 返回是否需要更新JSON文件
pub async fn generate_multimedia_for_word(
    client: &Client,
    word_data: &mut WordData,
    output_dir: &Path,
) -> Result<bool> {
    let mut needs_update = false;
    let word_name = word_data.name.as_deref().unwrap_or_default();
    if word_name.is_empty() { return Ok(false); }

    // --- 处理音频 ---
    if word_data.audio.is_none() {
        let file_path = output_dir.join(config::AUDIO_DIR).join(format!("{}.mp3", word_name));
        if let Ok(filename) = generate_audio(word_name, &file_path).await {
            word_data.audio = Some(filename);
            needs_update = true;
        }
    }
    
    // --- 处理例句音频 ---
    if word_data.audio_example.is_none() {
        if let Some(example_en) = word_data.example_en.as_deref() {
             let file_path = output_dir.join(config::AUDIO_DIR).join(format!("{}_example.mp3", word_name));
             if let Ok(filename) = generate_audio(example_en, &file_path).await {
                 word_data.audio_example = Some(filename);
                 needs_update = true;
             }
        }
    }

    // --- 处理图片 ---
    if word_data.image.is_none() {
        if let Some(task_id) = word_data.image_taskid.as_deref() {
            // 已有任务ID，查询状态
            let file_path = output_dir.join(config::IMAGE_DIR).join(format!("{}.png", word_name));
            match query_and_download_image(client, task_id, &file_path).await {
                Ok(Some(filename)) => { // 任务已结束（成功或失败）
                    word_data.image_taskid = None; // 清除任务ID
                    if !filename.is_empty() {
                        word_data.image = Some(filename);
                    }
                    needs_update = true;
                },
                Ok(None) => {}, // 任务仍在进行中，什么都不做
                Err(e) => eprintln!("查询图片任务失败: {}", e),
            }
        } else if let Some(prompt) = word_data.image_prompt.as_deref() {
            // 没有任务ID，提交新任务
            println!("为 '{}' 提交图片生成任务", word_name);
            match generate_image(client, prompt).await {
                Ok(task_id) => {
                    word_data.image_taskid = Some(task_id);
                    needs_update = true;
                    // 等待一小段时间，避免立即查询导致API拥堵
                    tokio::time::sleep(Duration::from_millis(config::IMAGE_GEN_DELAY_MS)).await;
                },
                Err(e) => eprintln!("提交图片生成任务失败: {}", e),
            }
        }
    }
    
    Ok(needs_update)
}