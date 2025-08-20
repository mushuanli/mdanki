// src/agent/agent_ui.js

import { appState, setState } from '../common/state.js';
import { escapeHTML } from '../common/utils.js';
import * as dataService from '../services/dataService.js';
import { renderRichContent } from '../common/renderingService.js';

// [新增] 创建一个模块级变量来存储 DOM 引用
let dom;

/**
 * [新增] 初始化函数，用于从外部接收 DOM 引用
 * @param {object} domInstance - DomElements 类的实例
 */
export function initAgentUI(domInstance) {
    dom = domInstance;
}

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
        const lastAgent = dataService.agent_getAgentById(lastMessage.agentId);
        const agentName = lastAgent ? lastAgent.name : '默认 AI';
        tooltip = `角色: ${agentName}\n时间: ${new Date(lastMessage.timestamp).toLocaleString()}`;
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
    
    await _renderMessageBody(item.querySelector('.history-item-content'), message);

    // 3. 调整按钮可见性
    const actionsContainer = item.querySelector('.history-item-actions');

    if (message.role === 'user') {
        actionsContainer.querySelector('.regenerate-btn').style.display = 'none';
    } else {
        actionsContainer.querySelector('.edit-btn').style.display = 'none';
    }
    
    return item;
}

function createHintPanel(agent) {
    return `
        <div class="hint-panel">
            <div class="hint-panel-header">
                <div class="hint-panel-avatar">${escapeHTML(agent.avatar)}</div>
                <div class="hint-panel-title">${escapeHTML(agent.name)} 为您服务</div>
            </div>
            <div class="hint-panel-content">
                <i class="fas fa-lightbulb"></i>
                ${agent.hint}
            </div>
        </div>
    `;
}

/**
 * [新增] 渲染主题列表的标签筛选器
 */
function renderTopicFilters() {
    if (!dom.topicTagFilter) return;
    const allTags = [...new Set(appState.agents.flatMap(agent => agent.tags || []))];
    dom.topicTagFilter.innerHTML = '<option value="all">所有主题</option>';
    allTags.forEach(tag => {
        const option = document.createElement('option');
        option.value = tag;
        option.textContent = tag;
        dom.topicTagFilter.appendChild(option);
    });
    dom.topicTagFilter.value = appState.topicListFilterTag;
}

function renderHistoryHeader() {
    if (appState.currentTopicId) {
        const topic = appState.topics.find(t => t.id === appState.currentTopicId);
        dom.historyHeaderTitle.textContent = topic ? `${escapeHTML(topic.title)} - 对话记录` : '对话记录';
    } else {
        dom.historyHeaderTitle.textContent = '选择一个主题开始';
    }

    dom.conversationRoleSelector.innerHTML = `<option value="">默认 AI (无角色)</option>`;
    appState.agents.forEach(agent => {
        const option = document.createElement('option');
        option.value = agent.id;
        option.textContent = agent.name;
        dom.conversationRoleSelector.appendChild(option);
    });
    dom.conversationRoleSelector.value = appState.currentConversationAgentId || "";
}

export function renderTopicList() {
    dom.topicList.innerHTML = '';
    const filteredTopics = dataService.agent_getFilteredTopics();
    filteredTopics.forEach(topic => dom.topicList.appendChild(createTopicItem(topic)));

    dom.editTopicBtn.style.display = appState.currentTopicId ? 'block' : 'none';

    if (appState.isTopicSelectionMode) {
        dom.topicsBatchActions.style.display = 'flex';
        dom.manageTopicsBtn.classList.add('active');
        const count = appState.selectedTopicIds.length;
        dom.deleteSelectedTopicsBtn.textContent = `删除选中 (${count})`;
        dom.deleteSelectedTopicsBtn.disabled = count === 0;
        dom.selectAllTopicsBtn.textContent = (appState.topics.length > 0 && count === appState.topics.length) ? '全不选' : '全选';
    } else {
        dom.topicsBatchActions.style.display = 'none';
        dom.manageTopicsBtn.classList.remove('active');
    }
    
    const addTopicBtn = document.createElement('li');
    addTopicBtn.className = 'topic-item add-topic-btn';
    addTopicBtn.innerHTML = `<div class="topic-item-content"><div class="topic-icon"><i class="fas fa-plus"></i></div><span>添加新主题</span></div>`;
    dom.topicList.appendChild(addTopicBtn);
}

export async function renderHistoryPanel() {
    renderHistoryHeader();
    dom.historyContent.innerHTML = '';
    
    if (!appState.currentTopicId) {
        dom.historyContent.innerHTML = `<div class="no-history"><p>请选择或创建一个主题来开始聊天</p></div>`;
        dom.chatInputArea.style.display = 'none';
        updateTurnElements(); // [调用] 确保在无主题时也更新按钮状态
        return;
    }

    dom.chatInputArea.style.display = 'flex';
    const currentHistory = appState.history
        .filter(h => h.topicId === appState.currentTopicId)
        .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    if (currentHistory.length === 0) {
        const agent = dataService.agent_getAgentById(appState.currentConversationAgentId);
        if (agent && agent.hint) {
            dom.historyContent.innerHTML = createHintPanel(agent);
        } else {
            dom.historyContent.innerHTML = `<div class="no-history"><p>这个主题还没有对话记录。</p></div>`;
        }
        updateTurnElements(); // [调用] 确保在无历史时也更新按钮状态
        return;
    }

    const itemPromises = currentHistory.map(message => {
        if (message.status === 'streaming') {
            const item = document.createElement('div');
            item.className = 'history-item role-assistant';
            item.dataset.messageId = message.id;
            item.innerHTML = `
                <div class="history-item-header"><span>AI助手</span><span>${new Date(message.timestamp).toLocaleString()}</span></div>
                <div class="history-item-content"><div class="streaming-content-container"><p><i class="fas fa-spinner fa-pulse"></i></p></div></div>`;
            return Promise.resolve(item);
        }
        return createHistoryItem(message);
    });

    const renderedItems = await Promise.all(itemPromises);
    renderedItems.forEach(item => dom.historyContent.appendChild(item));
    
    // [恢复] 恢复滚动位置，如果不存在则滚动到底部
    const savedScrollTop = appState.topicScrollPositions?.[appState.currentTopicId];
    if (savedScrollTop !== undefined) {
        dom.historyContent.scrollTop = savedScrollTop;
    } else {
        dom.historyContent.scrollTop = dom.historyContent.scrollHeight;
    }
    
    updateTurnElements(); // [调用] 渲染完历史记录后，更新导航按钮状态
}

export function renderAttachmentPreviews(attachments) {
    dom.attachmentPreviewContainer.innerHTML = '';
    attachments.forEach((file, index) => {
        const item = document.createElement('div');
        item.className = 'attachment-preview-item';
        item.innerHTML = `<span><i class="fas fa-file-image"></i> ${escapeHTML(file.name)}</span><button class="remove-attachment-btn" data-index="${index}">×</button>`;
        dom.attachmentPreviewContainer.appendChild(item);
    });
}
// --- NEW: Streaming and Navigation UI updates ---

// 将 updateStreamingMessageInDOM 重命名并重构
// 现在它叫做 updateStreamingChunkInDOM，因为它只负责一小块的更新
export function updateStreamingChunkInDOM(messageId, type, textChunk) {
    const messageEl = dom.historyContent.querySelector(`.history-item[data-message-id="${messageId}"]`);
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
            detailsEl.innerHTML = `<summary>AI 思考过程</summary><pre><code class="streaming-reasoning-container"></code></pre>`;
            contentContainer.prepend(detailsEl);
        }
        targetContainer = detailsEl.querySelector('.streaming-reasoning-container');
    } else {
        targetContainer = contentContainer.querySelector('.streaming-content-container');
        if (!targetContainer) {
            targetContainer = document.createElement('div');
            targetContainer.className = 'streaming-content-container';
            contentContainer.appendChild(targetContainer);
            targetContainer.innerHTML = ''; // 清除 spinner
        }
    }

    if (targetContainer) {
        targetContainer.innerText += textChunk;
        dom.historyContent.scrollTop = dom.historyContent.scrollHeight;
    }
}

/**
 * [修改] 实现了“完成时重绘”的逻辑
 */
export async function finalizeStreamingUI(messageId) {
    const messageEl = dom.historyContent.querySelector(`.history-item[data-message-id="${messageId}"]`);
    if (!messageEl) return;

    const messageData = appState.history.find(msg => msg.id === messageId);
    if (!messageData) return;

    await _renderMessageBody(messageEl.querySelector('.history-item-content'), messageData);

    let actionsContainer = messageEl.querySelector('.history-item-actions');
    if (!actionsContainer) {
        actionsContainer = document.createElement('div');
        actionsContainer.className = 'history-item-actions';
        actionsContainer.innerHTML = `
            <button class="history-action-btn regenerate-btn"><i class="fas fa-redo"></i> 重新生成</button>
            <button class="history-action-btn edit-btn" style="display: none;"><i class="fas fa-edit"></i></button>
            <button class="history-action-btn delete-btn"><i class="fas fa-trash"></i></button>`;
        messageEl.appendChild(actionsContainer);
    }
    actionsContainer.style.display = 'flex';
}

export function renderAgentView() {
    dom.topicsPanel.classList.toggle('collapsed', appState.isTopicsPanelHidden);
    dom.toggleTopicsBtn.title = appState.isTopicsPanelHidden ? "显示主题栏" : "隐藏主题栏";
    renderTopicFilters();
    renderTopicList();
    renderHistoryPanel(); // async
}

/**
 * [恢复] 更新对话导航按钮的禁用状态
 */
export function updateTurnElements() {
    // 检查DOM元素是否存在，以增加代码健壮性
    if (!dom.chatNavUp || !dom.chatNavDown || !dom.historyContent) return;
    
    const hasTurns = dom.historyContent.querySelector('.history-item.role-user');
    
    dom.chatNavUp.disabled = !hasTurns;
    dom.chatNavDown.disabled = !hasTurns;
}