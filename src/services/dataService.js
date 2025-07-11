// src/services/dataService.js

import { appState, setState } from '../common/state.js';
import { calculateNextReview } from './srs.js'; // 导入 SRS 模块
import * as storage from './storageService.js';
// [MODIFIED] 导入哈希函数
import { generateId, simpleHash } from '../common/utils.js';
import { INITIAL_CONTENT } from '../common/config.js';

import * as llmService from './llm/llmService.js'; // <-- 新增导入
import { renderHistoryPanel, updateStreamingChunkInDOM, finalizeStreamingUI } from '../agent/agent_ui.js'; 

// --- [NEW] Anki 算法常量 ---
const LEARNING_STEPS = [1 / 1440, 10 / 1440]; // 学习阶段间隔(天): 1分钟, 10分钟
const DEFAULT_EASE = 2.5; // 默认简易度 250%
const MIN_EASE = 1.3;     // 最小简易度 130%
const EASY_BONUS = 1.3;   // “简单”按钮的额外奖励
const INTERVAL_MODIFIER = 1.0; // 间隔调整系数
const HARD_INTERVAL_FACTOR = 1.2; // “困难”按钮的间隔系数

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

// [NEW] Cloze ID 生成策略
function generateClozeId(fileId, clozeContent) {
    return `${fileId}_${simpleHash(clozeContent)}`;
}

// --- Public Service API ---

export async function initializeApp() {
    setState({ isLoading: true });
    try {
        // [MODIFIED] 在 loadAllData 中增加 clozeStates
        const { sessions, folders, clozeStates, persistentAppState } = await storage.loadAllData();
        
        const loadedState = {
            sessions: sessions || [],
            folders: folders || [],
            clozeStates: clozeStates || {}, // [MODIFIED] 加载 clozeStates
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
        // --- FIX: Change storage.saveCollections to storage.saveAllData ---
        await storage.saveAllData({
            sessions: appState.sessions,
            folders: appState.folders,
            clozeStates: appState.clozeStates, // [MODIFIED] 保存 clozeStates
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

/**
 * 获取或创建指定 Cloze 的状态
 * @param {string} fileId 
 * @param {string} clozeContent 
 * @returns {object}
 */
export function getOrCreateClozeState(fileId, clozeContent) {
    const clozeId = `${fileId}_${simpleHash(clozeContent)}`;
    const allStates = appState.clozeStates;
    
    if (allStates[clozeId]) {
        return allStates[clozeId];
    }
    
    // 如果不存在，则创建一个新的状态对象
    return {
        id: clozeId,
        fileId: fileId,
        content: clozeContent,
        state: 'new',
        due: Date.now(), // 新卡片立即到期
        interval: 0,
        easeFactor: 2.5,
        lastReview: null,
    };
}

/**
 * 根据用户评分更新 Cloze 状态
 * @param {string} fileId 
 * @param {string} clozeContent 
 * @param {number} rating 
 */
export function updateClozeState(fileId, clozeContent, rating) {
    const currentState = getOrCreateClozeState(fileId, clozeContent);
    const updates = calculateNextReview(currentState, rating);
    
    const allStates = appState.clozeStates;
    allStates[currentState.id] = {
        ...currentState,
        ...updates,
        lastReview: Date.now()
    };
    
    setState({ clozeStates: allStates });
    // 在实际应用中，这里应该触发数据持久化
    // e.g., saveToDatabase({ clozeStates: allStates });
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

export function getAgentById(agentId) {
    if (!agentId) return undefined;
    return appState.agents.find(a => a.id === agentId);
}

export async function addAgent(agentData) {
    const baseName = agentData.displayName.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    let name = baseName;
    let counter = 1;
    // Ensure name is unique
    while (appState.agents.some(a => a.name === name)) {
        name = `${baseName}_${counter++}`;
    }

    const newAgent = {
        id: generateId(),
        name,
        displayName: agentData.displayName,
        avatar: agentData.avatar,
        config: agentData.config, // 直接使用从表单传递过来的完整配置
    };
    const agents = [...appState.agents, newAgent];
    setState({ agents, currentAgentId: newAgent.id, currentTopicId: null });
    await persistAgentState();
    return newAgent; // 返回新创建的 agent 对象
}

export async function updateAgent(agentId, updatedData) {
    const agents = appState.agents.map(agent => 
        agent.id === agentId ? { ...agent, ...updatedData } : agent
    );
    setState({ agents });
    await persistAgentState();
}

export async function deleteAgent(agentId) {
    // 1. Get all topics associated with this agent
    const topicsToDelete = appState.topics.filter(t => t.agentId === agentId);
    const topicIdsToDelete = new Set(topicsToDelete.map(t => t.id));

    // 2. Filter out associated history, topics, and the agent itself
    const history = appState.history.filter(h => !topicIdsToDelete.has(h.topicId));
    const topics = appState.topics.filter(t => t.agentId !== agentId);
    const agents = appState.agents.filter(a => a.id !== agentId);

    // 3. Determine the new current agent/topic
    let newCurrentAgentId = appState.currentAgentId;
    let newCurrentTopicId = appState.currentTopicId;
    if (newCurrentAgentId === agentId) {
        newCurrentAgentId = agents.length > 0 ? agents[0].id : null;
        const firstTopic = topics.find(t => t.agentId === newCurrentAgentId);
        newCurrentTopicId = firstTopic ? firstTopic.id : null;
    }

    setState({ 
        agents, 
        topics, 
        history, 
        currentAgentId: newCurrentAgentId, 
        currentTopicId: newCurrentTopicId 
    });
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

async function _addHistoryMessage(topicId, role, content, images = [], status = 'completed', reasoning = null) {
    const newMessage = {
        id: generateId(),
        topicId,
        role,
        content,
        reasoning, // <-- 新增 reasoning 字段
        images,
        timestamp: new Date().toISOString(),
        status, // <-- 新增 status
    };
    const history = [...appState.history, newMessage];
    setState({ history });
    if (status !== 'streaming') {
    await persistAgentState();
    }
    return newMessage;
}



/**
 * The main chat function. Handles user message, simulates AI response.
 * @param {string} content - The text content from the user.
 * @param {Array<{name: string, data: string}>} attachments - The user's attachments.
 */
export async function sendMessageAndGetResponse(content, attachments) {
    if (!appState.currentTopicId || appState.isAiThinking) {
        return;
    }

    const topicId = appState.currentTopicId;
    const currentAgent = getAgentById(appState.currentAgentId);
    if (!currentAgent) {
        alert("错误：找不到当前Agent的配置。");
        return;
    }
    
    // --- FIX START ---

    // 1. 设置AI思考状态
    setState({ isAiThinking: true });

    // 2. 添加用户消息并立即渲染
    await _addHistoryMessage(topicId, 'user', content, []);
    renderHistoryPanel(); 

    // AI 消息占位符，现在也包含一个空的 reasoning 字段
    const aiMessage = await _addHistoryMessage(topicId, 'assistant', '', [], 'streaming', '');
    renderHistoryPanel();

    // --- FIX START: 使用两个累加器 ---
    let accumulatedContent = "";
    let accumulatedReasoning = "";

    const conversationHistory = appState.history
        .filter(h => h.topicId === topicId && h.status === 'completed');

    await llmService.streamChat(
        currentAgent.config,
        conversationHistory,
        {
            onChunk: ({ type, text }) => {
                // --- 核心修改 ---
                // 不论类型，都先累积数据
                if (type === 'content') {
                    accumulatedContent += text;
                } else if (type === 'thinking') {
                    accumulatedReasoning += text;
                }
                // 然后调用新的UI函数，实时更新对应的DOM区域
                updateStreamingChunkInDOM(aiMessage.id, type, text);
            },
            onDone: async () => {
                const finalHistory = appState.history.map(msg => {
                    if (msg.id === aiMessage.id) {
                        return { 
                            ...msg, 
                            content: accumulatedContent, 
                            reasoning: accumulatedReasoning, // <-- 保存分离的思考过程
                            status: 'completed' 
                        };
                    }
                    return msg;
                });
                
                // 2. 调用 finalizeStreamingUI 来折叠 <details> 并显示按钮
                // 注意：这里我们不再依赖 setState 触发的重渲染来完成UI的最终状态，
                // 因为重渲染会丢失<details>的折叠状态。我们手动操作它。
                finalizeStreamingUI(aiMessage.id);

                // 使用 setState 一次性、原子性地更新状态
                setState({ 
                    history: finalHistory, 
                    isAiThinking: false 
                });
                
                // 由于 setState 会触发 renderHistoryPanel，它会用最终正确的 state 重新渲染
                // 所以 finalizeStreamingMessageInDOM 变得不再必要，可以移除，避免冗余操作
                // finalizeStreamingMessageInDOM(aiMessage.id, fullResponseContent); // <-- 可以移除此行

                // 等待 state 更新并渲染后，再保存
                await persistAgentState(); 
            },
            onError: async (error) => {
                const errorText = `\n\n**错误:** ${error.message}`;
                accumulatedContent += errorText; // 错误信息显示在主内容区

                finalizeStreamingUI(aiMessage.id); // 同样需要折叠

                const finalHistory = appState.history.map(msg => {
                    if (msg.id === aiMessage.id) {
                        return { ...msg, content: accumulatedContent, reasoning: accumulatedReasoning, status: 'error' };
                    }
                    return msg;
                });

                setState({ 
                    history: finalHistory, 
                    isAiThinking: false 
                });

                await persistAgentState();
            }
        }
    );
    // --- FIX END ---
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
    if (viewName === 'anki' || viewName === 'agent' || viewName === 'mistakes' ) {
        setState({ activeView: viewName });
    } else {
        console.warn(`[DataService] Invalid view name passed to switchView: '${viewName}'`);
    }
}

/**
 * [新增] 持久化所有应用模块的状态
 * 调用各个模块的持久化函数。
 */
export async function persistAllAppState() {
    try {
        await Promise.all([
            persistState(), // 保存 Anki/Core 数据
            persistAgentState(), // 保存 Agent 数据
            // 将来如果 mistakes 有自己的独立状态需要保存，也在这里调用
            // 例如: mistakesManager.persist()
        ]);
        console.log("All application state persisted.");
    } catch (error) {
        console.error("Failed to persist all application state:", error);
    }
}
