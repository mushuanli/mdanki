// src/client/tui/app.rs

use super::action::Action;
use super::super::local_store::{LocalStore, LocalSessionInfo, SyncStatus}; // Corrected path to use super::super
use crate::common::types::{ChatLog, Interaction};
use ratatui::widgets::ListState;
use ratatui_textarea::{Input, TextArea};
use uuid::Uuid;
use crate::error::Result; // Added for Result<Self>

// ADDED: Import the static config variables
use crate::client::cli::{SERVER_ADDR, CLIENT_USERNAME};

pub enum InputMode { Title, SystemPrompt, UserPrompt }
pub enum AppMode { TaskList, NewChatPopup, EditingTask }

// TUI 核心状态
pub struct App<'a> {
    pub should_quit: bool,
    pub mode: AppMode,
    // MODIFIED: tasks is now a Vec of local session info
    pub sessions: Vec<LocalSessionInfo>, 
    pub task_list_state: ListState,
    pub status_message: Option<String>,
    
    // NEW: Fields to store config info for display in TUI
    pub server_addr: String,
    pub username: String,

    // The store is now part of the app state
    pub store: LocalStore,

    // State for the "New Chat" popup
    pub new_chat_popup_active_input: InputMode,
    pub title_input: TextArea<'a>,
    pub system_prompt_input: TextArea<'a>,
    pub user_prompt_input: TextArea<'a>,
    // NEW fields for the editor
    pub editor_task_uuid: Option<Uuid>,
    pub editor_textarea: TextArea<'a>,
}

impl<'a> App<'a> {
    pub fn new() -> Result<Self> {
        // ... initialization of text areas ...
        let mut title_input = TextArea::new(vec!["".to_string()]);
        title_input.set_block(ratatui::widgets::Block::default().borders(ratatui::widgets::Borders::ALL).title("Title"));
        let mut system_prompt_input = TextArea::default();
        system_prompt_input.set_block(ratatui::widgets::Block::default().borders(ratatui::widgets::Borders::ALL).title("System Prompt"));
        let mut user_prompt_input = TextArea::default();
        user_prompt_input.set_block(ratatui::widgets::Block::default().borders(ratatui::widgets::Borders::ALL).title("User Prompt"));

        let store = LocalStore::load()?;
        let sessions = store.list_sessions().into_iter().cloned().collect();

        Ok(Self {
            should_quit: false,
            mode: AppMode::TaskList,
            sessions, // Use local sessions
            task_list_state: ListState::default(),
            status_message: Some("Welcome! Press 'r' to sync with server.".into()),
            
            // NEW: Initialize from static variables
            server_addr: SERVER_ADDR.clone(),
            username: CLIENT_USERNAME.clone(),

            store, // Store the loaded store

            new_chat_popup_active_input: InputMode::Title,
            title_input,
            system_prompt_input,
            user_prompt_input,
            // NEW
            editor_task_uuid: None,
            editor_textarea: TextArea::default(),
        }) // FIXED: Added missing closing parenthesis ')'
    }

    // A helper to reload sessions from the store
    pub fn reload_sessions(&mut self) {
        self.sessions = self.store.list_sessions().into_iter().cloned().collect();
    }

    // MODIFIED: get_selected_task is now get_selected_session
    pub fn get_selected_session(&self) -> Option<&LocalSessionInfo> {
        self.task_list_state.selected().and_then(|i| self.sessions.get(i))
    }

    // REFACTOR: Update method now takes an action and modifies state.
    pub fn update(&mut self, action: Action) {
        match action {
            Action::Quit => self.should_quit = true,
            Action::Refresh => self.status_message = Some("Syncing with server...".into()),
            Action::NextTask => self.next_task(),
            Action::PrevTask => self.prev_task(),
            Action::EnterNewChat => self.enter_new_chat_mode(),
            Action::ExitPopup => self.exit_popup_mode(),
            Action::CyclePopupInput => self.cycle_popup_input(),
            Action::CreateTask(log) => {
                // In a more complex app, you might send this to the network layer
                // and wait for a response before closing the popup.
                self.exit_popup_mode();
                if self.store.save_session(&log).and_then(|_| self.store.save_index()).is_ok() {
                    self.reload_sessions();
                    self.status_message = Some(format!("Session '{}' created locally. Press 's' to send to server.", log.title));
                } else {
                    self.status_message = Some("Error: Failed to save session locally.".into());
                }
            }
            // Other actions are handled by the main loop, this just sets status text.
            Action::DeleteTask(uuid) => self.status_message = Some(format!("Deleting task {}...", uuid)),
            Action::ResendTask(uuid) => self.status_message = Some(format!("Resending task {}...", uuid)),
            Action::CancelEdit => { // NEW
                self.mode = AppMode::TaskList;
                self.editor_textarea = TextArea::default(); // Clear content
                self.editor_task_uuid = None;
                self.status_message = Some("Edit cancelled.".into());
            },
            Action::SaveEdit => { // NEW
                self.status_message = Some("Saving and uploading changes...".into());
            }
            Action::StartEdit(uuid) => { // NEW
                self.status_message = Some(format!("Loading task {} for editing...", uuid));
            }

            _ => {}
        }
    }


    // REFACTOR: Methods for creating Actions based on current state.
    // FIX: This method needs to be mutable because it calls get_popup_action which is mutable.
    pub fn get_action_for_key(&mut self, key: crossterm::event::KeyEvent) -> Option<Action> {
        match self.mode {
            AppMode::TaskList => self.get_tasklist_action(key),
            AppMode::NewChatPopup => self.get_popup_action(key),
            AppMode::EditingTask => self.get_editor_action(key), // NEW
        }
    }

    fn get_tasklist_action(&self, key: crossterm::event::KeyEvent) -> Option<Action> {
        use crossterm::event::{KeyCode};
        match key.code {
            KeyCode::Char('q') => Some(Action::Quit),
            KeyCode::Char('j') | KeyCode::Down => Some(Action::NextTask),
            KeyCode::Char('k') | KeyCode::Up => Some(Action::PrevTask),
            KeyCode::Char('n') => Some(Action::EnterNewChat),
            KeyCode::Char('r') => Some(Action::Refresh),
            KeyCode::Char('d') => self.get_selected_session().map(|t| Action::DeleteTask(t.uuid)),
            KeyCode::Char('e') => self.get_selected_session().map(|t| Action::StartEdit(t.uuid)),
            // 's' can now send local/modified sessions or resend failed ones
            KeyCode::Char('s') => self.get_selected_session()
                .filter(|s| s.sync_status != SyncStatus::Synced)
                .map(|s| Action::ResendTask(s.uuid)), // Re-using ResendTask for "send/sync"
            _ => None,
        }
    }
    
    // FIX: This method must take &mut self because it modifies the text areas.
    fn get_popup_action(&mut self, key: crossterm::event::KeyEvent) -> Option<Action> {
        use crossterm::event::KeyCode;
        match key.code {
            KeyCode::Esc => Some(Action::ExitPopup),
            KeyCode::Tab => Some(Action::CyclePopupInput),
            KeyCode::Enter => {
                let log = self.create_chat_log_from_popup();
                Some(Action::CreateTask(log))
            }
            _ => {
                let input = ratatui_textarea::Input::from(key);
                match self.new_chat_popup_active_input {
                    InputMode::Title => { self.title_input.input(input); },
                    InputMode::SystemPrompt => { self.system_prompt_input.input(input); },
                    InputMode::UserPrompt => { self.user_prompt_input.input(input); },
                };
                None
            }
        }
	
    }
    
    // NEW: handler for editor mode
    fn get_editor_action(&mut self, key: crossterm::event::KeyEvent) -> Option<Action> {
        use crossterm::event::{KeyCode, KeyModifiers};
        match key {
            // Save action
            crossterm::event::KeyEvent {
                code: KeyCode::Char('s'),
                modifiers: KeyModifiers::CONTROL,
                ..
            } => Some(Action::SaveEdit),
            // Cancel action
            crossterm::event::KeyEvent {
                code: KeyCode::Esc,
                ..
            } => Some(Action::CancelEdit),
            // Let the textarea handle other inputs (including undo/redo)
            _ => {
                self.editor_textarea.input(Input::from(key));
                None
            }
        }
    }

    // --- Helper methods for state mutation ---
    
    fn next_task(&mut self) {
        // MODIFIED
        if self.sessions.is_empty() { return; } 
        let i = match self.task_list_state.selected() {
            // MODIFIED
            Some(i) => if i >= self.sessions.len() - 1 { 0 } else { i + 1 }, 
            None => 0,
        };
        self.task_list_state.select(Some(i));
    }

    fn prev_task(&mut self) {
        // MODIFIED
        if self.sessions.is_empty() { return; } 
        let i = match self.task_list_state.selected() {
            // MODIFIED
            Some(i) => if i == 0 { self.sessions.len() - 1 } else { i - 1 },
            None => self.sessions.len() - 1,
        };
        self.task_list_state.select(Some(i));
    }

    fn enter_new_chat_mode(&mut self) { self.mode = AppMode::NewChatPopup }
    fn exit_popup_mode(&mut self) { self.mode = AppMode::TaskList }
    fn cycle_popup_input(&mut self) { 
        self.new_chat_popup_active_input = match self.new_chat_popup_active_input {
            InputMode::Title => InputMode::SystemPrompt,
            InputMode::SystemPrompt => InputMode::UserPrompt,
            InputMode::UserPrompt => InputMode::Title,
        };
    }
    fn create_chat_log_from_popup(&self) -> ChatLog { /* ... logic to build ChatLog from text areas ... */
        let mut log = ChatLog::new(self.title_input.lines().join("\n"));
        log.system_prompt = Some(self.system_prompt_input.lines().join("\n"));
        log.interactions.push(Interaction::User { content: self.user_prompt_input.lines().join("\n") });
        log
    }
}
