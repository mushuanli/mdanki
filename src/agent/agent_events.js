// src/agent/agent_events.js

import * as dom from './agent_dom.js';
import * as dataService from '../services/dataService.js';
import { appState } from '../common/state.js';
import { renderAgentView, renderHistoryPanel, renderAttachmentPreviews } from './agent_ui.js';

// --- Module State ---
let selectedAttachments = []; // Holds { name, data (base64) }

// --- Config Constants ---
const PROVIDER_DEFAULTS = {
    'OpenAI': {
        apiPath: 'https://api.openai.com/v1/chat/completions',
        models: ['gpt-4-turbo', 'gpt-4o', 'gpt-3.5-turbo', 'gpt-4-vision-preview']
    },
    'Google': {
        apiPath: 'https://generativelanguage.googleapis.com/v1beta/models/...',
        models: ['gemini-1.5-pro-latest', 'gemini-1.0-pro']
    },
    'Local': {
        apiPath: 'http://localhost:11434/api/chat',
        models: ['llama3', 'mistral', 'gemma']
    }
};

// --- Modal Management ---
const modal = {
    el: document.getElementById('agentSettingsModal'),
    title: document.getElementById('agentSettingsModalTitle'),
    form: document.getElementById('agentSettingsForm'),
    id: document.getElementById('agentSettingsId'),
    name: document.getElementById('agentSettingsName'),
    displayName: document.getElementById('agentSettingsDisplayName'),
    provider: document.getElementById('agentSettingsProvider'),
    apiPath: document.getElementById('agentSettingsApiPath'),
    apiKey: document.getElementById('agentSettingsApiKey'),
    apiKeyGroup: document.querySelector('.api-key-group'),
    model: document.getElementById('agentSettingsModel'),
    modelList: document.getElementById('model-list'),
    isLocal: document.getElementById('agentSettingsIsLocal'),
    deleteBtn: document.getElementById('deleteAgentBtn'),
    deleteConfirmZone: document.querySelector('.delete-confirm-zone'),
    agentNameToConfirm: document.getElementById('agentNameToConfirm'),
    deleteConfirmInput: document.getElementById('deleteConfirmInput'),
    finalDeleteBtn: document.getElementById('finalDeleteBtn'),
    saveBtn: document.getElementById('agentSettingsSaveBtn'),
    cancelBtn: document.getElementById('agentSettingsCancelBtn'),
    closeBtn: document.getElementById('agentSettingsCloseBtn'),
};

function openSettingsModal(agent) {
    modal.el.style.display = 'flex';
    modal.title.textContent = `Agent 设置: ${agent.displayName}`;
    
    // Populate form
    modal.id.value = agent.id;
    modal.name.value = agent.name;
    modal.displayName.value = agent.displayName;
    modal.provider.value = agent.config.provider || '';
    modal.apiPath.value = agent.config.apiPath || '';
    modal.apiKey.value = agent.config.apiKey || '';
    modal.model.value = agent.config.model || '';
    modal.isLocal.checked = agent.config.isLocal || false;

    updateModalUIBasedOnState();
    resetValidation();
    modal.deleteConfirmZone.style.display = 'none';
}

function closeSettingsModal() {
    modal.el.style.display = 'none';
}

function updateModalUIBasedOnState() {
    // Update model list based on provider
    const provider = modal.provider.value;
    const defaults = PROVIDER_DEFAULTS[provider];
    modal.modelList.innerHTML = '';
    if (defaults && defaults.models) {
        defaults.models.forEach(m => {
            modal.modelList.innerHTML += `<option value="${m}">`;
        });
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

    // Validate Name
    const agentId = modal.id.value;
    const agentName = modal.name.value;
    const isNameTaken = appState.agents.some(a => a.id !== agentId && a.name === agentName);
    if (!modal.name.checkValidity() || isNameTaken) {
        modal.name.classList.add('is-invalid');
        isValid = false;
    }

    if (!modal.displayName.checkValidity()) {
        modal.displayName.classList.add('is-invalid');
        isValid = false;
    }

    if (!isValid) return;

    // Collect data
    const updatedData = {
        id: agentId,
        name: agentName,
        displayName: modal.displayName.value,
        config: {
            provider: modal.provider.value,
            apiPath: modal.apiPath.value,
            apiKey: modal.apiKey.value,
            model: modal.model.value,
            isLocal: modal.isLocal.checked,
        }
    };

    // Update avatar if a new one is provided (example)
    // For simplicity, we don't have an avatar field, but this is where it would go.

    dataService.updateAgent(agentId, updatedData).then(() => {
        closeSettingsModal();
        renderAgentView();
    });
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

    const agentId = agentItem.dataset.agentId;
    
    if (agentItem.classList.contains('add-agent-btn')) {
        const displayName = prompt("请输入新Agent的显示名称:");
        if (displayName) {
            const avatar = prompt("请输入代表Agent的两个字母:", "AI");
            await dataService.addAgent(displayName, avatar ? avatar.substring(0, 2).toUpperCase() : 'AI');
            renderAgentView();
        }
        return;
    }
    
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
    if (!content && selectedAttachments.length === 0) {
        return; // Don't send empty messages
    }

    // Disable input while processing
    dom.chatInput.disabled = true;
    dom.sendMessageBtn.disabled = true;

    // Call the data service to handle the logic
    await dataService.sendMessageAndGetResponse(content, selectedAttachments);
    
    // Clear inputs and re-render
    dom.chatInput.value = '';
    selectedAttachments = [];
    renderAttachmentPreviews(selectedAttachments);
    renderHistoryPanel();

    // Re-enable input
    dom.chatInput.disabled = false;
    dom.sendMessageBtn.disabled = false;
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

// --- Setup ---

function setupModalEventListeners() {
    modal.form.addEventListener('submit', (e) => {
        e.preventDefault();
        validateAndSave();
    });

    modal.closeBtn.addEventListener('click', closeSettingsModal);
    modal.cancelBtn.addEventListener('click', closeSettingsModal);
    
    modal.provider.addEventListener('change', () => {
        const provider = modal.provider.value;
        const defaults = PROVIDER_DEFAULTS[provider];
        if (defaults) {
            modal.apiPath.value = defaults.apiPath;
        }
        updateModalUIBasedOnState();
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
}