import { appState, setState } from '../state.js';
import { generateId } from '../utils.js';
import { saveStateToStorage } from './storageManager.js';
import { INITIAL_CONTENT } from '../config.js';

function parseHeadings(content) {
    const headingRegex = /^(#{1,2})\s+(.+)$/gm;
    const headings = [];
    let match;
    while ((match = headingRegex.exec(content)) !== null) {
        headings.push({
            level: match[1].length,
            text: match[2].trim(),
            start: match.index,
            end: match.index + match[0].length
        });
    }
    for (let i = 0; i < headings.length; i++) {
        const start = headings[i].end + 1;
        const end = i < headings.length - 1 ? headings[i + 1].start : content.length;
        headings[i].content = content.substring(start, end).trim();
    }
    return headings;
}

export function createSubsessionsForFile(fileId, content) {
    const headings = parseHeadings(content);
    const subsessions = headings
        .filter(h => h.level === 1 || h.level === 2)
        .map(heading => ({
            id: generateId(),
            parentId: fileId,
            title: heading.text,
            content: `# ${heading.text}\n\n${heading.content}`,
            level: heading.level
        }));
    
    const newFileSubsessions = { ...appState.fileSubsessions, [fileId]: subsessions };
    setState({ fileSubsessions: newFileSubsessions });
}

export function addFile(content = INITIAL_CONTENT, name = null) {
    const id = generateId();
    const sessionName = name || `新文件 ${appState.sessions.length + 1}`;
    const newFile = {
        id,
        name: sessionName,
        content,
        type: 'file',
        folderId: appState.currentFolderId,
        createdAt: new Date(),
    };
    const newSessions = [...appState.sessions, newFile];
    setState({ sessions: newSessions, currentSessionId: id, currentSubsessionId: null });
    createSubsessionsForFile(id, content);
    saveStateToStorage();
    return newFile;
}

export function addFolder(name = null) {
    const id = generateId();
    const folderName = name || `新目录 ${appState.folders.length + 1}`;
    const newFolder = {
        id,
        name: folderName,
        type: 'folder',
        folderId: appState.currentFolderId,
        createdAt: new Date(),
    };
    const newFolders = [...appState.folders, newFolder];
    setState({ folders: newFolders });
    saveStateToStorage();
    return newFolder;
}

export function removeItems(itemsToRemove) {
    const idsToRemove = new Set(itemsToRemove.map(item => item.id));
    let sessions = [...appState.sessions];
    let folders = [...appState.folders];
    let fileSubsessions = {...appState.fileSubsessions};

    itemsToRemove.forEach(item => {
        if (item.type === 'file') {
            sessions = sessions.filter(s => s.id !== item.id);
            delete fileSubsessions[item.id];
        } else if (item.type === 'folder') {
            folders = folders.filter(f => f.id !== item.id);
            // Recursively remove children
            // This is a simplified version. A more robust solution would handle deep nesting.
            sessions = sessions.filter(s => s.folderId !== item.id);
            folders = folders.filter(f => f.folderId !== item.id);
        }
    });

    let currentSessionId = appState.currentSessionId;
    if (idsToRemove.has(currentSessionId)) {
        currentSessionId = sessions.length > 0 ? sessions[0].id : null;
    }
    
    setState({ sessions, folders, fileSubsessions, currentSessionId });
    saveStateToStorage();
}

export function moveItems(items, targetFolderId) {
    const newSessions = appState.sessions.map(s => {
        if (items.some(item => item.id === s.id && item.type === 'file')) {
            return { ...s, folderId: targetFolderId };
        }
        return s;
    });
    const newFolders = appState.folders.map(f => {
        if (items.some(item => item.id === f.id && item.type === 'folder')) {
            return { ...f, folderId: targetFolderId };
        }
        return f;
    });
    setState({ sessions: newSessions, folders: newFolders });
    saveStateToStorage();
}

export function updateItemName(id, newName, type) {
    if (type === 'file') {
        const newSessions = appState.sessions.map(s => s.id === id ? { ...s, name: newName } : s);
        setState({ sessions: newSessions });
    } else {
        const newFolders = appState.folders.map(f => f.id === id ? { ...f, name: newName } : f);
        setState({ folders: newFolders });
    }
    saveStateToStorage();
}

export function saveCurrentSessionContent(newContent) {
    const session = appState.sessions.find(s => s.id === appState.currentSessionId);
    if (session && session.content !== newContent) {
        const newSessions = appState.sessions.map(s => 
            s.id === appState.currentSessionId ? { ...s, content: newContent, lastActive: new Date() } : s
        );
        setState({ sessions: newSessions });
        createSubsessionsForFile(appState.currentSessionId, newContent);
        saveStateToStorage();
        return true; // Indicates a change was saved
    }
    return false;
}