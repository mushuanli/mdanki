// src/client/actions.rs

use std::sync::Arc;
use tokio::sync::{mpsc, Mutex};
use ratatui_textarea::TextArea;
use chrono::Utc;

use crate::error::{Result, AppError};
use crate::common::protocol::{format_chat_log, parse_chat_file};
use crate::common::types::Interaction;
use super::network::NetworkClient;
use super::tui::app::{App, AppMode};
use super::tui::action::Action;
use super::local_store::SyncStatus;
use super::cli::{SERVER_ADDR, CLIENT_USERNAME, USER_PRIVATE_KEY_PATH};

/// Handles actions that require network communication.
/// Each match arm is self-contained and responsible for its own network connection.
pub async fn handle_network_action(
    action: Action,
    app: Arc<Mutex<App<'static>>>,
    // The tx is for sending follow-up actions, but we're not using it yet.
    _tx: mpsc::UnboundedSender<Action>,
) -> Result<()> {
    log::info!("Handling network action: {:?}", action);

    match action {
        Action::Refresh => {
            let mut client = NetworkClient::connect(&SERVER_ADDR, &CLIENT_USERNAME, USER_PRIVATE_KEY_PATH).await?;
            
            // After connection, update the models in the app state
            app.lock().await.set_models(client.models.clone(), &client.default_model);
            
            let remote_tasks = client.list_tasks().await?;
            let mut app_lock = app.lock().await;
            app_lock.status_message = Some(format!("Found {} remote tasks. Syncing metadata...", remote_tasks.len()));

            // Logic to merge remote status with local index
            let mut changed = false;
            for task in remote_tasks {
                if let Some(info) = app_lock.store.index.get_mut(&task.uuid) {
                    let new_remote_status_str = if let Some(err) = &task.error_message {
                        format!("failed: {}", err)
                    } else {
                        task.status.clone()
                    };
                    let new_remote_status = Some(new_remote_status_str);

                    let new_sync_status = match task.status.as_str() {
                        "pending" => SyncStatus::Pending, "processing" => SyncStatus::Processing,
                        "completed" => SyncStatus::Done, "failed" => SyncStatus::Failed,
                        _ => info.sync_status.clone(),
                    };

                    if info.remote_status != new_remote_status || info.sync_status != new_sync_status {
                        info.title = task.title.clone();
                        info.remote_status = new_remote_status;
                        info.sync_status = new_sync_status;
                        changed = true;
                    }
                }
            }
            if changed {
                app_lock.store.save_index()?;
            }
            app_lock.reload_sessions();
            app_lock.status_message = Some("Metadata sync complete.".into());
            log::info!("Metadata sync completed");
        }

        Action::SendNewTask(log) => {
            // 1. Save locally FIRST. This marks it as `Local`.
            {
                let mut app_lock = app.lock().await;
                app_lock.store.save_session(&log)?;
                app_lock.store.save_index()?;
                app_lock.reload_sessions();
            }

            // 2. Send to server
            let content = format_chat_log(&log);
            let mut client = NetworkClient::connect(&SERVER_ADDR, &CLIENT_USERNAME, USER_PRIVATE_KEY_PATH).await?;
            client.execute_chat(&content).await?;
            
            // 3. Update local status to Pending
            {
                let mut app_lock = app.lock().await;
                app_lock.store.update_session_status(log.uuid, SyncStatus::Pending, None)?;
                app_lock.reload_sessions();
                app_lock.status_message = Some(format!("Session {} sent.", log.uuid));
            }
            log::info!("Successfully sent new session {}", log.uuid);
        }

        Action::SendAppendedPrompt { uuid, prompt } => {
            log::info!("Appending prompt to session {} and sending...", uuid);
            
            // 1. Load, append, and save locally.
            let content = {
                let mut app_lock = app.lock().await;
                let mut chat_log = app_lock.store.get_session(uuid)?;
                chat_log.interactions.push(Interaction::User {
                    content: prompt,
                    created_at: Utc::now(),
                });
                app_lock.store.save_session(&chat_log)?;
                app_lock.store.save_index()?;
                app_lock.reload_sessions();
                
                // Return the full content for sending.
                format_chat_log(&chat_log)
            };

            // 2. Send the entire updated log to the server.
            let mut client = NetworkClient::connect(&SERVER_ADDR, &CLIENT_USERNAME, USER_PRIVATE_KEY_PATH).await?;
            // The server's `handle_exec` will overwrite the old file and re-queue.
            client.execute_chat(&content).await?;
            
            // 3. Update local status to `Pending`.
            {
                let mut app_lock = app.lock().await;
                app_lock.store.update_session_status(uuid, SyncStatus::Pending, None)?;
                app_lock.reload_sessions();
                app_lock.status_message = Some(format!("Appended prompt sent for {}.", uuid));
            }
            log::info!("Successfully sent appended session {}", uuid);
        }

        Action::SyncSelected { uuid, remote_status, local_status } => {
            let mut client = NetworkClient::connect(&SERVER_ADDR, &CLIENT_USERNAME, USER_PRIVATE_KEY_PATH).await?;
            
            let (new_local_status, status_message) = match (&local_status, remote_status.as_deref()) {
                // If it's local or modified, we need to upload it.
                (SyncStatus::Local | SyncStatus::Modified, _) => {
                    log::info!("Session {} is local/modified. Uploading...", uuid);
                    let content = app.lock().await.store.get_session_content(uuid)?;
                    client.execute_chat(&content).await?;
                    (SyncStatus::Pending, format!("Session {} sent.", uuid))
                },
                // If it failed on the server, we can resend it.
                (_, Some(rs)) if rs.starts_with("failed:") => {
                    log::info!("Session {} failed on server. Resending...", uuid);
                    client.resend_task(uuid).await?;
                    (SyncStatus::Pending, format!("Resend request for {} sent.", uuid))
                },
                // Otherwise, the default sync action is to download the result from the server.
                _ => {
                    log::info!("Session {} is on server. Downloading result...", uuid);
                    let content = client.download_task(uuid).await?;
                    let log = parse_chat_file(&content)?;
                    
                    // We need to create a RemoteTask object to use the update_from_remote helper
                    let remote_task_info = super::network::RemoteTask {
                        uuid,
                        title: log.title.clone(),
                        status: log.status.as_deref().unwrap_or("completed").to_string(),
                        created_at: log.get_creation_time(),
                        error_message: log.fail_reason,
                    };
                    app.lock().await.store.update_from_remote(&content, &remote_task_info)?;
                    (SyncStatus::Finish, format!("Session {} synced from server.", uuid))
                }
            };
            
            // Update the local store and UI with the outcome.
            let mut app_lock = app.lock().await;
            app_lock.store.update_session_status(uuid, new_local_status, None)?;
            app_lock.reload_sessions();
            app_lock.status_message = Some(status_message);
        }

        Action::DeleteTask(uuid) => {
            let mut client = NetworkClient::connect(&SERVER_ADDR, &CLIENT_USERNAME, USER_PRIVATE_KEY_PATH).await?;
            client.delete_task(uuid).await?;

            let mut app_lock = app.lock().await;
            app_lock.store.delete_session(uuid)?;
            app_lock.reload_sessions();
            app_lock.status_message = Some(format!("Task {} deleted.", uuid));
        }

        Action::SaveEdit => {
            // 1. Get content from editor and save locally
            let (uuid, content) = {
                let mut app_lock = app.lock().await;
                if let Some(uuid) = app_lock.editor_task_uuid {
                    let content = app_lock.editor_textarea.lines().join("\n");
                    let log_to_save = parse_chat_file(&content)?;
                    // This save marks the session as `Modified`
                    app_lock.store.save_session(&log_to_save)?;
                    app_lock.store.save_index()?;
                    app_lock.reload_sessions();
                    Some((uuid, content))
                } else { None }
            }.ok_or_else(|| AppError::ParseError("No active editor task".to_string()))?;
            
            // 2. Send the updated content to the server
            let mut client = NetworkClient::connect(&SERVER_ADDR, &CLIENT_USERNAME, USER_PRIVATE_KEY_PATH).await?;
            client.update_task(uuid, &content).await?;
            
            // 3. Update UI
            let mut app_lock = app.lock().await;
            app_lock.status_message = Some(format!("Session {} saved and synced.", uuid));
            app_lock.mode = AppMode::TaskList;
        }

        // Non-network actions are filtered out before this function is called.
        _ => {},
    };

    Ok(())
}

/// Handles actions that only modify local state and do not require network access.
pub async fn handle_local_action(action: Action, app: Arc<Mutex<App<'static>>>) -> Result<()> {
    log::debug!("Handling local action: {:?}", action);

    match action {
        Action::StartEdit(uuid) => {
            let mut app_lock = app.lock().await;
            let content = app_lock.store.get_session_content(uuid)?;
            app_lock.editor_textarea = TextArea::new(content.lines().map(String::from).collect());
            app_lock.editor_task_uuid = Some(uuid);
            app_lock.mode = AppMode::EditingTask;
            app_lock.status_message = Some("Editor loaded. CTRL+S to save, Esc to cancel.".into());
        },
        // --- ADD: ViewTask is a local action ---
        Action::ViewTask(uuid) => {
            let mut app_lock = app.lock().await;
            let content = app_lock.store.get_session_content(uuid)?;
            app_lock.viewer_content = content;
            app_lock.mode = AppMode::ViewingTask;
            app_lock.status_message = Some("Viewing session. Press Esc or 'q' to return.".into());
        },
        Action::EnterAppendPrompt(uuid) => {
            let mut app_lock = app.lock().await;
            app_lock.active_append_uuid = Some(uuid);
            app_lock.append_prompt_input = TextArea::default();
            app_lock.append_prompt_input.set_block(
                ratatui::widgets::Block::default()
                    .borders(ratatui::widgets::Borders::ALL)
                    .title(" Add to Conversation ")
            );
            app_lock.mode = AppMode::AppendPromptPopup;
            app_lock.status_message = Some("Enter prompt. Press Enter to send, Esc to cancel.".into());
        },
        // Other actions are either UI-only (handled in App::update) or network actions.
        _ => {}
    }
    Ok(())
}
