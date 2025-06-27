import { db } from '../db.js';

/**
 * Loads all core data collections from the database.
 * This is the primary function for fetching data on app startup.
 * @returns {Promise<object>} An object containing the data collections.
 */
export async function loadAllData() {
    // Use Promise.all to fetch all tables in parallel for maximum speed.
    const [sessions, folders, clozeAccessTimes, appStateValues] = await Promise.all([
        db.sessions.toArray(),
        db.folders.toArray(),
        db.clozeAccessTimes.toArray(),
        db.appState.toArray(),
    ]);

    // The data is fetched as arrays of objects. We need to reconstruct
    // the key-value objects for cloze times and app state.

    const reconstructedClozeTimes = clozeAccessTimes.reduce((acc, item) => {
        // The primary key is 'content', and the value is 'time'
        acc[item.content] = item.time;
        return acc;
    }, {});

    const reconstructedAppState = appStateValues.reduce((acc, item) => {
        // The primary key is 'key', and the value is 'value'
        acc[item.key] = item.value;
        return acc;
    }, {});

    return {
        sessions: sessions || [],
        folders: folders || [],
        clozeAccessTimes: reconstructedClozeTimes || {},
        persistentAppState: reconstructedAppState || {},
    };
}

/**
 * Persists all core data collections to the database.
 * This function uses a transaction to ensure all writes succeed or fail together,
 * maintaining data integrity.
 * @param {object} data - An object containing arrays and objects to be saved.
 * @param {Array<object>} data.sessions - The array of session objects.
 * @param {Array<object>} data.folders - The array of folder objects.
 * @param {object} data.clozeAccessTimes - The cloze access times object.
 * @param {object} data.persistentAppState - An object with simple key-value state.
 */
export async function saveAllData({ sessions, folders, clozeAccessTimes, persistentAppState }) {
    // Define the tables we will be writing to in the transaction.
    const tablesToUpdate = [db.sessions, db.folders, db.clozeAccessTimes, db.appState];

    await db.transaction('rw', tablesToUpdate, async () => {
        // 1. Prepare data for 'bulkPut'. It needs an array of objects.
        const clozeDataForDB = Object.entries(clozeAccessTimes).map(([content, time]) => ({ content, time }));
        const appStateDataForDB = Object.entries(persistentAppState).map(([key, value]) => ({ key, value }));

        // 2. Clear out any data that no longer exists.
        // This handles deletions efficiently. For example, if a session was deleted
        // from the `sessions` array, we need to remove it from the DB.
        
        const existingSessionIds = new Set(sessions.map(s => s.id));
        const existingFolderIds = new Set(folders.map(f => f.id));
        const existingClozeContents = new Set(Object.keys(clozeAccessTimes));
        const existingAppStateKeys = new Set(Object.keys(persistentAppState));

        // Delete items from DB that are NOT in the current state arrays/objects.
        await Promise.all([
            db.sessions.where('id').noneOf(Array.from(existingSessionIds)).delete(),
            db.folders.where('id').noneOf(Array.from(existingFolderIds)).delete(),
            db.clozeAccessTimes.where('content').noneOf(Array.from(existingClozeContents)).delete(),
            db.appState.where('key').noneOf(Array.from(existingAppStateKeys)).delete(),
        ]);
        
        // 3. Use 'bulkPut' to insert new items and update existing ones.
        // This is highly efficient for saving collections.
        await Promise.all([
            db.sessions.bulkPut(sessions),
            db.folders.bulkPut(folders),
            db.clozeAccessTimes.bulkPut(clozeDataForDB),
            db.appState.bulkPut(appStateDataForDB),
        ]);
    });
}

/**
 * --- Example of AI Agent data persistence (for future use) ---
 *
 * Loads all AI agent-related data.
 * @returns {Promise<object>} An object with agents, topics, and history arrays.
 */
export async function loadAgentData() {
    const [agents, topics, history] = await Promise.all([
        db.agents.toArray(),
        db.topics.toArray(),
        db.history.toArray(),
    ]);

    return {
        agents: agents || [],
        topics: topics || [],
        history: history || [],
    };
}

/**
 * Saves all AI agent-related data.
 * @param {object} agentData - The data to save.
 */
export async function saveAgentData({ agents, topics, history }) {
     await db.transaction('rw', db.agents, db.topics, db.history, async () => {
        // Here you would implement the same delete/bulkPut logic as in saveAllData
        // for agents, topics, and history to ensure data consistency.
        
        // For simplicity, this is just a bulkPut example. A full implementation
        // would also handle deletions.
        await Promise.all([
            db.agents.bulkPut(agents),
            db.topics.bulkPut(topics),
            db.history.bulkPut(history),
        ]);
    });
}