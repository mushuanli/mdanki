// src/settings/settings_events.js
import { $, $id } from '../common/dom.js';
import { appState, setState } from '../common/state.js';
import * as dataService from '../services/dataService.js';
import { exportDatabase, importDatabase } from '../services/dbService.js';
import { renderSettingsView, renderSettingsDetail, setButtonLoadingState } from './settings_ui.js';
import { LLM_PROVIDERS, getDefaultApiPath } from '../services/llm/llmProviders.js';

// --- Module State ---
let autoSaveIntervalId = null;
let currentItem = null; // 跟踪当前正在编辑的项目

// ======================================================
//      [保留] 旧功能：全局设置相关逻辑
// ======================================================

function applyTheme(themeName) {
    document.documentElement.setAttribute('data-theme', themeName || '');
}

function saveTheme(themeName) {
    localStorage.setItem('app-theme', themeName);
}

function setupAutoSaveTimer(intervalInMinutes) {
    if (autoSaveIntervalId) clearInterval(autoSaveIntervalId);
    if (intervalInMinutes > 0) {
        autoSaveIntervalId = setInterval(dataService.autoSave, intervalInMinutes * 60 * 1000);
    }
}

function handleThemeChange(event) {
    const selectedTheme = event.target.value;
    applyTheme(selectedTheme);
    saveTheme(selectedTheme);
}

function handleAutoSaveChange(event) {
    const newInterval = parseInt(event.target.value, 10);
    if (isNaN(newInterval) || newInterval < 0) {
        event.target.value = appState.settings.autoSaveInterval;
        return;
    }
    setState({ settings: { ...appState.settings, autoSaveInterval: newInterval } });
    setupAutoSaveTimer(newInterval);
}

async function handleExportClick() {
    const exportDbBtn = $id('export-db-btn');
    const originalText = exportDbBtn.innerHTML;
    setButtonLoadingState(exportDbBtn, true, originalText);

    try {
        const data = await exportDatabase();
        const jsonString = JSON.stringify(data, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const date = new Date().toISOString().slice(0, 10);
        a.download = `anki-suite-backup-${date}.json`;
        a.click();
        URL.revokeObjectURL(url);
    } catch (error) {
        console.error("导出数据库失败:", error);
        alert("导出数据时发生错误。");
    } finally {
        setButtonLoadingState(exportDbBtn, false, originalText);
    }
}

async function handleFileImport(event) {
    const importDbBtn = $id('import-db-btn');
    const importFileInput = $id('import-file-input');
    const file = event.target.files[0];
    if (!file) return;

    if (!confirm("警告！导入将覆盖所有数据，此操作不可撤销。确定继续吗？")) {
        importFileInput.value = '';
        return;
    }

    const originalText = importDbBtn.innerHTML;
    setButtonLoadingState(importDbBtn, true, originalText);

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = JSON.parse(e.target.result);
            await importDatabase(data);
            alert("数据导入成功！应用将重新加载。");
            window.dispatchEvent(new CustomEvent('app:dataImported'));
        } catch (error) {
            console.error("导入数据库失败:", error);
            alert(`导入数据失败：${error.message}`);
        } finally {
            setButtonLoadingState(importDbBtn, false, originalText);
        }
    };
    reader.readAsText(file);
    importFileInput.value = '';
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
    
    const id = navItem.dataset.id;
    const type = navItem.dataset.type;

    let itemData;
    if (type === 'general') {
        itemData = { id: 'general', type: 'general', name: '应用设置' };
    } else if (type === 'apiConfig') {
        itemData = appState.apiConfigs.find(c => c.id === id);
    } else if (type === 'agent') {
        itemData = appState.agents.find(p => p.id === id);
    }

    if (itemData) {
        // [核心修复] 创建一个包含 displayName 的新对象，用于UI渲染
        const itemForUI = {
            ...itemData,
            type: type,
            displayName: itemData.name // 确保 displayName 始终等于 name 属性
        };

        currentItem = itemForUI; // 更新当前正在编辑的项目
        renderSettingsDetail(itemForUI); // 传递格式正确的对象

        if (type === 'general') {
            const themeSelector = $id('theme-selector');
            if(themeSelector) themeSelector.value = localStorage.getItem('app-theme') || '';
            
            const autoSaveInput = $id('autosave-interval');
            if(autoSaveInput) autoSaveInput.value = appState.settings.autoSaveInterval;
        }
    }
}

function handleAddItemClick(e) {
    const addBtn = e.target.closest('.add-item-btn');
    if (!addBtn) return;
    
    const type = addBtn.dataset.type;
    let displayName = '新项目';
    if (type === 'apiConfig') displayName = '新 API 配置';
    else if (type === 'agent') displayName = '新 Agent';

    // 确保创建时也使用 displayName
    const newItem = { type, displayName };
    currentItem = newItem;
    renderSettingsDetail(newItem, true);
}


// --- Event Handlers for Detail Panel (Agent Form specific) ---

function handleProviderChange(e) {
    const form = e.target.closest('form');
    if (!form) return;
    const providerName = e.target.value;
    const apiUrlInput = form.querySelector('.config-apiUrl');
    if (apiUrlInput) {
        apiUrlInput.value = getDefaultApiPath(providerName);
    }
}

async function handleSave() {
    if (!currentItem) return;
    
    const saveBtn = $id('settings-save-btn');
    const originalText = saveBtn.innerHTML;
    setButtonLoadingState(saveBtn, true, "保存中...");

    try {
        if (currentItem.type === 'apiConfig') {
            await saveApiConfig();
        } else if (currentItem.type === 'agent') {
            await saveAgent();
        }
        // Force a re-render of the entire settings view to reflect list changes
        $id('settings-view').innerHTML = '';
        renderSettingsView();
        // Maybe re-select the item that was just saved
    } catch (error) {
        console.error("Save failed:", error);
        alert(`保存失败: ${error.message}`);
    } finally {
        setButtonLoadingState(saveBtn, false, originalText);
    }
}

async function saveApiConfig() {
    const form = $id('api-config-form-dynamic');
    const data = {
        name: form.querySelector('.config-name').value,
        provider: form.querySelector('.config-provider').value,
        apiUrl: form.querySelector('.config-apiUrl').value,
        apiKey: form.querySelector('.config-apiKey').value,
        models: form.querySelector('.config-models').value,
    };
    const id = form.querySelector('.config-id').value;

    if (id) {
        await dataService.updateApiConfig(id, data);
    } else {
        await dataService.addApiConfig(data);
    }
}

async function saveAgent() {
    const form = $id('agent-form-dynamic');

    // [新增] 收集标签数据
    const tags = Array.from(form.querySelectorAll('.tags-list li'))
                      .map(li => li.textContent.slice(0, -1).trim()); // 移除末尾的 '×' 并 trim

    const data = {
        name: form.querySelector('.config-name').value,
        avatar: form.querySelector('.config-avatar').value,
        model: form.querySelector('.config-model').value,
        systemPrompt: form.querySelector('.config-systemPrompt').value,
        hint: form.querySelector('.config-hint').value,
        tags: tags, // [新增]
        sendHistory: form.querySelector('.config-sendHistory').checked, // [新增]
    };
    const id = form.querySelector('.config-id').value;
    
    if (id) {
        await dataService.updateAgent(id, data); // [重构]
    } else {
        await dataService.addAgent(data); // [重构]
    }
}

async function handleDelete(e) {
    if(!e.target.closest('.delete-item-btn') || !currentItem || !currentItem.id) return;

    const { type, id, displayName } = currentItem;
    let confirmMessage = `你确定要删除 "${displayName}" 吗? 此操作无法撤销。`;
    
    if (confirm(confirmMessage)) {
        try {
            if (type === 'apiConfig') {
                await dataService.deleteApiConfig(id);
            } else if (type === 'agent') {
                await dataService.deleteAgent(id);
            }
            // Force a re-render
            $id('settings-view').innerHTML = '';
            renderSettingsView();
            // Show placeholder
            renderSettingsDetail({}, false);
        } catch (error) {
            console.error("Delete failed:", error);
            alert(`删除失败: ${error.message}`);
        }
    }
}

// --- Public Functions ---

export function setupEventListeners() {
    const view = $id('settings-view');
    if (!view) return;

    // --- 使用事件委托统一处理所有事件 ---
    view.addEventListener('click', e => {
        const target = e.target;
        if (target.id === 'export-db-btn') handleExportClick(e);
        if (target.id === 'import-db-btn') $id('import-file-input').click();
        if (target.closest('.settings-nav-item')) handleNavItemClick(e);
        if (target.closest('.add-item-btn')) handleAddItemClick(e);
        if (target.id === 'settings-save-btn') handleSave(e);
        if (target.closest('.delete-item-btn')) handleDelete(e);
        if (target.closest('.toggle-api-key-visibility')) {
            const input = target.closest('.input-group').querySelector('input');
            input.type = input.type === 'password' ? 'text' : 'password';
        }
        // [新增] 移除标签
        if (e.target.classList.contains('remove-tag-btn')) {
            e.target.parentElement.remove();
        }

    });

    view.addEventListener('change', e => {
        const target = e.target;
        if (target.id === 'theme-selector') handleThemeChange(e);
        if (target.id === 'autosave-interval') handleAutoSaveChange(e);
        if (target.id === 'import-file-input') handleFileImport(e);
        if (target.matches('.config-provider')) handleProviderChange(e);
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

export function initializeUI(context) {
    // --- 初始化全局计时器 ---
    setupAutoSaveTimer(appState.settings.autoSaveInterval);
    
    let initialItemSelector;
    if (context?.type === 'prompt' && context?.action === 'create') {
        const addBtn = $(`.add-item-btn[data-type="prompt"]`);
        if (addBtn) {
            addBtn.click();
            return;
        }
    }
    // Default to general settings
    initialItemSelector = '#settings-view .settings-nav-item[data-type="general"]';
    
    const initialItem = $(initialItemSelector);
    if (initialItem) {
        initialItem.click();
    } else {
        renderSettingsDetail({displayName: ''}, false); // Fallback
    }
}