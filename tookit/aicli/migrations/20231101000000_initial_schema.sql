-- migrations/20231101000000_initial_schema.sql

CREATE TABLE IF NOT EXISTS users (
    username TEXT PRIMARY KEY NOT NULL,
    public_key TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    key_modified_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen_at DATETIME
);

CREATE TABLE IF NOT EXISTS chat_logs (
    uuid TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    client_ip TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('pending', 'processing', 'completed', 'failed')),
    model_used TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    processing_at DATETIME,
    finished_at DATETIME,
    error_message TEXT
);

CREATE TABLE IF NOT EXISTS attachments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    log_uuid TEXT NOT NULL REFERENCES chat_logs(uuid) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    file_hash TEXT,
    file_path_on_server TEXT NOT NULL
);
