// src/error.rs
use thiserror::Error;

#[derive(Error, Debug)]
pub enum AppError {
    #[error("I/O Error: {0}")]
    Io(#[from] std::io::Error),

    #[error("JSON parsing error: {0}")]
    JsonError(#[from] serde_json::Error), // 新增

    #[error("Base58 decoding error: {0}")]
    Bs58Error(#[from] bs58::decode::Error), // 新增

    #[error("Protocol parsing error: {0}")]
    ParseError(String),

    #[error("Network error: {0}")]
    NetworkError(String),

    #[error("Database error: {0}")]
    DbError(String),
    
    #[error("AI service error: {0}")]
    AiServiceError(String),

    #[error("Configuration error: {0}")]
    ConfigError(String),

    #[error("Authentication failed: {0}")]
    AuthError(String),
}

pub type Result<T> = std::result::Result<T, AppError>;
