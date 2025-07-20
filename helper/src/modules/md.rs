// src/modules/md.rs

use crate::cli::MdArgs;
use crate::models::{WordData, WordlistItem};
use anyhow::{anyhow, Context, Result};
use std::collections::HashMap;
use std::fs::{self, File};
use std::io::BufReader;
use std::path::Path;

/// "md" 子命令的公共处理函数
///
/// 这是此模块的入口点，由 main.rs 调用。
pub fn handle_md_command(args: MdArgs) -> Result<()> {
    // 1. 设置和验证路径
    let base_dir = args
        .dir
        .canonicalize()
        .with_context(|| format!("错误: 无法解析数据目录 {}", args.dir.display()))?;
    
    // --- 核心逻辑: 决定使用哪个输入文件 ---
    let wordlist_path = match args.input {
        // 如果用户通过 -i 指定了文件，则使用该文件
        Some(input_path) => {
            println!("使用指定输入文件: {}", input_path.display());
            input_path
        }
        // 否则，默认使用 <dir>/index.json
        None => {
            let default_path = base_dir.join("index.json");
            println!("使用默认输入文件: {}", default_path.display());
            default_path
        }
    };
    
    // 详情目录始终相对于基础目录
    let details_dir = base_dir.join("json");

    if !wordlist_path.exists() {
        return Err(anyhow!("错误: 输入文件 '{}' 不存在", wordlist_path.display()));
    }
    if !details_dir.is_dir() {
        return Err(anyhow!("错误: 详情目录 'json/' 在 '{}' 中未找到", base_dir.display()));
    }

    // 确保输出目录存在
    fs::create_dir_all(&args.output_dir)
        .with_context(|| format!("错误: 无法创建输出目录 {}", args.output_dir.display()))?;

    // 2. 读取并解析主 JSON 文件
    let file = File::open(&wordlist_path)?;
    let reader = BufReader::new(file);
    let wordlist: Vec<WordlistItem> = serde_json::from_reader(reader)
        .with_context(|| format!("错误: 解析文件 '{}' 失败", wordlist_path.display()))?;

    // 3. 遍历词汇表并生成内容
    let mut unit_outputs: HashMap<String, String> = HashMap::new();
    let mut current_unit: Option<String> = None;

    println!("开始处理词汇表...");

    for item in wordlist {
        // 检查是否是单元标记
        if item.chn.is_none() && item.name.chars().all(char::is_numeric) {
            current_unit = Some(item.name.clone());
            // 如果是新单元，为其准备好 Markdown 表头
            unit_outputs
                .entry(item.name)
                .or_insert_with(|| "| 中文 | 单词 |\n| :--- | :--- |\n".to_string());
            println!("\n--- 切换到 Unit {} ---", current_unit.as_ref().unwrap());
            continue;
        }

        // 处理单词条目 (必须有 chn 字段并且当前单元已知)
        if let (Some(chn), Some(unit)) = (item.chn, &current_unit) {
            let word_name = &item.name;
            let sanitized_name = sanitize_word_for_filename(word_name);
            if sanitized_name.is_empty() {
                continue;
            }

            let detail_json_path = details_dir.join(format!("{}.json", sanitized_name));

            // 4. 查找并读取单词详情 JSON 文件
            let detail_data = match read_detail_file(&detail_json_path) {
                Ok(data) => {
                    println!("  [✓] 找到并处理: {} (文件: {}.json)", word_name, sanitized_name);
                    data
                },
                Err(_) => {
                    eprintln!("  [!] 警告: 未找到 '{}' 的详情文件, 已跳过. (查找路径: {})", word_name, detail_json_path.display());
                    continue;
                }
            };
            
            // 5. 格式化输出行
            let cleaned_chn = clean_text(&Some(chn));
            let cleaned_word_family = clean_text(&detail_data.word_family);
            let cleaned_collocations = clean_text(&detail_data.collocations);
            let cleaned_example_en = clean_text(&detail_data.example_en);
            let cleaned_example_cn = clean_text(&detail_data.example_cn);

            let audio_word = word_name.trim_start_matches('*').trim();
            let audio_example_en = clean_text(&detail_data.example_en);
            
            let markdown_row = format!(
                "| {} | -- {} : {} . ¶{}¶{}¶{}¶{} --^^audio: {} . {} ^^|\n",
                cleaned_chn,
                word_name,
                item.symbol.as_deref().unwrap_or(""),
                cleaned_word_family,
                cleaned_collocations,
                cleaned_example_en,
                cleaned_example_cn,
                audio_word,
                audio_example_en
            );

            // 追加到当前单元的输出中
            if let Some(output) = unit_outputs.get_mut(unit) {
                output.push_str(&markdown_row);
            }
        }
    }

    // 6. 将内容写入到各自的 UnitX.md 文件
    println!("\n--- 开始写入 Markdown 文件 ---");
    for (unit, content) in unit_outputs {
        let output_filename = args.output_dir.join(format!("Unit{}.md", unit));
        match fs::write(&output_filename, content) {
            Ok(_) => println!("  [✓] 成功生成文件: {}", output_filename.display()),
            Err(e) => eprintln!("  [✗] 错误: 写入文件 '{}' 失败. {}", output_filename.display(), e),
        }
    }
    
    println!("\n处理完成!");
    Ok(())
}


// --- 辅助函数 ---

/// 从路径读取并解析单词详情 JSON 文件。
fn read_detail_file(path: &Path) -> Result<WordData> {
    let file = File::open(path)?;
    let reader = BufReader::new(file);
    let data: WordData = serde_json::from_reader(reader)?;
    Ok(data)
}

/// 清理单词或词组以用作文件名，与 JS 版本逻辑一致。
fn sanitize_word_for_filename(word: &str) -> String {
    if word.is_empty() {
        return String::new();
    }
    // 移除前导星号，修剪两端空格，并转换为小写
    word.trim_start_matches('*')
        .trim()
        .to_lowercase()
}

/// 清理文本：处理 Option，去除首尾空格，并将所有换行符替换为 '¶'。
fn clean_text(text_opt: &Option<String>) -> String {
    match text_opt {
        Some(text) => text.trim().replace('\n', "¶"),
        None => "N/A".to_string(), // 如果没有提供，默认用 N/A
    }
}