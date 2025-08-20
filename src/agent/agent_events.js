// src/agent/agent_events.js

import * as dom from './agent_dom.js';
import * as dataService from '../services/dataService.js';
import { appState, setState } from '../common/state.js';
import { renderAgentView, renderHistoryPanel, renderTopicList, renderAttachmentPreviews } from './agent_ui.js';

// --- Module State ---
let selectedAttachments = [];
// [修复] 将导航状态变量移至模块作用域，以在函数调用间保持状态
let turnElements = [];
let currentTurnIndex = -1;

// --- Event Handlers ---

async function handleTopicClick(e) {
    // [修改] 增加对选择模式和删除按钮的判断
    const target = e.target;
    const topicItem = target.closest('.topic-item');
    if (!topicItem) return;

    // [重构] 优先处理特殊按钮点击
    // 1. "添加新主题" 按钮
    if (topicItem.classList.contains('add-topic-btn')) {
        if (!appState.currentAgentId && appState.agents.length > 0) {
            // 如果没有默认选中的Agent，帮用户选一个
            setState({ currentAgentId: appState.agents[0].id });
        }
        if (!appState.currentAgentId) {
            alert("请先在设置中创建一个 Agent 角色。");
            return;
        }
        const title = prompt("请输入新主题的名称:");
        if (title) {
            await dataService.agent_addTopic(title);
            renderAgentView();
        }
        return;
    }

    // 2. 单个删除按钮
    if (target.closest('.topic-delete-btn')) {
        const topicId = topicItem.dataset.topicId;
        if (confirm(`确定要删除主题 "${topicItem.querySelector('span').textContent}" 吗？`)) {
            await dataService.agent_deleteTopics([topicId]);
            renderAgentView();
        }
        return; // 结束处理
    }

    // 3. 选择模式下的点击
    if (appState.isTopicSelectionMode) {
        const checkbox = topicItem.querySelector('.topic-selection-checkbox');
        if (checkbox) {
            checkbox.checked = !checkbox.checked;
            checkbox.dispatchEvent(new Event('change', { bubbles: true }));
        }
        return; // 结束处理
    }

    // [重构] 最后处理常规的主题选择
    const topicId = topicItem.dataset.topicId;
    if (topicId && topicId !== appState.currentTopicId) {
        // [恢复] 在切换主题之前保存当前滚动位置
        if (appState.currentTopicId) {
            const currentScrollTop = dom.historyContent.scrollTop;
            const newScrollPositions = { ...(appState.topicScrollPositions || {}), [appState.currentTopicId]: currentScrollTop };
            setState({ topicScrollPositions: newScrollPositions });
        }
        
        dataService.agent_selectTopic(topicId);
        renderAgentView();
    }
}

async function handleHistoryActionClick(e) {
    const actionBtn = e.target.closest('.history-action-btn');
    if (!actionBtn) return;

    const messageItem = actionBtn.closest('.history-item');
    const messageId = messageItem.dataset.messageId;

    if (actionBtn.classList.contains('delete-btn')) {
        if (confirm("确定要删除这组对话吗？")) {
            let idsToDelete = [messageId];
            const messageEl = actionBtn.closest('.history-item');
            if (messageEl.classList.contains('role-user') && messageEl.nextElementSibling?.classList.contains('role-assistant')) {
                idsToDelete.push(messageEl.nextElementSibling.dataset.messageId);
            } else if (messageEl.classList.contains('role-assistant') && messageEl.previousElementSibling?.classList.contains('role-user')) {
                idsToDelete.push(messageEl.previousElementSibling.dataset.messageId);
            }
            await dataService.agent_deleteHistoryMessages(idsToDelete);
            await renderHistoryPanel();
        }
    } else if (actionBtn.classList.contains('edit-btn')) {
        const currentContent = appState.history.find(h => h.id === messageId)?.content || '';
        const newContent = prompt("编辑你的消息:", currentContent);
        if (newContent && newContent !== currentContent && confirm("编辑将删除此后的对话并重新生成回应，是否继续？")) {
            await dataService.agent_editUserMessageAndRegenerate(messageId, newContent);
        }
    }
}

/**
 * [新增] 处理主题标签筛选器变化的事件
 */
function handleTopicFilterChange(e) {
    setState({ topicListFilterTag: e.target.value });
    renderTopicList();
    const currentTopics = dataService.agent_getFilteredTopics();
    const isVisible = currentTopics.some(t => t.id === appState.currentTopicId);
    if (!isVisible) {
        const newTopicId = currentTopics.length > 0 ? currentTopics[0].id : null;
        if (newTopicId) dataService.agent_selectTopic(newTopicId);
        else setState({ currentTopicId: null });
        renderAgentView();
    }
}

/**
 * [新增] 对话角色选择器事件
 */
function handleConversationRoleChange(e) {
    if (!appState.currentTopicId) return;
    setState({ currentConversationAgentId: e.target.value || null });
    renderHistoryPanel();
}

// [新增] 主题重命名事件
async function handleEditTopic() {
    if (!appState.currentTopicId) return;
    const topic = appState.topics.find(t => t.id === appState.currentTopicId);
    const newName = prompt("请输入新的主题名称:", topic.title);
    if (newName && newName.trim() !== topic.title) {
        await dataService.agent_updateTopic(appState.currentTopicId, { title: newName.trim() });
        renderTopicList();
    }
}

// --- NEW CHAT EVENT HANDLERS ---

/**
 * Handles sending a message when the send button is clicked.
 */
async function handleSendMessage() {
    const content = dom.chatInput.value.trim();
    if ((!content && selectedAttachments.length === 0) || appState.isAiThinking) return;
    
    await dataService.agent_sendMessageAndGetResponse(content, [...selectedAttachments]);
    dom.chatInput.value = '';
    selectedAttachments = [];
    renderAttachmentPreviews([]);
    dom.chatInput.focus();
}

/**
 * Handles file selection for attachments.
 */
function handleAttachmentChange(e) {
    selectedAttachments = [];
    Array.from(e.target.files).forEach(file => {
        const reader = new FileReader();
        reader.onload = (event) => {
            selectedAttachments.push({ name: file.name, data: event.target.result });
            renderAttachmentPreviews(selectedAttachments);
        };
        reader.readAsDataURL(file);
    });
    
    // Clear the input value so the same file can be selected again
    e.target.value = '';
}

/**
 * Handles removing an attachment from the preview list.
 */
function handleRemoveAttachment(e) {
    const removeBtn = e.target.closest('.remove-attachment-btn');
    if (!removeBtn) return;
    selectedAttachments.splice(parseInt(removeBtn.dataset.index, 10), 1);
    renderAttachmentPreviews(selectedAttachments);
}

// --- Chat Navigation Logic (新增) ---
function setupChatNavigation() {
    // [修复] 此处的 DOM 引用已在 dom.js 中定义，无需重新 getElementById
    dom.chatNavUp.addEventListener('click', () => navigateTurns(-1));
    dom.chatNavDown.addEventListener('click', () => navigateTurns(1));
}

function navigateTurns(direction) {
    // [修复] 此处直接使用模块作用域的变量，不再重新声明
    turnElements = Array.from(dom.historyContent.querySelectorAll('.history-item.role-user'));
    if (turnElements.length === 0) return;

    document.querySelectorAll('.history-item.highlighted').forEach(el => el.classList.remove('highlighted'));

    currentTurnIndex = (currentTurnIndex + direction + turnElements.length) % turnElements.length;
    
    const userTurnEl = turnElements[currentTurnIndex];
    if (userTurnEl) {
        userTurnEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        
        userTurnEl.classList.add('highlighted');
        const nextEl = userTurnEl.nextElementSibling;
        if (nextEl && nextEl.classList.contains('history-item')) {
            nextEl.classList.add('highlighted');
        }
    }
}

// [新增] 切换主题面板的处理器
function handleToggleTopicsPanel() {
    setState({ isTopicsPanelHidden: !appState.isTopicsPanelHidden });
    renderAgentView(); // Re-render to apply the change
}

// --- Setup ---

export function setupAgentEventListeners() {
    dom.topicList.addEventListener('click', handleTopicClick);
    dom.historyContent.addEventListener('click', handleHistoryActionClick);
    dom.topicTagFilter.addEventListener('change', handleTopicFilterChange);
    dom.conversationRoleSelector.addEventListener('change', handleConversationRoleChange);
    dom.editTopicBtn.addEventListener('click', handleEditTopic);
    dom.toggleTopicsBtn.addEventListener('click', handleToggleTopicsPanel);

    // Batch actions
    dom.manageTopicsBtn.addEventListener('click', () => {
        setState({ isTopicSelectionMode: true, selectedTopicIds: [] });
        renderTopicList();
    });
    dom.cancelTopicSelectionBtn.addEventListener('click', () => {
        setState({ isTopicSelectionMode: false, selectedTopicIds: [] });
        renderTopicList();
    });
    dom.selectAllTopicsBtn.addEventListener('click', () => {
        const allIds = appState.topics.map(t => t.id);
        const selected = (appState.selectedTopicIds.length === allIds.length) ? [] : allIds;
        setState({ selectedTopicIds: selected });
        renderTopicList();
    });
    dom.deleteSelectedTopicsBtn.addEventListener('click', async () => {
        const count = appState.selectedTopicIds.length;
        if (count > 0 && confirm(`确定要删除选中的 ${count} 个主题吗？`)) {
            await dataService.agent_deleteTopics(appState.selectedTopicIds);
            renderAgentView();
        }
    });

    dom.topicList.addEventListener('change', e => {
        if (e.target.classList.contains('topic-selection-checkbox')) {
            const topicId = e.target.dataset.topicId;
            const selectedIds = new Set(appState.selectedTopicIds);
            e.target.checked ? selectedIds.add(topicId) : selectedIds.delete(topicId);
            setState({ selectedTopicIds: Array.from(selectedIds) });
            renderTopicList(); // 只重绘列表以更新按钮状态
        }
    });

    // Chat input
    dom.sendMessageBtn.addEventListener('click', handleSendMessage);
    dom.chatInput.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault(); // Prevent new line on Enter
            handleSendMessage();
        }
    });
    dom.attachFileBtn.addEventListener('click', () => dom.attachmentInput.click());
    dom.attachmentInput.addEventListener('change', handleAttachmentChange);
    dom.attachmentPreviewContainer.addEventListener('click', handleRemoveAttachment);
    setupChatNavigation(); // <-- 新增
}
