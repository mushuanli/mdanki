// src/client/local_store.rs
use crate::common::protocol::{format_chat_log, parse_chat_file};
use crate::common::types::{ChatLog, Interaction};
use crate::error::{AppError, Result};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf; // REMOVED: Path (unused)
use uuid::Uuid;
use super::cli::{CLIENT_DATA_DIR, CLIENT_INDEX_PATH};

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub enum SyncStatus {
    Local,    // Only exists locally
    Synced,   // In sync with remote
    Modified, // Modified locally, needs sync
    Conflict, // Remote has changed since last sync (future enhancement)
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LocalSessionInfo {
    pub uuid: Uuid,
    pub title: String,
    pub created_at: DateTime<Utc>,
    pub modified_at: DateTime<Utc>,
    pub sync_status: SyncStatus,
    pub remote_status: Option<String>,
}

pub struct LocalStore {
    sessions_dir: PathBuf,
    index_path: PathBuf,
    index: HashMap<Uuid, LocalSessionInfo>,
}

impl LocalStore {
    /// Loads the session index from disk.
    pub fn load() -> Result<Self> {
        let sessions_dir = PathBuf::from(CLIENT_DATA_DIR);
        let index_path = PathBuf::from(CLIENT_INDEX_PATH);

        let index_content = fs::read_to_string(&index_path).map_err(|e| AppError::IoWithContext {
            context: format!("Failed to read index file '{}'. Did you run 'client init'?", index_path.display()),
            source: e,
        })?;

        let index: HashMap<Uuid, LocalSessionInfo> = serde_json::from_str(&index_content)?;

        Ok(Self {
            sessions_dir,
            index_path,
            index,
        })
    }
    
    /// Saves the current in-memory index to the index.json file.
    pub fn save_index(&self) -> Result<()> {
        let content = serde_json::to_string_pretty(&self.index)?;
        fs::write(&self.index_path, content)?;
        Ok(())
    }

    /// Creates a new session, saves it to a .md file, and updates the index.
    pub fn create_session(&mut self, title: String) -> Result<ChatLog> {
        let mut log = ChatLog::new(title);
        log.interactions.push(Interaction::User {
            content: "Your first prompt here.".to_string(),
        });
        
        // This will save the .md file and update the in-memory index
        self.save_session(&log)?;
        
        // Persist the index change to disk
        self.save_index()?;

        println!("Created session '{}' with UUID: {}", log.title, log.uuid);
        Ok(log)
    }

    /// Saves a ChatLog to a .md file and updates the in-memory index.
    pub fn save_session(&mut self, log: &ChatLog) -> Result<()> {
        let content = format_chat_log(log);
        let file_path = self.sessions_dir.join(format!("{}.md", log.uuid));
        fs::write(&file_path, content)?;

        let now = Utc::now();
        
        // Update or insert into the index
        let info = self.index.entry(log.uuid).or_insert_with(|| {
            // This is a new entry
            LocalSessionInfo {
                uuid: log.uuid,
                title: log.title.clone(),
                created_at: log.created_at,
                modified_at: now,
                sync_status: SyncStatus::Local,
                remote_status: None,
            }
        });

        // Update fields for existing entries
        info.title = log.title.clone();
        info.modified_at = now;
        // If it was synced, now it's modified
        if info.sync_status == SyncStatus::Synced {
            info.sync_status = SyncStatus::Modified;
        }

        Ok(())
    }
    
    /// Reads the content of a session's .md file.
    pub fn get_session_content(&self, uuid: Uuid) -> Result<String> {
        if !self.index.contains_key(&uuid) {
            return Err(AppError::ParseError(format!("Session with UUID '{}' not found in local index.", uuid)));
        }
        let file_path = self.sessions_dir.join(format!("{}.md", uuid));
        fs::read_to_string(&file_path).map_err(|e| AppError::IoWithContext {
            context: format!("Failed to read session file '{}'", file_path.display()),
            source: e,
        })
    }

    /// Gets a full ChatLog object from a local session file.
    pub fn get_session(&self, uuid: Uuid) -> Result<ChatLog> {
        let content = self.get_session_content(uuid)?;
        parse_chat_file(&content)
    }

    /// Lists all sessions from the in-memory index.
    pub fn list_sessions(&self) -> Vec<&LocalSessionInfo> {
        let mut sessions: Vec<_> = self.index.values().collect();
        // Sort by creation date, newest first
        sessions.sort_by(|a, b| b.created_at.cmp(&a.created_at));
        sessions
    }

    /// Deletes a session from the index and removes its .md file.
    pub fn delete_session(&mut self, uuid: Uuid) -> Result<()> {
        if self.index.remove(&uuid).is_none() {
            // If it wasn't in the index, it might not be a critical error, but we can warn.
            println!("Warning: Session {} not found in local index, but proceeding with deletion.", uuid);
        }

        let file_path = self.sessions_dir.join(format!("{}.md", uuid));
        if file_path.exists() {
            fs::remove_file(&file_path)?;
        }
        
        self.save_index()?;
        Ok(())
    }
    
    /// Updates the local session based on content and metadata from the server.
    pub fn update_from_remote(&mut self, content: &str, remote_task: &super::network::RemoteTask) -> Result<()> {
        let log = parse_chat_file(content)?;
        
        // Overwrite local .md file
        let file_path = self.sessions_dir.join(format!("{}.md", log.uuid));
        fs::write(file_path, content)?;

        // Update index entry
        let info = self.index.entry(log.uuid).or_insert_with(|| LocalSessionInfo {
            uuid: log.uuid,
            title: log.title.clone(),
            created_at: log.created_at,
            modified_at: Utc::now(),
            sync_status: SyncStatus::Synced,
            remote_status: Some(remote_task.status.clone()),
        });

        // Update fields for existing entries
        info.title = log.title.clone();
        info.modified_at = Utc::now();
        info.sync_status = SyncStatus::Synced;
        info.remote_status = Some(remote_task.status.clone());
        if let Some(err) = &remote_task.error_message {
            info.remote_status = Some(format!("failed: {}", err));
        }
        
        self.save_index()?;
        Ok(())
    }

    /// Updates just the status of a session in the index.
    pub fn update_session_status(&mut self, uuid: Uuid, sync_status: SyncStatus, remote_status: Option<String>) -> Result<()> {
        if let Some(info) = self.index.get_mut(&uuid) {
            info.sync_status = sync_status;
            if let Some(rs) = remote_status {
                info.remote_status = Some(rs);
            }
            self.save_index()?;
        } else {
            return Err(AppError::ParseError(format!("Cannot update status for non-existent local session {}", uuid)));
        }
        Ok(())
    }
}