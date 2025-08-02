// src/server/ai_gateway/mod.rs

use async_trait::async_trait;
use serde::{ Serialize};

use crate::common::config::Config;
use crate::error::{ Result};
use crate::server::ai_gateway::openai::OpenAiClient;

// A generic message structure that all AI clients can work with.
#[derive(Debug, Serialize, Clone)]
pub struct AiMessage {
    pub role: String, // "system", "user", "assistant"
    pub content: String,
}

#[async_trait]
pub trait AiClient: Send + Sync {
    async fn send_request(&self, messages: Vec<AiMessage>) -> Result<String>;
}

// Factory function to create a client based on config
pub fn create_client(config: &Config, model: Option<&str>) -> Box<dyn AiClient> {
    let model_to_use = model.unwrap_or(&config.server.default_model);
    match config.server.r#type.as_str() {
        "openai" => Box::new(OpenAiClient::new(
            &config.server.url,
            &config.server.token,
            model_to_use,
        )),
        // "gemini" => Box::new(GeminiClient::new(...)),
        _ => panic!("Unsupported AI server type: {}", config.server.r#type),
    }
}

// Sub-modules
pub mod openai;
