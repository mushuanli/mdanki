// src/server/worker.rs

use crate::common::config::CONFIG;
use crate::common::protocol::{format_chat_log, parse_chat_file, truncate_after_last_user}; 
use crate::common::types::{ChatLog, Interaction};
use crate::error::{Result, AppError};
use crate::server::ai_gateway::{self, AiMessage};
use crate::server::db::Database;
use std::fs;
use std::path::Path;
use std::sync::Arc;
use tokio::sync::{mpsc, Semaphore};
use uuid::Uuid;
use chrono::Utc;

// The task that the handler sends to the worker
#[derive(Debug)]
pub struct AiTask {
    pub uuid: Uuid,
    pub client_ip: String,
}

/// The main loop for the worker pool.
/// It listens for tasks and processes them concurrently up to a specified limit.
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
            log::info!("Processing task {} for client {}...", task.uuid, task.client_ip);
            
            // This error handling logic is now more robust.
            // process_task handles its own DB status updates for success/failure.
            // This top-level error catch is for I/O errors or other unexpected panics.
            let task_uuid = task.uuid;
            if let Err(e) = process_task(db_clone.clone(), task).await {
                log::error!("Unhandled error in process_task for {}: {}. Updating status to failed.", task_uuid, e);
                if let Err(db_err) = db_clone.update_status(&task_uuid, "failed", Some(&e.to_string())).await {
                    log::error!("CRITICAL: Failed to update DB to 'failed' for task {}: {}", task_uuid, db_err);
                }
            }
            // The permit is automatically released when `permit` goes out of scope.
            drop(permit);
        });
    }
}

/// The logic for processing a single AI task.
async fn process_task(db: Arc<Database>, task: AiTask) -> Result<()> {
    // 1. Update status to 'processing'
    db.update_status(&task.uuid, "processing", None).await?;

    // 2. Read and parse the chat file from disk
    let chat_file_path = Path::new(&CONFIG.storage.chat_dir).join(format!("{}.txt", task.uuid));
    let content = fs::read_to_string(&chat_file_path)?;
    let mut chat_log = parse_chat_file(&content)?;

    // --- START OF THE FIX ---
    // 3. **CRITICAL STEP**: Before sending a new request, remove any previous
    //    AI responses or errors. This ensures we always start from a clean slate
    //    after the last user prompt, preventing duplicate responses/errors.
    truncate_after_last_user(&mut chat_log);
    // --- END OF THE FIX ---

    // 4. Prepare request for AI (was step 3)
    if chat_log.model.is_none() {
        chat_log.model = Some(CONFIG.server.default.clone());
    }
    let model_identifier = chat_log.model.as_ref().unwrap();

    let ai_client = ai_gateway::create_client(&CONFIG, model_identifier)?;
    let messages = convert_chat_log_to_ai_messages(&chat_log);

    // Defensive check: If after truncation there are no messages, it's an error.
    if messages.is_empty() {
        return Err(AppError::AiServiceError(
            "Cannot process task: No valid user prompts found to send to AI.".to_string()
        ));
    }

    // 5. Send request to AI and handle response (was step 4)
    let ai_response_result = ai_client.send_request(messages).await;

    match ai_response_result {
        Ok(ai_response_content) => {
            log::info!("Received AI response for task {}", task.uuid);
            // Append the NEW AI response
            chat_log.interactions.push(Interaction::Ai {
                content: ai_response_content,
                created_at: Utc::now(),
            });
            chat_log.status = Some("completed".to_string());
            db.update_status(&task.uuid, "completed", None).await?;
            log::info!("Task {} completed successfully.", task.uuid);
        }
        Err(e) => {
            log::error!("AI processing for task {} failed: {}", task.uuid, e);
            // Append the NEW error details
            chat_log.interactions.push(Interaction::Error {
                reason: e.to_string(),
                created_at: Utc::now(),
            });
            chat_log.status = Some("failed".to_string());
            db.update_status(&task.uuid, "failed", Some(&e.to_string())).await?;
            log::warn!("Task {} marked as failed. Wrote error details to session file.", task.uuid);
        }
    }
    
    // 6. Write the final, clean state back to the file
    let updated_content = format_chat_log(&chat_log);
    fs::write(&chat_file_path, updated_content)?;

    Ok(())
}

/// Converts a ChatLog into a sequence of messages for an AI model.
fn convert_chat_log_to_ai_messages(log: &ChatLog) -> Vec<AiMessage> {
    let mut messages = Vec::new();
    if let Some(prompt) = &log.system_prompt {
        messages.push(AiMessage { role: "system".to_string(), content: prompt.clone() });
    }
    for interaction in &log.interactions {
        match interaction {
            Interaction::User { content, .. } => {
                messages.push(AiMessage { role: "user".to_string(), content: content.clone() });
            }
            Interaction::Ai { content, .. } => {
                messages.push(AiMessage { role: "assistant".to_string(), content: content.clone() });
            }
            // Attachments and Errors are not sent to the AI in this implementation.
            _ => {}
        }
    }
    messages
}
