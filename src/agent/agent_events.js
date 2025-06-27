// src/agent_/agent_events.js

import * as dom from './agent_dom.js';
import * as dataService from '../services/dataService.js';
import { renderAgentView } from './agent_ui.js';

// --- Event Handlers ---

async function handleAgentClick(e) {
    const agentItem = e.target.closest('.agent-item');
    if (!agentItem) return;

    if (agentItem.classList.contains('add-agent-btn')) {
        const name = prompt("请输入新Agent的名称:");
        const avatar = prompt("请输入代表Agent的两个字母:", "AI");
        if (name && avatar) {
            await dataService.addAgent(name, avatar.substring(0, 2).toUpperCase());
            renderAgentView();
        }
        return;
    }

    const agentId = agentItem.dataset.agentId;
    if (agentId) {
        dataService.selectAgent(agentId);
        renderAgentView(); // Re-render everything to update topics and history
    }
}

async function handleTopicClick(e) {
    const topicItem = e.target.closest('.topic-item');
    if (!topicItem) return;

    if (topicItem.classList.contains('add-topic-btn')) {
        const title = prompt("请输入新主题的名称:");
        if (title) {
            await dataService.addTopic(title);
            renderAgentView();
        }
        return;
    }

    const topicId = topicItem.dataset.topicId;
    if (topicId) {
        dataService.selectTopic(topicId);
        renderAgentView(); // Only need to re-render topics and history
    }
}

async function handleHistoryActionClick(e) {
    const actionBtn = e.target.closest('.history-action-btn');
    if (!actionBtn) return;

    const messageItem = actionBtn.closest('.history-item');
    const messageId = messageItem.dataset.messageId;

    if (actionBtn.classList.contains('delete-btn')) {
        if (confirm("确定要删除这条消息吗？")) {
            await dataService.deleteHistoryMessages([messageId]);
            renderHistoryPanel(); // Just re-render the history
        }
    } else if (actionBtn.classList.contains('edit-btn')) {
        const p = messageItem.querySelector('.history-item-content p');
        const newContent = prompt("编辑你的消息:", p.textContent);
        if (newContent) {
            await dataService.editUserMessageAndRegenerate(messageId, newContent);
            renderHistoryPanel();
        }
    } else if (actionBtn.classList.contains('regenerate-btn')) {
        // This is complex, would involve deleting this message and re-running the AI
        console.log(`Regenerating response for message ${messageId}`);
    }
}


// --- Setup ---

export function setupAgentEventListeners() {
    dom.navAgentList.addEventListener('click', handleAgentClick);
    dom.agentTopicList.addEventListener('click', handleTopicClick);
    dom.agentHistoryContent.addEventListener('click', handleHistoryActionClick);
}