// src/client/tui/mod.rs
use crate::client::network::{NetworkClient, RemoteTask};
use crate::common::protocol::format_chat_log;
use crate::error::{AppError, Result}; // FIX: Import AppError
use crossterm::{
    event::{self, DisableMouseCapture, EnableMouseCapture, Event, KeyCode},
    execute,
    terminal::{disable_raw_mode, enable_raw_mode, EnterAlternateScreen, LeaveAlternateScreen},
};
use ratatui::prelude::*;
use std::{io, sync::Arc, time::Duration};
use tokio::sync::{mpsc, Mutex};
use tokio::net::TcpStream;
use super::cli::SERVER_ADDR;

use self::{
    app::App,
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
    let app = Arc::new(Mutex::new(App::new()));

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
            
            // FIX: Add Action::CreateTask to the list of actions that trigger network I/O
            if matches!(action, Action::Refresh | Action::DeleteTask(_) | Action::ResendTask(_) | Action::CreateTask(_) | Action::ResendTask(_) | Action::DownloadTask(_)) {
                let app_clone = app.clone();
                let tx_clone = tx.clone();
                tokio::spawn(async move {
                    // IMPROVEMENT: If the action fails, update the UI with the error message.
                    if let Err(e) = handle_action(action, app_clone.clone(), tx_clone).await {
                        let mut app = app_clone.lock().await;
                        app.status_message = Some(format!("Action failed: {}", e));
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
async fn handle_action(action: Action, app: Arc<Mutex<App<'static>>>, tx: mpsc::UnboundedSender<Action>) -> Result<()> {
    // TODO: proper auth
    // FIX: Update the hardcoded path to the private key
    let mut client = NetworkClient::connect(SERVER_ADDR, "testuser", "data/user.key").await?;
    
    match action {
        Action::Refresh => {
            let tasks = client.list_tasks().await?;
            let mut app = app.lock().await;
            app.tasks = tasks;
            if app.task_list_state.selected().is_none() && !app.tasks.is_empty() {
                app.task_list_state.select(Some(0));
            }
            app.status_message = Some("Tasks refreshed.".into());
        },
        // ADDED: Handle the CreateTask action
        Action::CreateTask(chat_log) => {
            let content = format_chat_log(&chat_log);
            let uuid = client.execute_chat(&content).await?;
            tx.send(Action::Refresh).ok(); // Refresh list to show the new 'pending' task
            app.lock().await.status_message = Some(format!("Task {} sent to server.", uuid));
        },
        Action::DeleteTask(uuid) => {
            client.delete_task(uuid).await?;
            tx.send(Action::Refresh).ok(); // Trigger a refresh after delete
            app.lock().await.status_message = Some(format!("Task {} deleted.", uuid));
        },
        Action::ResendTask(uuid) => {
            client.resend_task(uuid).await?;
            tx.send(Action::Refresh).ok();
            app.lock().await.status_message = Some(format!("Task {} re-queued.", uuid));
        },
        Action::DownloadTask(uuid) => {
            let content = client.download_task(uuid).await?;
            let filename = format!("{}.txt", uuid);
            tokio::fs::write(&filename, content).await?;
            app.lock().await.status_message = Some(format!("Task downloaded to {}", filename));
        },
        _ => {}, // Other actions don't have I/O
    };

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
