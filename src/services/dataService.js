// src/services/dataService.js

import { appState, setState } from '../common/state.js';
import * as storage from './storageService.js';
import { db } from '../common/db.js'; // 引入db实例以进行更直接的操作
import { generateId } from '../common/utils.js';
import { INITIAL_CONTENT } from '../common/config.js';

// 模块化导入
import * as llmService from './llm/llmService.js';
import { getDefaultApiPath } from './llm/llmProviders.js';

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

/**
 * [保留] 保存当前 Anki 会话的内容。
 * 仍然被 `autoSave` 使用。
 */
export async function anki_saveCurrentSessionContent(newContent) {
    const session = appState.sessions.find(s => s.id === appState.currentSessionId) || null;
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


// --- [移除] ---
// 以下函数 (anki_addFile, anki_addFolder, anki_removeItems, anki_moveItems, 
// anki_updateItemName, anki_getCurrentSession, anki_selectSession 等导航函数,
// anki_getOrCreateClozeState, anki_updateClozeState, anki_recordReview 等)
// 的功能已被新的 `src/anki/ankiApp.js` 及其 `store` 和 `services` 完全接管，
// 不再从全局 `dataService` 调用。因此予以移除。


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

    // 1. 构建数据对象
    const agentData = { 
        ...seedResult, 
        topics: topics || [], 
        history: history || [] 
    };
    
    // 2. [重要] 如果添加了新数据，立即持久化
    //    注意：我们需要修改 persistAgentState 来接受数据，而不是依赖全局 appState
    if (seedResult.needsPersistence) {
        await storage.saveAgentData(agentData);
    }
    
    // 3. [重要] 返回构建好的数据对象，而不是调用 setState
    return agentData;
}

/**
 * [重构] 持久化所有设置相关的配置数据。
 * [修改] 接受一个 state 对象作为参数，以消除对全局 appState 的依赖。
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

// --- 新增/重构的数据库交互辅助函数 ---

export async function agent_addTopic(title, agentId) {
    if (!title || !agentId) {
        console.error("需要标题和agentId才能创建新主题。");
        return null;
    }
    const newTopic = {
        id: generateId(),
        agentId: agentId,
        title: title,
        icon: 'fas fa-comment',
        createdAt: new Date().toISOString()
    };
    await db.agent_topics.put(newTopic);
    return newTopic;
}

export async function agent_updateTopic(topicId, updates) {
    const topic = await db.agent_topics.get(topicId);
    if (!topic) return null;
    const updatedTopic = { ...topic, ...updates };
    await db.agent_topics.put(updatedTopic);
    return updatedTopic;
}

export async function agent_deleteTopics(topicIds) {
    await db.transaction('rw', [db.agent_topics, db.agent_history], async () => {
        await db.agent_topics.bulkDelete(topicIds);
        const historyToDelete = await db.agent_history.where('topicId').anyOf(topicIds).keys();
        await db.agent_history.bulkDelete(historyToDelete);
    });
    const remainingTopics = await db.agent_topics.toArray();
    const remainingHistory = await db.agent_history.toArray();
    return { remainingTopics, remainingHistory };
}

export async function agent_addHistoryMessage(topicId, role, content, attachments = [], status = 'completed', agentId = null, reasoning = null) {
    const newMessage = {
        id: generateId(), topicId, role, content, attachments, status, reasoning,
        agentId: role === 'assistant' ? agentId : null,
        timestamp: new Date().toISOString(),
    };
    await db.agent_history.put(newMessage);
    return newMessage;
}

export async function agent_updateHistoryMessage(message) {
    return await db.agent_history.put(message);
}

export async function agent_deleteHistoryMessages(messageIds) {
    return await db.agent_history.bulkDelete(messageIds);
}


// --- 新增/重构的纯数据处理辅助函数 ---

/**
 * 根据传入的 state 过滤主题列表
 * @param {object} state - 当前 AgentStore 的状态
 * @returns {Array<object>} 过滤后的主题列表
 */
export function agent_getFilteredTopics(state) {
    const { topicListFilterTag, topics, history, agents } = state;
    if (!topics) return [];

    if (topicListFilterTag === 'all') {
        return topics.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
    }

    const agentMap = new Map(agents.map(agent => [agent.id, agent]));
    return topics.filter(topic => {
        const lastMsg = history
            .filter(h => h.topicId === topic.id)
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];
        
        if (!lastMsg) return false;
        
        const agent = agentMap.get(lastMsg.agentId);
        return agent?.tags?.includes(topicListFilterTag);
    }).sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
}

/**
 * 根据 Topic ID 获取其详细信息
 * @param {string} topicId 
 * @param {object} state - 当前 AgentStore 的状态
 * @returns {object} { topic, lastConversationAgentId }
 */
export function agent_getTopicDetails(topicId, state) {
    const { topics, history, agents } = state;
    const topic = topics.find(t => t.id === topicId);
    
    // 如果找不到 topic，直接返回
    if (!topic) {
        return { topic: null, lastConversationAgentId: null };
    }

    // 优先级 1: 读取用户上次在该主题中明确选择的角色
    if (topic.lastUsedAgentId) {
        // 验证这个ID是否仍然有效，防止agent被删除
        if (agents.some(a => a.id === topic.lastUsedAgentId)) {
            return { topic, lastConversationAgentId: topic.lastUsedAgentId };
        }
    }

    // 优先级 2: 从最后一条AI消息中推断
    const lastMessage = history
        .filter(h => h.topicId === topicId && h.role === 'assistant' && h.agentId) // 优先找AI助手的消息
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];

    if (lastMessage && lastMessage.agentId) {
        return { topic, lastConversationAgentId: lastMessage.agentId };
    }

    // 2. 如果没有历史消息，或者历史消息没有 agentId，回退到 topic 对象自带的 agentId
    //    这个 agentId 是在主题创建时关联的。
    if (topic.agentId) {
        return { topic, lastConversationAgentId: topic.agentId };
    }
    
    // 3. 如果以上都没有（异常情况），作为最后的兜底策略，返回当前列表中的第一个 agent
    //    或者返回 null 以表示使用“默认AI”
    const fallbackAgentId = agents.length > 0 ? agents[0].id : null;

    return { topic, lastConversationAgentId: fallbackAgentId };
}

/**
 * 根据当前选择构建 LLM 服务所需的配置
 * @param {string} agentId 
 * @param {Array} agents 
 * @param {Array} apiConfigs 
 * @returns {object} llmConfig 或包含 error 的对象
 */
export function agent_getLlmConfig(agentId, agents, apiConfigs) {
    const agent = agents.find(p => p.id === agentId);

    if (agent) {
        const [apiConfigId, modelAlias] = agent.model.split(':');
        const apiConfig = apiConfigs.find(c => c.id === apiConfigId);
        if (!apiConfig) return { error: `错误：找不到角色 "${agent.name}" 所需的 API 配置。` };

        const modelName = new Map((apiConfig.models || '').split(',').map(m => m.split(':').map(s => s.trim()))).get(modelAlias);
        if (!modelName) return { error: `错误：在 API 配置 "${api.name}" 中找不到别名 "${modelAlias}"。` };

        return { provider: apiConfig.provider, apiPath: apiConfig.apiUrl || getDefaultApiPath(apiConfig.provider), apiKey: `Bearer ${apiConfig.apiKey}`, model: modelName, systemPrompt: agent.systemPrompt };
    } else {
        const apiConfig = apiConfigs[0];
        if (!apiConfig) return { error: "错误：没有找到可用的 API 配置。" };
        const modelName = (new Map((apiConfig.models || '').split(',').map(m => m.split(':').map(s => s.trim()))).values().next() || {}).value;
        if (!modelName) return { error: `错误：在 API 配置 "${apiConfig.name}" 中找不到任何模型。` };

        return { provider: apiConfig.provider, apiPath: apiConfig.apiUrl || getDefaultApiPath(apiConfig.provider), apiKey: `Bearer ${apiConfig.apiKey}`, model: modelName, systemPrompt: "" };
    }
}