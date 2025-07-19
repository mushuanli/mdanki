// src/main.rs
use std::collections::HashSet;
use std::fs::{self, File};
use std::io::BufReader;
use std::path::{Path, PathBuf};

use anyhow::{anyhow, Context, Result};
// --- 修改 1: 引入 Subcommand 和 Args ---
use clap::{Parser, Subcommand, Args};
use genanki_rs::{Deck, Field, Model, Note, Package, Template};
use glob::glob;
use rand::Rng;
use serde::Deserialize;
use serde_json::Value;

// --- 1. 定义数据结构 (用于解析 JSON) ---

#[derive(Debug, Deserialize)]
struct AnkiModelTemplate {
    id: i64,
    name: String,
    flds: Vec<TemplateField>,
    tmpls: Vec<TemplateFormat>,
    css: Option<String>,
    #[serde(rename = "type")]
    model_type: Option<i32>,
}

#[derive(Debug, Deserialize)]
struct TemplateField {
    name: String,
}

#[derive(Debug, Deserialize)]
struct TemplateFormat {
    name: String,
    qfmt: String,
    afmt: String,
}

#[derive(Debug, Deserialize, Default)]
struct WordData {
    name: Option<String>,
    grade: Option<Value>, // <--- 修改
    unit: Option<Value>,  // <--- 修改
    symbol: Option<String>,
    chn: Option<String>,
    audio: Option<String>,
    audio_example: Option<String>,
    image: Option<String>,
    example_en: Option<String>,
    example_cn: Option<String>,
    word_family: Option<String>,
    memory_tips: Option<String>,
    difficulty: Option<Value>, // <--- 修改
    collocations: Option<String>,
}

#[derive(Debug, Deserialize, Default)]
#[allow(dead_code)] // Allow unused fields, as not all JSON files might have all fields
struct ReciteData {
    name: Option<String>,
    author: Option<String>,
    text: Option<String>,
    hint: Option<String>,
    audio: Option<String>,
    audio1: Option<String>,
    audio2: Option<String>,
    audio3: Option<String>,
    audio4: Option<String>,
    audio5: Option<String>,
    audio6: Option<String>,
    audio7: Option<String>,
    audio8: Option<String>,
    audio9: Option<String>,
    translate: Option<String>,
    image: Option<String>,
    imageprompt: Option<String>,
    text1: Option<String>,
    hint1: Option<String>,
    text2: Option<String>,
    hint2: Option<String>,
    text3: Option<String>,
    hint3: Option<String>,
    text4: Option<String>,
    hint4: Option<String>,
    text5: Option<String>,
    hint5: Option<String>,
    text6: Option<String>,
    hint6: Option<String>,
    text7: Option<String>,
    hint7: Option<String>,
    text8: Option<String>,
    hint8: Option<String>,
    text9: Option<String>,
    hint9: Option<String>,
}

// --- 修改 2: 重新定义命令行接口 ---

/// 一个帮助从目录生成 Anki .apkg 文件的工具
#[derive(Parser, Debug)]
#[command(name = "helper", version, about, long_about = None)]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand, Debug)]
enum Command {
    /// 将指定目录打包成一个 .apkg 文件
    Pack(PackArgs),
}

/// 定义 "pack" 子命令的参数
#[derive(Args, Debug)]
struct PackArgs {
    /// 要打包的目录路径
    #[arg(required = true)]
    pack_dir: PathBuf,

    /// ankimodel.json 模板文件的路径
    #[arg(short, long, default_value = "template/ankimodel.json")]
    template: PathBuf,
}

// --- 3. 核心逻辑函数 ---

/// 加载并解析 ankimodel.json 模板
fn load_model_template(path: &Path) -> Result<AnkiModelTemplate> {
    let file = File::open(path).with_context(|| format!("错误: 无法打开模板文件 {}", path.display()))?;
    let reader = BufReader::new(file);
    let template: AnkiModelTemplate = serde_json::from_reader(reader)
        .with_context(|| format!("错误: 模板文件JSON解析失败 {}", path.display()))?;
    Ok(template)
}

/// 根据模板创建 genanki-rs 模型
fn create_genanki_model(template: AnkiModelTemplate) -> Model {
    let fields = template.flds.into_iter().map(|f| Field::new(&f.name)).collect();
    let templates = template.tmpls.into_iter().map(|t| Template::new(&t.name).qfmt(&t.qfmt).afmt(&t.afmt)).collect();
    let is_cloze = template.model_type.unwrap_or(0) == 1;
    // css 直接作为 Option<String> 使用
    let css = template.css;

    // 使用正确的参数签名调用 new_with_options
    Model::new_with_options(
        template.id,
        &template.name,
        fields,
        templates,
        css.as_deref(),                     // 5. css
        None,                               // 6. latex_pre
        None,                               // 7. latex_post
        // --- FIX 1: 将整数 1 和 0 修改为字符串 "&str" ---
        Some(if is_cloze { "1" } else { "0" }), // 8. type_
        // --- FIX 2: 移除了多余的第10个参数 `req` ---
        None,                               // 9. sort_field_index
    )
}

/// 处理单词JSON文件
fn process_word_files(
    model: &Model,
    json_dir: &Path,
    media_dirs: (&Path, &Path),
    deck: &mut Deck,
    media_files: &mut HashSet<PathBuf>,
    note_count: &mut usize, // 添加计数器参数
) -> Result<()> {
    if !json_dir.exists() {
        println!("警告: 单词JSON目录不存在 {}", json_dir.display());
        return Ok(());
    }

    let pattern = json_dir.join("*.json");
    let word_files: Vec<_> = glob(pattern.to_str().unwrap_or_default())?.filter_map(Result::ok).collect();
    if !word_files.is_empty() {
        println!("找到 {} 个单词文件", word_files.len());
    }

    for word_file in word_files {
        let file = File::open(&word_file)?;
        let data: WordData = match serde_json::from_reader(BufReader::new(file)) {
            Ok(d) => d,
            Err(e) => {
                eprintln!("错误: JSON解析失败 {}: {}", word_file.display(), e);
                continue;
            }
        };

        let mut current_media: Vec<PathBuf> = Vec::new();

        // 处理音频和图片
        let audio_filename = check_media_file(data.audio, media_dirs.0, "音频", &mut current_media);
        let example_audio_filename = check_media_file(data.audio_example, media_dirs.0, "例句音频", &mut current_media);
        let image_filename = check_media_file(data.image, media_dirs.1, "图片", &mut current_media);
        
        // --- 新增: 辅助函数，用于将 serde_json::Value 转换为 String ---
        // 无论原始值是数字(3)还是字符串("3")，都将其转为字符串 "3"
        let value_to_string = |v: Option<Value>| {
            v.map_or(String::new(), |val| val.to_string().trim_matches('"').to_string())
        };

        // 创建字段列表 - 共51个字段
        let mut fields = vec![String::new(); 51];
        fields[0] = data.name.unwrap_or_default();
        fields[2] = value_to_string(data.grade); // <--- 修改
        fields[3] = value_to_string(data.unit); // <--- 修改
        fields[4] = data.symbol.unwrap_or_default();
        fields[5] = data.chn.unwrap_or_default();
        fields[6] = image_filename.map(|f| format!(r#"<img src="{}">"#, f)).unwrap_or_default();
        fields[7] = data.example_en.unwrap_or_default();
        fields[8] = example_audio_filename.map(|f| format!("[sound:{}]", f)).unwrap_or_default();
        fields[9] = audio_filename.map(|f| format!("[sound:{}]", f)).unwrap_or_default();
        fields[11] = data.example_cn.unwrap_or_default();
        fields[12] = data.word_family.unwrap_or_default();
        fields[13] = data.memory_tips.unwrap_or_default();
        fields[14] = value_to_string(data.difficulty); // <--- 修改
        fields[15] = data.collocations.unwrap_or_default();
        
        // --- FIX 2: Convert Vec<String> to Vec<&str> before creating Note ---
        let fields_str: Vec<&str> = fields.iter().map(AsRef::as_ref).collect();
        let note = Note::new(model.clone(), fields_str)?;
        deck.add_note(note);
        *note_count += 1; // 增加计数
        media_files.extend(current_media);
        println!("添加单词: {}", &fields[0]);
    }

    Ok(())
}

/// 处理背诵JSON文件
fn process_recite_files(
    model: &Model,
    json_dir: &Path,
    media_dirs: (&Path, &Path),
    deck: &mut Deck,
    media_files: &mut HashSet<PathBuf>,
    note_count: &mut usize, // 添加计数器参数
) -> Result<()> {
    if !json_dir.exists() {
        println!("警告: 背诵JSON目录不存在 {}", json_dir.display());
        return Ok(());
    }

    let pattern = json_dir.join("*.json");
    let recite_files: Vec<_> = glob(pattern.to_str().unwrap_or_default())?.filter_map(Result::ok).collect();
    if !recite_files.is_empty() {
        println!("找到 {} 个背诵文件", recite_files.len());
    }

    for recite_file in recite_files {
        let file = File::open(&recite_file)?;
        let data: ReciteData = match serde_json::from_reader(BufReader::new(file)) {
            Ok(d) => d,
            Err(e) => {
                eprintln!("错误: JSON解析失败 {}: {}", recite_file.display(), e);
                continue;
            }
        };

        let mut current_media: Vec<PathBuf> = Vec::new();
        let replace_br = |s: Option<String>| s.unwrap_or_default().replace('\n', "<br>");

        let audios = [
            check_media_file(data.audio, media_dirs.0, "音频", &mut current_media),
            check_media_file(data.audio1, media_dirs.0, "音频1", &mut current_media),
            check_media_file(data.audio2, media_dirs.0, "音频2", &mut current_media),
            check_media_file(data.audio3, media_dirs.0, "音频3", &mut current_media),
            check_media_file(data.audio4, media_dirs.0, "音频4", &mut current_media),
            check_media_file(data.audio5, media_dirs.0, "音频5", &mut current_media),
            check_media_file(data.audio6, media_dirs.0, "音频6", &mut current_media),
            check_media_file(data.audio7, media_dirs.0, "音频7", &mut current_media),
            check_media_file(data.audio8, media_dirs.0, "音频8", &mut current_media),
            check_media_file(data.audio9, media_dirs.0, "音频9", &mut current_media),
        ];

        let image_filename = check_media_file(data.image, media_dirs.1, "图片", &mut current_media);

        // 创建字段列表 - 共51个字段
        let mut fields = vec![String::new(); 51];
        fields[16] = data.name.clone().unwrap_or_default();
        fields[17] = data.author.unwrap_or_default();
        fields[18] = replace_br(data.text);
        fields[19] = replace_br(data.hint);
        fields[20] = audios[0].as_ref().map_or(String::new(), |f| format!("[sound:{}]", f));
        fields[21] = replace_br(data.text1);
        fields[22] = replace_br(data.hint1);
        fields[23] = audios[1].as_ref().map_or(String::new(), |f| format!("[sound:{}]", f));
        fields[24] = replace_br(data.text2);
        fields[25] = replace_br(data.hint2);
        fields[26] = audios[2].as_ref().map_or(String::new(), |f| format!("[sound:{}]", f));
        fields[27] = replace_br(data.text3);
        fields[28] = replace_br(data.hint3);
        fields[29] = audios[3].as_ref().map_or(String::new(), |f| format!("[sound:{}]", f));
        fields[30] = replace_br(data.text4);
        fields[31] = replace_br(data.hint4);
        fields[32] = audios[4].as_ref().map_or(String::new(), |f| format!("[sound:{}]", f));
        fields[33] = replace_br(data.text5);
        fields[34] = replace_br(data.hint5);
        fields[35] = audios[5].as_ref().map_or(String::new(), |f| format!("[sound:{}]", f));
        fields[36] = replace_br(data.text6);
        fields[37] = replace_br(data.hint6);
        fields[38] = audios[6].as_ref().map_or(String::new(), |f| format!("[sound:{}]", f));
        fields[39] = replace_br(data.text7);
        fields[40] = replace_br(data.hint7);
        fields[41] = audios[7].as_ref().map_or(String::new(), |f| format!("[sound:{}]", f));
        fields[42] = replace_br(data.text8);
        fields[43] = replace_br(data.hint8);
        fields[44] = audios[8].as_ref().map_or(String::new(), |f| format!("[sound:{}]", f));
        fields[45] = replace_br(data.text9);
        fields[46] = replace_br(data.hint9);
        fields[47] = audios[9].as_ref().map_or(String::new(), |f| format!("[sound:{}]", f));
        fields[48] = replace_br(data.translate);
        fields[49] = image_filename.map_or(String::new(), |f| format!(r#"<img src="{}">"#, f));
        fields[50] = data.imageprompt.unwrap_or_default();
        
        let fields_str: Vec<&str> = fields.iter().map(AsRef::as_ref).collect();
        let note = Note::new(model.clone(), fields_str)?;
        deck.add_note(note);
        *note_count += 1; // 增加计数
        media_files.extend(current_media);
        println!("添加背诵: {}", data.name.unwrap_or_else(|| "无标题".to_string()));
    }
    Ok(())
}


/// 辅助函数：检查媒体文件是否存在并返回其文件名
fn check_media_file(filename_opt: Option<String>, media_dir: &Path, file_type: &str, media_list: &mut Vec<PathBuf>) -> Option<String> {
    filename_opt.and_then(|filename| {
        if filename.is_empty() { return None; }
        let path = media_dir.join(&filename);
        if path.exists() {
            media_list.push(path);
            Some(filename)
        } else {
            eprintln!("警告: {}文件不存在 {}", file_type, path.display());
            None
        }
    })
}

// --- 4. 主函数 ---

/// 运行打包的核心逻辑
fn run_pack(args: PackArgs) -> Result<()> {
    let base_dir = args.pack_dir.canonicalize().with_context(|| format!("错误: 无法解析目录路径 {}", args.pack_dir.display()))?;
    let deck_name = base_dir.file_name().and_then(|s| s.to_str()).unwrap_or("UnnamedDeck");

    // 配置路径
    let word_json_dir = base_dir.join("word_json");
    let recite_json_dir = base_dir.join("recite_json");
    let audio_dir = base_dir.join("audio");
    let images_dir = base_dir.join("images");
    let output_file = base_dir.join(format!("{}_Deck.apkg", deck_name));
    
    // 确保媒体目录存在 (如果不存在则创建)
    for dir in [&audio_dir, &images_dir] {
        if !dir.exists() {
            println!("创建目录: {}", dir.display());
            fs::create_dir_all(dir)?;
        }
    }

    // 加载模板
    let template_path = &args.template; // 直接使用解析出来的路径
     if !template_path.exists() {
        return Err(anyhow!("错误: 模板文件 {} 不存在", template_path.display()));
    }
    let model_template = load_model_template(template_path)?;
    let model = create_genanki_model(model_template);

    // 创建牌组
    let deck_id: i64 = rand::thread_rng().gen_range(1..i64::MAX);
    // Deck 的 description 字段可以留空
    let mut deck = Deck::new(deck_id, &format!("{} 综合学习", deck_name), "");

    // 媒体文件集合
    let mut media_files: HashSet<PathBuf> = HashSet::new();
    let mut note_count = 0; // 声明我们自己的计数器

    // 处理文件 (传入计数器的可变引用)
    process_word_files(&model, &word_json_dir, (&audio_dir, &images_dir), &mut deck, &mut media_files, &mut note_count)?;
    process_recite_files(&model, &recite_json_dir, (&audio_dir, &images_dir), &mut deck, &mut media_files, &mut note_count)?;
    
    // 使用我们自己的计数器进行检查和打印
    if note_count == 0 {
        return Err(anyhow!("错误: 没有找到可用的笔记，请检查JSON文件"));
    }
    println!("正在生成Anki包，包含 {} 张卡片...", note_count);

    // 将 Vec<PathBuf> 转换为 Vec<&str>
    let media_files_vec: Vec<PathBuf> = media_files.into_iter().collect();
    let media_files_str: Vec<&str> = media_files_vec.iter().filter_map(|p| p.to_str()).collect();
    let mut package = Package::new(vec![deck], media_files_str)?;
    package.write_to_file(output_file.to_str().context("输出路径包含无效字符")?)?;
    println!("成功生成Anki包: {}", output_file.display());
    
    Ok(())
}

// --- 修改 4: 更新 main 函数以处理子命令 ---

fn main() -> Result<()> {
    let cli = Cli::parse();

    // 根据解析到的子命令执行相应操作
    match cli.command {
        Command::Pack(args) => {
            // 调用包含所有核心逻辑的函数
            run_pack(args)?;
        }
    }
    
    Ok(())
}