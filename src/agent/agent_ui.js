// src/agent/agent_ui.js

import * as dom from './agent_dom.js';
import { appState } from '../common/state.js';
import { escapeHTML } from '../common/utils.js';
import * as dataService from '../services/dataService.js';

function createAgentItem(agent) {
    const isActive = agent.id === appState.currentAgentId;
    const item = document.createElement('div');
    item.className = `agent-item ${isActive ? 'active' : ''}`;
    item.dataset.agentId = agent.id;
    item.innerHTML = `
        <div class="agent-avatar">${escapeHTML(agent.avatar)}</div>
        <span>${escapeHTML(agent.displayName)}</span>
    `;
    return item;
}

function createTopicItem(topic) {
    const isActive = topic.id === appState.currentTopicId;
    const item = document.createElement('li');
    item.className = `topic-item ${isActive ? 'active' : ''}`;
    item.dataset.topicId = topic.id;
    item.innerHTML = `
        <div class="topic-icon"><i class="${escapeHTML(topic.icon)}"></i></div>
        <span>${escapeHTML(topic.title)}</span>
    `;
    return item;
}

function preprocessMarkdown(markdownText) {
    if (!markdownText) return '';
    
    // --- FIX START ---
    // 1. 先合并相邻的、可能由流式传输产生的多个 thinking 块
    const mergedText = markdownText.replace(/<\/thinking>\s*<thinking>/gi, ' ');

    // 2. 将 <thinking>...</thinking> 替换为 <details>
    const thinkingRegex = /<thinking>([\s\S]*?)<\/thinking>/gi;
    return mergedText.replace(thinkingRegex, 
        `<details class="thinking-block">
            <summary>AI 思考过程</summary>
            <pre><code class="language-text">$1</code></pre>
         </details>`);
}

// --- Create DOM Elements ---
function createHistoryItem(message) {
    const item = document.createElement('div');
    item.className = `history-item role-${message.role}`;
    item.dataset.messageId = message.id;

    // --- 核心修改 START ---

    let reasoningHTML = '';
    let contentHTML = '';

    if (message.role === 'assistant') {
        if (message.status === 'streaming') {
            // 正在流式传输时，创建两个容器用于实时更新
            // <details> 默认是 open 的，这样用户就能实时看到
            reasoningHTML = `
                <details class="thinking-block" open>
                    <summary>AI 思考过程</summary>
                    <pre><code class="language-text streaming-reasoning-container"></code></pre>
                </details>
            `;
            // 主内容区显示加载动画
            contentHTML = `<div class="streaming-content-container"><p><i class="fas fa-spinner fa-pulse"></i></p></div>`;
        } else {
            // 流式结束后，根据最终数据渲染
            if (message.reasoning && message.reasoning.trim()) {
                reasoningHTML = preprocessMarkdown(message.reasoning); // 使用我们之前的函数
            }
            contentHTML = marked.parse(message.content || '');
        }
    } else { // 用户消息
        contentHTML = marked.parse(message.content || '');
    }
    
    // --- 核心修改 END ---

    // 3. 处理图片 (未来功能)
    const imagesHTML = (message.images || []).map(src => 
        `<img src="${src}" alt="Uploaded image" class="history-image">`
    ).join('');

    // 使用模板字符串构建完整的innerHTML，确保所有部分都被包含
    item.innerHTML = `
        <div class="history-item-header">
            <span class="role ${message.role}">${message.role === 'user' ? '用户' : 'AI助手'}</span>
            <span>${new Date(message.timestamp).toLocaleString()}</span>
        </div>
        <div class="history-item-content">
            ${reasoningHTML}
            ${contentHTML}
            <div class="image-previews">${imagesHTML}</div>
        </div>
        <div class="history-item-actions">
            <button class="history-action-btn regenerate-btn" title="重新生成"><i class="fas fa-redo"></i> 重新生成</button>
            <button class="history-action-btn edit-btn" title="编辑"><i class="fas fa-edit"></i> 编辑</button>
            <button class="history-action-btn delete-btn" title="删除"><i class="fas fa-trash"></i> 删除</button>
        </div>
    `;

    // 根据消息角色，隐藏不适用的按钮
    const actionsContainer = item.querySelector('.history-item-actions');

    if (message.role === 'user') {
        actionsContainer.querySelector('.regenerate-btn').style.display = 'none';
    } else {
        actionsContainer.querySelector('.edit-btn').style.display = 'none';
    }

    // 如果消息仍在流式传输中，不应显示任何操作按钮
    if (message.status === 'streaming') {
        actionsContainer.style.display = 'none';
    }
    
    return item;
}

export function renderAgentView() {
    renderAgentList();
    renderTopicList();
    renderHistoryPanel();
}

export function renderAgentList() {
    dom.navAgentList.innerHTML = '';
    appState.agents.forEach(agent => {
        dom.navAgentList.appendChild(createAgentItem(agent));
    });
    // Add "Add Agent" button
    const addAgentBtn = document.createElement('div');
    addAgentBtn.className = 'agent-item add-agent-btn';
    addAgentBtn.innerHTML = `<div class="agent-avatar">+</div><span>添加Agent</span>`;
    dom.navAgentList.appendChild(addAgentBtn);
}

function renderHistoryHeader() {
    const titleEl = document.getElementById('historyHeaderTitle');
    const settingsBtn = document.getElementById('agentSettingsTriggerBtn');
    const currentAgent = dataService.getAgentById(appState.currentAgentId);

    if (currentAgent) {
        titleEl.textContent = `${currentAgent.displayName} - 对话记录`;
        settingsBtn.style.display = 'flex'; // 显示按钮
    } else {
        titleEl.textContent = '历史对话记录';
        settingsBtn.style.display = 'none'; // 隐藏按钮
    }
}

export function renderTopicList() {
    dom.agentTopicList.innerHTML = '';
    const currentTopics = appState.topics.filter(t => t.agentId === appState.currentAgentId);
    currentTopics.forEach(topic => {
        dom.agentTopicList.appendChild(createTopicItem(topic));
    });
    // Add "Add Topic" button
    const addTopicBtn = document.createElement('li');
    addTopicBtn.className = 'topic-item add-topic-btn';
    addTopicBtn.innerHTML = `<div class="topic-icon"><i class="fas fa-plus-circle"></i></div><span>添加新主题</span>`;
    dom.agentTopicList.appendChild(addTopicBtn);
}

export function renderHistoryPanel() {
    renderHistoryHeader(); // **在这里调用！**

    const scrollIsAtBottom = dom.agentHistoryContent.scrollHeight - dom.agentHistoryContent.clientHeight <= dom.agentHistoryContent.scrollTop + 1;

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
        dom.agentHistoryContent.innerHTML = `<div class="no-history"><i class="fas fa-comment-dots"></i><p>这个主题还没有对话记录，开始提问吧！</p></div>`;
        return;
    }

    currentHistory.forEach(message => {
        // AI 正在思考的占位符不在此处渲染，因为它已经在history数组里了
        if (message.status !== 'streaming' || message.content.length > 0 || appState.isAiThinking) {
             dom.agentHistoryContent.appendChild(createHistoryItem(message));
        }
    });

    if (scrollIsAtBottom) {
        dom.agentHistoryContent.scrollTop = dom.agentHistoryContent.scrollHeight;
    }
    
    updateTurnElements(); // 更新导航元素
}

function createLoadingIndicator() {
    const item = document.createElement('div');
    item.className = 'history-item loading-indicator';
    item.innerHTML = `
        <div class="history-item-header">
            <span class="role assistant">AI助手</span>
        </div>
        <div class="history-item-content">
            <p><i class="fas fa-spinner fa-pulse"></i> 正在输入...</p>
        </div>
    `;
    return item;
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

    let targetContainer;
    if (type === 'thinking') {
        targetContainer = messageEl.querySelector('.streaming-reasoning-container');
        // thinking 文本块可能包含 <thinking> 标签，先去掉
        textChunk = textChunk.replace(/<\/?thinking>/g, '');
    } else if (type === 'content') {
        targetContainer = messageEl.querySelector('.streaming-content-container');
        // 如果是第一个 content chunk，清空加载动画
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

// 新增一个函数，用于在流结束后折叠思考过程
export function finalizeStreamingUI(messageId) {
    const messageEl = document.querySelector(`.history-item[data-message-id="${messageId}"]`);
    if (!messageEl) return;

    // 找到 thinking block 的 details 元素并移除 open 属性
    const detailsEl = messageEl.querySelector('.thinking-block');
    if (detailsEl) {
        detailsEl.removeAttribute('open');
    }

    // 显示操作按钮
    const actionsContainer = messageEl.querySelector('.history-item-actions');
    if (actionsContainer) {
        actionsContainer.style.display = 'flex';
    }
}

export function updateTurnElements() {
    const upBtn = document.getElementById('chatNavUp');
    const downBtn = document.getElementById('chatNavDown');
    const hasTurns = dom.agentHistoryContent.querySelector('.history-item .role.user');
    
    if (upBtn && downBtn) {
        upBtn.disabled = !hasTurns;
        downBtn.disabled = !hasTurns;
    }
}
