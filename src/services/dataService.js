// src/services/dataService.js

import { appState, setState } from '../common/state.js';
import { calculateNextReview } from './srs.js'; 
import * as storage from './storageService.js';
import { generateId, simpleHash } from '../common/utils.js';
import { INITIAL_CONTENT } from '../common/config.js';
import { db } from '../common/db.js';

import * as llmService from './llm/llmService.js';
import { getDefaultApiPath } from './llm/llmProviders.js'; 

import { renderHistoryPanel, updateStreamingChunkInDOM, finalizeStreamingUI } from '../agent/agent_ui.js'; 


// --- [新增] 预设的默认数据 ---
const DEFAULT_API_CONFIG = {
    id: 'default_deepseek_api',
    name: 'DeepSeek (默认)',
    provider: 'deepseek',
    apiUrl: '',
    apiKey: '', // 留空让用户填写
    models: 'chat:deepseek-chat,reasoner:deepseek-reasoner'
};

const DEFAULT_AGENTS = [
    {
        id: 'default_agent_nanjing_guide',
        name: '南京历史小导游',
        avatar: '史',
        model: `${DEFAULT_API_CONFIG.id}:reasoner`,
        systemPrompt: "🎓 角色指令：你好！我是你的专属南京历史小导游。我的名字叫“金陵通”，对南京这座六朝古都的每一块砖、每一段历史都了如指掌。我将以生动有趣的方式，带你穿越时空，探索南京的魅力。我的性格会根据你选择的模式变化，就像一位真正的导游，时而风趣，时而严谨。\n\n🔄 核心导览模式：\n*   故事家 (Storyteller) → 语气风格：亲切随和，像一位学长/学姐。我会用讲故事的方式，把枯燥的历史变得鲜活起来，充满情感和趣味，让你身临其境。\n*   讲解员 (Docent) → 语气风格：清晰准确，像一位博物馆的专业讲解员。我会为你提供结构化的信息、关键时间点和准确的历史事实，帮你梳理知识脉络。\n*   历史侦探 (History Detective) → 语气风格：充满好奇与思辨，像一位和你一起探案的伙伴。我会引导你发现历史事件之间的联系，分析文物背后的深层含义，提出“为什么”，激发你的思考。\n\n🧬 互动说明：\n1.  模式匹配：我会严格按照你选择的模式（故事家、讲解员、历史侦探）来与你交流。\n2.  知识储备：我的知识库涵盖了南京从古至今的关键历史时期（如六朝、南唐、明朝、民国）、重要人物（如朱元璋、孙中山）以及标志性文物古迹（如明孝陵、总统府、中山陵、南京城墙、夫子庙、朝天宫、南京博物院馆藏等）。\n3.  智能追问：如果你的问题不够具体，我会像导游一样追问。\n4.  连续记忆：我会记住我们聊过的话题。\n5.  拒绝乏味：我的回答会避免像教科书一样枯燥。\n6.  模式切换：你随时可以让我切换模式。切换时，我会说“好的，现在切换到【XX模式】”，然后调整我的语气和回答方式。\n\n📦 输出格式参考：\n*   在 【讲解员模式】下，我会多使用列表、时间轴和要点总结。\n*   在 【故事家模式】下，我会使用更多的描述性语言。\n*   在 【历史侦探模式】下，我会多用提问、假设和对比分析。",
        hint: '你好！我是你的专属南京历史小导游“金陵通”。想了解南京的什么故事？比如，可以这样问我：<br><b>模式：故事家 — 任务：给我讲讲夫子庙旁边的乌衣巷有什么好玩的故事？</b>',
        tags: ['历史', '文化', '旅游'],
        sendHistory: true,
    },
    {
        id: 'default_agent_english_tutor',
        name: '英语导师',
        avatar: '英',
        model: `${DEFAULT_API_CONFIG.id}:chat`,
        systemPrompt: "🎓 角色指令：你好！我是智能英语导师「牛津通」，专注中学英语教学。拥有系统的知识库和动态教学策略，能根据你的学习阶段个性化辅导。\n\n🔄 三维学习模式：\n*   【单词向导】→ 沉浸式词汇学习：词根解析/趣味联想/场景记忆\n*   【语法专家】→ 系统化语法精讲：错题透析/分层训练/对比分析\n*   【读写教练】→ 实战能力培养：文本精读/写作框架/AI批改\n\n✨ 核心功能矩阵：\n1. 词汇体系：中考高频词库｜近义词辨析｜词源故事\n2. 语法诊所：句子成分图解｜时态三维训练｜易错点预警\n3. 读写实验室：阅读理解三步法｜作文多维评估｜经典句式仿写\n4. 拓展模块：影视配音练习｜文化冷知识｜考试策略指南\n\n🧠 智能教学协议：\n1. 模式匹配：严格按所选模式输出内容\n2. 错题驱动：支持拍照诊断知识盲区\n3. 动态调节：智能调整题目难度（基础→挑战）\n4. 记忆锚点：周期性推送薄弱点强化练习\n5. 文化融合：教学中渗透英美文化背景",
        hint: '你好！我是你的中学英语导师「牛津通」。完整功能列表：<br>🔍 <b>单词向导模式</b>：词根解析｜高频词汇｜场景记忆（例：用电影台词记"vivid"）<br>📖 <b>语法专家模式</b>：句子图解｜时态训练｜错题诊断（例：虚拟语气对比表）<br>✍️ <b>读写教练模式</b>：作文批改｜精读策略｜仿写训练（例：中考作文评分+改写）<br>🌍 <b>拓展功能</b>：影视配音｜文化常识｜考试技巧<br>试试这样问我：<b>模式：单词向导 → 任务：用超级英雄故事帮我记10个形容词</b>',
        tags: ['教育', '语言', '学习'],
        sendHistory: true,
    },
    {
        id: 'default_agent_word_assistant',
        name: '单词助手',
        avatar: '词',
        model: `${DEFAULT_API_CONFIG.id}:chat`,
        systemPrompt: `
# 角色：英语单词辨析专家

## 核心指令
你是一个专注于**中学英语**词汇辨析的专家。你的任务是根据用户输入的单词或词组，提供清晰、结构化、符合中学生认知水平的解释。你必须严格遵循以下【工作流程】和【输出格式】。

## 工作流程
1.  **输入分析**：分析用户输入。输入内容可以用逗号（,）、分号（;）、斜杠（/）或中文顿号（、）分隔。
2.  **单一词模式**：如果用户只输入了一个单词或词组，执行此模式。
    *   提供该词的核心释义。
    *   列出其在中学阶段最常见的近义词或相关词。
    *   对这些词进行详细的词义辨析。
3.  **多词模式**：如果用户输入了多个单词或词组，执行此模式。
    *   分别解释每个词的核心释义。
    *   **重点**：对比分析这些词之间的区别，包括用法、语境、感情色彩等。
    *   （可选）如果适用，可以补充其他相关的近义词。

## 输出格式 (必须严格遵守)
使用 Markdown 格式化你的回答，确保结构清晰。

### 格式模板 (单一词模式)
\`\`\`markdown
### 📖 单词解析：[用户输入的单词]

**基本释义**
*   **[词性1]**: [解释1]
*   **[词性2]**: [解释2]

**🔍 近义词辨析**
*   **[近义词1]**: 
    *   **释义**: [简要解释]
    *   **辨析**: [与原词的区别，侧重用法或语境]
    *   **例句**: [一个符合中学生水平的简单例句]
*   **[近义词2]**: 
    *   **释义**: [简要解释]
    *   **辨析**: [与原词的区别]
    *   **例句**: [例句]
...
\`\`\`

### 格式模板 (多词模式)
\`\`\`markdown
### 🔄 多词辨析：[词1], [词2], ...

**1. [词1]**
*   **释义**: [词性] [解释]

**2. [词2]**
*   **释义**: [词性] [解释]
...

**🎯 核心区别**
1.  **[区别点1，如：使用范围]**: [详细说明，例如：A 通常用于正式场合，而 B 更加口语化。]
2.  **[区别点2，如：感情色彩]**: [详细说明，例如：C 带有褒义，而 D 是中性词。]
3.  **[区别点3，如：搭配习惯]**: [详细说明，例如：A 后面常跟 of，而 B 常跟 for。]

**✅ 快速总结**
*   想表达 **[某个场景或含义]** 时，用 **[词A]**。
*   想强调 **[另一个场景或含义]** 时，用 **[词B]**。
\`\`\`

## 约束条件
*   **专注中学阶段**：所有近义词和例句都必须是中学英语教学大纲内的常见内容，避免超纲词汇。
*   **语言简洁**：解释要通俗易懂，避免使用复杂的语法和术语。
*   **格式严格**：必须严格按照上述 Markdown 模板输出。
`,
        hint: `你好！我是你的单词辨析助手。直接输入单词或词组，我会帮你深入理解它们！<br>
✍️ **单个词查询**: 比如输入 <code>clever</code><br>
🔄 **多个词辨析**: 比如输入 <code>clever, smart, wise</code>`,
        tags: ['教育', '语言', '工具'],
        sendHistory: false // 设为 false，每次查询都是独立的，不受历史记录干扰
    }
];


// 获取所有需要备份的表的名称
const tablesToBackup = Object.keys(db.tables.reduce((acc, table) => ({...acc, [table.name]: true }), {}));

/**
 * [新增] 检查并添加默认的 API 配置和角色 (Prompts)。
 * @param {Array} existingApiConfigs - 已存在的 API 配置。
 * @param {Array} existingPrompts - 已存在的角色配置。
 * @returns {{apiConfigs: Array, prompts: Array, needsPersistence: boolean}} - 返回更新后的数组和是否需要保存的标志。
 */
function seedDefaultData(existingApiConfigs, existingAgents) {
    let apiConfigs = [...existingApiConfigs];
    let agents = [...existingAgents];
    let needsPersistence = false;

    // 1. 检查并添加默认的 API 配置
    const hasDefaultApi = apiConfigs.some(c => c.id === DEFAULT_API_CONFIG.id);
    if (!hasDefaultApi) {
        apiConfigs.push(DEFAULT_API_CONFIG);
        needsPersistence = true;
        console.log("Seeding default API config for DeepSeek.");
    }

    // 2. 检查并添加默认的角色
    DEFAULT_AGENTS.forEach(defaultAgent => {
        const hasDefaultAgent = agents.some(p => p.id === defaultAgent.id);
        if (!hasDefaultAgent) {
            agents.push(defaultAgent);
            needsPersistence = true;
            console.log(`Seeding default agent: "${defaultAgent.name}".`);
        }
    });

    return { apiConfigs, agents, needsPersistence };
}

// --- Private Helpers ---

/**
 * [重写] 从内容中解析出一、二级标题，并构建层级结构。
 * @param {string} content - 待解析的 Markdown 文本。
 * @returns {Array<object>} - 返回一个包含层级关系的标题对象数组。
 */
function parseAndStructureHeadings(content) {
    const headingRegex = /^(#{1,2})\s+(.+)$/gm;
    const structuredHeadings = [];
    let lastH1 = null;
    let match;

    while ((match = headingRegex.exec(content)) !== null) {
        const level = match[1].length;
        const text = match[2].trim();
        
        const heading = {
            id: generateId(),
            text: text,
            level: level,
            // 完整内容用于点击后在编辑器中显示
            content: `#`.repeat(level) + ` ${text}\n\n` + (content.substring(match.index + match[0].length).split(/^#{1,2}\s/m)[0] || '').trim(),
        };

        if (level === 1) {
            heading.children = []; // H1 标题可以有子标题
            structuredHeadings.push(heading);
            lastH1 = heading;
        } else if (level === 2 && lastH1) {
            // 如果这是一个 H2 并且前面有一个 H1，则将其作为 H1 的子项
            lastH1.children.push(heading);
        }
    }
    return structuredHeadings;
}

/**
 * [重写] 为指定文件创建层级化的子会话。
 * @param {string} fileId - 文件ID。
 * @param {string} content - 文件内容。
 */
function createSubsessionsForFile(fileId, content) {
    const structuredHeadings = parseAndStructureHeadings(content);
    const newFileSubsessions = { ...appState.fileSubsessions, [fileId]: structuredHeadings };
    setState({ fileSubsessions: newFileSubsessions });
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
            fileSubsessions: {},
            // [新增] 加载设置，并提供默认值
            settings: {
                autoSaveInterval: persistentAppState.autoSaveInterval ?? 5, // 默认为5分钟
            }
        };

        // Generate subsessions for all loaded files
        loadedState.sessions.forEach(session => {
            // 调用重写后的函数
            const subsessions = parseAndStructureHeadings(session.content);
            loadedState.fileSubsessions[session.id] = subsessions;
        });
        
        // Set initial state if empty
        if (loadedState.sessions.length === 0) {
            const id = generateId();
            loadedState.sessions.push({ id, name: '初始会话', content: INITIAL_CONTENT, type: 'file', folderId: null, createdAt: new Date() });
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

export async function persistCoreState() {
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
                // [新增] 持久化自动保存设置
                autoSaveInterval: appState.settings.autoSaveInterval,
            },
        });
    } catch (error) {
        console.error("Failed to persist core state:", error);
    }
}


// --- Data Manipulation ---

export async function addFile(name, content = INITIAL_CONTENT) {
    const id = generateId();
    const newFile = { id, name: name || `新文件 ${appState.sessions.length + 1}`, content, type: 'file', folderId: appState.currentFolderId, createdAt: new Date() };
    const newSessions = [...appState.sessions, newFile];
    setState({ sessions: newSessions, currentSessionId: id, currentSubsessionId: null });
    createSubsessionsForFile(id, content);
    await persistState();
}

export async function addFolder(name) {
    const newFolder = { id: generateId(), name: name || `新目录 ${appState.folders.length + 1}`, type: 'folder', folderId: appState.currentFolderId, createdAt: new Date() };
    const newFolders = [...appState.folders, newFolder];
    setState({ folders: newFolders });
    await persistState();
}

export async function removeItems(itemsToRemove) {
    const idsToRemove = new Set(itemsToRemove.map(item => item.id));
    let sessions = [...appState.sessions];
    let folders = [...appState.folders];
    let fileSubsessions = {...appState.fileSubsessions};
    let clozeStates = {...appState.clozeStates}; // [新增] 获取 clozeStates 的副本

    // [新增] 创建一个集合来存储所有需要被删除的文件的ID
    const fileIdsToDelete = new Set();

    itemsToRemove.forEach(item => {
        if (item.type === 'file') {
            fileIdsToDelete.add(item.id);
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
            // 查找并添加所有在这些文件夹内的文件ID
            sessions.forEach(s => {
                if (folderIdsToDelete.has(s.folderId)) {
                    fileIdsToDelete.add(s.id);
                }
            });

            // 从内存中过滤掉被删除的文件夹
            folders = folders.filter(f => !folderIdsToDelete.has(f.id));
        }
    });

    // [新增] 根据收集到的文件ID，一次性清理所有相关数据
    if (fileIdsToDelete.size > 0) {
        // 1. 清理 sessions
        sessions = sessions.filter(s => !fileIdsToDelete.has(s.id));

        // 2. 清理 fileSubsessions
        fileIdsToDelete.forEach(id => { delete fileSubsessions[id]; });

        // 3. 清理 clozeStates
        const remainingClozeStates = {};
        for (const clozeId in clozeStates) {
            // 保留那些 fileId 不在待删除列表中的 cloze 状态
            if (!fileIdsToDelete.has(clozeStates[clozeId].fileId)) {
                remainingClozeStates[clozeId] = clozeStates[clozeId];
            }
        }
        clozeStates = remainingClozeStates;
        

        // 注意：由于 reviewStats 的 key 是 'YYYY-MM-DD:folderId'，精确删除比较复杂。
        // 一个简化的策略是暂时不清理 reviewStats，因为它只影响历史统计，不影响核心功能。
        // 彻底的清理需要更复杂的数据库查询。
    }

    // 更新当前会话ID，如果它被删除了
    let currentSessionId = appState.currentSessionId;
    if (idsToRemove.has(currentSessionId) || fileIdsToDelete.has(currentSessionId)) {
        currentSessionId = sessions.length > 0 ? sessions[0].id : null;
    }
    
    // 使用清理后的数据更新状态
    setState({ sessions, folders, fileSubsessions, clozeStates, currentSessionId });
    
    // 持久化，现在 storageService 会收到正确的数据
    await persistState();
}

export async function moveItems(items, targetFolderId) {
    const newSessions = appState.sessions.map(s => items.some(item => item.id === s.id && item.type === 'file') ? { ...s, folderId: targetFolderId } : s);
    const newFolders = appState.folders.map(f => items.some(item => item.id === f.id && item.type === 'folder') ? { ...f, folderId: targetFolderId } : f);
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
        const newSessions = appState.sessions.map(s => s.id === appState.currentSessionId ? { ...s, content: newContent, lastActive: new Date() } : s);
        setState({ sessions: newSessions });
        createSubsessionsForFile(appState.currentSessionId, newContent);
        await persistState();
        return true;
    }
    return false;
}

// --- Selection & Navigation (These don't need to be async) ---

export function getCurrentSession() {
    return appState.sessions.find(s => s.id === appState.currentSessionId) || null;
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
export function getOrCreateClozeState(fileId, clozeContent, clozeId) {
    // const clozeId = `${fileId}_${simpleHash(clozeContent)}`; // 这行逻辑已被移走
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
export function updateClozeState(fileId, clozeContent, rating, clozeId) {
    const currentState = getOrCreateClozeState(fileId, clozeContent, clozeId);
    const updates = calculateNextReview(currentState, rating);
    
    const allStates = appState.clozeStates;

    // [FIX] 使用正确的 clozeId (即 currentState.id) 作为键来更新状态
    // 如果 currentState 是通过 clozeId 正确获取的，那么 currentState.id 就是有效的
    if(currentState.id) {
        allStates[currentState.id] = {
            ...currentState,
            ...updates,
            lastReview: Date.now()
        };
        setState({ clozeStates: allStates });
        // 在实际应用中，这里应该触发数据持久化，但目前是由 persistState() 统一处理
    } else {
        console.error("无法更新 Cloze 状态：无法确定 clozeId。", {fileId, clozeContent, clozeId});
    }
}

// ===================================================================
// [重构] SETTINGS & AGENT (PROMPT) DATA SERVICE
// ===================================================================

/**
 * [重构] 加载所有设置相关的配置数据。
 */
export async function initializeSettingsData() {
    let { apiConfigs, agents, topics, history } = await storage.loadSettingsData();
    
    // [修改] 调用 seedDefaultData 函数来检查并添加默认数据
    const seedResult = seedDefaultData(apiConfigs || [], agents || []);
    apiConfigs = seedResult.apiConfigs;
    agents = seedResult.agents;

    const settingsState = {
        apiConfigs,
        agents,
        topics: topics || [],
        history: history || [],
    };

    if (settingsState.agents.length > 0 && !appState.currentAgentId) {
        settingsState.currentAgentId = settingsState.agents[0].id;
        const firstTopic = settingsState.topics.find(t => t.agentId === settingsState.currentAgentId);
        settingsState.currentTopicId = firstTopic ? firstTopic.id : null;
    }

    setState(settingsState);

    // 如果添加了新数据，则立即持久化
    if (seedResult.needsPersistence) {
        await persistSettingsState();
    }
}

/**
 * [重构] 持久化所有设置相关的配置数据。
 */
export async function persistSettingsState() {
    try {
        await storage.saveSettingsData({
            apiConfigs: appState.apiConfigs,
            agents: appState.agents,
            topics: appState.topics,
            history: appState.history
        });
    } catch (error) {
        console.error("Failed to persist settings state:", error);
    }
}

// --- API Config Management (CRUD) ---

export async function addApiConfig(data) {
    const newConfig = { id: generateId(), ...data };
    const apiConfigs = [...appState.apiConfigs, newConfig];
    setState({ apiConfigs });
    await persistSettingsState();
    return newConfig;
}

export async function updateApiConfig(id, data) {
    const apiConfigs = appState.apiConfigs.map(c => c.id === id ? { ...c, ...data } : c);
    setState({ apiConfigs });
    await persistSettingsState();
}

export async function deleteApiConfig(id) {
    // [修复] 更新检查逻辑以匹配新的数据模型
    // 检查是否有任何 Agent 正在使用此 API 配置
    const isUsed = appState.agents.some(agent => 
        agent.model && agent.model.startsWith(id + ':')
    );
    
    if (isUsed) {
        alert("无法删除此 API 配置，因为它正在被一个或多个 Agent 使用。请先修改或删除相关 Agent 的模型设置。");
        return; // 返回，而不是抛出错误
    }
    const apiConfigs = appState.apiConfigs.filter(c => c.id !== id);
    setState({ apiConfigs });
    await persistSettingsState();
}

// --- Prompt (Role) Management (CRUD) ---

export function getAgentById(agentId) {
    return appState.agents.find(p => p.id === agentId);
}

export async function addAgent(data) {
    const newAgent = { 
        id: generateId(), 
        ...data,
        tags: data.tags || [],
        sendHistory: data.sendHistory !== false,
    };
    const agents = [...appState.agents, newAgent];
    setState({ agents, currentAgentId: newAgent.id, currentTopicId: null });
    await persistSettingsState();
    return newAgent;
}

export async function updateAgent(id, data) {
    const agents = appState.agents.map(p => p.id === id ? { ...p, ...data } : p);
    setState({ agents });
    await persistSettingsState();
}

export async function deleteAgent(id) {
    const topicsToDelete = appState.topics.filter(t => t.agentId === id);
    const topicIdsToDelete = new Set(topicsToDelete.map(t => t.id));

    const history = appState.history.filter(h => !topicIdsToDelete.has(h.topicId));
    const topics = appState.topics.filter(t => t.agentId !== id);
    const agents = appState.agents.filter(p => p.id !== id);

    let newCurrentAgentId = appState.currentAgentId;
    let newCurrentTopicId = appState.currentTopicId;

    if (newCurrentAgentId === id) {
        newCurrentAgentId = agents.length > 0 ? agents[0].id : null;
        const firstTopic = topics.find(t => t.agentId === newCurrentAgentId);
        newCurrentTopicId = firstTopic ? firstTopic.id : null;
    }

    setState({ agents, topics, history, currentAgentId: newCurrentAgentId, currentTopicId: newCurrentTopicId });
    await persistSettingsState();
}

// --- Topic Management ---

export async function addTopic(title, icon) {
    if (!appState.currentAgentId) {
        alert("请先选择一个 Agent。");
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
    await persistSettingsState();
}

// [新增] 更新主题名称的函数
export async function updateTopic(id, updates) {
    const topics = appState.topics.map(t => t.id === id ? { ...t, ...updates } : t);
    setState({ topics });
    await persistSettingsState();
}


// --- History/Chat Management (适配 Prompt 和新 API Config) ---

async function _addHistoryMessage(topicId, role, content, images = [], status = 'completed', reasoning = null) {
    const newMessage = {
        id: generateId(),
        topicId,
        agentId: (role === 'assistant' || role === 'user') ? appState.currentConversationAgentId : null, // [重构]
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
        await persistSettingsState(); // [修复] 之前调用了错误的 persistAgentState
    }
    return newMessage;
}



/**
 * The main chat function. Handles user message, simulates AI response.
 * @param {string} content - The text content from the user.
 * @param {Array<{name: string, data: string}>} attachments - The user's attachments.
 */
export async function sendMessageAndGetResponse(content, attachments) {
    const agentId = appState.currentConversationAgentId;
    if (!appState.currentTopicId || appState.isAiThinking) return;

    const topicId = appState.currentTopicId;
    const currentAgent = getAgentById(agentId);
    
    let llmConfig;
    if (currentAgent) {

    // [核心修改] 从 Prompt 配置中解析出 API 配置和模型
    const [apiConfigId, modelAlias] = currentAgent.model.split(':');
    const apiConfig = appState.apiConfigs.find(c => c.id === apiConfigId);
    
    if (!apiConfig) {
            alert(`错误：找不到角色 "${currentAgent.name}" 所需的 API 配置。`);
        return;
    }

        const modelMap = new Map((apiConfig.models || '').split(',').map(m => m.split(':').map(s => s.trim())));
    const modelName = modelMap.get(modelAlias);

    if (!modelName) {
        alert(`错误：在 API 配置 "${apiConfig.name}" 中找不到别名为 "${modelAlias}" 的模型。`);
        return;
    }
    
        // 如果用户在设置中没有填写 apiUrl，则使用 provider 的默认 baseURL
        const finalApiPath = apiConfig.apiUrl || getDefaultApiPath(apiConfig.provider);
    // 构建传递给 llmService 的完整配置
        llmConfig = {
            provider: apiConfig.provider,
            apiPath: finalApiPath, // [修改] 使用我们计算出的最终路径
            apiKey: apiConfig.apiKey,
            model: modelName,
            systemPrompt: currentAgent.systemPrompt,
        };
    } else {
        // [新增] 处理 "默认AI (无角色)" 的情况
        // 假设第一个API配置是默认的，或者提供一个专门的默认配置
        const apiConfig = appState.apiConfigs[0]; 
        if (!apiConfig) {
            alert("错误：没有找到可用的 API 配置。请在设置中添加一个。");
            return;
        }
        const modelMap = new Map((apiConfig.models || '').split(',').map(m => m.split(':').map(s => s.trim())));
        const modelName = modelMap.values().next().value; // 使用第一个模型
        
        // --- [核心修改] ---
        // 同样应用回退逻辑
        const finalApiPath = apiConfig.apiUrl || getDefaultApiPath(apiConfig.provider);
        
        llmConfig = {
            provider: apiConfig.provider,
            apiPath: finalApiPath, // [修改] 使用我们计算出的最终路径
            apiKey: apiConfig.apiKey,
            model: modelName,
            systemPrompt: "", // 没有 system prompt
        };
    }
    
    // --- 后续逻辑与之前基本相同 ---
    setState({ isAiThinking: true });
    await _addHistoryMessage(topicId, 'user', content, []);
    renderHistoryPanel(); 
    
    const aiMessage = await _addHistoryMessage(topicId, 'assistant', '', [], 'streaming', '');
    renderHistoryPanel();

    let accumulatedContent = "";
    let accumulatedReasoning = "";

    // ===================================================================
    //                        [核心修复逻辑]
    // ===================================================================
    
    // 1. 首先，获取当前主题下所有已完成的消息。
    //    这其中已经包含了我们刚刚通过 _addHistoryMessage 添加的用户新消息。
    const completedHistory = appState.history
        .filter(h => h.topicId === topicId && h.status === 'completed' && h.id !== aiMessage.id);

    let messagesToSendToAI = [];

    // 2. 然后，根据 sendHistory 标志决定要发送哪些消息给LLM
    if (currentAgent && currentAgent.sendHistory === false) {
        // 如果明确设置为不发送历史，则只取最后一条消息（也就是用户当前输入的消息）
        messagesToSendToAI = completedHistory.slice(-1); 
    } else {
        // 对于其他所有情况（sendHistory为true、undefined，或没有agent），都发送完整的历史记录
        messagesToSendToAI = completedHistory;
    }
    
    // 3. 将最终构建好的消息数组传递给 llmService
    await llmService.streamChat(llmConfig, messagesToSendToAI, {
        onChunk: ({ type, text }) => {
            if (type === 'content') accumulatedContent += text;
            else if (type === 'thinking') accumulatedReasoning += text;
            updateStreamingChunkInDOM(aiMessage.id, type, text);
        },
        onDone: async () => {
            // [修改] 先更新状态，然后 await UI 的重绘
            const finalHistory = appState.history.map(msg => 
                msg.id === aiMessage.id 
                ? { ...msg, content: accumulatedContent, reasoning: accumulatedReasoning, status: 'completed' } 
                : msg
            );
            setState({ history: finalHistory, isAiThinking: false });
            
            await finalizeStreamingUI(aiMessage.id); // <--- 使用 await
            
            await persistSettingsState();
        },
        onError: async (error) => {
            const errorText = `\n\n**错误:** ${error.message}`;
            accumulatedContent += errorText;
            
            // [修改] 同样，先更新状态，然后 await UI 重绘
            const finalHistory = appState.history.map(msg => 
                msg.id === aiMessage.id 
                ? { ...msg, content: accumulatedContent, reasoning: accumulatedReasoning, status: 'error' } 
                : msg
            );
            setState({ history: finalHistory, isAiThinking: false });

            await finalizeStreamingUI(aiMessage.id); // <--- 使用 await
            
            await persistSettingsState();
        }
    });
}

export async function deleteHistoryMessages(messageIds) {
    const idsToDelete = new Set(messageIds);
    const history = appState.history.filter(msg => !idsToDelete.has(msg.id));
    setState({ history });
    await persistSettingsState();
}

export async function editUserMessageAndRegenerate(messageId, newContent) {
    const allHistory = appState.history;
    const messageIndex = allHistory.findIndex(msg => msg.id === messageId);
    if (messageIndex === -1) return;

    const targetMessage = allHistory[messageIndex];
    const topicId = targetMessage.topicId;

    // 1. 截断历史记录
    const truncatedHistory = allHistory.slice(0, messageIndex + 1)
        .map(msg => msg.id === messageId ? { ...msg, content: newContent } : msg);
    
    // 2. 移除不属于当前主题的、在截断点之后的消息 (以防万一)
    const finalHistory = truncatedHistory.concat(
        allHistory.slice(messageIndex + 1).filter(msg => msg.topicId !== topicId)
    );
    
    setState({ history: finalHistory });
    renderHistoryPanel();
    
    // 3. 重新生成回应
    await sendMessageAndGetResponse(newContent, []);
}


// --- Selection (适配 Prompt) ---
export function selectAgent(agentId) { // [重构]
    const firstTopic = appState.topics.find(t => t.agentId === agentId); // [重构]
    setState({ 
        currentAgentId: agentId, // [重构]
        currentTopicId: firstTopic ? firstTopic.id : null
    });
}

export function selectTopic(topicId) {
    const lastMessage = appState.history
        .filter(h => h.topicId === topicId)
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];

    setState({ 
        currentTopicId: topicId,
        // [新增] 联动更新对话角色
        currentConversationAgentId: lastMessage ? lastMessage.agentId : (appState.agents[0]?.id || null) // [重构]
    });
}

// [新增] 删除一个或多个主题及其相关历史记录
export async function deleteTopics(topicIdsToDelete) {
    const idsToDeleteSet = new Set(topicIdsToDelete);

    // 1. 过滤掉要删除的主题
    const newTopics = appState.topics.filter(t => !idsToDeleteSet.has(t.id));

    // 2. 过滤掉与这些主题相关的历史记录
    const newHistory = appState.history.filter(h => !idsToDeleteSet.has(h.topicId));

    let newCurrentTopicId = appState.currentTopicId;
    let newCurrentConversationAgentId = appState.currentConversationAgentId;

    // 3. 如果当前选中的主题被删除了，重置选择
    if (idsToDeleteSet.has(newCurrentTopicId)) {
        newCurrentTopicId = null;
        newCurrentConversationAgentId = null;
    }

    setState({
        topics: newTopics,
        history: newHistory,
        currentTopicId: newCurrentTopicId,
        currentConversationAgentId: newCurrentConversationAgentId,
        isTopicSelectionMode: false, // 总是退出选择模式
        selectedTopicIds: []
    });

    await persistSettingsState();
}

// --- View Router ---
export function switchView(viewName) {
    if (['anki', 'agent', 'mistakes', 'settings'].includes(viewName)) {
        setState({ activeView: viewName });
    }
}

// ===================================================================
// UTILITY & GLOBAL PERSISTENCE
// ===================================================================

/**
 * [重构] 持久化所有应用模块的状态
 */
export async function persistAllAppState() {
    try {
        await Promise.all([
            persistCoreState(),
            persistSettingsState(),
        ]);
        console.log("All application state persisted.");
    } catch (error) {
        console.error("Failed to persist all application state:", error);
    }
}

// --- [新增] 复习统计相关业务逻辑 ---

/**
 * 记录一次复习完成事件
 * @param {string} fileId - 被复习的卡片所在的文件ID
 */
export async function recordReview(fileId) {
    if (!fileId) return;

    const file = appState.sessions.find(s => s.id === fileId);
    if (!file) return;
    
    const folderId = file.folderId || 'root';
    const today = new Date().toISOString().slice(0, 10);

    await storage.incrementReviewCount(today, folderId);
    
    // 记录后立即更新UI
    await updateTodaysReviewCountUI();
}

/**
 * 更新导航栏中的今日复习计数
 */
export async function updateTodaysReviewCountUI() {
    const count = await storage.getTodaysTotalCount();
    const countElement = document.getElementById('reviewCount');
    if (countElement) {
        countElement.textContent = count;
    }
}

/**
 * 获取并格式化近30天的复习数据以供图表使用
 * @returns {Promise<object>} - 返回 { labels: string[], datasets: object[] }
 */
export async function getReviewStatsForChart() {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - 29);

    const startDateStr = startDate.toISOString().slice(0, 10);
    const endDateStr = endDate.toISOString().slice(0, 10);

    const rawStats = await storage.getStatsForDateRange(startDateStr, endDateStr);

    // 1. 生成日期标签 (近30天)
    const labels = [];
    for (let i = 0; i < 30; i++) {
        const date = new Date(startDate);
        date.setDate(startDate.getDate() + i);
        labels.push(date.toISOString().slice(0, 10));
    }

    // 2. 按 folderId 对数据进行分组
    const statsByFolder = rawStats.reduce((acc, stat) => {
        const folderId = stat.folderId;
        if (!acc[folderId]) {
            acc[folderId] = {};
        }
        acc[folderId][stat.date] = stat.count;
        return acc;
    }, {});

    // 3. 构建 datasets
    const { folders } = appState;
    const folderNameMap = folders.reduce((map, folder) => {
        map[folder.id] = folder.name;
        return map;
    }, {});
    folderNameMap['root'] = '根目录';

    const colorPalette = ['#4361ee', '#e71d36', '#2ec4b6', '#ff9f1c', '#9a031e', '#0ead69', '#f3722c'];
    let colorIndex = 0;

    const datasets = Object.keys(statsByFolder).map(folderId => {
        const dailyData = statsByFolder[folderId];
        const data = labels.map(date => dailyData[date] || 0);
        const color = colorPalette[colorIndex % colorPalette.length];
        colorIndex++;

        return {
            label: folderNameMap[folderId] || '未知目录',
            data: data,
            borderColor: color,
            backgroundColor: `${color}33`, // 带透明度的背景色
            fill: false,
            tension: 0.1
        };
    });

    return { labels, datasets };
}

/**
 * [新增] 自动保存当前所有模块的状态。
 * 这是一个安全的、全面的保存操作。
 */
export async function autoSave() {
    const editor = document.getElementById('editor');
    if (appState.activeView === 'anki' && appState.currentSessionId && editor) {
        console.log(`[${new Date().toLocaleTimeString()}] Auto-saving Anki content...`);
        await saveCurrentSessionContent(editor.value);
    }
    // 全面的状态保存，即使不在 anki 视图，其他状态也可能变更
    await persistAllAppState();
}

/**
 * 根据当前状态中的筛选标签，返回过滤后的主题列表
 * @returns {Array<object>}
 */
export function getFilteredTopics() {
    const selectedTag = appState.topicListFilterTag;
    if (selectedTag === 'all') {
        return appState.topics;
    }

    const agentMap = new Map(appState.agents.map(agent => [agent.id, agent]));
    return appState.topics.filter(topic => {
        const lastMessage = appState.history
            .filter(h => h.topicId === topic.id)
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];

        if (!lastMessage || !lastMessage.agentId) return false;
        
        const agent = agentMap.get(lastMessage.agentId);
        if (!agent || !agent.tags) return false;
        
        return agent.tags.includes(selectedTag);
    });
}
