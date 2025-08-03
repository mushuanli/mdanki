-- migrations/20231101000000_initial_schema.sql

-- Table for user management and authentication
CREATE TABLE IF NOT EXISTS users (
    username TEXT PRIMARY KEY NOT NULL,
    public_key TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    key_modified_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen_at DATETIME
);

-- Table for tracking AI chat sessions (tasks)
CREATE TABLE IF NOT EXISTS chat_logs (
    -- Core identifiers
    uuid TEXT PRIMARY KEY,
    title TEXT NOT NULL,

    -- Request metadata
    client_ip TEXT NOT NULL,
    model_used TEXT NOT NULL,
    
    -- Status tracking
    status TEXT NOT NULL, -- No CHECK constraint here to allow for more flexible client-side statuses
                          -- Common values: 'local', 'pending', 'processing', 'completed', 'failed'

    -- Timestamps for performance and auditing
    created_at DATETIME NOT NULL,
    processing_at DATETIME, -- When the worker started processing this task
    finished_at DATETIME,   -- When the task was completed or failed
    
    -- Error information
    error_message TEXT -- Stores the reason for a 'failed' status
);

-- Table for managing file attachments associated with a chat log
CREATE TABLE IF NOT EXISTS attachments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    log_uuid TEXT NOT NULL REFERENCES chat_logs(uuid) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    file_hash TEXT, -- Optional: for deduplication or integrity checks
    file_path_on_server TEXT NOT NULL
);
