// src/services/storageService.js
import { db } from '../common/db.js';

/**
 * Loads all core data collections from the database.
 * This is the primary function for fetching data on app startup.
 * @returns {Promise<object>} An object containing the data collections.
 */
export async function loadAllData() {
    // [修正] 不再加载 clozeAccessTimes，而是加载 clozeStates
    const [sessions, folders, clozeStates, appStateValues] = await Promise.all([
        db.sessions.toArray(),
        db.folders.toArray(),
        db.clozeStates.toArray(), // <--- 修改点
        db.appState.toArray(),
    ]);

    // [修正] 将 clozeStates 数组转换为以 id 为 key 的对象
    const reconstructedClozeStates = clozeStates.reduce((acc, item) => {
        acc[item.id] = item;
        return acc;
    }, {});

    const reconstructedAppState = appStateValues.reduce((acc, item) => {
        acc[item.key] = item.value;
        return acc;
    }, {});

    return {
        sessions: sessions || [],
        folders: folders || [],
        clozeStates: reconstructedClozeStates || {}, // <--- 修改点
        persistentAppState: reconstructedAppState || {},
    };
}

// --- [新增] 复习统计相关的数据服务 ---

/**
 * 原子性地增加指定日期和目录的复习次数
 * @param {string} date - 'YYYY-MM-DD' 格式的日期
 * @param {string} folderId - 目录ID，或 'root'
 */
export async function incrementReviewCount(date, folderId) {
    const id = `${date}:${folderId || 'root'}`;
    try {
        // 使用事务确保操作的原子性
        await db.transaction('rw', db.reviewStats, async () => {
            const stat = await db.reviewStats.get(id);
            if (stat) {
                // 如果存在，则数量+1
                await db.reviewStats.update(id, { count: stat.count + 1 });
            } else {
                // 如果不存在，则创建新纪录
                await db.reviewStats.add({
                    id: id,
                    date: date,
                    folderId: folderId || 'root',
                    count: 1
                });
            }
        });
    } catch (error) {
        console.error(`Failed to increment review count for ${id}:`, error);
    }
}

/**
 * 获取指定日期范围内的所有复习统计数据
 * @param {string} startDate - 'YYYY-MM-DD' 格式的开始日期
 * @param {string} endDate - 'YYYY-MM-DD' 格式的结束日期
 * @returns {Promise<Array<object>>}
 */
export async function getStatsForDateRange(startDate, endDate) {
    try {
        return await db.reviewStats
            .where('date')
            .between(startDate, endDate, true, true) // 包含开始和结束日期
            .toArray();
    } catch (error) {
        console.error("Failed to get stats for date range:", error);
        return [];
    }
}

/**
 * 获取今天所有目录的复习总数
 * @returns {Promise<number>}
 */
export async function getTodaysTotalCount() {
    const today = new Date().toISOString().slice(0, 10);
    try {
        const stats = await db.reviewStats.where('date').equals(today).toArray();
        return stats.reduce((total, current) => total + current.count, 0);
    } catch (error) {
        console.error("Failed to get today's total count:", error);
        return 0;
    }
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
export async function saveAllData({ sessions, folders, clozeStates, persistentAppState }) {
    // [修正] 更新事务中要操作的表
    const tablesToUpdate = [db.sessions, db.folders, db.clozeStates, db.appState];

    await db.transaction('rw', tablesToUpdate, async () => {
        // [修正] 准备 clozeStates 数据
        // clozeStates 在 appState 中已经是对象了，我们需要将其转换为数组以进行 bulkPut
        const clozeDataForDB = Object.values(clozeStates);
        const appStateDataForDB = Object.entries(persistentAppState).map(([key, value]) => ({ key, value }));

        // [修正] 获取已存在的 clozeStates 的 ID
        const existingSessionIds = new Set(sessions.map(s => s.id));
        const existingFolderIds = new Set(folders.map(f => f.id));
        const existingClozeIds = new Set(Object.keys(clozeStates)); // <--- 修改点
        const existingAppStateKeys = new Set(Object.keys(persistentAppState));

        // [修正] 删除不再存在的 clozeStates
        await Promise.all([
            db.sessions.where('id').noneOf(Array.from(existingSessionIds)).delete(),
            db.folders.where('id').noneOf(Array.from(existingFolderIds)).delete(),
            db.clozeStates.where('id').noneOf(Array.from(existingClozeIds)).delete(), // <--- 修改点
            db.appState.where('key').noneOf(Array.from(existingAppStateKeys)).delete(),
        ]);
        
        // [修正] 批量保存 clozeStates
        await Promise.all([
            db.sessions.bulkPut(sessions),
            db.folders.bulkPut(folders),
            db.clozeStates.bulkPut(clozeDataForDB), // <--- 修改点
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
        // --- ADDING FULL IMPLEMENTATION FOR DATA CONSISTENCY ---
        
        // 1. Get IDs/keys of current state items
        const existingAgentIds = new Set(agents.map(a => a.id));
        const existingTopicIds = new Set(topics.map(t => t.id));
        const existingHistoryIds = new Set(history.map(h => h.id));

        // 2. Delete items from DB that are NOT in the current state
        await Promise.all([
            db.agents.where('id').noneOf(Array.from(existingAgentIds)).delete(),
            db.topics.where('id').noneOf(Array.from(existingTopicIds)).delete(),
            db.history.where('id').noneOf(Array.from(existingHistoryIds)).delete(),
        ]);
        
        // 3. Use 'bulkPut' to insert new items and update existing ones
        await Promise.all([
            db.agents.bulkPut(agents),
            db.topics.bulkPut(topics),
            db.history.bulkPut(history),
        ]);
    });
}

// --- [新增] 错题集相关的数据服务 ---

/**
 * 从 IndexedDB 加载所有错题
 * @returns {Promise<Array<object>>}
 */
export async function loadAllMistakes() {
    try {
        // 确保在查询前数据库已打开
        if (!db.isOpen()) {
            await db.open();
        }
        return await db.mistakes.toArray();
    } catch (error) {
        console.error("Failed to load mistakes from DB:", error);
        return [];
    }
}

/**
 * 将错题批量保存到 IndexedDB
 * @param {Array<object>} mistakes - 要保存的错题数组
 */
export async function saveAllMistakes(mistakes) {
    try {
        await db.mistakes.bulkPut(mistakes);
        console.log("Mistakes saved successfully.");
    } catch (error) {
        console.error("Failed to save mistakes to DB:", error);
    }
}

/**
 * 更新单个错题（例如，在复习后）
 * @param {object} mistake - 更新后的错题对象
 */
export async function updateMistake(mistake) {
    try {
        await db.mistakes.put(mistake);
    } catch (error) {
        console.error(`Failed to update mistake ${mistake.uuid}:`, error);
    }
}

/**
 * 根据ID删除错题
 * @param {string[]} mistakeUuids - 要删除的错题UUID数组
 */
export async function deleteMistakes(mistakeUuids) {
    try {
        await db.mistakes.bulkDelete(mistakeUuids);
    } catch(error) {
        console.error("Failed to delete mistakes:", error);
    }
}