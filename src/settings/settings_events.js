// src/settings/settings_events.js

import { appState, setState } from '../common/state.js';
import * as dataService from '../services/dataService.js';
import { exportDatabase, importDatabase } from '../services/dbService.js';
// [FIX] 导入新的 populateNavList 函数
import { populateNavList, renderSettingsDetail, setButtonLoadingState } from './settings_ui.js';
import { getDefaultApiPath } from '../services/llm/llmProviders.js';
// [重构] 不再需要导入 DYNAMIC_FORM_IDS，因为 dom 对象已包含表单引用
// import { DYNAMIC_FORM_IDS } from './settings_dom.js'; 

let currentItem = null;

// ======================================================
//      [保留] 旧功能：全局设置相关逻辑
// ======================================================

function applyTheme(themeName) {
    document.documentElement.setAttribute('data-theme', themeName || '');
    localStorage.setItem('app-theme', themeName);
}

/**
 * [修正] 公共入口函数，用于设置所有事件监听器。
 * @param {SettingsDom} dom - SettingsDom 类的实例。
 */
export function setupSettingsEventListeners(dom) {
    if (!dom.settingsView) return;

    // --- 将所有事件处理器定义为内部函数，以便闭包访问 dom ---
    
    function handleThemeChange(event) {
        applyTheme(event.target.value);
    }

    function handleAutoSaveChange(event) {
        const newInterval = parseInt(event.target.value, 10);
        if (!isNaN(newInterval) && newInterval >= 0) {
            setState({ settings: { ...appState.settings, autoSaveInterval: newInterval } });
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
            document.body.appendChild(a); // 兼容 Firefox
            a.click();
            document.body.removeChild(a); // 清理
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
            alert("数据导入成功！应用即将刷新。");
            window.location.reload(); // 导入成功后刷新页面以应用所有更改
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
            renderSettingsDetail(dom, itemForUI); // [修正] 传入 dom
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
        renderSettingsDetail(dom, currentItem, true); // [修正] 传入 dom
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
        const isCreating = !currentItem.id; // [UX-OPTIMIZATION] 判断是新建还是更新

        setButtonLoadingState(dom.saveBtn, true, "保存中...");
        try {
            let savedItem = null;
            if (currentItem.type === 'apiConfig') {
                if (isCreating) {
                    savedItem = await saveApiConfig(true);
                } else {
                    await saveApiConfig(false);
                    savedItem = { ...currentItem }; // 更新操作，ID不变
                }
            } else if (currentItem.type === 'agent') {
                if (isCreating) {
                    savedItem = await saveAgent(true);
                } else {
                    await saveAgent(false);
                    savedItem = { ...currentItem }; // 更新操作，ID不变
                }
            }

            // [UX-OPTIMIZATION] 保存后刷新导航列表，并智能选中
            populateNavList(dom);
            
            if (savedItem && savedItem.id) {
                // 无论是新建还是更新，都尝试找到并点击对应的导航项
                const navItemToSelect = dom.navList.querySelector(`.settings-nav-item[data-id="${savedItem.id}"]`);
                if (navItemToSelect) {
                    navItemToSelect.click();
                } else {
                    // 如果找不到（异常情况），则回退到默认行为
                    dom.navList.querySelector('.settings-nav-item[data-type="general"]')?.click();
                }
            } else {
                // 如果没有返回 savedItem，也回退到默认行为
                dom.navList.querySelector('.settings-nav-item[data-type="general"]')?.click();
            }

        } catch (error) {
            alert(`保存失败: ${error.message}`);
        } finally {
            setButtonLoadingState(dom.saveBtn, false, originalText);
        }
    }

    /**
     * [UX-OPTIMIZATION] 修改函数以接收 isCreating 标志并返回新对象
     * @param {boolean} isCreating 
     * @returns {Promise<object|void>}
     */
    async function saveApiConfig(isCreating) {
        // [重构] 使用 dom.apiConfigForm 替代 document.getElementById
        const form = dom.apiConfigForm;
        const data = {
            name: form.querySelector('.config-name').value.trim(),
            provider: form.querySelector('.config-provider').value,
            apiUrl: form.querySelector('.config-apiUrl').value.trim(),
            apiKey: form.querySelector('.config-apiKey').value.trim(),
            models: form.querySelector('.config-models').value.trim(),
        };
        if (isCreating) {
            return await dataService.agent_addApiConfig(data);
        } else {
            const id = form.querySelector('.config-id').value;
            await dataService.agent_updateApiConfig(id, data);
        }
    }

    /**
     * [UX-OPTIMIZATION] 修改函数以接收 isCreating 标志并返回新对象
     * @param {boolean} isCreating 
     * @returns {Promise<object|void>}
     */
    async function saveAgent(isCreating) {
        // [重构] 使用 dom.agentForm 替代 document.getElementById
        const form = dom.agentForm;
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
        if (isCreating) {
            return await dataService.agent_addAgent(data);
        } else {
            const id = form.querySelector('.config-id').value;
            await dataService.agent_updateAgent(id, data);
        }
    }

    async function handleDelete(e) {
        if (!e.target.closest('.delete-item-btn') || !currentItem?.id) return;
        const { type, id, displayName } = currentItem;
        if (confirm(`确定要删除 "${displayName}" 吗?`)) {
            try {
                if (type === 'apiConfig') await dataService.agent_deleteApiConfig(id);
                else if (type === 'agent') await dataService.agent_deleteAgent(id);
                // [修正] 删除后刷新导航列表并显示占位符
                populateNavList(dom);
                renderSettingsDetail(dom, {}, false);
            } catch (error) {
                alert(`删除失败: ${error.message}`);
            }
        }
    }

// --- Public Functions ---

    dom.settingsView.addEventListener('click', e => {
        // [修正] 使用 e.target.closest() 来正确捕获按钮点击
        if (e.target.closest('#settings_exportDbBtn')) {
            handleExportClick();
        }
        if (e.target.closest('#settings_importDbBtn')) {
            dom.importFileInput.click();
        }
        if (e.target.closest('.settings-nav-item')) {
            handleNavItemClick(e);
        }
        if (e.target.closest('.add-item-btn')) {
            handleAddItemClick(e);
        }
        if (e.target.closest('#settings_saveBtn')) {
            // [修正] 直接调用 handleSave 而不是通过 ID 比较
            // handleSave();
        }
        if (e.target.closest('.delete-item-btn')) {
            // handleDelete(e);
        }
        if (e.target.closest('.toggle-api-key-visibility')) {
            const input = e.target.closest('.input-group').querySelector('input');
            input.type = input.type === 'password' ? 'text' : 'password';
        }
        if (e.target.classList.contains('remove-tag-btn')) {
            e.target.parentElement.remove();
        }
    });

    dom.settingsView.addEventListener('change', e => {
        if (e.target.matches('#settings_themeSelector')) handleThemeChange(e);
        if (e.target.matches('#settings_autosaveInterval')) handleAutoSaveChange(e);
        if (e.target.matches('#settings_importFileInput')) handleFileImport(e);
        if (e.target.matches('.config-provider')) {
            // handleProviderChange(e);
        }
    });
   
    // [新增] 标签输入处理
    dom.settingsView.addEventListener('keydown', e => {
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

/**
 * [FIX] 初始化Settings界面的UI状态。
 * @param {SettingsDom} dom - SettingsDom 类的实例。
 * @param {object} context - 导航上下文。
 */
export function initializeSettingsUI(dom, context) {
    applyTheme(localStorage.getItem('app-theme') || '');
    
    populateNavList(dom); // [FIX] 先填充导航列表
    
    if (context?.type === 'agent' && context?.action === 'create') {
        const addBtn = dom.settingsView.querySelector(`.add-item-btn[data-type="agent"]`);
        addBtn?.click();
    } else {
        const initialItem = dom.settingsView.querySelector('.settings-nav-item[data-type="general"]');
        initialItem?.click();
    }
}