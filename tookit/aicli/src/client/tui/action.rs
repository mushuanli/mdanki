// src/client/tui/action.rs

use uuid::Uuid;
use crate::common::types::ChatLog;

// REFACTOR: Defines all possible actions the user can trigger.
#[derive(Debug, Clone)]
pub enum Action {
    Quit,
    Tick,
    Refresh,
    NextTask,
    PrevTask,
    EnterNewChat,
    ExitPopup,
    CyclePopupInput,
    CreateTask(ChatLog),
    DeleteTask(Uuid),
    ResendTask(Uuid),
    StartEdit(Uuid),
    SaveEdit,
    CancelEdit,
}
