// src/settings/components/DetailComponent.js

import { LLM_PROVIDERS, getDefaultApiPath } from '../../services/llm/llmProviders.js';
import { escapeHTML } from '../../common/utils.js';

export class DetailComponent {
    constructor(store) {
        this.store = store;
        this.container = document.querySelector('.settings-detail-panel');

        // 缓存模板以提高性能
        this.templates = {
            general: document.getElementById('settings_generalFormTemplate'),
            apiConfig: document.getElementById('settings_apiConfigFormTemplate'),
            agent: document.getElementById('settings_agentFormTemplate'),
        };
        
        this.setupEventListeners();
        this.unsubscribe = store.subscribe(this.handleStateChange.bind(this));
    }

    setupEventListeners() {
        // 对整个详情面板容器使用事件委托
        this.container.addEventListener('click', (e) => {
            if (e.target.closest('#settings_saveBtn')) this._handleSave();
            if (e.target.closest('.delete-item-btn')) this._handleDelete();
            if (e.target.closest('.toggle-api-key-visibility')) this._toggleApiKeyVisibility(e);
            if (e.target.classList.contains('remove-tag-btn')) e.target.parentElement.remove();
            if (e.target.closest('#settings_exportDbBtn')) this.store.exportDb();
            if (e.target.closest('#settings_importDbBtn')) document.getElementById('settings_importFileInput').click();
        });

        this.container.addEventListener('change', (e) => {
            if (e.target.matches('#settings_themeSelector')) this.store.setTheme(e.target.value);
            if (e.target.matches('#settings_autosaveInterval')) this.store.setAutoSaveInterval(e.target.value);
            if (e.target.matches('#settings_importFileInput')) this.store.importDb(e.target.files[0]);
            if (e.target.matches('.config-provider')) this._handleProviderChange(e);
        });
        
        this.container.addEventListener('keydown', (e) => {
            if (e.target.classList.contains('config-tags-input') && e.key === 'Enter') this._handleAddTag(e);
        });
    }

    handleStateChange(newState, oldState) {
        // 仅当选择项或其数据变化时才重新渲染
        if (
            newState.activeItemId !== oldState.activeItemId ||
            newState.isCreating !== oldState.isCreating ||
            newState.apiConfigs !== oldState.apiConfigs ||
            newState.agents !== oldState.agents
        ) {
            this.render(newState);
        }
        
        // 单独更新保存按钮状态，避免不必要的重绘
        const saveBtn = document.getElementById('settings_saveBtn');
        if (saveBtn) {
            const wasSaving = oldState.isSaving;
            const isSaving = newState.isSaving;
            if (wasSaving !== isSaving) {
                saveBtn.disabled = isSaving;
                saveBtn.innerHTML = isSaving 
                    ? '<i class="fas fa-spinner fa-spin"></i> 保存中...'
                    : '<i class="fas fa-save"></i> 保存';
            }
        }
    }

    render(state) {
        const { activeItemId, activeItemType, isCreating } = state;

        let itemData = null;
        if (activeItemType === 'general') {
            itemData = { name: '应用设置' };
        } else if (activeItemType === 'apiConfig') {
            itemData = isCreating ? { name: '新 API 配置' } : state.apiConfigs.find(c => c.id === activeItemId);
        } else if (activeItemType === 'agent') {
            itemData = isCreating ? { name: '新 Agent' } : state.agents.find(a => a.id === activeItemId);
        }
        
        const titleEl = this.container.querySelector('#settings_detailTitle');
        const contentEl = this.container.querySelector('#settings_detailContent');
        const saveBtn = this.container.querySelector('#settings_saveBtn');

        if (!itemData) {
            titleEl.innerHTML = '';
            contentEl.innerHTML = `<div class="placeholder-content"><p>请从左侧选择一个项目。</p></div>`;
            saveBtn.style.display = 'none';
            return;
        }

        const titleIcon = isCreating ? 'fa-plus-circle' : 'fa-edit';
        titleEl.innerHTML = `<i class="fas ${titleIcon}"></i> ${isCreating ? `创建 ${itemData.name}` : `编辑: ${escapeHTML(itemData.name)}`}`;
        saveBtn.style.display = (activeItemType !== 'general') ? 'inline-flex' : 'none';

        const template = this.templates[activeItemType];
        if (!template) return;

        contentEl.innerHTML = '';
        contentEl.appendChild(template.content.cloneNode(true));

        // 根据类型填充表单数据
        if (activeItemType === 'general') this._populateGeneralForm(state);
        if (activeItemType === 'apiConfig') this._populateApiConfigForm(itemData, isCreating);
        if (activeItemType === 'agent') this._populateAgentForm(itemData, isCreating, state.apiConfigs);
    }
    
    _populateGeneralForm(state) {
        const form = this.container.querySelector('[data-id="general"]');
        if (!form) return;
        form.querySelector('#settings_themeSelector').value = state.settings.theme;
        form.querySelector('#settings_autosaveInterval').value = state.settings.autoSaveInterval;
    }

    _populateApiConfigForm(config, isCreating) {
        const form = this.container.querySelector('form');
        if (!form) return;
        const providerSelect = form.querySelector('.config-provider');
        providerSelect.innerHTML = Object.keys(LLM_PROVIDERS).map(name => `<option value="${name}">${name}</option>`).join('');

        if (isCreating) {
            form.querySelector('.delete-item-btn').style.display = 'none';
        } else {
            form.querySelector('.config-id').value = config.id;
            form.querySelector('.config-name').value = config.name;
            providerSelect.value = config.provider;
            form.querySelector('.config-apiUrl').value = config.apiUrl || '';
            form.querySelector('.config-apiKey').value = config.apiKey || '';
            form.querySelector('.config-models').value = config.models || '';
        }
    }
    
    _populateAgentForm(agent, isCreating, apiConfigs) {
        const form = this.container.querySelector('form');
        if (!form) return;
        const modelSelect = form.querySelector('.config-model');
        modelSelect.innerHTML = '<option value="">-- 请选择模型 --</option>';
        apiConfigs.forEach(api => {
            if (!api.models) return;
            api.models.split(',').forEach(modelStr => {
                const [alias, modelName] = modelStr.split(':').map(s => s.trim());
                if (alias && modelName) {
                    const value = `${api.id}:${alias}`;
                    const text = `${api.name}: ${alias} (${modelName})`;
                    modelSelect.add(new Option(text, value));
                }
            });
        });

        if (isCreating) {
            form.querySelector('.delete-item-btn').style.display = 'none';
            form.querySelector('.config-sendHistory').checked = true;
        } else {
            form.querySelector('.config-id').value = agent.id;
            form.querySelector('.config-name').value = agent.name;
            form.querySelector('.config-avatar').value = agent.avatar || '';
            modelSelect.value = agent.model || '';
            form.querySelector('.config-systemPrompt').value = agent.systemPrompt || '';
            form.querySelector('.config-hint').value = agent.hint || '';
            form.querySelector('.config-sendHistory').checked = agent.sendHistory !== false;

            const tagsList = form.querySelector('.tags-list');
            tagsList.innerHTML = (agent.tags || []).map(tag => `<li>${escapeHTML(tag)}<button type="button" class="remove-tag-btn">×</button></li>`).join('');
        }
    }

    _handleSave() {
        const state = this.store.getState();
        const form = this.container.querySelector('form');
        if (!form || !state.activeItemType || state.activeItemType === 'general') return;

        const formData = {
            id: form.querySelector('.config-id')?.value,
            name: form.querySelector('.config-name')?.value.trim(),
        };

        if (state.activeItemType === 'apiConfig') {
            Object.assign(formData, {
                provider: form.querySelector('.config-provider').value,
                apiUrl: form.querySelector('.config-apiUrl').value.trim(),
                apiKey: form.querySelector('.config-apiKey').value.trim(),
                models: form.querySelector('.config-models').value.trim(),
            });
        } else if (state.activeItemType === 'agent') {
            Object.assign(formData, {
                avatar: form.querySelector('.config-avatar').value.trim(),
                model: form.querySelector('.config-model').value,
                systemPrompt: form.querySelector('.config-systemPrompt').value.trim(),
                hint: form.querySelector('.config-hint').value.trim(),
                tags: Array.from(form.querySelectorAll('.tags-list li')).map(li => li.textContent.slice(0, -1).trim()),
                sendHistory: form.querySelector('.config-sendHistory').checked,
            });
        }
        
        this.store.saveCurrentItem(formData);
    }
    
    _handleDelete() {
        const { activeItemId, activeItemType } = this.store.getState();
        if (activeItemId && activeItemType !== 'general') {
            this.store.deleteItem(activeItemId, activeItemType);
        }
    }

    _toggleApiKeyVisibility(e) {
        const input = e.target.closest('.input-group').querySelector('input');
        input.type = input.type === 'password' ? 'text' : 'password';
    }

    _handleProviderChange(e) {
        const form = e.target.closest('form');
        if (form) {
            form.querySelector('.config-apiUrl').value = getDefaultApiPath(e.target.value);
        }
    }
    
    _handleAddTag(e) {
        e.preventDefault();
        const input = e.target;
        const tagText = input.value.trim();
        if (tagText) {
            const tagsList = input.closest('.tags-input-container').querySelector('.tags-list');
            tagsList.insertAdjacentHTML('beforeend', `<li>${escapeHTML(tagText)}<button type="button" class="remove-tag-btn">×</button></li>`);
            input.value = '';
        }
    }

    destroy() {
        this.unsubscribe();
    }
}
