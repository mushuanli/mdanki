// src/common/protocol.rs
use crate::common::types::{ChatLog, Interaction};
use crate::error::Result; // AppError is not directly used, so remove it from import
use chrono::{DateTime, Utc};
use std::str::FromStr;
use uuid::Uuid;

const PREFIX_UUID: &str = "::>uuid:";
const PREFIX_TITLE: &str = "::>title:";
const PREFIX_MODEL: &str = "::>model:";
const PREFIX_STATUS: &str = "::>status:";
const PREFIX_SYSTEM: &str = "::>system:";
const PREFIX_USER: &str = "::>user:";
const PREFIX_RESPONSE: &str = "::>response:";
const PREFIX_ATTACH: &str = "::>attach:";
// REFACTOR: Add new prefixes
const PREFIX_RESEND_AT: &str = "::>resend_at:";
const PREFIX_FAIL_REASON: &str = "::>failreason:";

// --- REFACTORED: New format for parsing lines with timestamps ---
fn parse_line_with_timestamp<'a>(prefix: &str, line: &'a str) -> Option<(DateTime<Utc>, &'a str)> {
    line.strip_prefix(prefix)
        .and_then(|stripped| stripped.trim().strip_prefix('['))
        .and_then(|s| s.split_once("] "))
        .and_then(|(ts_str, content)| {
            DateTime::parse_from_rfc3339(ts_str).ok()
                .map(|dt| (dt.with_timezone(&Utc), content))
        })
}

/// Parses a string in the AI chat txt format into a ChatLog struct.
pub fn parse_chat_file(content: &str) -> Result<ChatLog> {
    let mut log = ChatLog::new("Untitled".to_string());

    enum LastField { None, System, User, Ai, FailReason }
    let mut last_field = LastField::None;

    for line in content.lines() {
        if line.starts_with("::>") {
            last_field = LastField::None;
            if let Some(val) = line.strip_prefix(PREFIX_UUID) {
                log.uuid = Uuid::from_str(val.trim())?;
            } else if let Some(val) = line.strip_prefix(PREFIX_TITLE) {
                log.title = val.trim().to_string();
            } else if let Some((created_at, content)) = parse_line_with_timestamp(PREFIX_USER, line) {
                log.interactions.push(Interaction::User { content: content.to_string(), created_at });
                last_field = LastField::User;
            } else if let Some((created_at, content)) = parse_line_with_timestamp(PREFIX_RESPONSE, line) {
                log.interactions.push(Interaction::Ai { content: content.to_string(), created_at });
                last_field = LastField::Ai;
            } else if let Some(val) = line.strip_prefix(PREFIX_MODEL) {
                log.model = Some(val.trim().to_string());
            } else if let Some(val) = line.strip_prefix(PREFIX_STATUS) {
                log.status = Some(val.trim().to_string());
            } else if let Some(val) = line.strip_prefix(PREFIX_SYSTEM) {
                log.system_prompt = Some(val.trim().to_string());
                last_field = LastField::System;
            } else if let Some(val) = line.strip_prefix(PREFIX_FAIL_REASON) {
                log.fail_reason = Some(val.trim().to_string());
                last_field = LastField::FailReason;
            } else if let Some(val) = line.strip_prefix(PREFIX_RESEND_AT) {
                log.resend_at = Some(DateTime::parse_from_rfc3339(val.trim())?.with_timezone(&Utc));
            } else if let Some(val) = line.strip_prefix(PREFIX_ATTACH) {
                let parts: Vec<&str> = val.split(':').map(str::trim).collect();
                if parts.len() == 2 {
                    log.interactions.push(Interaction::Attachment {
                        filename: parts[0].to_string(),
                        mime_type: parts[1].to_string(),
                    });
                }
            }
        } else {
            // This is a multi-line continuation. Append to the last seen field.
            match last_field {
                LastField::System => {
                    if let Some(prompt) = log.system_prompt.as_mut() {
                        prompt.push('\n');
                        prompt.push_str(line);
                    }
                }
                LastField::User => {
                    if let Some(Interaction::User { content, .. }) = log.interactions.last_mut() {
                        content.push('\n');
                        content.push_str(line);
                    }
                }
                LastField::Ai => {
                    if let Some(Interaction::Ai { content, .. }) = log.interactions.last_mut() {
                        content.push('\n');
                        content.push_str(line);
                    }
                }
                // FIX: Add the missing match arm for FailReason
                LastField::FailReason => {
                    if let Some(reason) = log.fail_reason.as_mut() {
                        reason.push('\n');
                        reason.push_str(line);
                    }
                }
                LastField::None => {
                    // Ignore lines before any valid tag, or handle as an error
                }
            }
        }
    }

    Ok(log)
}

/// Formats a ChatLog struct back into the AI chat txt format string.
pub fn format_chat_log(log: &ChatLog) -> String {
    let mut builder = String::new();

    builder.push_str(&format!("{} {}\n", PREFIX_UUID, log.uuid));
    builder.push_str(&format!("{} {}\n", PREFIX_TITLE, log.title));
    
    if let Some(model) = &log.model {
        builder.push_str(&format!("{} {}\n", PREFIX_MODEL, model));
    }
    if let Some(status) = &log.status {
        builder.push_str(&format!("{} {}\n", PREFIX_STATUS, status));
    }
    if let Some(reason) = &log.fail_reason {
        builder.push_str(&format!("{} {}\n", PREFIX_FAIL_REASON, reason));
    }
    if let Some(ts) = &log.resend_at {
        builder.push_str(&format!("{} {}\n", PREFIX_RESEND_AT, ts.to_rfc3339()));
    }
    if let Some(prompt) = &log.system_prompt {
        builder.push_str(&format!("{} {}\n", PREFIX_SYSTEM, prompt));
    }

    for interaction in &log.interactions {
        match interaction {
            Interaction::User { content, created_at } => {
                builder.push_str(&format!("{} [{}] {}\n", PREFIX_USER, created_at.to_rfc3339(), content));
            }
            Interaction::Ai { content, created_at } => {
                builder.push_str(&format!("{} [{}] {}\n", PREFIX_RESPONSE, created_at.to_rfc3339(), content));
            }
            Interaction::Attachment { filename, mime_type } => {
                builder.push_str(&format!("{} {} : {}\n", PREFIX_ATTACH, filename, mime_type));
            }
        }
    }
    builder
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_and_format_roundtrip() {
        let original_content = r#"::>uuid: 550e8400-e29b-41d4-a716-446655440000
::>title: Test Chat
::>created_at: 2023-10-27T10:00:00Z
::>model: gpt-4
::>status: completed
::>system: You are a helpful assistant.
This is a multi-line system prompt.
::>user: Hello AI.
How are you?
::>response: I am an AI, I don't have feelings.
I am doing well in terms of operation.
::>attach: data.zip : application/zip
"#;

        let log = parse_chat_file(original_content).unwrap();

        assert_eq!(log.uuid.to_string(), "550e8400-e29b-41d4-a716-446655440000");
        assert_eq!(log.title, "Test Chat");
        assert_eq!(log.system_prompt.unwrap(), "You are a helpful assistant.\nThis is a multi-line system prompt.");
        
        if let Some(Interaction::User { content }) = log.interactions.get(0) {
            assert_eq!(content, "Hello AI.\nHow are you?");
        } else {
            panic!("First interaction should be user");
        }

        if let Some(Interaction::Attachment { filename, mime_type }) = log.interactions.get(2) {
             assert_eq!(filename, "data.zip");
             assert_eq!(mime_type, "application/zip");
        } else {
             panic!("Third interaction should be attachment");
        }

        let formatted_content = format_chat_log(&log);
        println!("{}", formatted_content); // For manual inspection
        // Note: A perfect roundtrip might be tricky due to newlines/spacing. 
        // A better test is to parse the formatted content again and check for equality of structs.
        let re_parsed_log = parse_chat_file(&formatted_content).unwrap();
        
        // This now works because we added `#[derive(PartialEq)]` to ChatLog and Interaction
        assert_eq!(log, re_parsed_log);
    }
}
