// src/settings/settings_ui.js
import { $id, $ } from '../common/dom.js';
import { appState } from '../common/state.js';
import { LLM_PROVIDERS } from '../services/llm/llmProviders.js';

// --- Private UI Rendering Functions ---

/**
 * 创建一个导航列表项。
 * @param {object} item - 包含 id, name, type 的对象。
 * @returns {HTMLElement} - 创建的 li 元素。
 */
function createNavItem(item) {
    const li = document.createElement('li');
    li.className = 'settings-nav-item';
    li.dataset.id = item.id;
    li.dataset.type = item.type;
    
    let iconClass = 'fa-cog';
    if (item.type === 'apiConfig') iconClass = 'fa-key';
    else if (item.type === 'agent') iconClass = 'fa-robot';

    li.innerHTML = `<i class="fas ${iconClass}"></i><span>${item.name}</span>`;
    return li;
}

/**
 * 创建一个导航分组，包含标题、添加按钮和列表。
 * @param {string} title - 分组标题。
 * @param {Array<object>} items - 该分组下的项目数组。
 * @param {string} type - 该分组的项目类型 ('apiConfig' 或 'prompt')。
 * @returns {DocumentFragment} - 包含完整分组的文档片段。
 */
function createNavGroup(title, items, type) {
    const fragment = document.createDocumentFragment();
    const group = document.createElement('div');
    group.className = 'settings-nav-group';
    group.innerHTML = `
        <h4 class="settings-nav-group-title">${title}</h4>
        <button class="add-item-btn" data-type="${type}"><i class="fas fa-plus"></i> 添加</button>
    `;
    const ul = document.createElement('ul');
    items.forEach(item => ul.appendChild(createNavItem(item)));
    group.appendChild(ul);
    fragment.appendChild(group);
    return fragment;
}

// --- Public API ---

/**
 * 渲染统一的设置主从布局，并填充所有导航项。
 */
export function renderSettingsView() {
    const container = $id('settings-view');
    const layoutTemplate = $id('settings-layout-template');
    if (!container || !layoutTemplate) {
        console.error('Settings container or layout template not found.');
        return;
    }
    
    // 防止重复渲染整个布局
    if (container.children.length > 0) return;

    // 1. 清空容器并渲染基础布局
    container.innerHTML = '';
    container.appendChild(layoutTemplate.content.cloneNode(true));
    
    // 2. 填充导航列表
    const listContainer = $('.settings-nav-list');
    if (!listContainer) return;

    // 清空现有列表
    listContainer.innerHTML = '';

    // a. 添加固定的“应用程序设置”项
    const generalSettingsItem = document.createElement('li');
    generalSettingsItem.className = 'settings-nav-item';
    generalSettingsItem.dataset.id = 'general';
    generalSettingsItem.dataset.type = 'general';
    generalSettingsItem.innerHTML = `<i class="fas fa-cogs"></i><span>应用设置</span>`;
    listContainer.appendChild(generalSettingsItem);

    // b. [修改] 添加动态配置项
    const apiConfigs = appState.apiConfigs.map(c => ({ id: c.id, name: c.name, type: 'apiConfig' }));
    const agents = appState.agents.map(p => ({ id: p.id, name: p.name, type: 'agent' }));
    
    listContainer.appendChild(createNavGroup('API 配置', apiConfigs, 'apiConfig'));
    listContainer.appendChild(createNavGroup('Agent配置', agents, 'agent'));
}

/**
 * 在详情面板中渲染指定项目的配置表单。
 * @param {object} item - 要渲染的配置项数据对象。
 * @param {boolean} isCreate - 是否为创建模式。
 */
export function renderSettingsDetail(item, isCreate = false) {
    const titleEl = $id('settings-detail-title');
    const contentEl = $id('settings-detail-content');
    const saveBtn = $id('settings-save-btn');
    if (!contentEl || !titleEl || !saveBtn) return;

    saveBtn.style.display = (item.type !== 'general') ? 'inline-flex' : 'none';

    let templateId;
    if (item.type === 'general') templateId = 'general-settings-form-template';
    else if (item.type === 'apiConfig') templateId = 'api-config-form-template';
    else if (item.type === 'agent') templateId = 'agent-form-template';
    else {
        contentEl.innerHTML = `<div class="placeholder-content"><i class="fas fa-exclamation-circle fa-2x"></i><p>未知的配置类型</p></div>`;
        return;
    }
    
    const template = $id(templateId);
    if (!template) {
        contentEl.innerHTML = `<p>错误：未找到模板 #${templateId}。</p>`;
        return;
    }

    contentEl.innerHTML = '';
    contentEl.appendChild(template.content.cloneNode(true));

    if (item.type === 'apiConfig') {
        populateApiConfigForm(item, isCreate);
    } else if (item.type === 'agent') {
        populateAgentForm(item, isCreate);
    }
    
    const titleIcon = isCreate ? 'fa-plus-circle' : 'fa-edit';
    titleEl.innerHTML = `<i class="fas ${titleIcon}"></i> ${isCreate ? `创建${item.displayName}` : `编辑: ${item.displayName}`}`;
}

/**
 * 填充 API 配置表单。
 * @param {object} config - API 配置数据对象。
 * @param {boolean} isCreate - 是否为创建模式。
 */
function populateApiConfigForm(config, isCreate) {
    const form = $id('api-config-form-dynamic');
    if (!form) return;

    const providerSelect = form.querySelector('.config-provider');
    providerSelect.innerHTML = '';
    Object.keys(LLM_PROVIDERS).forEach(name => {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        providerSelect.appendChild(option);
    });

    if (isCreate) {
        form.querySelector('.delete-item-btn').style.display = 'none';
        providerSelect.value = '火山'; // Default
        providerSelect.dispatchEvent(new Event('change'));
    } else {
        form.querySelector('.config-id').value = config.id;
        form.querySelector('.config-name').value = config.name;
        providerSelect.value = config.provider;
        form.querySelector('.config-apiUrl').value = config.apiUrl;
        form.querySelector('.config-apiKey').value = config.apiKey;
        form.querySelector('.config-models').value = config.models;
    }
}

/**
 * 填充角色 (Prompt) 配置表单。
 * @param {object} prompt - 角色配置数据对象。
 * @param {boolean} isCreate - 是否为创建模式。
 */
function populateAgentForm(agent, isCreate) { // [重构]
    const form = $id('agent-form-dynamic');
    if (!form) return;

    const modelSelect = form.querySelector('.config-model');
    modelSelect.innerHTML = '<option value="">-- 请选择一个模型 --</option>';
    
    appState.apiConfigs.forEach(api => {
        if (!api.models) return;
        const models = api.models.split(',').map(m => m.trim()).filter(Boolean);
        models.forEach(modelStr => {
            const [alias, modelName] = modelStr.split(':').map(s => s.trim());
            if (!alias || !modelName) return;
            const option = document.createElement('option');
            option.value = `${api.id}:${alias}`;
            option.textContent = `${api.name}: ${alias} (${modelName})`;
            modelSelect.appendChild(option);
        });
    });
    
    if (isCreate) {
        form.querySelector('.delete-item-btn').style.display = 'none';
        form.querySelector('.config-sendHistory').checked = true; // [新增] 默认勾选
    } else {
        form.querySelector('.config-id').value = agent.id;
        form.querySelector('.config-name').value = agent.name;
        form.querySelector('.config-avatar').value = agent.avatar || '';
        form.querySelector('.config-model').value = agent.model || '';
        form.querySelector('.config-systemPrompt').value = agent.systemPrompt || '';
        form.querySelector('.config-hint').value = agent.hint || '';
        // [新增] 填充新字段
        form.querySelector('.config-sendHistory').checked = agent.sendHistory !== false;

        const tagsList = form.querySelector('.tags-list');
        tagsList.innerHTML = '';
        if (agent.tags && agent.tags.length > 0) {
            agent.tags.forEach(tag => {
                const li = document.createElement('li');
                li.textContent = tag;
                li.innerHTML += '<button type="button" class="remove-tag-btn">×</button>';
                tagsList.appendChild(li);
            });
        }
    }
}

/**
 * 更新按钮的UI，显示加载状态。
 * @param {HTMLElement} button - 要更新的按钮元素。
 * @param {boolean} isLoading - 是否正在加载。
 * @param {string} originalText - 按钮的原始文本。
 */
export function setButtonLoadingState(button, isLoading, originalText) {
    if (!button) return;
    if (isLoading) {
        button.disabled = true;
        button.innerHTML = `<i class="fas fa-spinner fa-spin"></i> 处理中...`;
    } else {
        button.disabled = false;
        button.innerHTML = originalText;
    }
}