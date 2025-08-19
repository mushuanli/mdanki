// src/agent/agent_ui.js

import * as dom from './agent_dom.js';
import { appState, setState } from '../common/state.js';
import { escapeHTML } from '../common/utils.js';
import * as dataService from '../services/dataService.js';
import { renderRichContent } from '../common/renderingService.js';

function createTopicItem(topic) {
    const isActive = topic.id === appState.currentTopicId;
    const item = document.createElement('li');
    item.className = `topic-item ${isActive ? 'active' : ''}`;
    item.dataset.topicId = topic.id;

    // [新增] 悬浮提示功能
    const lastMessage = appState.history
        .filter(h => h.topicId === topic.id)
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];
    
    let tooltip = `最后会话: 无`;
    if (lastMessage) {
        const lastAgent = dataService.getAgentById(lastMessage.agentId);
        const agentName = lastAgent ? lastAgent.name : '默认 AI';
        const time = new Date(lastMessage.timestamp).toLocaleString();
        tooltip = `角色: ${agentName}\n时间: ${time}`;
    }
    item.title = tooltip;
    const isSelected = appState.selectedTopicIds.includes(topic.id);

    // [修改] 增加复选框和删除按钮的逻辑
    const checkboxHTML = appState.isTopicSelectionMode
        ? `<input type="checkbox" class="topic-selection-checkbox" data-topic-id="${topic.id}" ${isSelected ? 'checked' : ''}>`
        : '';

    item.innerHTML = `
        ${checkboxHTML}
        <div class="topic-item-content">
            <div class="topic-icon"><i class="${escapeHTML(topic.icon)}"></i></div>
            <span>${escapeHTML(topic.title)}</span>
        </div>
        <button class="topic-delete-btn" title="删除此主题"><i class="fas fa-trash-alt"></i></button>
    `;
    return item;
}

/**
 * [修改] 这是一个新的辅助函数，用于将消息体渲染到指定的容器中。
 * @param {HTMLElement} container - 要填充内容的DOM元素。
 * @param {object} message - 消息对象。
 */
async function _renderMessageBody(container, message) {
    let markdownText = message.content || '';
    
    // 如果是AI助手且有思考过程，则将其与内容合并
    if (message.role === 'assistant' && message.reasoning && message.reasoning.trim()) {
        const thinkingBlock = `<details class="thinking-block"><summary>AI 思考过程</summary><pre><code>${escapeHTML(message.reasoning)}</code></pre></details>`;
        markdownText = thinkingBlock + markdownText;
    }

    await renderRichContent(container, markdownText);
}

/**
 * [修改] createHistoryItem 现在是 async 函数，因为它需要等待内容渲染。
 */
async function createHistoryItem(message) {
    const item = document.createElement('div');
    item.className = `history-item role-${message.role}`;
    item.dataset.messageId = message.id;

    // 1. 创建基本的 DOM 骨架，内容区域为空
    item.innerHTML = `
        <div class="history-item-header">
            <span class="role ${message.role}">${message.role === 'user' ? '用户' : 'AI助手'}</span>
            <span>${new Date(message.timestamp).toLocaleString()}</span>
        </div>
        <div class="history-item-content"></div>
        <div class="history-item-actions">
            <button class="history-action-btn regenerate-btn" title="重新生成"><i class="fas fa-redo"></i> 重新生成</button>
            <button class="history-action-btn edit-btn" title="编辑"><i class="fas fa-edit"></i> 编辑</button>
            <button class="history-action-btn delete-btn" title="删除"><i class="fas fa-trash"></i> 删除</button>
        </div>
    `;
    
    // 2. 填充内容
    const contentContainer = item.querySelector('.history-item-content');
    await _renderMessageBody(contentContainer, message);

    // 3. 调整按钮可见性
    const actionsContainer = item.querySelector('.history-item-actions');

    if (message.role === 'user') {
        actionsContainer.querySelector('.regenerate-btn').style.display = 'none';
    } else {
        actionsContainer.querySelector('.edit-btn').style.display = 'none';
    }
    
    return item;
}

export function renderAgentView() {
    // [新增] 根据状态设置初始显示
    const topicsPanel = document.querySelector('.topics-panel');
    const toggleBtn = document.getElementById('toggleTopicsBtn');

    if (appState.isTopicsPanelHidden) {
        topicsPanel.classList.add('collapsed');
        if(toggleBtn) toggleBtn.title = "显示主题栏";
    } else {
        topicsPanel.classList.remove('collapsed');
        if(toggleBtn) toggleBtn.title = "隐藏主题栏";
    }

    renderTopicFilters();
    renderTopicList();
    renderHistoryPanel(); // 异步调用
}

/**
 * [新增] 渲染主题列表的标签筛选器
 */
function renderTopicFilters() {
    const filterEl = dom.$id('topic-tag-filter');
    if (!filterEl) return;

    // 1. 从所有Agent中收集独一无二的标签
    const allTags = [...new Set(appState.agents.flatMap(agent => agent.tags || []))];
    
    const currentFilter = appState.topicListFilterTag;
    
    // 2. 填充下拉框
    filterEl.innerHTML = '<option value="all">所有主题</option>';
    allTags.forEach(tag => {
        const option = document.createElement('option');
        option.value = tag;
        option.textContent = tag;
        filterEl.appendChild(option);
    });
    
    // 3. 设置当前选中的值
    filterEl.value = currentFilter;
}

function renderHistoryHeader() {
    const titleEl = document.getElementById('historyHeaderTitle');
    const topicId = appState.currentTopicId;

    if (topicId) {
        const currentTopic = appState.topics.find(t => t.id === topicId);
        if (currentTopic) {
            titleEl.textContent = `${escapeHTML(currentTopic.title)} - 对话记录`;
        } else {
            // 如果找不到主题（边缘情况），显示通用标题
            titleEl.textContent = '对话记录';
        }
    } else {
        titleEl.textContent = '选择一个主题开始';
    }

    // [新增] 渲染对话角色选择器
    const selector = dom.$id('conversationRoleSelector');
    selector.innerHTML = `<option value="">默认 AI (无角色)</option>`;
    appState.agents.forEach(agent => { // [重构]
        const option = document.createElement('option');
        option.value = agent.id;
        option.textContent = agent.name;
        selector.appendChild(option);
    });
    selector.value = appState.currentConversationAgentId || ""; // [重构]
}

export function renderTopicList() {
    dom.agentTopicList.innerHTML = '';

    const selectedTag = appState.topicListFilterTag;
    let filteredTopics = appState.topics;

    // 如果设置了筛选标签 (不是 'all')
    if (selectedTag !== 'all') {
        const agentMap = new Map(appState.agents.map(agent => [agent.id, agent]));

        filteredTopics = appState.topics.filter(topic => {
            // a. 找到该主题的最后一条消息
            const lastMessage = appState.history
                .filter(h => h.topicId === topic.id)
                .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];

            if (!lastMessage || !lastMessage.agentId) return false;
            
            // b. 找到对应的Agent
            const agent = agentMap.get(lastMessage.agentId);
            if (!agent || !agent.tags) return false;
            
            // c. 检查标签是否匹配
            return agent.tags.includes(selectedTag);
        });
    }

    // 渲染过滤后的主题列表
    filteredTopics.forEach(topic => {
        dom.agentTopicList.appendChild(createTopicItem(topic));
    });

    // 控制重命名按钮的显示
    const editTopicBtn = dom.$id('editTopicBtn');
    if (appState.currentTopicId && filteredTopics.some(t => t.id === appState.currentTopicId)) {
        editTopicBtn.style.display = 'block';
    } else {
        editTopicBtn.style.display = 'none';
    }

    // [新增] 批量操作栏的UI更新
    const batchActions = document.querySelector('.topics-batch-actions');
    const manageBtn = document.getElementById('manageTopicsBtn');
    if (appState.isTopicSelectionMode) {
        batchActions.style.display = 'flex';
        manageBtn.classList.add('active'); // Add active state for visual feedback
        const deleteBtn = document.getElementById('deleteSelectedTopicsBtn');
        const count = appState.selectedTopicIds.length;
        deleteBtn.textContent = `删除选中 (${count})`;
        deleteBtn.disabled = count === 0;

        // --- [核心修改开始] ---
        // 动态更新“全选/全不选”按钮的文本
        const selectAllBtn = document.getElementById('selectAllTopicsBtn');
        const totalTopics = appState.topics.length;
        if (totalTopics > 0 && count === totalTopics) {
            selectAllBtn.textContent = '全不选';
        } else {
            selectAllBtn.textContent = '全选';
        }
        // --- [核心修改结束] ---

    } else {
        batchActions.style.display = 'none';
        manageBtn.classList.remove('active');
    }
    
    // Add "Add Topic" button
    const addTopicBtn = document.createElement('li');
    addTopicBtn.className = 'topic-item add-topic-btn';
    // [修改] 简化 innerHTML，因为样式由 CSS 控制
    addTopicBtn.innerHTML = `
        <div class="topic-item-content">
            <div class="topic-icon"><i class="fas fa-plus"></i></div>
            <span>添加新主题</span>
        </div>
    `;
    dom.agentTopicList.appendChild(addTopicBtn);
}

/**
 * [新增] 创建一个 Agent 提示/欢迎语的 HTML 面板。
 * @param {object} agent - 包含提示信息的 Agent 对象。
 * @returns {string} - 返回 HTML 字符串。
 */
function createHintPanel(agent) {
    // 默认的欢迎图标
    const iconHTML = `<i class="fas fa-lightbulb" style="margin-right: 8px;"></i>`;

    return `
        <div class="hint-panel">
            <div class="hint-panel-header">
                <div class="hint-panel-avatar">${escapeHTML(agent.avatar)}</div>
                <div class="hint-panel-title">${escapeHTML(agent.name)} 为您服务</div>
            </div>
            <div class="hint-panel-content">
                ${iconHTML}
                ${agent.hint}
            </div>
        </div>
    `;
}

export async function renderHistoryPanel() {
    renderHistoryHeader();

    dom.agentHistoryContent.innerHTML = '';
    if (!appState.currentTopicId) {
        dom.agentHistoryContent.innerHTML = `<div class="no-history"><i class="fas fa-comments"></i><p>请选择或创建一个主题来开始聊天</p></div>`;
        // Hide chat input if no topic is selected
        if(dom.chatInputArea) dom.chatInputArea.style.display = 'none';
        return;
    }

    // Show chat input if a topic is selected
    if(dom.chatInputArea) dom.chatInputArea.style.display = 'flex';

    const currentHistory = appState.history
        .filter(h => h.topicId === appState.currentTopicId)
        .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    if (currentHistory.length === 0) {
        // 如果没有历史记录，尝试显示 Agent 的 hint
        const agent = dataService.getAgentById(appState.currentConversationAgentId);

        if (agent && agent.hint) {
            // 如果当前 Agent 有 hint，则显示提示面板
            dom.agentHistoryContent.innerHTML = createHintPanel(agent);
        } else {
            // 否则，显示默认的空状态消息
            dom.agentHistoryContent.innerHTML = `<div class="no-history"><i class="fas fa-comment-dots"></i><p>这个主题还没有对话记录，开始提问吧！</p></div>`;
        }
        return; // 显示完提示或空状态后，直接返回
    }

    // [修改] 使用 Promise.all 来并行创建所有历史项
    const itemPromises = currentHistory.map(message => {
        // 如果是正在流式传输的消息，只创建骨架
        if (message.status === 'streaming') {
            // 对于正在流式传输的消息，我们只创建骨架
            const item = document.createElement('div');
            item.className = 'history-item role-assistant';
            item.dataset.messageId = message.id;
            item.innerHTML = `
                <div class="history-item-header">
                    <span class="role assistant">AI助手</span>
                    <span>${new Date(message.timestamp).toLocaleString()}</span>
                </div>
                <div class="history-item-content">
                    <div class="streaming-content-container"><p><i class="fas fa-spinner fa-pulse"></i></p></div>
                </div>
            `;
            return Promise.resolve(item);
        } else {
            return createHistoryItem(message);
        }
    });

    const renderedItems = await Promise.all(itemPromises);
    renderedItems.forEach(item => dom.agentHistoryContent.appendChild(item));

    dom.agentHistoryContent.scrollTop = dom.agentHistoryContent.scrollHeight;
    
    updateTurnElements();
}

export function renderAttachmentPreviews(attachments) {
    dom.attachmentPreviewContainer.innerHTML = '';
    attachments.forEach((file, index) => {
        const item = document.createElement('div');
        item.className = 'attachment-preview-item';
        item.innerHTML = `
            <span><i class="fas fa-file-image"></i> ${escapeHTML(file.name)}</span>
            <button class="remove-attachment-btn" data-index="${index}">×</button>
        `;
        dom.attachmentPreviewContainer.appendChild(item);
    });
}
// --- NEW: Streaming and Navigation UI updates ---

// 将 updateStreamingMessageInDOM 重命名并重构
// 现在它叫做 updateStreamingChunkInDOM，因为它只负责一小块的更新
export function updateStreamingChunkInDOM(messageId, type, textChunk) {
    const messageEl = document.querySelector(`.history-item[data-message-id="${messageId}"]`);
    if (!messageEl) return;
    
    const contentContainer = messageEl.querySelector('.history-item-content');
    if (!contentContainer) return;

    let targetContainer;
    if (type === 'thinking') {
        // 只有在接收到思考过程时才创建 <details> 元素
        let detailsEl = contentContainer.querySelector('.thinking-block');
        if (!detailsEl) {
            detailsEl = document.createElement('details');
            detailsEl.className = 'thinking-block';
            detailsEl.open = true;
            detailsEl.innerHTML = `<summary>AI 思考过程</summary><pre><code class="language-text streaming-reasoning-container"></code></pre>`;
            // 将其插入到内容容器的最前面
            contentContainer.prepend(detailsEl);
        }
        targetContainer = detailsEl.querySelector('.streaming-reasoning-container');
    } else if (type === 'content') {
        targetContainer = contentContainer.querySelector('.streaming-content-container');
        if (!targetContainer) { // 如果容器不存在，则创建
            targetContainer = document.createElement('div');
            targetContainer.className = 'streaming-content-container';
            contentContainer.appendChild(targetContainer);
        }
        const spinner = targetContainer.querySelector('.fa-spinner');
        if (spinner) {
            targetContainer.innerHTML = '';
        }
    }

    if (targetContainer) {
        // 使用 innerText 追加，浏览器会自动处理转义，更安全
        targetContainer.innerText += textChunk;
        // 保持滚动到底部
        dom.agentHistoryContent.scrollTop = dom.agentHistoryContent.scrollHeight;
    }
}

/**
 * [修改] 实现了“完成时重绘”的逻辑
 */
export async function finalizeStreamingUI(messageId) {
    const messageEl = document.querySelector(`.history-item[data-message-id="${messageId}"]`);
    if (!messageEl) return;

    const messageData = appState.history.find(msg => msg.id === messageId);
    if (!messageData) return;

    // 1. 重绘内容区域
    const contentContainer = messageEl.querySelector('.history-item-content');
    if(contentContainer) {
        await _renderMessageBody(contentContainer, messageData);
    }

    // 显示操作按钮
    const actionsContainer = messageEl.querySelector('.history-item-actions');
    if (actionsContainer) {
        actionsContainer.style.display = 'flex';
    } else { // 如果不存在，则创建并附加
        const newActions = document.createElement('div');
        newActions.className = 'history-item-actions';
        newActions.innerHTML = `
            <button class="history-action-btn regenerate-btn" title="重新生成"><i class="fas fa-redo"></i> 重新生成</button>
            <button class="history-action-btn edit-btn" title="编辑" style="display: none;"><i class="fas fa-edit"></i> 编辑</button>
            <button class="history-action-btn delete-btn" title="删除"><i class="fas fa-trash"></i> 删除</button>
        `;
        messageEl.appendChild(newActions);
    }
}

export function updateTurnElements() {
    const upBtn = document.getElementById('chatNavUp');
    const downBtn = document.getElementById('chatNavDown');
    const hasTurns = dom.agentHistoryContent.querySelector('.history-item .role-user');
    
    if (upBtn && downBtn) {
        upBtn.disabled = !hasTurns;
        downBtn.disabled = !hasTurns;
    }
}
