import { STORAGE_KEYS } from '../config.js';
import { appState, setState } from '../state.js';

export function saveStateToStorage() {
    try {
        localStorage.setItem(STORAGE_KEYS.SESSIONS, JSON.stringify(appState.sessions));
        localStorage.setItem(STORAGE_KEYS.FOLDERS, JSON.stringify(appState.folders));
        localStorage.setItem(STORAGE_KEYS.CLOZE_TIMES, JSON.stringify(appState.clozeAccessTimes));
        localStorage.setItem(STORAGE_KEYS.CURRENT_SESSION_ID, appState.currentSessionId);
        localStorage.setItem(STORAGE_KEYS.CURRENT_FOLDER_ID, appState.currentFolderId);
        localStorage.setItem(STORAGE_KEYS.FOLDER_STACK, JSON.stringify(appState.folderStack));
        localStorage.setItem(STORAGE_KEYS.CURRENT_SUBSESSION_ID, appState.currentSubsessionId);
    } catch (error) {
        console.error("Failed to save state to storage:", error);
    }
}

export function loadStateFromStorage() {
    try {
        const sessions = JSON.parse(localStorage.getItem(STORAGE_KEYS.SESSIONS) || '[]');
        const folders = JSON.parse(localStorage.getItem(STORAGE_KEYS.FOLDERS) || '[]');
        const clozeAccessTimes = JSON.parse(localStorage.getItem(STORAGE_KEYS.CLOZE_TIMES) || '{}');
        const currentSessionId = localStorage.getItem(STORAGE_KEYS.CURRENT_SESSION_ID);
        let currentFolderId = localStorage.getItem(STORAGE_KEYS.CURRENT_FOLDER_ID);
        if (currentFolderId === 'null') currentFolderId = null;
        const folderStack = JSON.parse(localStorage.getItem(STORAGE_KEYS.FOLDER_STACK) || '[]');
        const currentSubsessionId = localStorage.getItem(STORAGE_KEYS.CURRENT_SUBSESSION_ID);

        setState({ 
            sessions, 
            folders, 
            clozeAccessTimes, 
            currentSessionId, 
            currentFolderId, 
            folderStack, 
            currentSubsessionId 
        });
    } catch (error) {
        console.error("Failed to load state from storage:", error);
        // Fallback to empty state
        setState({ sessions: [], folders: [], clozeAccessTimes: {} });
    }
}