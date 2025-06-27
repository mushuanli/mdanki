// src/agent_/agent_ui.js

import * as dom from './agent_dom.js';
import { appState } from '../common/state.js';
import { escapeHTML } from '../common/utils.js';

function createAgentItem(agent) {
    const isActive = agent.id === appState.currentAgentId;
    const item = document.createElement('div');
    item.className = `agent-item ${isActive ? 'active' : ''}`;
    item.dataset.agentId = agent.id;
    item.innerHTML = `
        <div class="agent-avatar">${escapeHTML(agent.avatar)}</div>
        <span>${escapeHTML(agent.name)}</span>
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

function createHistoryItem(message) {
    const item = document.createElement('div');
    item.className = 'history-item';
    item.dataset.messageId = message.id;

    const imagesHTML = message.images.map(src => 
        `<img src="${src}" alt="Uploaded image">`
    ).join('');

    item.innerHTML = `
        <div class="history-item-header">
            <span class="role ${message.role}">${message.role === 'user' ? '用户' : 'AI助手'}</span>
            <span>${new Date(message.timestamp).toLocaleString()}</span>
        </div>
        <div class="history-item-content">
            <p>${escapeHTML(message.content)}</p>
            <div class="image-previews">${imagesHTML}</div>
        </div>
        <div class="history-item-actions">
            <button class="history-action-btn regenerate-btn"><i class="fas fa-redo"></i> 重新生成</button>
            <button class="history-action-btn edit-btn"><i class="fas fa-edit"></i> 编辑</button>
            <button class="history-action-btn delete-btn"><i class="fas fa-trash"></i> 删除</button>
        </div>
    `;
    // Hide buttons that don't apply
    if (message.role === 'user') {
        item.querySelector('.regenerate-btn').style.display = 'none';
    } else {
        item.querySelector('.edit-btn').style.display = 'none';
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
    dom.agentHistoryContent.innerHTML = '';
    if (!appState.currentTopicId) {
        dom.agentHistoryContent.innerHTML = `<div class="no-history"><i class="fas fa-comments"></i><p>请选择或创建一个主题来开始聊天</p></div>`;
        return;
    }
    const currentHistory = appState.history
        .filter(h => h.topicId === appState.currentTopicId)
        .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    if (currentHistory.length === 0) {
        dom.agentHistoryContent.innerHTML = `<div class="no-history"><i class="fas fa-comment-dots"></i><p>这个主题还没有对话记录</p></div>`;
        return;
    }
    currentHistory.forEach(message => {
        dom.agentHistoryContent.appendChild(createHistoryItem(message));
    });
}