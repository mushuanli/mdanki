// src/modules/md.rs

use anyhow::{anyhow, Context, Result};
use serde::Deserialize;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

// --- 数据结构定义 ---
// 这些结构体现在能完全反映 index.json 和 word_json/*.json 的结构

#[derive(Deserialize, Debug, Clone)]
struct SynonymDetail {
    word: String,
    focus: String,
    example: String,
}

#[derive(Deserialize, Debug, Clone)]
struct SynonymDiff {
    words: String,
    quick_guide: String,
    details: Vec<SynonymDetail>,
}

#[derive(Deserialize, Debug, Clone)]
struct WordEntry {
    name: String,
    chn: Option<String>,
    symbol: Option<String>,
    example_en: Option<String>,
    example_cn: Option<String>,
    word_family: Option<String>,
    collocations: Option<String>,
    memory_tips: Option<String>, // 新增“记忆技巧”字段
    synonym_diff: Option<SynonymDiff>,
    // memory_tips, difficulty, image_prompt 等字段虽然存在于JSON中，
    // 但当前格式化逻辑不需要它们，所以可以省略以简化代码。
    // 如果未来需要，可以在这里添加。
}

// 引用您在 cli.rs 中定义的 MdArgs 结构体
pub use crate::cli::MdArgs;

/// "md" 子命令的公共处理函数
pub fn handle_md_command(args: MdArgs) -> Result<()> {
    // 1. 路径解析 (已修正为完全使用 args.path)
    let (index_path, input_dir, base_name) = resolve_paths(&args.path)?;

    println!("Index 文件:          {}", index_path.display());
    println!("数据 (word_json) 目录: {}", input_dir.display());
    println!("输出文件基础名:        {}", base_name);
    
    let details_dir = input_dir.join("word_json");

    // 检查路径是否存在
    if !index_path.exists() {
        return Err(anyhow!("错误: Index 文件 '{}' 不存在", index_path.display()));
    }
    if !details_dir.is_dir() {
        return Err(anyhow!("错误: 'word_json' 目录在 '{}' 中未找到", input_dir.display()));
    }

    // 确保输出目录存在
    fs::create_dir_all(&args.output_dir)
        .with_context(|| format!("错误: 无法创建输出目录 '{}'", args.output_dir.display()))?;

    // 2. 读取并解析主 index.json 文件
    let index_content = fs::read_to_string(&index_path)
        .with_context(|| format!("错误: 无法读取文件 '{}'", index_path.display()))?;
    let wordlist: Vec<WordEntry> = serde_json::from_str(&index_content)
        .with_context(|| format!("错误: 解析文件 '{}' 失败", index_path.display()))?;

    // 3. 遍历词汇表并生成内容
    let mut unit_outputs: HashMap<String, String> = HashMap::new();
    let mut current_unit_num: Option<String> = None;

    println!("\n开始处理词汇表...");

    for mut item in wordlist {
        // 4. 检查是否是单元标记 (只有 name, 没有 chn)
        if item.chn.is_none() {
            // 如果一个条目只有 name 没有 chn，则认为是单元标记
            current_unit_num = Some(item.name.clone());
            unit_outputs.entry(item.name.clone()).or_insert_with(|| {
                "| 中文 | 单词 |\n| :--- | :--- |\n".to_string()
            });
            println!("\n--- 切换到 Unit {} ---", item.name);
            continue;
        }

        // --- 开始处理单词条目 ---
        let unit_num = match &current_unit_num {
            Some(num) => num,
            None => {
                eprintln!("[!] 警告: 单词 '{}' 找不到所属单元，已跳过。", item.name);
                continue;
            }
        };

        // 5. 如果缺少例句 (example_en)，则从 word_json 加载并合并数据
        if item.example_en.is_none() {
            let sanitized_name = sanitize_word_for_filename(&item.name);
            let detail_json_path = details_dir.join(format!("{}.json", sanitized_name));

            if detail_json_path.exists() {
                println!("  [i] '{}' 信息不全, 从 {} 加载...", item.name, detail_json_path.display());
                match fs::read_to_string(&detail_json_path)
                    .and_then(|content| serde_json::from_str::<WordEntry>(&content).map_err(Into::into))
                {
                    Ok(detail_data) => {
                        // 合并字段 (仅当原字段为 None 时更新)
                        item.example_en.clone_from(&detail_data.example_en);
                        item.example_cn.clone_from(&detail_data.example_cn);
                        item.word_family.clone_from(&detail_data.word_family);
                        item.collocations.clone_from(&detail_data.collocations);
                        item.symbol.clone_from(&detail_data.symbol);
                        item.memory_tips.clone_from(&detail_data.memory_tips); // 合并记忆技巧
                        if item.synonym_diff.is_none() {
                            item.synonym_diff = detail_data.synonym_diff;
                        }
                    },
                    Err(e) => {
                         eprintln!("[!] 警告: 解析详情文件 {} 失败: {}. 已跳过 '{}'.", detail_json_path.display(), e, item.name);
                         continue;
                    }
                }
            } else {
                eprintln!("[!] 警告: '{}' 缺少例句且未找到详情文件, 已跳过. (路径: {})", item.name, detail_json_path.display());
                continue;
            }
        }
        
        // --- 格式化输出 (全新逻辑) ---
        let chn = item.chn.as_deref().unwrap_or("").trim().replace('\n', " ");
        let name = item.name.trim();
        let symbol = item.symbol.as_deref().unwrap_or("");
        
        let example_en = item.example_en.as_deref().unwrap_or("");
        let example_cn = item.example_cn.as_deref().unwrap_or("");

        // 构建“词族、词组、记忆”部分，能优雅地处理字段缺失
        let mut extra_info_parts = Vec::new();
        if let Some(wf) = item.word_family {
            extra_info_parts.push(format!("词族: {}", wf.replace('|', ",")));
        }
        if let Some(c) = item.collocations {
            extra_info_parts.push(format!("词组: {}", c));
        }
        if let Some(mt) = item.memory_tips {
            extra_info_parts.push(format!("记忆: {}", mt));
        }
        let extra_info_block = extra_info_parts.join(" ¶ ");

        // 构建“辨析”部分
        let synonym_block = item.synonym_diff.map(|sd| {
            let details_formatted = sd.details.iter()
                .map(|d| format!("< {} - {} ¶ {} >", d.word.trim(), d.focus.trim(), d.example.trim()))
                .collect::<Vec<_>>()
                .join(" ¶ ");
            format!("辨析: {} ¶¶ {} ¶ ", sd.quick_guide.trim(), details_formatted)
        }).unwrap_or_default();

        // 准备音频部分的内容
        let audio_word = name.trim_start_matches('*');

        // 8. 构建最终的 Markdown 行
        let markdown_row = format!(
            "| {} | -- {}: {} ¶¶ 例句: {} ¶ {} ¶¶ {} ¶¶ {} --^^audio: {} . {} ^^|\n",
            chn,                 // 1. 中文释义
            name,                // 2. 单词
            symbol,              // 3. 音标
            example_en,          // 4. 英文例句
            example_cn,          // 5. 中文例句
            extra_info_block,    // 6. 词族/词组/记忆区块
            synonym_block,       // 7. 词义辨析区块
            audio_word,          // 8. 音频单词
            example_en           // 9. 音频例句
        );

        // 追加到当前单元的输出中
        if let Some(output) = unit_outputs.get_mut(unit_num) {
            output.push_str(&markdown_row);
            println!("  [✓] 已处理单词: {}", name);
        }
    }

    // 6. 写入文件 (使用新的命名规则)
    println!("\n--- 开始写入 Markdown 文件 ---");
    for (unit_num, content) in unit_outputs {
        // 2. 输出文件名为 <基础名>_U{unitNum}.md
        let output_filename = args.output_dir.join(format!("{}_U{}.md", base_name, unit_num));
        match fs::write(&output_filename, content) {
            Ok(_) => println!("  [✓] 成功生成文件: {}", output_filename.display()),
            Err(e) => eprintln!("  [✗] 错误: 写入文件 '{}' 失败. {}", output_filename.display(), e),
        }
    }

    println!("\n处理完成!");
    Ok(())
}

// --- 辅助函数 ---

/// 根据输入路径解析出 index 文件路径、输入目录和用于输出的基础名称。
fn resolve_paths(path: &Path) -> Result<(PathBuf, PathBuf, String)> {
    let canonical_path = path.canonicalize()
        .with_context(|| format!("错误: 无法解析路径 '{}'", path.display()))?;

    if canonical_path.is_dir() {
        let index_path = canonical_path.join("index.json");
        let base_name = canonical_path.file_name()
            .and_then(|name| name.to_str())
            .map(String::from)
            .ok_or_else(|| anyhow!("无法从目录 '{}' 获取文件名", canonical_path.display()))?;
        Ok((index_path, canonical_path, base_name))
    } else if canonical_path.is_file() {
        let input_dir = canonical_path.parent()
            .ok_or_else(|| anyhow!("无法获取文件 '{}' 的父目录", canonical_path.display()))?
            .to_path_buf();
        
        // --- 修正点在这里 ---
        // 基础名称现在从父目录获取，而不是文件名
        let base_name = input_dir.file_name()
            .and_then(|name| name.to_str())
            .map(String::from)
            .ok_or_else(|| anyhow!("无法从父目录 '{}' 获取基础名称", input_dir.display()))?;
            
        Ok((canonical_path, input_dir, base_name))
    } else {
        Err(anyhow!("路径 '{}' 既不是文件也不是目录", path.display()))
    }
}

/// 清理单词以用作文件名。
fn sanitize_word_for_filename(word: &str) -> String {
    word.trim_start_matches('*').trim().to_lowercase()
}