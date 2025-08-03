// src/client/tui/action.rs

use uuid::Uuid;
use crate::common::types::ChatLog;
use crate::client::local_store::SyncStatus;

#[derive(Debug, Clone)]
pub enum Action {
    Quit,
    Refresh,
    NextTask,
    PrevTask,
    
    // Task List Actions
    EnterNewChat,
    StartEdit(Uuid),
    // --- NEW ACTIONS ---
    ViewTask(Uuid),
    EnterAppendPrompt(Uuid),
    // --- END NEW ---
    
    // Popup/Modal Actions
    ExitPopup, // A generic exit action for any modal view
    CyclePopupInput,
    SendNewTask(ChatLog),
    // --- NEW ACTION ---
    SendAppendedPrompt { uuid: Uuid, prompt: String },
    // --- END NEW ---
    
    // Network/Sync Actions
    DeleteTask(Uuid),
    // MODIFIED: SyncSelected now includes the remote status for better decision making
    SyncSelected { uuid: Uuid, remote_status: Option<String>, local_status: SyncStatus },
    SaveEdit,
    CancelEdit,
}
