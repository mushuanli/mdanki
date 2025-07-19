// src/models.rs
use serde::Deserialize;
use serde_json::Value;

#[derive(Debug, Deserialize, pub)]
pub struct AnkiModelTemplate {
    pub id: i64,
    pub name: String,
    pub flds: Vec<TemplateField>,
    pub tmpls: Vec<TemplateFormat>,
    pub css: Option<String>,
    #[serde(rename = "type")]
    pub model_type: Option<i32>,
}

#[derive(Debug, Deserialize, pub)]
pub struct TemplateField {
    pub name: String,
}

#[derive(Debug, Deserialize, pub)]
pub struct TemplateFormat {
    pub name: String,
    pub qfmt: String,
    pub afmt: String,
}

#[derive(Debug, Deserialize, Default, pub)]
pub struct WordData {
    pub name: Option<String>,
    pub grade: Option<Value>,
    pub unit: Option<Value>,
    pub symbol: Option<String>,
    pub chn: Option<String>,
    pub audio: Option<String>,
    pub audio_example: Option<String>,
    pub image: Option<String>,
    pub example_en: Option<String>,
    pub example_cn: Option<String>,
    pub word_family: Option<String>,
    pub memory_tips: Option<String>,
    pub difficulty: Option<Value>,
    pub collocations: Option<String>,
}

#[derive(Debug, Deserialize, Default, pub)]
#[allow(dead_code)]
pub struct ReciteData {
    pub name: Option<String>,
    pub author: Option<String>,
    pub text: Option<String>,
    pub hint: Option<String>,
    pub audio: Option<String>,
    pub audio1: Option<String>,
    pub audio2: Option<String>,
    pub audio3: Option<String>,
    pub audio4: Option<String>,
    pub audio5: Option<String>,
    pub audio6: Option<String>,
    pub audio7: Option<String>,
    pub audio8: Option<String>,
    pub audio9: Option<String>,
    pub translate: Option<String>,
    pub image: Option<String>,
    pub imageprompt: Option<String>,
    pub text1: Option<String>,
    pub hint1: Option<String>,
    pub text2: Option<String>,
    pub hint2: Option<String>,
    pub text3: Option<String>,
    pub hint3: Option<String>,
    pub text4: Option<String>,
    pub hint4: Option<String>,
    pub text5: Option<String>,
    pub hint5: Option<String>,
    pub text6: Option<String>,
    pub hint6: Option<String>,
    pub text7: Option<String>,
    pub hint7: Option<String>,
    pub text8: Option<String>,
    pub hint8: Option<String>,
    pub text9: Option<String>,
    pub hint9: Option<String>,
}