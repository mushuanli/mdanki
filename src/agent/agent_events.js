// src/agent/agent_events.js

import * as dom from './agent_dom.js';
import * as dataService from '../services/dataService.js';
import { appState } from '../common/state.js';
import { renderAgentView, renderHistoryPanel, renderAttachmentPreviews, updateTurnElements } from './agent_ui.js';
import { LLM_PROVIDERS, getDefaultModel, getDefaultApiPath } from '../services/llm/llmProviders.js'; // <-- 新增导入

// --- Module State ---
let selectedAttachments = [];
let turnElements = []; // For chat navigation
let currentTurnIndex = -1; // For chat navigation

// --- Modal Management ---
const modal = {
    el: document.getElementById('agentSettingsModal'),
    title: document.getElementById('agentSettingsModalTitle'),
    form: document.getElementById('agentSettingsForm'),
    id: document.getElementById('agentSettingsId'),
    name: document.getElementById('agentSettingsName'),
    displayName: document.getElementById('agentSettingsDisplayName'),
    avatar: document.getElementById('agentSettingsAvatar'), // <-- 新增
    provider: document.getElementById('agentSettingsProvider'),
    apiPath: document.getElementById('agentSettingsApiPath'),
    apiKey: document.getElementById('agentSettingsApiKey'),
    apiKeyGroup: document.querySelector('.api-key-group'),
    model: document.getElementById('agentSettingsModel'),
    isLocal: document.getElementById('agentSettingsIsLocal'),
    systemPrompt: document.getElementById('agentSettingsSystemPrompt'), // <-- 新增
    deleteBtn: document.getElementById('deleteAgentBtn'),
    deleteConfirmZone: document.querySelector('.delete-confirm-zone'),
    agentNameToConfirm: document.getElementById('agentNameToConfirm'),
    deleteConfirmInput: document.getElementById('deleteConfirmInput'),
    finalDeleteBtn: document.getElementById('finalDeleteBtn'),
    saveBtn: document.getElementById('agentSettingsSaveBtn'),
    cancelBtn: document.getElementById('agentSettingsCancelBtn'),
    closeBtn: document.getElementById('agentSettingsCloseBtn'),
};

/**
 * 新增：动态填充提供商下拉菜单
 */
function populateProviderDropdown() {
    modal.provider.innerHTML = ''; // 清空现有选项
    for (const providerName in LLM_PROVIDERS) {
        const option = document.createElement('option');
        option.value = providerName;
        option.textContent = providerName;
        modal.provider.appendChild(option);
    }
}

/**
 * 打开设置模态框，支持创建和编辑模式。
 * @param {object | null} agent - 如果提供 agent 对象，则为编辑模式；否则为创建模式。
 */
function openSettingsModal(agent = null) {
    modal.el.style.display = 'flex';
    resetValidation();
    modal.deleteConfirmZone.style.display = 'none';

    // 1. 首先，动态填充提供商列表
    populateProviderDropdown();

    if (agent) { // --- 编辑模式 ---
        modal.title.textContent = `Agent 设置: ${agent.displayName}`;
        modal.deleteBtn.style.display = 'block';
        
        // 填充表单
        modal.id.value = agent.id;
        modal.name.value = agent.name;
        modal.displayName.value = agent.displayName;
        modal.avatar.value = agent.avatar || '';
        modal.systemPrompt.value = agent.config.systemPrompt || '';

        // 3. 设置保存的提供商，并手动触发change事件来加载关联的模型列表和API路径
        modal.provider.value = agent.config.provider || '火山';
        modal.provider.dispatchEvent(new Event('change', { bubbles: true }));

        // 4. 填充其余字段（在change事件后，以防被覆盖）
        modal.apiPath.value = agent.config.apiPath || '';
        modal.apiKey.value = agent.config.apiKey || '';
        modal.model.value = agent.config.model || '';
        modal.isLocal.checked = agent.config.isLocal || false;

    } else { // --- 创建模式 ---
        modal.title.textContent = '创建新 Agent';
        modal.deleteBtn.style.display = 'none'; // 创建时隐藏删除按钮
        
        // 重置表单
        modal.form.reset();
        modal.id.value = ''; // 关键：ID为空表示是新对象
        modal.name.value = ''; // 内部名称也为空，稍后生成

        // 3. 设置默认提供商，并手动触发change事件来加载默认的模型和API路径
        modal.provider.value = '火山'; 
        modal.provider.dispatchEvent(new Event('change', { bubbles: true }));
    }

    updateModalUIBasedOnState();
}

function closeSettingsModal() {
    modal.el.style.display = 'none';
}

function updateModalUIBasedOnState() {
    const providerName = modal.provider.value;
    const providerConfig = LLM_PROVIDERS[providerName];
    
    // 清空现有的模型选项
    modal.model.innerHTML = ''; 

    // 填充新的模型选项
    if (providerConfig && providerConfig.models && providerConfig.models.length > 0) {
        providerConfig.models.forEach(modelName => {
            const option = document.createElement('option');
            option.value = modelName;
            option.textContent = modelName;
            modal.model.appendChild(option);
        });
        modal.model.disabled = false;
    } else {
        // 如果没有预设模型，显示一个提示并禁用选择
        const option = document.createElement('option');
        option.textContent = '请在下方手动输入模型名';
        option.value = '';
        modal.model.appendChild(option);
        modal.model.disabled = true; 
        // 考虑是否需要一个额外的输入框来让用户手动输入
    }

    // Toggle API key based on local model checkbox
    if (modal.isLocal.checked) {
        modal.apiKeyGroup.style.display = 'none';
        modal.apiKey.required = false;
    } else {
        modal.apiKeyGroup.style.display = 'block';
        modal.apiKey.required = true;
    }
}

function resetValidation() {
    modal.form.querySelectorAll('.is-invalid').forEach(el => el.classList.remove('is-invalid'));
}

function validateAndSave() {
    resetValidation();
    let isValid = true;
    const agentId = modal.id.value; // 如果是创建，此值为空

    // 验证显示名
    if (!modal.displayName.checkValidity()) {
        modal.displayName.classList.add('is-invalid');
        isValid = false;
    }

    // 验证头像
    if (!modal.avatar.checkValidity()) {
        modal.avatar.classList.add('is-invalid');
        isValid = false;
    }
    
    // 验证内部名称（仅在用户手动输入时）
    // 我们的策略是自动生成，所以主要检查重复性
    const agentName = modal.name.value;
    if (agentName) {
        const isNameTaken = appState.agents.some(a => a.id !== agentId && a.name === agentName);
        if (!modal.name.checkValidity() || isNameTaken) {
            modal.name.classList.add('is-invalid');
            isValid = false;
        }
    }

    if (!isValid) return;

    // 收集表单数据
    const agentData = {
        displayName: modal.displayName.value,
        avatar: modal.avatar.value.substring(0, 2).toUpperCase(),
        config: {
            provider: modal.provider.value,
            apiPath: modal.apiPath.value,
            apiKey: modal.apiKey.value,
            model: modal.model.value,
            isLocal: modal.isLocal.checked,
            systemPrompt: modal.systemPrompt.value, // <-- 新增
        }
    };

    // 根据是否存在 ID 来决定是创建还是更新
    if (agentId) { // --- 更新 ---
        agentData.id = agentId;
        agentData.name = modal.name.value; // 对于更新，name是已知的
        dataService.updateAgent(agentId, agentData).then(() => {
            closeSettingsModal();
            renderAgentView();
        });
    } else { // --- 创建 ---
        dataService.addAgent(agentData).then(() => {
            closeSettingsModal();
            renderAgentView();
        });
    }
}

async function handleDeleteAgent() {
    if(confirm(`您确定要永久删除Agent "${modal.displayName.value}" 吗？此操作无法撤销！`)) {
        await dataService.deleteAgent(modal.id.value);
        closeSettingsModal();
        renderAgentView();
    }
}

// --- Event Handlers ---

async function handleAgentClick(e) {
    const agentItem = e.target.closest('.agent-item');
    if (!agentItem) return;

    // --- 修改此处逻辑 ---
    if (agentItem.classList.contains('add-agent-btn')) {
        openSettingsModal(); // 不带参数调用，进入创建模式
        return;
    }
    
    const agentId = agentItem.dataset.agentId;
    if (agentId && !agentItem.classList.contains('active')) {
        dataService.selectAgent(agentId);
        renderAgentView();
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

function handleSettingsTriggerClick() {
    const currentAgent = dataService.getAgentById(appState.currentAgentId);
    if (currentAgent) {
        openSettingsModal(currentAgent);
    } else {
        console.error("No agent selected to configure.");
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

    upBtn.addEventListener('click', () => navigateTurns(-1));
    downBtn.addEventListener('click', () => navigateTurns(1));
}

function navigateTurns(direction) {
    turnElements = Array.from(dom.agentHistoryContent.querySelectorAll('.history-item .role.user'));
    if (turnElements.length === 0) return;

    document.querySelectorAll('.history-item.highlighted').forEach(el => el.classList.remove('highlighted'));

    currentTurnIndex += direction;

    if (currentTurnIndex < 0) {
        currentTurnIndex = turnElements.length - 1;
    } else if (currentTurnIndex >= turnElements.length) {
        currentTurnIndex = 0;
    }
    
    const userTurnEl = turnElements[currentTurnIndex].closest('.history-item');
    if (userTurnEl) {
        userTurnEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        
        userTurnEl.classList.add('highlighted');
        const nextEl = userTurnEl.nextElementSibling;
        if (nextEl && nextEl.classList.contains('history-item')) {
            nextEl.classList.add('highlighted');
        }
    }
}


// --- Setup ---

function setupModalEventListeners() {
    modal.form.addEventListener('submit', (e) => {
        e.preventDefault();
        validateAndSave();
    });

    modal.closeBtn.addEventListener('click', closeSettingsModal);
    modal.cancelBtn.addEventListener('click', closeSettingsModal);
    
    modal.provider.addEventListener('change', () => {
        const providerName = modal.provider.value;
        
        // 自动填充API路径和默认模型
        modal.apiPath.value = getDefaultApiPath(providerName);
        
        // **重要**：先更新模型列表，然后再设置默认值
        updateModalUIBasedOnState(); 
        
        // 设置默认模型
        modal.model.value = getDefaultModel(providerName);
    });

    modal.isLocal.addEventListener('change', updateModalUIBasedOnState);

    modal.deleteBtn.addEventListener('click', () => {
        modal.deleteConfirmZone.style.display = 'block';
        modal.agentNameToConfirm.textContent = modal.name.value;
        modal.deleteConfirmInput.value = '';
        modal.finalDeleteBtn.disabled = true;
    });

    modal.deleteConfirmInput.addEventListener('input', (e) => {
        modal.finalDeleteBtn.disabled = e.target.value !== modal.name.value;
    });

    modal.finalDeleteBtn.addEventListener('click', handleDeleteAgent);
    
    const toggleBtn = document.getElementById('toggleApiKeyVisibility');
    toggleBtn.addEventListener('click', () => {
        const icon = toggleBtn.querySelector('i');
        if (modal.apiKey.type === 'password') {
            modal.apiKey.type = 'text';
            icon.classList.replace('fa-eye', 'fa-eye-slash');
        } else {
            modal.apiKey.type = 'password';
            icon.classList.replace('fa-eye-slash', 'fa-eye');
        }
    });
}

export function setupAgentEventListeners() {
    dom.navAgentList.addEventListener('click', handleAgentClick);
    dom.agentTopicList.addEventListener('click', handleTopicClick);
    dom.agentHistoryContent.addEventListener('click', handleHistoryActionClick);
    // **新增**: 监听历史记录标题栏的设置按钮
    const settingsTriggerBtn = document.getElementById('agentSettingsTriggerBtn');
    settingsTriggerBtn.addEventListener('click', handleSettingsTriggerClick);

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
    setupModalEventListeners();
    setupChatNavigation(); // <-- 新增
}