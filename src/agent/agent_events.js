// src/agent/agent_events.js

import * as dom from './agent_dom.js';
import * as dataService from '../services/dataService.js';
import { appState, setState } from '../common/state.js';
import { renderAgentView, renderHistoryPanel, renderTopicList, renderAttachmentPreviews, updateTurnElements } from './agent_ui.js';

// --- Module State ---
let selectedAttachments = [];
let turnElements = []; // For chat navigation
let currentTurnIndex = -1; // For chat navigation

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
            await dataService.addTopic(title);
            renderAgentView();
        }
        return;
    }

    // 2. 单个删除按钮
    if (target.closest('.topic-delete-btn')) {
        const topicId = topicItem.dataset.topicId;
        if (confirm(`确定要删除主题 "${topicItem.querySelector('span').textContent}" 吗？\n这将同时删除所有相关聊天记录。`)) {
            await dataService.deleteTopics([topicId]);
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
        // 在切换主题之前保存当前滚动位置
        if (appState.currentTopicId) {
            const currentScrollTop = dom.agentHistoryContent.scrollTop;
            const newScrollPositions = { ...appState.topicScrollPositions, [appState.currentTopicId]: currentScrollTop };
            setState({ topicScrollPositions: newScrollPositions });
        }
        
        dataService.selectTopic(topicId);
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
            // [修改] 删除一组对话
            let idsToDelete = [messageId];
            const message = appState.history.find(h => h.id === messageId);
            const messageEl = actionBtn.closest('.history-item');

            if (message.role === 'user') {
                const nextEl = messageEl.nextElementSibling;
                if (nextEl && nextEl.classList.contains('role-assistant')) {
                    idsToDelete.push(nextEl.dataset.messageId);
                }
            } else if (message.role === 'assistant') {
                const prevEl = messageEl.previousElementSibling;
                if (prevEl && prevEl.classList.contains('role-user')) {
                    idsToDelete.push(prevEl.dataset.messageId);
                }
            }
            await dataService.deleteHistoryMessages(idsToDelete);
            renderHistoryPanel();
        }
    } else if (actionBtn.classList.contains('edit-btn')) {
        const p = messageItem.querySelector('.history-item-content p:first-of-type');
        const currentContent = p.textContent;
        const newContent = prompt("编辑你的消息:", currentContent);
        if (newContent && newContent !== currentContent) {
            if (confirm("编辑此消息将删除此后的所有对话并重新生成回应，是否继续？")) {
                await dataService.editUserMessageAndRegenerate(messageId, newContent);
                // UI会自动更新
            }
        }
    } else if (actionBtn.classList.contains('regenerate-btn')) {
        // This is complex, would involve deleting this message and re-running the AI
        console.log(`Regenerating response for message ${messageId}`);
    }
}

/**
 * [新增] 处理主题标签筛选器变化的事件
 */
function handleTopicFilterChange(e) {
    const selectedTag = e.target.value;
    setState({ topicListFilterTag: selectedTag });

    // 重新渲染主题列表，它会自动应用筛选
    renderTopicList();

    // **重要**：检查当前选中的主题是否还在筛选结果中
    const currentTopics = dataService.getFilteredTopics(); // 假设在dataService中创建此辅助函数
    const isCurrentTopicVisible = currentTopics.some(t => t.id === appState.currentTopicId);

    if (!isCurrentTopicVisible) {
        // 如果当前主题被筛掉了，自动选择列表中的第一个主题
        const newTopicId = currentTopics.length > 0 ? currentTopics[0].id : null;
        if (newTopicId) {
            dataService.selectTopic(newTopicId);
        } else {
             setState({ currentTopicId: null });
        }
        // 重新渲染整个视图以更新历史记录面板
        renderAgentView();
    }
}

/**
 * [新增] 对话角色选择器事件
 */
function handleConversationRoleChange(e) {
    // 如果没有选中任何主题，则不允许切换对话角色
    if (!appState.currentTopicId) return;

    const newAgentId = e.target.value || null; // 'null' for "默认 AI"
    
    // 只更新对话角色ID，不改变当前主题
    setState({
        currentConversationAgentId: newAgentId,
    });
    
    // 重新渲染历史记录面板，这会根据新角色更新 hint 或历史
    renderHistoryPanel();
}

// [新增] 主题重命名事件
async function handleEditTopic() {
    if (!appState.currentTopicId) return;
    const topic = appState.topics.find(t => t.id === appState.currentTopicId);
    const newName = prompt("请输入新的主题名称:", topic.title);
    if (newName && newName.trim() !== topic.title) {
        await dataService.updateTopic(appState.currentTopicId, { title: newName.trim() });
        renderTopicList(); // 重新渲染以显示新名称
    }
}

// --- NEW CHAT EVENT HANDLERS ---

/**
 * Handles sending a message when the send button is clicked.
 */
async function handleSendMessage() {
    const content = dom.chatInput.value.trim();
    if ((!content && selectedAttachments.length === 0) || appState.isAiThinking) {
        return;
    }
    
    const attachmentsCopy = [...selectedAttachments];
    dom.chatInput.value = '';
    selectedAttachments = [];
    renderAttachmentPreviews([]);
    
    await dataService.sendMessageAndGetResponse(content, attachmentsCopy);

    dom.chatInput.focus();
}

/**
 * Handles file selection for attachments.
 */
function handleAttachmentChange(e) {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    // Simple implementation: overwrite existing selections
    selectedAttachments = []; 

    files.forEach(file => {
        const reader = new FileReader();
        reader.onload = (event) => {
            selectedAttachments.push({
                name: file.name,
                data: event.target.result // base64 string
            });
            // Re-render previews after each file is loaded
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

    const indexToRemove = parseInt(removeBtn.dataset.index, 10);
    selectedAttachments.splice(indexToRemove, 1);
    renderAttachmentPreviews(selectedAttachments);
}

// --- Chat Navigation Logic (新增) ---
function setupChatNavigation() {
    const upBtn = document.getElementById('chatNavUp');
    const downBtn = document.getElementById('chatNavDown');
    if(upBtn) upBtn.addEventListener('click', () => navigateTurns(-1));
    if(downBtn) downBtn.addEventListener('click', () => navigateTurns(1));
}

function navigateTurns(direction) {
    turnElements = Array.from(dom.agentHistoryContent.querySelectorAll('.history-item.role-user'));
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
    const isHidden = !appState.isTopicsPanelHidden;
    setState({ isTopicsPanelHidden: isHidden });
    
    const topicsPanel = document.querySelector('.topics-panel');
    const toggleBtn = document.getElementById('toggleTopicsBtn');

    if (isHidden) {
        topicsPanel.classList.add('collapsed');
        toggleBtn.title = "显示主题栏";
    } else {
        topicsPanel.classList.remove('collapsed');
        toggleBtn.title = "隐藏主题栏";
    }
}

// --- Setup ---

export function setupAgentEventListeners() {
    // [已修复] 移除了对不存在元素的事件监听
    dom.agentTopicList.addEventListener('click', handleTopicClick);
    dom.agentHistoryContent.addEventListener('click', handleHistoryActionClick);
    
    // [新增] 为新的筛选器和操作按钮添加监听
    const topicTagFilter = dom.$id('topic-tag-filter');
    if (topicTagFilter) {
        topicTagFilter.addEventListener('change', handleTopicFilterChange);
    }
    
    const conversationRoleSelector = dom.$id('conversationRoleSelector');
    if(conversationRoleSelector) {
        conversationRoleSelector.addEventListener('change', handleConversationRoleChange);
    }

    const editTopicBtn = dom.$id('editTopicBtn');
    if (editTopicBtn) {
        editTopicBtn.addEventListener('click', handleEditTopic);
    }

    // [新增] 批量删除相关事件
    const manageBtn = document.getElementById('manageTopicsBtn');
    const cancelBtn = document.getElementById('cancelTopicSelectionBtn');
    const selectAllBtn = document.getElementById('selectAllTopicsBtn');
    const deleteSelectedBtn = document.getElementById('deleteSelectedTopicsBtn');

    manageBtn.addEventListener('click', () => {
        setState({ isTopicSelectionMode: true, selectedTopicIds: [] });
        renderTopicList();
    });
    cancelBtn.addEventListener('click', () => {
        setState({ isTopicSelectionMode: false, selectedTopicIds: [] });
        renderTopicList();
    });
    selectAllBtn.addEventListener('click', () => {
        const allTopicIds = appState.topics.map(t => t.id);
        const selectedIds = appState.selectedTopicIds;

        // 判断当前是否已经全选
        if (allTopicIds.length > 0 && selectedIds.length === allTopicIds.length) {
            // 如果是，则执行“全不选”
            setState({ selectedTopicIds: [] });
        } else {
            // 否则，执行“全选”
            setState({ selectedTopicIds: allTopicIds });
        }
        
        // 重新渲染列表以更新复选框状态和按钮文本
        renderTopicList();
    });
    deleteSelectedBtn.addEventListener('click', async () => {
        const count = appState.selectedTopicIds.length;
        if (count > 0 && confirm(`确定要删除选中的 ${count} 个主题吗？\n这将同时删除所有相关聊天记录。`)) {
            await dataService.deleteTopics(appState.selectedTopicIds);
            renderAgentView();
        }
    });

    // 使用事件委托处理复选框
    dom.agentTopicList.addEventListener('change', e => {
        if (e.target.classList.contains('topic-selection-checkbox')) {
            const topicId = e.target.dataset.topicId;
            const selectedIds = new Set(appState.selectedTopicIds);
            if (e.target.checked) {
                selectedIds.add(topicId);
            } else {
                selectedIds.delete(topicId);
            }
            setState({ selectedTopicIds: Array.from(selectedIds) });
            renderTopicList(); // 只重绘列表以更新按钮状态
        }
    });

    // [新增] 切换主题面板的事件监听
    const toggleTopicsBtn = document.getElementById('toggleTopicsBtn');
    if (toggleTopicsBtn) {
        toggleTopicsBtn.addEventListener('click', handleToggleTopicsPanel);
    }

    // New chat listeners
    dom.sendMessageBtn.addEventListener('click', handleSendMessage);
    dom.chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault(); // Prevent new line on Enter
            handleSendMessage();
        }
    });
    dom.attachmentInput.addEventListener('change', handleAttachmentChange);
    dom.attachmentPreviewContainer.addEventListener('click', handleRemoveAttachment);
    setupChatNavigation(); // <-- 新增
}
