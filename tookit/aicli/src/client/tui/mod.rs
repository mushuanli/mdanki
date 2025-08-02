// src/client/tui/mod.rs

use crate::error::Result;
use crate::common::protocol::parse_chat_file; // <-- FIXED: Added this import
use crossterm::{
    event::{self, DisableMouseCapture, EnableMouseCapture, Event},
    execute,
    terminal::{disable_raw_mode, enable_raw_mode, EnterAlternateScreen, LeaveAlternateScreen},
};
use ratatui::prelude::*;
use std::{io, sync::Arc, time::Duration};
use tokio::sync::{mpsc, Mutex};
use ratatui_textarea::TextArea;

// MODIFIED: Use shared constants from the cli module
use super::cli::{SERVER_ADDR, CLIENT_USERNAME, USER_PRIVATE_KEY_PATH};
use crate::client::network::NetworkClient;

use self::{
    app::{App, AppMode}, // <-- FIXED: Corrected AppMode path
    ui::draw,
    action::Action,
};

mod app;
mod ui;
mod action;

pub async fn run() -> Result<()> {
    // FIX (E0716): Create the Tui struct and give it a long-lived binding `tui`.
    let mut tui = Tui::new()?;
    // Then, call methods on the now-owned struct.
    tui.enter()?;
    
    // Create a channel for actions
    let (tx, mut rx) = mpsc::unbounded_channel::<Action>();

    // Create App state
    let app = Arc::new(Mutex::new(App::new()?));

    // Initial refresh
    // FIX: Channel send can fail if the receiver is dropped.
    // In this loop, it won't, but it's good practice to handle it. .ok() is fine here.
    tx.send(Action::Refresh).ok();

    // Main loop
    loop {
        let mut app_lock = app.lock().await;
        // FIX: The Tui struct holds the terminal, so we need to access it via `tui.terminal`.
        tui.terminal.draw(|f| draw(f, &mut app_lock))?;

        if app_lock.should_quit {
            break;
        }
        
        // Handle events and actions
        if event::poll(Duration::from_millis(50))? {
            if let Event::Key(key) = event::read()? {
                // FIX: get_action_for_key needs a mutable lock
                if let Some(action) = app_lock.get_action_for_key(key) {
                    // FIX: Handle potential send error
                    tx.send(action).ok();
                }
            }
        }

        if let Ok(action) = rx.try_recv() {
            // Only update needs a mutable lock
            app_lock.update(action.clone());
            // Drop the lock before spawning a task to avoid deadlocks
            drop(app_lock);
            
        // MODIFIED: StartEdit no longer triggers network I/O.
        // It reads from the local store first.
        let should_trigger_network = matches!(action, 
            Action::Refresh |      // Sync with remote
            Action::DeleteTask(_) |  // Tell remote to delete
            Action::ResendTask(_) |  // Send to remote
            Action::SaveEdit         // Send update to remote
        );

            if should_trigger_network {
                let app_clone = app.clone();
                let tx_clone = tx.clone();
                tokio::spawn(async move {
                if let Err(e) = handle_network_action(action, app_clone.clone(), tx_clone).await {
                    let mut app = app_clone.lock().await;
                    app.status_message = Some(format!("Error: {}", e));
                }
                });
            }
        // Handle actions that only affect local state
        else if matches!(action, Action::StartEdit(_)) {
            let app_clone = app.clone();
            tokio::spawn(async move {
                if let Err(e) = handle_local_action(action, app_clone.clone()).await {
                     let mut app = app_clone.lock().await;
                    app.status_message = Some(format!("Error: {}", e));
                }
            });
        }
        }
    }

    tui.exit()?;
    Ok(())
}

// FIX: This function performs operations that can fail, so it should return a Result.
// This allows us to use the `?` operator inside it.
async fn handle_network_action(action: Action, app: Arc<Mutex<App<'static>>>, _tx: mpsc::UnboundedSender<Action>) -> Result<()> {
    // This function now only handles actions that require a network client
    let mut client = NetworkClient::connect(&SERVER_ADDR, &CLIENT_USERNAME, USER_PRIVATE_KEY_PATH).await?;
    
    match action {
        Action::Refresh => {
            let remote_tasks = client.list_tasks().await?;
            let mut app_lock = app.lock().await;
            app_lock.status_message = Some(format!("Found {} remote tasks. Syncing...", remote_tasks.len()));
            drop(app_lock);

            // Create a new client for concurrent downloads
            // This is an optimization to speed up sync
            for task in remote_tasks {
                 let mut download_client = NetworkClient::connect(&SERVER_ADDR, &CLIENT_USERNAME, USER_PRIVATE_KEY_PATH).await?;
                 let content = download_client.download_task(task.uuid).await?;
                 let mut app_lock = app.lock().await;
                 app_lock.store.update_from_remote(&content, &task)?;
            }

            let mut app_lock = app.lock().await;
            app_lock.reload_sessions();
            app_lock.status_message = Some("Sync with server complete.".into());
        },

        Action::DeleteTask(uuid) => {
            client.delete_task(uuid).await?;
            // A local deletion is also needed
            let mut app = app.lock().await;
            app.store.delete_session(uuid)?; 
            app.reload_sessions();
            app.status_message = Some(format!("Task {} deleted.", uuid));
        },
        Action::ResendTask(uuid) => { // Send/Resend logic
            let content = app.lock().await.store.get_session_content(uuid)?;
            client.execute_chat(&content).await?;
            let mut app = app.lock().await;
            app.store.update_session_status(uuid, crate::client::local_store::SyncStatus::Synced, None)?;
            app.reload_sessions();
            app.status_message = Some(format!("Session {} sent to server.", uuid));
        },
        // NEW: Handle edit flow
        Action::SaveEdit => {
            let mut app_lock = app.lock().await;
            if let Some(uuid) = app_lock.editor_task_uuid {
                let content = app_lock.editor_textarea.lines().join("\n");
                
                // First, save it locally
                let log_to_save = parse_chat_file(&content)?; // <-- This now compiles
                app_lock.store.save_session(&log_to_save)?;
                app_lock.store.save_index()?;
                
                // Then, send update to server
                client.update_task(uuid, &content).await?;

                app_lock.status_message = Some(format!("Session {} saved and synced.", uuid));
                app_lock.mode = AppMode::TaskList;
                app_lock.reload_sessions();
            }
        },
        // All other actions are handled in App::update or handle_local_action
        _ => {},
    };

    Ok(())
}

// NEW: A handler for actions that are purely local
async fn handle_local_action(action: Action, app: Arc<Mutex<App<'static>>>) -> Result<()> {
    match action {
        Action::StartEdit(uuid) => {
            let mut app_lock = app.lock().await;
            let content = app_lock.store.get_session_content(uuid)?;
            app_lock.editor_textarea = TextArea::new(content.lines().map(String::from).collect());
            app_lock.editor_task_uuid = Some(uuid);
            app_lock.mode = AppMode::EditingTask;
            app_lock.status_message = Some("Session loaded from local file into editor.".into());
        }
        _ => {}
    }
    Ok(())
}

// --- TUI Boilerplate Helper ---
struct Tui {
    terminal: Terminal<CrosstermBackend<io::Stdout>>,
}
impl Tui {
    fn new() -> Result<Self> {
        let backend = CrosstermBackend::new(io::stdout());
        let terminal = Terminal::new(backend)?;
        Ok(Self { terminal })
    }
    fn enter(&mut self) -> Result<()> {
        enable_raw_mode()?;
        execute!(io::stdout(), EnterAlternateScreen, EnableMouseCapture)?;
        Ok(())
    }
    fn exit(&mut self) -> Result<()> {
        disable_raw_mode()?;
        execute!(io::stdout(), LeaveAlternateScreen, DisableMouseCapture)?;
        self.terminal.show_cursor()?;
        Ok(())
    }
}
