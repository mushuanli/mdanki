// src/common/types.rs
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use chrono::{DateTime, Utc};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ChatLog {
    pub uuid: Uuid,
    pub title: String,
    pub created_at: DateTime<Utc>,
    pub model: Option<String>,
    pub status: Option<String>,
    pub system_prompt: Option<String>,
    pub interactions: Vec<Interaction>,
    // REFACTOR: Add new metadata fields
    pub resend_at: Option<DateTime<Utc>>,
    pub fail_reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum Interaction {
    User { content: String },
    Ai { content: String },
    Attachment { filename: String, mime_type: String },
}

impl ChatLog {
    pub fn new(title: String) -> Self {
        Self {
            uuid: Uuid::new_v4(),
            title,
            created_at: Utc::now(),
            model: None,
            status: Some("local".to_string()),
            system_prompt: None,
            interactions: Vec::new(),
            resend_at: None,
            fail_reason: None,
        }
    }
}

#[derive(PartialEq, Debug, Clone, Copy)]
#[repr(u8)]
pub enum PacketType {
    CmdAuthRequest = 0x00,
    CmdAuthChallenge = 0x8A,
    CmdAuthResponse = 0x0A,

    CmdExec = 0x01,        
    CmdList = 0x02,
    CmdGet = 0x03,         
    CmdDelete = 0x04,      
    CmdResend = 0x05,      
    AttachmentChunk = 0x10,
    Ack = 0x80,            
    ResponseList = 0x81,   
    ResponseChatLog = 0x82,
    Error = 0xFF,
}

impl PacketType {
    pub fn from_u8(value: u8) -> Option<Self> {
        match value {
            0x00 => Some(PacketType::CmdAuthRequest),
            0x8A => Some(PacketType::CmdAuthChallenge),
            0x0A => Some(PacketType::CmdAuthResponse),
            0x01 => Some(PacketType::CmdExec),
            0x02 => Some(PacketType::CmdList),
            0x03 => Some(PacketType::CmdGet),
            0x04 => Some(PacketType::CmdDelete),
            0x05 => Some(PacketType::CmdResend),
            0x10 => Some(PacketType::AttachmentChunk),
            0x80 => Some(PacketType::Ack),
            0x81 => Some(PacketType::ResponseList),
            0x82 => Some(PacketType::ResponseChatLog),
            0xFF => Some(PacketType::Error),
            _ => None,
        }
    }
}