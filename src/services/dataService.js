// src/services/dataService.js

import { appState, setState } from '../common/state.js';
import * as storage from './storageService.js';
import { generateId } from '../common/utils.js';
import { INITIAL_CONTENT } from '../common/config.js';

// --- Private Helpers ---

function parseHeadings(content) {
    const headingRegex = /^(#{1,2})\s+(.+)$/gm;
    const headings = [];
    let match;
    while ((match = headingRegex.exec(content)) !== null) {
        const heading = {
            level: match[1].length,
            text: match[2].trim(),
            start: match.index,
            end: match.index + match[0].length,
            content: ''
        };
        headings.push(heading);
    }
    for (let i = 0; i < headings.length; i++) {
        const start = headings[i].end + 1;
        const end = i < headings.length - 1 ? headings[i + 1].start : content.length;
        headings[i].content = content.substring(start, end).trim();
    }
    return headings;
}

function createSubsessionsForFile(fileId, content) {
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


// --- Public Service API ---

export async function initializeApp() {
    setState({ isLoading: true });
    try {
        const { sessions, folders, clozeAccessTimes, persistentAppState } = await storage.loadCollections();
        
        const loadedState = {
            sessions: sessions || [],
            folders: folders || [],
            clozeAccessTimes: clozeAccessTimes || {},
            currentSessionId: persistentAppState.currentSessionId || null,
            currentFolderId: persistentAppState.currentFolderId || null,
            currentSubsessionId: persistentAppState.currentSubsessionId || null,
            folderStack: persistentAppState.folderStack || [],
            fileSubsessions: {} // Will be generated
        };

        // Generate subsessions for all loaded files
        loadedState.sessions.forEach(session => {
            const subsessions = parseHeadings(session.content)
                .filter(h => h.level === 1 || h.level === 2)
                .map(h => ({
                    id: generateId(),
                    parentId: session.id,
                    title: h.text,
                    content: `# ${h.text}\n\n${h.content}`,
                    level: h.level
                }));
            loadedState.fileSubsessions[session.id] = subsessions;
        });
        
        // Set initial state if empty
        if (loadedState.sessions.length === 0) {
            const id = generateId();
            loadedState.sessions.push({
                id,
                name: '初始会话',
                content: INITIAL_CONTENT,
                type: 'file',
                folderId: null,
                createdAt: new Date(),
            });
            loadedState.currentSessionId = id;
            createSubsessionsForFile(id, INITIAL_CONTENT);
        }

        // Ensure currentSessionId is valid
        if (!loadedState.sessions.some(s => s.id === loadedState.currentSessionId)) {
            loadedState.currentSessionId = loadedState.sessions.length > 0 ? loadedState.sessions[0].id : null;
        }

        setState(loadedState);

    } catch (error) {
        console.error("Failed to initialize application state:", error);
    } finally {
        setState({ isLoading: false });
    }
}

export async function persistState() {
    try {
        await storage.saveCollections({
            sessions: appState.sessions,
            folders: appState.folders,
            clozeAccessTimes: appState.clozeAccessTimes,
            persistentAppState: {
                currentSessionId: appState.currentSessionId,
                currentFolderId: appState.currentFolderId,
                currentSubsessionId: appState.currentSubsessionId,
                folderStack: appState.folderStack,
            },
        });
        console.log("State persisted successfully.");
    } catch (error) {
        console.error("Failed to persist state:", error);
    }
}


// --- Data Manipulation ---

export async function addFile(name, content = INITIAL_CONTENT) {
    const id = generateId();
    const newFile = {
        id,
        name: name || `新文件 ${appState.sessions.length + 1}`,
        content,
        type: 'file',
        folderId: appState.currentFolderId,
        createdAt: new Date(),
    };
    const newSessions = [...appState.sessions, newFile];
    setState({ sessions: newSessions, currentSessionId: id, currentSubsessionId: null });
    createSubsessionsForFile(id, content);
    await persistState();
}

export async function addFolder(name) {
    const newFolder = {
        id: generateId(),
        name: name || `新目录 ${appState.folders.length + 1}`,
        type: 'folder',
        folderId: appState.currentFolderId,
        createdAt: new Date(),
    };
    const newFolders = [...appState.folders, newFolder];
    setState({ folders: newFolders });
    await persistState();
}

export async function removeItems(itemsToRemove) {
    const idsToRemove = new Set(itemsToRemove.map(item => item.id));
    let sessions = [...appState.sessions];
    let folders = [...appState.folders];
    let fileSubsessions = {...appState.fileSubsessions};

    itemsToRemove.forEach(item => {
        if (item.type === 'file') {
            sessions = sessions.filter(s => s.id !== item.id);
            delete fileSubsessions[item.id];
        } else if (item.type === 'folder') {
            const folderIdsToDelete = new Set([item.id]);
            // Simple recursive delete
            let changed = true;
            while(changed) {
                changed = false;
                const children = folders.filter(f => folderIdsToDelete.has(f.folderId));
                children.forEach(c => {
                    if (!folderIdsToDelete.has(c.id)) {
                        folderIdsToDelete.add(c.id);
                        changed = true;
                    }
                });
            }
            folders = folders.filter(f => !folderIdsToDelete.has(f.id));
            sessions = sessions.filter(s => !folderIdsToDelete.has(s.folderId));
        }
    });

    let currentSessionId = appState.currentSessionId;
    if (idsToRemove.has(currentSessionId)) {
        currentSessionId = sessions.length > 0 ? sessions[0].id : null;
    }
    
    setState({ sessions, folders, fileSubsessions, currentSessionId });
    await persistState();
}

export async function moveItems(items, targetFolderId) {
    const newSessions = appState.sessions.map(s => 
        items.some(item => item.id === s.id && item.type === 'file') 
            ? { ...s, folderId: targetFolderId } 
            : s
    );
    const newFolders = appState.folders.map(f => 
        items.some(item => item.id === f.id && item.type === 'folder') 
            ? { ...f, folderId: targetFolderId } 
            : f
    );
    setState({ sessions: newSessions, folders: newFolders });
    await persistState();
}

export async function updateItemName(id, newName, type) {
    if (type === 'file') {
        const newSessions = appState.sessions.map(s => s.id === id ? { ...s, name: newName } : s);
        setState({ sessions: newSessions });
    } else {
        const newFolders = appState.folders.map(f => f.id === id ? { ...f, name: newName } : f);
        setState({ folders: newFolders });
    }
    await persistState();
}

export async function saveCurrentSessionContent(newContent) {
    const session = getCurrentSession();
    if (session && session.content !== newContent) {
        const newSessions = appState.sessions.map(s => 
            s.id === appState.currentSessionId ? { ...s, content: newContent, lastActive: new Date() } : s
        );
        setState({ sessions: newSessions });
        createSubsessionsForFile(appState.currentSessionId, newContent);
        await persistState();
        return true;
    }
    return false;
}

// --- Selection & Navigation (These don't need to be async) ---

export function getCurrentSession() {
    if (!appState.currentSessionId) return null;
    return appState.sessions.find(s => s.id === appState.currentSessionId);
}

export function selectSession(sessionId) {
    setState({ currentSessionId: sessionId, currentSubsessionId: null });
}

export function selectFolder(folderId) {
    const newStack = [...appState.folderStack, appState.currentFolderId].filter(fid => fid != null);
    setState({ currentFolderId: folderId, folderStack: newStack });
}

export function selectSubsession(sessionId, subsessionId) {
    setState({ currentSessionId: sessionId, currentSubsessionId: subsessionId });
}

export function goBack() {
    if (appState.folderStack.length > 0) {
        const newStack = [...appState.folderStack];
        const parentId = newStack.pop();
        setState({ currentFolderId: parentId, folderStack: newStack });
    }
}

export function goToFolder(folderId, stackIndex) {
    const newStack = appState.folderStack.slice(0, stackIndex);
    setState({ currentFolderId: folderId, folderStack: newStack });
}

export function goToRoot() {
    setState({ currentFolderId: null, folderStack: [] });
}


// ===================================================================
// AI AGENT DATA SERVICE
// ===================================================================

/**
 * Loads all AI Agent related data on app initialization.
 */
export async function initializeAgentData() {
    const { agents, topics, history } = await storage.loadAgentData();
    
    const agentState = {
        agents: agents || [],
        topics: topics || [],
        history: history || [],
    };

    // Set initial agent and topic if they exist
    if (agentState.agents.length > 0) {
        agentState.currentAgentId = agentState.agents[0].id;
        const firstTopicForAgent = agentState.topics.find(t => t.agentId === agentState.currentAgentId);
        if (firstTopicForAgent) {
            agentState.currentTopicId = firstTopicForAgent.id;
        }
    }

    setState(agentState);
}

/**
 * Persists all agent-related data.
 */
export async function persistAgentState() {
    try {
        await storage.saveAgentData({
            agents: appState.agents,
            topics: appState.topics,
            history: appState.history
        });
        console.log("Agent state persisted.");
    } catch (error) {
        console.error("Failed to persist agent state:", error);
    }
}


// --- Agent Management ---

export async function addAgent(name, avatar) {
    const newAgent = {
        id: generateId(),
        name,
        avatar,
        config: {} // For future settings like system prompts
    };
    const agents = [...appState.agents, newAgent];
    setState({ agents, currentAgentId: newAgent.id, currentTopicId: null });
    await persistAgentState();
}

// --- Topic Management ---

export async function addTopic(title, icon) {
    if (!appState.currentAgentId) {
        alert("Please select an AI Agent first.");
        return;
    }
    const newTopic = {
        id: generateId(),
        agentId: appState.currentAgentId,
        title,
        icon: icon || 'fas fa-comment',
        createdAt: new Date()
    };
    const topics = [...appState.topics, newTopic];
    setState({ topics, currentTopicId: newTopic.id });
    await persistAgentState();
}

// --- History/Chat Management ---

export async function addHistoryMessage(topicId, role, content, images = []) {
    const newMessage = {
        id: generateId(),
        topicId,
        role, // 'user' or 'assistant'
        content,
        images, // Array of image data (e.g., base64 strings or blob URLs)
        timestamp: new Date()
    };
    const history = [...appState.history, newMessage];
    setState({ history });
    await persistAgentState();

    // Here you would trigger the call to the actual AI model
    // const aiResponse = await callAIModel(newMessage);
    // await addHistoryMessage(topicId, 'assistant', aiResponse);
}

export async function deleteHistoryMessages(messageIds) {
    const idsToDelete = new Set(messageIds);
    const history = appState.history.filter(msg => !idsToDelete.has(msg.id));
    setState({ history });
    await persistAgentState();
}

export async function editUserMessageAndRegenerate(messageId, newContent) {
    // This is more complex. The logic would be:
    // 1. Find the message to edit.
    // 2. Find all subsequent messages in the same topic.
    // 3. Delete all subsequent messages.
    // 4. Update the content of the target message.
    // 5. Re-run the AI conversation from that point.
    console.log(`Editing message ${messageId} with content: ${newContent}`);
    // Implementation would go here...
}


// --- Selection ---

export function selectAgent(agentId) {
    const firstTopicForAgent = appState.topics.find(t => t.agentId === agentId);
    setState({ 
        currentAgentId: agentId,
        currentTopicId: firstTopicForAgent ? firstTopicForAgent.id : null
    });
}

export function selectTopic(topicId) {
    setState({ currentTopicId: topicId });
}

// --- View Router ---
export function switchView(viewName) {
    if (viewName === 'anki' || viewName === 'agent') {
        setState({ activeView: viewName });
    }
}