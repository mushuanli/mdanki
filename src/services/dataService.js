// src/services/dataService.js

import { appState, setState } from '../common/state.js';
import * as storage from './storageService.js';
import { generateId } from '../common/utils.js';
import { INITIAL_CONTENT } from '../common/config.js';
import { calculateNextReview } from './srs.js';

// 模块化导入
import * as llmService from './llm/llmService.js';
import { getDefaultApiPath } from './llm/llmProviders.js';
import { renderHistoryPanel, updateStreamingChunkInDOM, finalizeStreamingUI } from '../agent/agent_ui.js';

// ===================================================================
//                        应用初始化与全局服务
// ===================================================================

/**
 * [重构] 应用主初始化函数。
 * 仅加载 Anki 核心数据和全局状态。Agent 和 Task 模块将按需加载。
 */
export async function initializeApp() {
    setState({ isLoading: true });
    try {
        // 1. 加载 Anki 核心数据和全局持久化状态
        const { sessions, folders, clozeStates, persistentAppState } = await storage.loadAnkiData();

        const ankiState = {
            sessions: sessions || [],
            folders: folders || [],
            clozeStates: clozeStates || {}, // [MODIFIED] 加载 clozeStates
            currentSessionId: persistentAppState.currentSessionId || null,
            currentFolderId: persistentAppState.currentFolderId || null,
            currentSubsessionId: persistentAppState.currentSubsessionId || null,
            folderStack: persistentAppState.folderStack || [],
            isSessionSidebarHidden: persistentAppState.isSessionSidebarHidden || false,
            fileSubsessions: {},
            // [新增] 加载设置，并提供默认值
            settings: {
                autoSaveInterval: persistentAppState.autoSaveInterval ?? 5
            },
        };

        ankiState.sessions.forEach(session => {
            ankiState.fileSubsessions[session.id] = anki_parseAndStructureHeadings(session.content);
        });

        if (ankiState.sessions.length === 0) {
            const id = generateId();
            ankiState.sessions.push({ id, name: '初始笔记', content: INITIAL_CONTENT, type: 'file', folderId: null, createdAt: new Date() });
            ankiState.currentSessionId = id;
            ankiState.fileSubsessions[id] = anki_parseAndStructureHeadings(INITIAL_CONTENT);
        }

        if (!ankiState.sessions.some(s => s.id === ankiState.currentSessionId)) {
            ankiState.currentSessionId = ankiState.sessions.length > 0 ? ankiState.sessions[0].id : null;
        }

        setState(ankiState);
    } catch (error) {
        console.error("Failed to initialize core application state:", error);
    } finally {
        setState({ isLoading: false });
    }
}

/**
 * [重构] 自动保存所有已加载模块的状态。
 */
export async function autoSave() {
    console.log(`[${new Date().toLocaleTimeString()}] Auto-saving...`);
    // 只有 Anki 编辑器需要特殊处理，先从 DOM 获取最新内容
    if (appState.activeView === 'anki' && appState.currentSessionId) {
        const editor = document.getElementById('anki_editor');
        if (editor) {
            await anki_saveCurrentSessionContent(editor.value);
        }
    }
    // 其他模块的状态已经在内存中，直接保存即可
    await persistAllAppState();
}

/**
 * [重构] 持久化所有应用模块的状态。
 */
export async function persistAllAppState() {
    try {
        await Promise.all([
            persistAnkiState(),
            // 只有当 agent 数据加载后才尝试保存
            appState.agents ? persistAgentState() : Promise.resolve(),
        ]);
        console.log("All application state persisted.");
    } catch (error) {
        console.error("Failed to persist all application state:", error);
    }
}

/**
 * [保留] 视图切换服务。
 */
export function switchView(viewName) {
    if (['anki', 'task', 'agent', 'settings'].includes(viewName)) {
        setState({ activeView: viewName });
    }
}


// ===================================================================
//                        Anki 模块服务
// ===================================================================

function anki_parseAndStructureHeadings(content) {
    const headingRegex = /^(#{1,2})\s+(.+)$/gm;
    const structuredHeadings = [];
    let lastH1 = null;
    let match;

    while ((match = headingRegex.exec(content)) !== null) {
        const level = match[1].length;
        const text = match[2].trim();
        const headingContent = (content.substring(match.index + match[0].length).split(/^#{1,2}\s/m)[0] || '').trim();
        
        const heading = {
            id: generateId(),
            text,
            level,
            content: `#`.repeat(level) + ` ${text}\n\n` + headingContent,
            children: level === 1 ? [] : undefined
        };

        if (level === 1) {
            structuredHeadings.push(heading);
            lastH1 = heading;
        } else if (level === 2 && lastH1) {
            lastH1.children.push(heading);
        }
    }
    return structuredHeadings;
}

function anki_createSubsessionsForFile(fileId, content) {
    const subsessions = anki_parseAndStructureHeadings(content);
    setState({
        fileSubsessions: { ...appState.fileSubsessions, [fileId]: subsessions }
    });
}

export async function persistAnkiState() {
    try {
        await storage.saveAnkiData({
            sessions: appState.sessions,
            folders: appState.folders,
            clozeStates: appState.clozeStates, // [MODIFIED] 保存 clozeStates
            persistentAppState: {
                currentSessionId: appState.currentSessionId,
                currentFolderId: appState.currentFolderId,
                currentSubsessionId: appState.currentSubsessionId,
                folderStack: appState.folderStack,
                isSessionSidebarHidden: appState.isSessionSidebarHidden,
                autoSaveInterval: appState.settings.autoSaveInterval,
            },
        });
    } catch (error) {
        console.error("Failed to persist Anki state:", error);
    }
}


// --- Data Manipulation ---

export async function anki_addFile(name, content = INITIAL_CONTENT) {
    const id = generateId();
    const newFile = { id, name: name || `新笔记`, content, type: 'file', folderId: appState.currentFolderId, createdAt: new Date() };
    setState({
        sessions: [...appState.sessions, newFile],
        currentSessionId: id,
        currentSubsessionId: null
    });
    anki_createSubsessionsForFile(id, content);
    await persistAnkiState();
}

export async function anki_addFolder(name) {
    const newFolder = { id: generateId(), name: name || `新目录`, type: 'folder', folderId: appState.currentFolderId, createdAt: new Date() };
    setState({
        folders: [...appState.folders, newFolder]
    });
    await persistAnkiState();
}

export async function anki_removeItems(itemsToRemove) {
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
                folders.filter(f => folderIdsToDelete.has(f.folderId)).forEach(c => {
                    if (!folderIdsToDelete.has(c.id)) {
                        folderIdsToDelete.add(c.id);
                        changed = true;
                    }
                });
            }
            // 查找并添加所有在这些文件夹内的文件ID
            sessions.forEach(s => {
                if (folderIdsToDelete.has(s.folderId)) fileIdsToDelete.add(s.id);
            });

            // 从内存中过滤掉被删除的文件夹
            folders = folders.filter(f => !folderIdsToDelete.has(f.id));
        }
    });

    // [新增] 根据收集到的文件ID，一次性清理所有相关数据
    if (fileIdsToDelete.size > 0) {
        // 1. 清理 sessions
        sessions = sessions.filter(s => !fileIdsToDelete.has(s.id));
        fileIdsToDelete.forEach(id => delete fileSubsessions[id]);
        clozeStates = Object.fromEntries(Object.entries(clozeStates).filter(([, state]) => !fileIdsToDelete.has(state.fileId)));
    }

    // 更新当前会话ID，如果它被删除了
    let currentSessionId = appState.currentSessionId;
    if (idsToRemove.has(currentSessionId) || fileIdsToDelete.has(currentSessionId)) {
        currentSessionId = sessions.length > 0 ? sessions[0].id : null;
    }
    
    // 使用清理后的数据更新状态
    setState({ sessions, folders, fileSubsessions, clozeStates, currentSessionId });
    await persistAnkiState();
}

export async function anki_moveItems(items, targetFolderId) {
    const newSessions = appState.sessions.map(s => items.some(item => item.id === s.id && item.type === 'file') ? { ...s, folderId: targetFolderId } : s);
    const newFolders = appState.folders.map(f => items.some(item => item.id === f.id && item.type === 'folder') ? { ...f, folderId: targetFolderId } : f);
    setState({ sessions: newSessions, folders: newFolders });
    await persistAnkiState();
}

export async function anki_updateItemName(id, newName, type) {
    const updater = (collection) => collection.map(item => item.id === id ? { ...item, name: newName } : item);
    setState(type === 'file' ? { sessions: updater(appState.sessions) } : { folders: updater(appState.folders) });
    await persistAnkiState();
}

export async function anki_saveCurrentSessionContent(newContent) {
    const session = anki_getCurrentSession();
    if (session && session.content !== newContent) {
        const newSessions = appState.sessions.map(s =>
            s.id === appState.currentSessionId ? { ...s, content: newContent, lastActive: new Date() } : s
        );
        setState({ sessions: newSessions });
        anki_createSubsessionsForFile(appState.currentSessionId, newContent);
        await persistAnkiState();
        return true;
    }
    return false;
}

export function anki_getCurrentSession() { return appState.sessions.find(s => s.id === appState.currentSessionId) || null; }
export function anki_selectSession(sessionId) { setState({ currentSessionId: sessionId, currentSubsessionId: null }); }
export function anki_selectFolder(folderId) { setState({ currentFolderId: folderId, folderStack: [...appState.folderStack, appState.currentFolderId].filter(Boolean) }); }
export function anki_selectSubsession(sessionId, subsessionId) { setState({ currentSessionId: sessionId, currentSubsessionId: subsessionId }); }
export function anki_goBack() { const stack = [...appState.folderStack]; const parentId = stack.pop(); setState({ currentFolderId: parentId, folderStack: stack }); }
export function anki_goToFolder(folderId, stackIndex) { setState({ currentFolderId: folderId, folderStack: appState.folderStack.slice(0, stackIndex) }); }
export function anki_goToRoot() { setState({ currentFolderId: null, folderStack: [] }); }

export function anki_getOrCreateClozeState(fileId, clozeContent, clozeId) {
    const allStates = appState.clozeStates;
    return allStates[clozeId] || { id: clozeId, fileId, content: clozeContent, state: 'new', due: Date.now(), interval: 0, easeFactor: 2.5, lastReview: null };
}

/**
 * 根据用户评分更新 Cloze 状态
 * @param {string} fileId 
 * @param {string} clozeContent 
 * @param {number} rating 
 */
export async function anki_updateClozeState(fileId, clozeContent, rating, clozeId) {
    const currentState = anki_getOrCreateClozeState(fileId, clozeContent, clozeId);
    const updates = calculateNextReview(currentState, rating);
    const allStates = { ...appState.clozeStates, [clozeId]: { ...currentState, ...updates, lastReview: Date.now() } };
    setState({ clozeStates: allStates });
    await persistAnkiState();
}

// --- [新增] 复习统计相关业务逻辑 ---

/**
 * 记录一次复习完成事件
 * @param {string} fileId - 被复习的卡片所在的文件ID
 */
export async function anki_recordReview(fileId) {
    if (!fileId) return;
    const file = appState.sessions.find(s => s.id === fileId);
    if (!file) return;

    const folderId = file.folderId || 'root';
    await storage.anki_incrementReviewCount(new Date().toISOString().slice(0, 10), folderId);
    await anki_updateTodaysReviewCountUI();
}

/**
 * 更新导航栏中的今日复习计数
 */
export async function anki_updateTodaysReviewCountUI() {
    const count = await storage.anki_getTodaysTotalCount();
    const countElement = document.getElementById('anki_reviewCount');
    if (countElement) {
        countElement.textContent = count;
    }
}

/**
 * 获取并格式化近30天的复习数据以供图表使用
 * @returns {Promise<object>} - 返回 { labels: string[], datasets: object[] }
 */
export async function anki_getReviewStatsForChart() {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - 29);

    const rawStats = await storage.anki_getStatsForDateRange(startDate.toISOString().slice(0, 10), endDate.toISOString().slice(0, 10));

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
        if (!acc[folderId]) acc[folderId] = {};
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


// ===================================================================
// [重构] SETTINGS & AGENT (PROMPT) DATA SERVICE
// ===================================================================

const DEFAULT_API_CONFIG = { id: 'default_deepseek_api', name: 'DeepSeek (默认)', provider: 'deepseek', apiKey: '', models: 'chat:deepseek-chat,reasoner:deepseek-reasoner' };

// [ALIGNMENT] 恢复了原版完整的 DEFAULT_AGENTS 数据
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

function agent_seedDefaultData(existingApiConfigs, existingAgents) {
    let apiConfigs = [...existingApiConfigs];
    let agents = [...existingAgents];
    let needsPersistence = false;

    if (!apiConfigs.some(c => c.id === DEFAULT_API_CONFIG.id)) {
        apiConfigs.push(DEFAULT_API_CONFIG);
        needsPersistence = true;
    }

    DEFAULT_AGENTS.forEach(defaultAgent => {
        if (!agents.some(p => p.id === defaultAgent.id)) {
            agents.push(defaultAgent);
            needsPersistence = true;
        }
    });

    return { apiConfigs, agents, needsPersistence };
}

export async function initializeAgentData() {
    let { apiConfigs, agents, topics, history } = await storage.loadAgentData();
    const seedResult = agent_seedDefaultData(apiConfigs || [], agents || []);

    const agentState = { ...seedResult, topics: topics || [], history: history || [] };
    if (agentState.agents.length > 0 && !appState.currentAgentId) {
        agentState.currentAgentId = agentState.agents[0].id;
        agentState.currentTopicId = (agentState.topics.find(t => t.agentId === agentState.currentAgentId) || {}).id || null;
    }

    setState(agentState);

    // 如果添加了新数据，则立即持久化
    if (seedResult.needsPersistence) {
        await persistAgentState();
    }
}

/**
 * [重构] 持久化所有设置相关的配置数据。
 */
export async function persistAgentState() {
    try {
        await storage.saveAgentData({
            apiConfigs: appState.apiConfigs,
            agents: appState.agents,
            topics: appState.topics,
            history: appState.history
        });
    } catch (error) {
        console.error("Failed to persist Agent state:", error);
    }
}

export function agent_getAgentById(agentId) { return appState.agents.find(p => p.id === agentId); }
export async function agent_addApiConfig(data) { setState({ apiConfigs: [...appState.apiConfigs, { id: generateId(), ...data }] }); await persistAgentState(); }
export async function agent_updateApiConfig(id, data) { setState({ apiConfigs: appState.apiConfigs.map(c => c.id === id ? { ...c, ...data } : c) }); await persistAgentState(); }
export async function agent_deleteApiConfig(id) { if (appState.agents.some(a => a.model?.startsWith(id + ':'))) { alert("此 API 配置正在被 Agent 使用。"); return; } setState({ apiConfigs: appState.apiConfigs.filter(c => c.id !== id) }); await persistAgentState(); }
export async function agent_addAgent(data) { const newAgent = { id: generateId(), ...data, tags: data.tags || [], sendHistory: data.sendHistory !== false }; setState({ agents: [...appState.agents, newAgent], currentAgentId: newAgent.id, currentTopicId: null }); await persistAgentState(); }
export async function agent_updateAgent(id, data) { setState({ agents: appState.agents.map(p => p.id === id ? { ...p, ...data } : p) }); await persistAgentState(); }
export async function agent_deleteAgent(id) { const topicsToDelete = new Set(appState.topics.filter(t => t.agentId === id).map(t => t.id)); const history = appState.history.filter(h => !topicsToDelete.has(h.topicId)); const topics = appState.topics.filter(t => t.agentId !== id); const agents = appState.agents.filter(p => p.id !== id); let { currentAgentId, currentTopicId } = appState; if (currentAgentId === id) { currentAgentId = agents[0]?.id || null; currentTopicId = (topics.find(t => t.agentId === currentAgentId) || {}).id || null; } setState({ agents, topics, history, currentAgentId, currentTopicId }); await persistAgentState(); }
export async function agent_addTopic(title, icon) { if (!appState.currentAgentId) return; const newTopic = { id: generateId(), agentId: appState.currentAgentId, title, icon: icon || 'fas fa-comment', createdAt: new Date() }; setState({ topics: [...appState.topics, newTopic], currentTopicId: newTopic.id }); await persistAgentState(); }
export async function agent_updateTopic(id, updates) { setState({ topics: appState.topics.map(t => t.id === id ? { ...t, ...updates } : t) }); await persistAgentState(); }
export async function agent_deleteTopics(topicIdsToDelete) { const ids = new Set(topicIdsToDelete); const topics = appState.topics.filter(t => !ids.has(t.id)); const history = appState.history.filter(h => !ids.has(h.topicId)); let { currentTopicId, currentConversationAgentId } = appState; if (ids.has(currentTopicId)) { currentTopicId = null; currentConversationAgentId = null; } setState({ topics, history, currentTopicId, currentConversationAgentId, isTopicSelectionMode: false, selectedTopicIds: [] }); await persistAgentState(); }
export async function agent_deleteHistoryMessages(messageIds) { const ids = new Set(messageIds); setState({ history: appState.history.filter(msg => !ids.has(msg.id)) }); await persistAgentState(); }
export async function agent_editUserMessageAndRegenerate(messageId, newContent) { const allHistory = appState.history; const msgIndex = allHistory.findIndex(msg => msg.id === messageId); if (msgIndex === -1) return; const topicId = allHistory[msgIndex].topicId; const truncatedHistory = allHistory.slice(0, msgIndex).concat([{ ...allHistory[msgIndex], content: newContent }]); setState({ history: truncatedHistory.concat(allHistory.slice(msgIndex + 1).filter(msg => msg.topicId !== topicId)) }); await renderHistoryPanel(); await agent_sendMessageAndGetResponse(newContent, []); }

// [ALIGNMENT] 恢复了 attachments 参数以支持附件功能
async function agent_addHistoryMessage(topicId, role, content, attachments = [], status = 'completed', reasoning = null) {
    const newMessage = {
        id: generateId(),
        topicId,
        agentId: role === 'assistant' ? appState.currentConversationAgentId : null,
        role,
        content,
        reasoning,
        attachments, // <-- 恢复的字段
        timestamp: new Date().toISOString(),
        status
    };
    setState({ history: [...appState.history, newMessage] });
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
export async function agent_sendMessageAndGetResponse(content, attachments) {
    const { currentTopicId, currentConversationAgentId, isAiThinking, apiConfigs, agents } = appState;
    if (!currentTopicId || isAiThinking) return;

    const agent = agent_getAgentById(currentConversationAgentId);
    let llmConfig;

    if (agent) {
        const [apiConfigId, modelAlias] = agent.model.split(':');
        const apiConfig = apiConfigs.find(c => c.id === apiConfigId);
        if (!apiConfig) { alert(`错误：找不到角色 "${agent.name}" 所需的 API 配置。`); return; }

        const modelName = new Map((apiConfig.models || '').split(',').map(m => m.split(':').map(s => s.trim()))).get(modelAlias);
        if (!modelName) { alert(`错误：在 API 配置 "${apiConfig.name}" 中找不到别名 "${modelAlias}"。`); return; }

        llmConfig = { provider: apiConfig.provider, apiPath: apiConfig.apiUrl || getDefaultApiPath(apiConfig.provider), apiKey: apiConfig.apiKey, model: modelName, systemPrompt: agent.systemPrompt };
    } else {
        const apiConfig = apiConfigs[0];
        if (!apiConfig) { alert("错误：没有找到可用的 API 配置。"); return; }
        const modelName = (new Map((apiConfig.models || '').split(',').map(m => m.split(':').map(s => s.trim()))).values().next() || {}).value;
        llmConfig = { provider: apiConfig.provider, apiPath: apiConfig.apiUrl || getDefaultApiPath(apiConfig.provider), apiKey: apiConfig.apiKey, model: modelName, systemPrompt: "" };
    }

    setState({ isAiThinking: true });
    // [ALIGNMENT] 传递 attachments 参数
    await agent_addHistoryMessage(currentTopicId, 'user', content, attachments);
    await renderHistoryPanel();

    // [ALIGNMENT] 传递空数组作为 AI 消息的 attachments
    const aiMessage = await agent_addHistoryMessage(currentTopicId, 'assistant', '', [], 'streaming');
    await renderHistoryPanel();

    let accumulatedContent = "",
        accumulatedReasoning = "";
    const historyForAI = appState.history.filter(h => h.topicId === currentTopicId && h.status === 'completed');
    
    // [ALIGNMENT] 修正了 `sendHistory: false` 时的逻辑，从 slice(-2) 改为 slice(-1)
    const messagesToSendToAI = (agent && agent.sendHistory === false) ? historyForAI.slice(-1) : historyForAI;

    await llmService.streamChat(llmConfig, messagesToSendToAI, {
        onChunk: ({ type, text }) => {
            if (type === 'content') accumulatedContent += text;
            else if (type === 'thinking') accumulatedReasoning += text;
            updateStreamingChunkInDOM(aiMessage.id, type, text);
        },
        onDone: async () => {
            const finalHistory = appState.history.map(msg => msg.id === aiMessage.id ? { ...msg, content: accumulatedContent, reasoning: accumulatedReasoning, status: 'completed' } : msg);
            setState({ history: finalHistory, isAiThinking: false });
            await finalizeStreamingUI(aiMessage.id);
            await persistAgentState();
        },
        onError: async (error) => {
            const errorText = `\n\n**错误:** ${error.message}`;
            accumulatedContent += errorText;
            const finalHistory = appState.history.map(msg => msg.id === aiMessage.id ? { ...msg, content: accumulatedContent, status: 'error' } : msg);
            setState({ history: finalHistory, isAiThinking: false });
            await finalizeStreamingUI(aiMessage.id);
            await persistAgentState();
        }
    });
}

export function agent_selectAgent(agentId) {
    const firstTopic = appState.topics.find(t => t.agentId === agentId);
    setState({
        currentAgentId: agentId,
        currentTopicId: firstTopic?.id || null
    });
}

export function agent_selectTopic(topicId) {
    const lastMessage = appState.history.filter(h => h.topicId === topicId).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];
    setState({
        currentTopicId: topicId,
        currentConversationAgentId: lastMessage?.agentId || appState.agents[0]?.id || null
    });
}

export function agent_getFilteredTopics() {
    const { topicListFilterTag, topics, history, agents } = appState;
    if (topicListFilterTag === 'all') {
        return topics;
    }

    const agentMap = new Map(agents.map(agent => [agent.id, agent]));
    return topics.filter(topic => {
        const lastMsg = history.filter(h => h.topicId === topic.id).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];
        const agent = lastMsg ? agentMap.get(lastMsg.agentId) : null;
        return agent?.tags?.includes(topicListFilterTag);
    });
}
