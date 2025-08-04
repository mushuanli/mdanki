// src/client/actions.rs

use std::sync::Arc;
use tokio::sync::{mpsc, Mutex};
use ratatui_textarea::TextArea;

use crate::error::{Result, AppError};
use crate::common::protocol::{format_chat_log, parse_chat_file};
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
            
            // Delegate metadata merging to the store
            app_lock.store.update_from_remote_list(remote_tasks)?;
            
            app_lock.reload_sessions();
            app_lock.status_message = Some("Metadata sync complete.".into());
            log::info!("Metadata sync completed");
        }

        Action::SendNewTask(log) => {
            let mut client = NetworkClient::connect(&SERVER_ADDR, &CLIENT_USERNAME, USER_PRIVATE_KEY_PATH).await?;
            let content = format_chat_log(&log);
            
            // Save locally, send, then update status
            {
                let mut app_lock = app.lock().await;
                app_lock.store.save_session(&log, SyncStatus::Local)?;
                app_lock.store.save_index()?;
            }
            client.execute_chat(&content).await?;
            {
                let mut app_lock = app.lock().await;
                app_lock.store.update_session_status(log.uuid, SyncStatus::Pending, None)?;
                app_lock.reload_sessions();
                app_lock.status_message = Some(format!("Session {} sent.", log.uuid));
            }
            log::info!("Successfully sent new session {}", log.uuid);
        }

        Action::SendAppendedPrompt { uuid, prompt } => {
            let mut client = NetworkClient::connect(&SERVER_ADDR, &CLIENT_USERNAME, USER_PRIVATE_KEY_PATH).await?;
            let content = {
                let mut app_lock = app.lock().await;
                app_lock.store.append_prompt(uuid, prompt)?;
                app_lock.reload_sessions();
                app_lock.store.get_session_content(uuid)?
            };
            
            client.execute_chat(&content).await?;
            {
                let mut app_lock = app.lock().await;
                app_lock.store.update_session_status(uuid, SyncStatus::Pending, None)?;
                app_lock.reload_sessions();
                app_lock.status_message = Some(format!("Appended prompt sent for {}.", uuid));
            }
            log::info!("Successfully sent appended session {}", uuid);
        }

        Action::SyncSelected { uuid, local_status } => {
            let mut client = NetworkClient::connect(&SERVER_ADDR, &CLIENT_USERNAME, USER_PRIVATE_KEY_PATH).await?;
            
            let (new_local_status, status_message) = match local_status {
                // --- UPLOAD FLOW ---
                // The client has the authoritative version. This applies to new, modified, or failed-and-retried sessions.
                SyncStatus::Local | SyncStatus::Modified | SyncStatus::Failed => {
                    log::info!("Client has authority for session {}. Uploading...", uuid);
                    
                    let content = {
                        let mut app_lock = app.lock().await;
                        // prepare_for_run cleans any previous AI/Error responses, making it perfect for retries.
                        let log_to_run = app_lock.store.prepare_for_run(uuid)?;
                        format_chat_log(&log_to_run)
                    };

                    client.execute_chat(&content).await?;
                    (SyncStatus::Pending, format!("Session {} sent to server.", uuid))
                },

                // --- DOWNLOAD FLOW ---
                // The server has the authoritative version, and we need to get it.
                // This applies when the server is Done, Processing, or we are just checking on a Pending task.
                SyncStatus::Pending | SyncStatus::Processing | SyncStatus::Done => {
                    log::info!("Server has authority for session {}. Downloading result...", uuid);
                    
                    // We need the remote metadata to properly update the local store
                    let remote_tasks = client.list_tasks().await?;
                    let remote_task_info = remote_tasks.into_iter().find(|t| t.uuid == uuid)
                        .ok_or_else(|| AppError::NetworkError(format!("Session {} not found on server during sync.", uuid)))?;
                    
                    let content = client.download_task(uuid).await?;
                    
                    app.lock().await.store.update_from_remote(&content, &remote_task_info)?;
                    (SyncStatus::Finish, format!("Session {} synced from server.", uuid))
                }

                // --- NO-OP FLOW ---
                // The session is already fully synced. Nothing to do.
                SyncStatus::Finish => {
                    log::info!("Session {} is already synced. No action taken.", uuid);
                    (SyncStatus::Finish, format!("Session {} is already up to date.", uuid))
                }
                
                // --- CONFLICT/UNHANDLED FLOW ---
                SyncStatus::Conflict => {
                    log::warn!("Session {} is in a conflict state. Manual resolution required.", uuid);
                    (SyncStatus::Conflict, "Conflict detected. Action not yet implemented.".to_string())
                }
            };
            
            // Update the local store and UI with the outcome.
            let mut app_lock = app.lock().await;
            // 注意：这里我们只更新状态，而不传递 remote_status，因为上面的逻辑已经处理了它
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
            let mut client = NetworkClient::connect(&SERVER_ADDR, &CLIENT_USERNAME, USER_PRIVATE_KEY_PATH).await?;
            
            let (uuid, content) = {
                let mut app_lock = app.lock().await;
                if let Some(uuid) = app_lock.editor_task_uuid {
                    let content = app_lock.editor_textarea.lines().join("\n");
                    let log_to_save = parse_chat_file(&content)?;
                    app_lock.store.save_session(&log_to_save, SyncStatus::Modified)?;
                    app_lock.store.save_index()?;
                    app_lock.reload_sessions();
                    Some((uuid, content))
                } else { None }
            }.ok_or_else(|| AppError::ParseError("No active editor task".to_string()))?;
            
            client.update_task(uuid, &content).await?;
            
            let mut app_lock = app.lock().await;
            app_lock.store.update_session_status(uuid, SyncStatus::Pending, None)?;
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
    let mut app_lock = app.lock().await;

    match action {
        Action::StartEdit(uuid) => {
            let content = app_lock.store.get_session_content(uuid)?;
            app_lock.editor_textarea = TextArea::new(content.lines().map(String::from).collect());
            app_lock.editor_task_uuid = Some(uuid);
            app_lock.mode = AppMode::EditingTask;
            app_lock.status_message = Some("Editor loaded. CTRL+S to save, Esc to cancel.".into());
        },
        // --- ADD: ViewTask is a local action ---
        Action::ViewTask(uuid) => {
            let content = app_lock.store.get_session_content(uuid)?;
            app_lock.viewer_content = content;
            app_lock.mode = AppMode::ViewingTask;
            app_lock.status_message = Some("Viewing session. Press Esc or 'q' to return.".into());
        },
        Action::EnterAppendPrompt(uuid) => {
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
