// src/common/db.js
import Dexie from 'dexie'; // Assuming you're using a bundler. If not, Dexie will be global.
import { DB_NAME, DB_VERSION } from './config.js';

export const db = new Dexie(DB_NAME);

/**
 * Defines the database schema.
 * Each version call defines the schema for that version.
 * Dexie handles migrations automatically.
 */
db.version(DB_VERSION).stores({
    // '++id' = auto-incrementing primary key
    // '&name' = unique index
    // 'folderId' = regular index for fast lookups
    folders: '++id, name, folderId',
    sessions: '++id, name, folderId',
    clozeAccessTimes: 'content', // 'content' is the primary key
    appState: 'key', // A key-value store for simple state properties

    // Schema for future AI Agent features
    agents: '++id, &name',
    topics: '++id, title, agentId, createdAt',
    history: '++id, topicId, timestamp',
});

// You can add helper functions here if needed, for example:
export async function connectToDatabase() {
    try {
        await db.open();
        console.log("Database connection established.");
    } catch (error) {
        console.error("Failed to open database:", error);
        // You might want to show an error to the user here
    }
}