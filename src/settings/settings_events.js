// src/settings/settings_events.js

import * as dom from './settings_dom.js';
import { appState, setState } from '../common/state.js';
import * as dataService from '../services/dataService.js';
import { exportDatabase, importDatabase } from '../services/dbService.js';
import { renderSettingsView, renderSettingsDetail, setButtonLoadingState } from './settings_ui.js';
import { getDefaultApiPath } from '../services/llm/llmProviders.js';

let currentItem = null;

// ======================================================
//      [保留] 旧功能：全局设置相关逻辑
// ======================================================

function applyTheme(themeName) {
    document.documentElement.setAttribute('data-theme', themeName || '');
    localStorage.setItem('app-theme', themeName);
}

function handleThemeChange(event) {
    applyTheme(event.target.value);
}

function handleAutoSaveChange(event) {
    const newInterval = parseInt(event.target.value, 10);
    if (!isNaN(newInterval) && newInterval >= 0) {
        setState({ settings: { ...appState.settings, autoSaveInterval: newInterval } });
        // The timer itself is managed in main.js based on state changes
    }
}

async function handleExportClick() {
    const originalText = dom.exportDbBtn.innerHTML;
    setButtonLoadingState(dom.exportDbBtn, true, originalText);
    try {
        const data = await exportDatabase();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `smart-suite-backup-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
    } catch (error) {
        alert(`导出失败: ${error.message}`);
    } finally {
        setButtonLoadingState(dom.exportDbBtn, false, originalText);
    }
}

async function handleFileImport(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (!confirm("警告！导入将覆盖所有数据。确定继续吗？")) {
        dom.importFileInput.value = '';
        return;
    }
    const originalText = dom.importDbBtn.innerHTML;
    setButtonLoadingState(dom.importDbBtn, true, originalText);
    
    try {
        const data = JSON.parse(await file.text());
        await importDatabase(data);
        window.dispatchEvent(new CustomEvent('app:dataImported'));
    } catch (error) {
        alert(`导入失败: ${error.message}`);
    } finally {
        setButtonLoadingState(dom.importDbBtn, false, originalText);
        dom.importFileInput.value = '';
    }
}


// ======================================================
//      [新增] 新功能：动态配置项管理逻辑
// ======================================================

function handleNavItemClick(e) {
    const navItem = e.target.closest('.settings-nav-item');
    if (!navItem) return;

    // 移除其他激活状态
    document.querySelectorAll('.settings-nav-item.active').forEach(el => el.classList.remove('active'));
    navItem.classList.add('active');
    
    const { id, type } = navItem.dataset;
    let itemData;
    if (type === 'general') itemData = { id, type, name: '应用设置' };
    else if (type === 'apiConfig') itemData = appState.apiConfigs.find(c => c.id === id);
    else if (type === 'agent') itemData = appState.agents.find(p => p.id === id);

    if (itemData) {
        const itemForUI = { ...itemData, type, displayName: itemData.name };
        currentItem = itemForUI;
        renderSettingsDetail(itemForUI);
        if (type === 'general') {
            dom.themeSelector.value = localStorage.getItem('app-theme') || '';
            dom.autoSaveInput.value = appState.settings.autoSaveInterval;
        }
    }
}

function handleAddItemClick(e) {
    const addBtn = e.target.closest('.add-item-btn');
    if (!addBtn) return;
    
    const { type } = addBtn.dataset;
    const displayName = type === 'apiConfig' ? '新 API 配置' : '新 Agent';
    currentItem = { type, displayName };
    renderSettingsDetail(currentItem, true);
}


// --- Event Handlers for Detail Panel (Agent Form specific) ---

function handleProviderChange(e) {
    const form = e.target.closest('form');
    if (form) {
        form.querySelector('.config-apiUrl').value = getDefaultApiPath(e.target.value);
    }
}

async function handleSave() {
    if (!currentItem) return;
    const originalText = dom.saveBtn.innerHTML;
    setButtonLoadingState(dom.saveBtn, true, "保存中...");
    try {
        if (currentItem.type === 'apiConfig') await saveApiConfig();
        else if (currentItem.type === 'agent') await saveAgent();
        dom.settingsView.innerHTML = '';
        renderSettingsView();
        // Optionally re-select the saved item here
    } catch (error) {
        alert(`保存失败: ${error.message}`);
    } finally {
        setButtonLoadingState(dom.saveBtn, false, originalText);
    }
}

async function saveApiConfig() {
    const form = document.getElementById(dom.DYNAMIC_FORM_IDS.apiConfig);
    const data = {
        name: form.querySelector('.config-name').value.trim(),
        provider: form.querySelector('.config-provider').value,
        apiUrl: form.querySelector('.config-apiUrl').value.trim(),
        apiKey: form.querySelector('.config-apiKey').value.trim(),
        models: form.querySelector('.config-models').value.trim(),
    };
    const id = form.querySelector('.config-id').value;
    await (id ? dataService.agent_updateApiConfig(id, data) : dataService.agent_addApiConfig(data));
}

async function saveAgent() {
    const form = document.getElementById(dom.DYNAMIC_FORM_IDS.agent);
    const tags = Array.from(form.querySelectorAll('.tags-list li')).map(li => li.textContent.slice(0, -1).trim());
    const data = {
        name: form.querySelector('.config-name').value.trim(),
        avatar: form.querySelector('.config-avatar').value.trim(),
        model: form.querySelector('.config-model').value,
        systemPrompt: form.querySelector('.config-systemPrompt').value.trim(),
        hint: form.querySelector('.config-hint').value.trim(),
        tags,
        sendHistory: form.querySelector('.config-sendHistory').checked,
    };
    const id = form.querySelector('.config-id').value;
    await (id ? dataService.agent_updateAgent(id, data) : dataService.agent_addAgent(data));
}

async function handleDelete(e) {
    if (!e.target.closest('.delete-item-btn') || !currentItem?.id) return;
    const { type, id, displayName } = currentItem;
    if (confirm(`确定要删除 "${displayName}" 吗?`)) {
        try {
            if (type === 'apiConfig') await dataService.agent_deleteApiConfig(id);
            else if (type === 'agent') await dataService.agent_deleteAgent(id);
            dom.settingsView.innerHTML = '';
            renderSettingsView();
            renderSettingsDetail({}, false); // Show placeholder
        } catch (error) {
            alert(`删除失败: ${error.message}`);
        }
    }
}

// --- Public Functions ---

export function setupSettingsEventListeners() {
    const view = dom.settingsView;
    if (!view) return;

    view.addEventListener('click', e => {
        if (e.target.id === dom.exportDbBtn.id) handleExportClick();
        if (e.target.id === dom.importDbBtn.id) dom.importFileInput.click();
        if (e.target.closest('.settings-nav-item')) handleNavItemClick(e);
        if (e.target.closest('.add-item-btn')) handleAddItemClick(e);
        if (e.target.id === dom.saveBtn.id) handleSave();
        if (e.target.closest('.delete-item-btn')) handleDelete(e);
        if (e.target.closest('.toggle-api-key-visibility')) {
            const input = e.target.closest('.input-group').querySelector('input');
            input.type = input.type === 'password' ? 'text' : 'password';
        }
        if (e.target.classList.contains('remove-tag-btn')) {
            e.target.parentElement.remove();
        }
    });

    view.addEventListener('change', e => {
        if (e.target.id === dom.themeSelector.id) handleThemeChange(e);
        if (e.target.id === dom.autoSaveInput.id) handleAutoSaveChange(e);
        if (e.target.id === dom.importFileInput.id) handleFileImport(e);
        if (e.target.matches('.config-provider')) handleProviderChange(e);
    });
   
    // [新增] 标签输入处理
    view.addEventListener('keydown', e => {
        if (e.target.classList.contains('config-tags-input') && e.key === 'Enter') {
            e.preventDefault();
            const input = e.target;
            const tagText = input.value.trim();
            if (tagText) {
                const tagsList = input.closest('.tags-input-container').querySelector('.tags-list');
                const li = document.createElement('li');
                li.textContent = tagText;
                li.innerHTML += '<button type="button" class="remove-tag-btn">×</button>';
                tagsList.appendChild(li);
                input.value = '';
            }
        }
    });

}

export function initializeSettingsUI(context) {
    applyTheme(localStorage.getItem('app-theme') || '');
    
    if (context?.type === 'agent' && context?.action === 'create') {
        const addBtn = document.querySelector(`.add-item-btn[data-type="agent"]`);
        addBtn?.click();
    } else {
        const initialItem = document.querySelector('#settings-view .settings-nav-item[data-type="general"]');
        initialItem?.click();
    }
}