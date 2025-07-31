// src/client/tui/app.rs

use super::action::Action;
use crate::client::network::RemoteTask;
use crate::common::types::{ChatLog, Interaction};
use ratatui::style::{Color, Style};
use ratatui::widgets::ListState;
use ratatui_textarea::TextArea;
use uuid::Uuid;

pub enum InputMode { Title, SystemPrompt, UserPrompt }
pub enum AppMode { TaskList, NewChatPopup }

// TUI 核心状态
pub struct App<'a> {
    pub should_quit: bool,
    pub mode: AppMode,
    pub tasks: Vec<RemoteTask>,
    pub task_list_state: ListState,
    pub status_message: Option<String>,

    // State for the "New Chat" popup
    pub new_chat_popup_active_input: InputMode,
    pub title_input: TextArea<'a>,
    pub system_prompt_input: TextArea<'a>,
    pub user_prompt_input: TextArea<'a>,
}

impl<'a> App<'a> {
    pub fn new() -> Self {
        // ... initialization of text areas ...
        let mut title_input = TextArea::new(vec!["".to_string()]);
        title_input.set_block(ratatui::widgets::Block::default().borders(ratatui::widgets::Borders::ALL).title("Title"));
        let mut system_prompt_input = TextArea::default();
        system_prompt_input.set_block(ratatui::widgets::Block::default().borders(ratatui::widgets::Borders::ALL).title("System Prompt"));
        let mut user_prompt_input = TextArea::default();
        user_prompt_input.set_block(ratatui::widgets::Block::default().borders(ratatui::widgets::Borders::ALL).title("User Prompt"));

        Self {
            should_quit: false,
            mode: AppMode::TaskList,
            tasks: vec![],
            task_list_state: ListState::default(),
            status_message: Some("Welcome! Press 'r' to refresh tasks.".into()),
            new_chat_popup_active_input: InputMode::Title,
            title_input,
            system_prompt_input,
            user_prompt_input,
        }
    }

    // REFACTOR: Update method now takes an action and modifies state.
    pub fn update(&mut self, action: Action) {
        match action {
            Action::Quit => self.should_quit = true,
            Action::Refresh => self.status_message = Some("Refreshing...".into()),
            Action::NextTask => self.next_task(),
            Action::PrevTask => self.prev_task(),
            Action::EnterNewChat => self.enter_new_chat_mode(),
            Action::ExitPopup => self.exit_popup_mode(),
            Action::CyclePopupInput => self.cycle_popup_input(),
            Action::CreateTask(log) => {
                // In a more complex app, you might send this to the network layer
                // and wait for a response before closing the popup.
                self.exit_popup_mode();
                self.status_message = Some(format!("Task '{}' created locally.", log.title));
            }
            // Other actions are handled by the main loop, this just sets status text.
            Action::DeleteTask(uuid) => self.status_message = Some(format!("Deleting task {}...", uuid)),
            Action::ResendTask(uuid) => self.status_message = Some(format!("Resending task {}...", uuid)),
            Action::DownloadTask(uuid) => self.status_message = Some(format!("Downloading task {}...", uuid)),
            _ => {}
        }
    }

    pub fn get_selected_task(&self) -> Option<&RemoteTask> {
        self.task_list_state.selected().and_then(|i| self.tasks.get(i))
    }

    // REFACTOR: Methods for creating Actions based on current state.
    // FIX: This method needs to be mutable because it calls get_popup_action which is mutable.
    pub fn get_action_for_key(&mut self, key: crossterm::event::KeyEvent) -> Option<Action> {
        match self.mode {
            AppMode::TaskList => self.get_tasklist_action(key),
            AppMode::NewChatPopup => self.get_popup_action(key),
        }
    }

    fn get_tasklist_action(&self, key: crossterm::event::KeyEvent) -> Option<Action> {
        use crossterm::event::KeyCode;
        match key.code {
            KeyCode::Char('q') => Some(Action::Quit),
            KeyCode::Char('j') | KeyCode::Down => Some(Action::NextTask),
            KeyCode::Char('k') | KeyCode::Up => Some(Action::PrevTask),
            KeyCode::Char('n') => Some(Action::EnterNewChat),
            KeyCode::Char('r') => Some(Action::Refresh),
            KeyCode::Char('d') => self.get_selected_task().map(|t| Action::DeleteTask(t.uuid)),
            KeyCode::Char('s') => self.get_selected_task().filter(|t| t.status == "pending" || t.status == "failed").map(|t| Action::ResendTask(t.uuid)),
            KeyCode::Char('w') => self.get_selected_task().filter(|t| t.status == "completed").map(|t| Action::DownloadTask(t.uuid)),
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
    
    // --- Helper methods for state mutation ---
    
    fn next_task(&mut self) {
        if self.tasks.is_empty() { return; }
        let i = match self.task_list_state.selected() {
            Some(i) => if i >= self.tasks.len() - 1 { 0 } else { i + 1 },
            None => 0,
        };
        self.task_list_state.select(Some(i));
    }

    fn prev_task(&mut self) {
        if self.tasks.is_empty() { return; }
        let i = match self.task_list_state.selected() {
            Some(i) => if i == 0 { self.tasks.len() - 1 } else { i - 1 },
            None => self.tasks.len() - 1,
        };
        self.task_list_state.select(Some(i));
    }

    fn enter_new_chat_mode(&mut self) { /* ... unchanged ... */ }
    fn exit_popup_mode(&mut self) { /* ... unchanged ... */ }
    fn cycle_popup_input(&mut self) { /* ... unchanged ... */ }
    fn create_chat_log_from_popup(&self) -> ChatLog { /* ... logic to build ChatLog from text areas ... */
        let mut log = ChatLog::new(self.title_input.lines().join("\n"));
        log.system_prompt = Some(self.system_prompt_input.lines().join("\n"));
        log.interactions.push(Interaction::User { content: self.user_prompt_input.lines().join("\n") });
        log
    }
}
