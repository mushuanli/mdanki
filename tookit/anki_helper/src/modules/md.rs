// src/modules/md.rs

use anyhow::{anyhow, Context, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::ffi::OsStr;
use std::fs;
use std::path::{Path, PathBuf};

// --- 数据结构定义 (已更新，增加 Serialize 和所有字段) ---
#[derive(Deserialize, Serialize, Debug, Clone)]
struct SynonymDetail {
    word: String,
    focus: String,
    example: String,
}

#[derive(Deserialize, Serialize, Debug, Clone)]
struct SynonymDiff {
    #[serde(default)]
    words: String,
    quick_guide: String,
    #[serde(default)]
    details: Vec<SynonymDetail>,
}

#[derive(Deserialize, Serialize, Debug, Clone)]
struct WordEntry {
    name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    chn: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    symbol: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    example_en: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    example_cn: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    word_family: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    memory_tips: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    difficulty: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    collocations: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    image_prompt: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    synonym_diff: Option<SynonymDiff>,
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
    
    // [主要修改] 移除对 `word_json` 目录的预先检查。
    // 我们将在需要时再检查它。
    // if !details_dir.is_dir() {
    //     return Err(anyhow!("错误: 'word_json' 目录在 '{}' 中未找到", input_dir.display()));
    // }

    // 确保输出目录存在
    fs::create_dir_all(&args.output_dir)
        .with_context(|| format!("错误: 无法创建输出目录 '{}'", args.output_dir.display()))?;

    // 2. 读取并解析主 index.json 文件
    let index_content = fs::read_to_string(&index_path)
        .with_context(|| format!("错误: 无法读取文件 '{}'", index_path.display()))?;
    let mut wordlist: Vec<WordEntry> = serde_json::from_str(&index_content)
        .with_context(|| format!("错误: 解析文件 '{}' 失败", index_path.display()))?;

    // [MODIFIED] unit_outputs 现在存储一个 Vec<String>，每行是一个元素
    let mut unit_outputs: HashMap<String, Vec<String>> = HashMap::new();
    let mut current_unit_num: Option<String> = None;
    let mut was_updated = false;

    // [MODIFIED] 我们需要追踪每个单词第一次出现时，它在单元输出Vec中的索引
    // HashMap<word_name, (count, first_occurrence_index_in_vec)>
    let mut word_tracking: HashMap<String, (u32, usize)> = HashMap::new();

    println!("\n开始处理词汇表...");

    // 使用可变引用进行迭代，以便能直接修改 item
    for item in &mut wordlist {
        // 4. 处理单元标记
        if item.chn.is_none() {
            // 如果一个条目只有 name 没有 chn，则认为是单元标记
            current_unit_num = Some(item.name.clone());
            // [MODIFIED] 初始化时只放入表格头
            unit_outputs
                .entry(item.name.clone())
                .or_insert_with(|| vec!["| 中文 | 单词 |\n| :--- | :--- |\n".to_string()]);
            println!("\n--- 切换到 Unit {} ---", item.name);
            continue;
        }

        // --- [FIXED] 修正作用域问题 ---
        // 1. 在循环的顶部声明 unit_num_str
        let unit_num_str: String;

        // 2. 使用 match 语句为 unit_num_str 赋值
        match &current_unit_num {
            Some(num) => {
                unit_num_str = num.clone();
            }
            None => {
                eprintln!("[!] 警告: 单词 '{}' 找不到所属单元，已跳过。", item.name);
                continue;
            }
        };

        // 5. 如果缺少例句 (example_en)，则从 word_json 加载并合并数据
        if item.example_en.is_none() {
            was_updated = true; // 标记发生了更新
            let sanitized_name = sanitize_word_for_filename(&item.name);
            let detail_json_path = details_dir.join(format!("{}.json", sanitized_name));

            // [逻辑移动] 在这里，我们真正需要详情文件了。
            // 我们直接尝试读取文件，而不是先检查它是否存在。
            // `fs::read_to_string` 的错误会告诉我们文件是否不存在。
            println!("  [i] '{}' 信息不全, 尝试从 {} 加载并补充...", item.name, detail_json_path.display());

            match fs::read_to_string(&detail_json_path) {
                Ok(content) => {
                    // 文件读取成功，现在解析它
                    match serde_json::from_str::<WordEntry>(&content) {
                        Ok(detail_data) => {
                            // 合并所有可能缺失的字段
                            item.symbol.clone_from(&detail_data.symbol);
                            item.example_en.clone_from(&detail_data.example_en);
                            item.example_cn.clone_from(&detail_data.example_cn);
                            item.word_family.clone_from(&detail_data.word_family);
                            item.memory_tips.clone_from(&detail_data.memory_tips);
                            item.difficulty.clone_from(&detail_data.difficulty);
                            item.collocations.clone_from(&detail_data.collocations);
                            item.image_prompt.clone_from(&detail_data.image_prompt);
                            if item.synonym_diff.is_none() {
                                item.synonym_diff = detail_data.synonym_diff;
                            }
                        },
                        Err(e) => {
                             eprintln!("[!] 警告: 解析详情文件 {} 失败: {}. 已跳过 '{}'.", detail_json_path.display(), e, item.name);
                             continue;
                        }
                    }
                }
                Err(e) => {
                    // [主要修改] 文件读取失败，我们需要诊断原因。
                    // 首先检查是不是因为整个 `word_json` 目录都不存在。
                    if !details_dir.is_dir() {
                        // 如果目录不存在，这是一个配置问题，应立即终止程序。
                        return Err(anyhow!(
                            "错误: 需要从详情文件补充数据，但 'word_json' 目录在 '{}' 中未找到。",
                            input_dir.display()
                        ));
                    }
                    
                    // 如果目录存在，那说明只是这一个单词的详情文件缺失。
                    // 这是一个警告，我们可以继续处理其他单词。
                    eprintln!(
                        "[!] 警告: 无法读取详情文件 {}: {}. 已跳过 '{}'.",
                        detail_json_path.display(), e, item.name
                    );
                    continue; // 跳过当前单词的处理
                }
            }
        }


        // --- [MODIFIED] 全新的、更复杂的 locator 生成逻辑 ---
        let name = item.name.trim();
        let locator: String;

        // 获取当前单元的输出Vec的可变引用
        let current_unit_output = unit_outputs.get_mut(&unit_num_str).unwrap();

        // 更新追踪信息
        let (count, first_occurrence_index) = word_tracking.entry(name.to_string()).or_insert((0, current_unit_output.len()));
        *count += 1;

        if *count == 1 {
            // 第一次出现，locator 就是单词本身
            locator = name.to_string();
            println!("  [✓] 已处理单词: {} (首次出现)", name);
        } else if *count == 2 {
            // 第二次出现 (即第一次重复)
            // 1. 回溯修改第一次出现的那一行的 locator
            if let Some(first_row) = current_unit_output.get_mut(*first_occurrence_index) {
                // 用 `replace` 替换第一次出现的 locator
                // 我们假设 `[name]` 的格式是唯一的，这在我们的场景下是安全的
                *first_row = first_row.replace(
                    &format!("--[{}]", name), 
                    &format!("--[{}-1]", name)
                );
            }
            // 2. 为当前行生成带 '-2' 的 locator
            locator = format!("{}-2", name);
            println!("  [✓] 已处理单词: {} (重复出现，locator: {})", name, locator);
        } else {
            // 第三次及以后的出现
            locator = format!("{}-{}", name, *count);
            println!("  [✓] 已处理单词: {} (重复出现，locator: {})", name, locator);
        }

        // --- 格式化输出 (保持不变) ---
        let chn = item.chn.as_deref().unwrap_or("").trim().replace('\n', " ");
        let symbol = item.symbol.as_deref().unwrap_or("");
        
        let example_en = item.example_en.as_deref().unwrap_or("");
        let example_cn = item.example_cn.as_deref().unwrap_or("");

        // 构建“词族、词组、记忆”部分，能优雅地处理字段缺失
        let mut extra_info_parts = Vec::new();
        if let Some(wf) = &item.word_family {
            let formatted_wf = wf.replace('\n', " ¶ ").replace('|', ",");
            extra_info_parts.push(format!("词族: {}", formatted_wf));
        }
        if let Some(c) = &item.collocations {
            let formatted_c = c.replace('\n', " ¶ ").replace('|', ",");
            extra_info_parts.push(format!("词组: {}", formatted_c));
        }
        if let Some(mt) = &item.memory_tips {
            let formatted_mt = mt.replace('\n', " ¶ ");
            extra_info_parts.push(format!("记忆: {}", formatted_mt));
        }
        let extra_info_block = extra_info_parts.join(" ¶ ");

        // 构建“辨析”部分
        let synonym_block = item.synonym_diff.as_ref().map(|sd| {
            // [MODIFIED] 对辨析部分也进行换行符替换
            let formatted_guide = sd.quick_guide.trim().replace('\n', " ¶ ");
            format!("辨析: {}", formatted_guide)
        }).unwrap_or_default();

        // 准备音频部分的内容
        let audio_word = name.trim_start_matches('*');

        // 构建最终的 Markdown 行
        // 注意： extra_info_block 和 synonym_block 之间用 ¶¶ 分隔。
        // 如果其中一个为空，连接后不会产生多余的分隔符。
        let final_extra_block = [extra_info_block, synonym_block]
            .into_iter()
            .filter(|s| !s.is_empty())
            .collect::<Vec<_>>()
            .join(" ¶¶ ");

        // 使用新生成的 locator 构建 Markdown 行
        let markdown_row = format!(
            "| {} | --[{}] {}: {} ¶¶ 例句: {} ¶ {} ¶¶ {} --^^audio: {} . {} ^^|\n",
            chn,                 // 1. 中文释义
            locator,             // [NEW] 2. 唯一的定位词
            name,                // 3. 单词（可见内容）
            symbol,              // 4. 音标
            example_en,          // 5. 英文例句
            example_cn,          // 6. 中文例句
            final_extra_block,   // 7. 合并后的额外信息区块
            audio_word,          // 8. 音频单词
            example_en           // 9. 音频例句
        );

        // 将新生成的行添加到当前单元的输出 Vec 中
        current_unit_output.push(markdown_row);
    }

    // 6. 写入文件
    println!("\n--- 开始写入 Markdown 文件 ---");
    for (unit_num, lines_vec) in unit_outputs {
        // [MODIFIED] 在写入前将 Vec<String> 连接成一个大字符串
        let content = lines_vec.join("");
        let output_filename = args.output_dir.join(format!("{}-U{}.md", base_name, unit_num));
        match fs::write(&output_filename, &content) {
            Ok(_) => println!("  [✓] 成功生成文件: {}", output_filename.display()),
            Err(e) => eprintln!("  [✗] 错误: 写入文件 '{}' 失败. {}", output_filename.display(), e),
        }
    }

    // 7. 回写更新后的 index.json
    if was_updated {
        println!("\n[i] 检测到 index.json 内容已补充，正在回写更新...");
        let updated_json_content = serde_json::to_string_pretty(&wordlist)
            .context("错误: 无法将更新后的数据序列化为 JSON")?;
        
        fs::write(&index_path, updated_json_content)
            .with_context(|| format!("错误: 无法将更新后的内容写入到 '{}'", index_path.display()))?;
        
        println!("[✓] 成功更新文件: {}", index_path.display());
    } else {
        println!("\n[i] index.json 内容完整，无需更新。");
    }

    println!("\n处理完成!");
    Ok(())
}

// --- 辅助函数 ---

/// [修改] 根据输入路径解析出 index 文件路径、输入目录和用于输出的基础名称。
/// (要求4) 现在会根据输入文件名决定基础名称：
/// - 如果是目录，或文件是 `index.json`，则基础名为目录名。
/// - 如果是其他文件（如 `EW10A.json`），则基础名为不带扩展名的文件名 (`EW10A`)。
fn resolve_paths(path: &Path) -> Result<(PathBuf, PathBuf, String)> {
    let canonical_path = path.canonicalize()
        .with_context(|| format!("错误: 无法解析路径 '{}'", path.display()))?;

    if canonical_path.is_dir() {
        let index_path = canonical_path.join("index.json");
        let base_name = canonical_path.file_name().and_then(|s| s.to_str()).map(String::from).ok_or_else(|| anyhow!("无法从目录获取文件名"))?;
        Ok((index_path, canonical_path, base_name))
    } else if canonical_path.is_file() {
        let input_dir = canonical_path.parent().ok_or_else(|| anyhow!("无法获取父目录"))?.to_path_buf();

        // [修改] 根据文件名决定 base_name
        let base_name = if canonical_path.file_name() == Some(OsStr::new("index.json")) {
            // 如果文件名是 index.json, 使用父目录名作为 base_name
            input_dir.file_name()
                     .and_then(|s| s.to_str())
                     .map(String::from)
                     .ok_or_else(|| anyhow!("无法从父目录 '{}' 获取基础名称", input_dir.display()))?
        } else {
            // 否则，使用文件名（不含扩展名）作为 base_name
            canonical_path.file_stem()
                          .and_then(|s| s.to_str())
                          .map(String::from)
                          .ok_or_else(|| anyhow!("无法从文件名 '{}' 获取基础名称", canonical_path.display()))?
        };
        
        Ok((canonical_path, input_dir, base_name))
    } else {
        Err(anyhow!("路径 '{}' 既不是文件也不是目录", path.display()))
    }
}

/// 清理单词以用作文件名。
fn sanitize_word_for_filename(word: &str) -> String {
    word.trim_start_matches('*').trim().to_lowercase()
}