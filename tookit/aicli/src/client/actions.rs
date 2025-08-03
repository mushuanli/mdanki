// src/client/actions.rs

use std::sync::Arc;
use tokio::sync::{mpsc, Mutex};
use ratatui_textarea::TextArea;

use crate::error::{Result, AppError};
use crate::common::protocol::{format_chat_log, parse_chat_file,truncate_after_last_user};
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

        Action::SyncSelected { uuid, remote_status, local_status } => {
            let mut client = NetworkClient::connect(&SERVER_ADDR, &CLIENT_USERNAME, USER_PRIVATE_KEY_PATH).await?;
            
            let (new_local_status, status_message) = match (&local_status, remote_status.as_deref()) {
                
                // --- CORE FIX IS HERE ---
                // 如果文件是本地创建或修改过的，我们就上传它
                (SyncStatus::Local | SyncStatus::Modified, _) => {
                    log::info!("Session {} is local/modified. Preparing and uploading...", uuid);
                    
                    // 1. 从 store 获取会话对象，这会从磁盘读取文件内容。
                    //    我们克隆它，这样就不需要长时间持有锁。
                    let mut log_to_run = app.lock().await.store.get_session(uuid)?;

                    // 2. 在内存中(in-memory)准备要发送的内容。
                    //    这个函数会移除最后一个 `::>user:` 之后的所有AI回复，以确保是续写或重试。
                    //    这步操作不会修改磁盘上的原始文件。
                    truncate_after_last_user(&mut log_to_run);

                    // 3. 将内存中的、准备好的版本格式化为字符串。
                    let content_to_send = format_chat_log(&log_to_run);
                    
                    // 4. 发送准备好的内容到服务器。
                    client.execute_chat(&content_to_send).await?;
                    
                    // 5. 因为上传成功，我们将本地状态更新为 Pending。
                    //    这里我们只更新状态，不改变文件内容。
                    (SyncStatus::Pending, format!("Session {} sent to server.", uuid))
                },
                // --- END OF FIX ---

                // 如果服务器端执行失败，我们可以选择重发
                (_, Some(rs)) if rs.starts_with("failed:") => {
                    log::info!("Session {} failed on server. Resending...", uuid);
                    client.resend_task(uuid).await?;
                    (SyncStatus::Pending, format!("Resend request for {} sent.", uuid))
                },

                // 其他情况（如 Pending, Done），默认操作是下载服务器的最新版本
                _ => {
                    log::info!("Session {} is on server. Downloading result...", uuid);
                    let remote_tasks = client.list_tasks().await?;
                    let remote_task_info = remote_tasks.into_iter().find(|t| t.uuid == uuid)
                        .ok_or_else(|| AppError::NetworkError(format!("Session {} not found on server.", uuid)))?;
                    
                    let content = client.download_task(uuid).await?;
                    
                    // 这个函数会用服务器内容覆盖本地文件，这是预期的下载行为。
                    app.lock().await.store.update_from_remote(&content, &remote_task_info)?;
                    
                    // 根据服务器状态决定最终本地状态
                    let final_status = if remote_task_info.status == "completed" {
                        SyncStatus::Finish 
                    } else { 
                        SyncStatus::Failed 
                    };
                    (final_status, format!("Session {} synced from server.", uuid))
                }
            };
            
            // 统一在最后更新本地数据库和UI
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
