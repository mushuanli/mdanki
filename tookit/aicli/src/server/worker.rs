// src/server/worker.rs

use crate::common::config::CONFIG;
use crate::common::protocol::{format_chat_log, parse_chat_file};
use crate::common::types::{ChatLog, Interaction};
use crate::error::Result;
use crate::server::ai_gateway::{self, AiMessage};
use crate::server::db::Database;
use std::fs;
use std::path::Path;
use std::sync::Arc;
use tokio::sync::{mpsc, Semaphore};
use uuid::Uuid;

// The task that the handler sends to the worker
#[derive(Debug)]
pub struct AiTask {
    pub uuid: Uuid,
    pub client_ip: String,
}

// The main loop for the worker pool
pub async fn run_worker_pool(
    db: Arc<Database>,
    semaphore: Arc<Semaphore>,
    mut rx: mpsc::Receiver<AiTask>,
) {
    while let Some(task) = rx.recv().await {
        // Wait for a permit from the semaphore. This limits concurrency.
        let permit = semaphore.clone().acquire_owned().await.unwrap();
        let db_clone = db.clone();
        
        tokio::spawn(async move {
            log::info!("Processing task {}...", task.uuid);
            if let Err(e) = process_task(db_clone, task).await {
                log::error!("Failed to process task: {}", e);
            }
            // The permit is automatically released when `permit` goes out of scope.
            drop(permit);
        });
    }
}

// The logic for processing a single task
async fn process_task(db: Arc<Database>, task: AiTask) -> Result<()> {
    // 1. Update status to 'processing'
    db.update_status(&task.uuid, "processing", None).await?;

    // 2. Read the chat file from disk
    let chat_file_path = Path::new(&CONFIG.storage.chat_dir).join(format!("{}.txt", task.uuid));
    let content = fs::read_to_string(&chat_file_path)?;
    let mut chat_log = parse_chat_file(&content)?;

    // 3. Prepare request for AI
    let ai_client = ai_gateway::create_client(&CONFIG, chat_log.model.as_deref());
    let messages = convert_chat_log_to_ai_messages(&chat_log);

    // 4. Send request to AI and handle response
    match ai_client.send_request(messages).await {
        Ok(ai_response_content) => {
            log::info!("Received AI response for task {}", task.uuid);
            // Append AI response to the log
            chat_log.interactions.push(Interaction::Ai { content: ai_response_content });
            chat_log.status = Some("completed".to_string());
            
            // Write updated log back to file
            let updated_content = format_chat_log(&chat_log);
            fs::write(&chat_file_path, updated_content)?;

            // Update DB status to 'completed'
            db.update_status(&task.uuid, "completed", None).await?;
            log::info!("Task {} completed successfully.", task.uuid);
        }
        Err(e) => {
            log::error!("AI processing for task {} failed: {}", task.uuid, e);
            // Update DB status to 'failed' with error message
            db.update_status(&task.uuid, "failed", Some(&e.to_string())).await?;
        }
    }
    Ok(())
}

fn convert_chat_log_to_ai_messages(log: &ChatLog) -> Vec<AiMessage> {
    let mut messages = Vec::new();
    if let Some(prompt) = &log.system_prompt {
        messages.push(AiMessage { role: "system".to_string(), content: prompt.clone() });
    }
    for interaction in &log.interactions {
        match interaction {
            Interaction::User { content } => {
                messages.push(AiMessage { role: "user".to_string(), content: content.clone() });
            }
            Interaction::Ai { content } => {
                messages.push(AiMessage { role: "assistant".to_string(), content: content.clone() });
            }
            // Note: Attachments with images might need a more complex format for multimodal models
            _ => {}
        }
    }
    messages
}
