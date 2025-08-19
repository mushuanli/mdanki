// src/common/state.js
// // The single source of truth for the application's runtime state.
let state = {
    // --- Core Data State ---
    // These are loaded from the database on startup.
    // --- Router State ---
    activeView: 'anki', // 'anki' or 'agent'

    sessions: [], // Array of file objects
    folders: [],  // Array of folder objects
    // [MODIFIED] 从 clozeAccessTimes 升级到更复杂的 clozeStates
    // 它将存储类似这样的结构: { [clozeId]: { due, interval, easeFactor, ... } }
    clozeStates: {}, 
    fileSubsessions: {}, // This can be generated at runtime, maybe not persisted
    // [NEW] Add undo/redo stacks for the Anki editor
    undoStack: [],
    redoStack: [],

    // --- UI/Session State ---
    // These reflect the current user interaction.
    // They are also persisted to the database.
    currentSessionId: null,
    currentFolderId: null,
    currentSubsessionId: null,
    
    folderStack: [],
    
    // --- AI Agent Data State ---
    agents: [],  // { id, name, avatar, config }[修改] 在其他地方会为它增加 tags 和 sendHistory 字段
    topics: [],  // { id, promptId, title, icon }
    history: [], // { id, topicId, role, content, images, timestamp，status,promptId }

    // --- AI Agent UI State ---
    currentAgentId: null, // [修改] 理解为左侧导航栏选中的角色
    currentTopicId: null,
    currentConversationAgentId: null, // [新增] 当前对话实际使用的角色ID

    // [新增] 主题列表的筛选标签
    topicListFilterTag: 'all', // 'all' 或具体的标签名

    // --- Transient UI State (not saved) ---
    isLoading: true,
    isAiThinking: false, // <-- ADD THIS LINE
    isTopicsPanelHidden: false, // [新增]

    isSessionSidebarHidden: false,
    areAllClozeVisible: false,
    movingItems: [], // {id, type}[]
    selectedMoveTarget: null,
    
    // --- Transient UI State (not saved) ---
    isTopicSelectionMode: false, // [新增] 主题选择模式标志
    selectedTopicIds: [],      // [新增] 存储选中的主题ID

};

// Provides a read-only view of the state to the rest of the app.
// This prevents accidental direct mutation of the state.
export const appState = new Proxy(state, {
    get(target, prop) {
        if (prop in target) {
            // Return a deep copy for objects and arrays to prevent mutation
            const value = target[prop];
            if (typeof value === 'object' && value !== null) {
                return JSON.parse(JSON.stringify(value));
            }
            return value;
        }
        return undefined;
    },
    set() {
        console.warn("Direct mutation of appState is not allowed. Use a data service function.");
        return false; // Prevent the set operation
    }
});

/**
 * The sole function for updating the application state.
 * It merges the new state with the existing state.
 * @param {Partial<state>} newState - An object with the state properties to update.
 */
export function setState(newState) {
    Object.assign(state, newState);
    // Here you could add a mechanism to notify UI components of the change,
    // e.g., by dispatching a custom event.
    // window.dispatchEvent(new CustomEvent('state-changed', { detail: newState }));
}