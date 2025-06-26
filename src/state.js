let state = {
    sessions: [],
    folders: [],
    fileSubsessions: {},
    clozeAccessTimes: {},
    
    currentSessionId: null,
    currentFolderId: null,
    currentSubsessionId: null,
    
    folderStack: [],
    movingItems: [],      // {id, type}[]
    selectedMoveTarget: null,
    isAllClozeOpen: false,

    // UI state
    isSessionSidebarHidden: false,
};

// Provides read-only access to the state from outside
export const appState = new Proxy(state, {
    get(target, prop) {
        if (prop in target) {
            return target[prop];
        }
        return undefined;
    }
});

// The only way to modify state from other modules
export function setState(newState) {
    Object.assign(state, newState);
}