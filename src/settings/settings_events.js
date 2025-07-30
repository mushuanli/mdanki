// src/settings/settings_events.js

import * as dom from './settings_dom.js';
import * as ui from './settings_ui.js';
import { appState, setState } from '../common/state.js';
import { autoSave } from '../services/dataService.js';
import { exportDatabase, importDatabase } from '../services/dbService.js';

let autoSaveIntervalId = null;

// --- Private Functions ---

function applyTheme(themeName) {
    if (themeName) {
        document.documentElement.setAttribute('data-theme', themeName);
    } else {
        document.documentElement.removeAttribute('data-theme');
    }
}

function saveTheme(themeName) {
    localStorage.setItem('app-theme', themeName);
}

function setupAutoSaveTimer(intervalInMinutes) {
    if (autoSaveIntervalId) clearInterval(autoSaveIntervalId);
    
    if (intervalInMinutes > 0) {
        const intervalInMs = intervalInMinutes * 60 * 1000;
        autoSaveIntervalId = setInterval(autoSave, intervalInMs);
        console.log(`Auto-save timer set for every ${intervalInMinutes} minutes.`);
    } else {
        console.log("Auto-save timer disabled.");
    }
}

// --- Event Handlers ---

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

/**
 * [新增] 处理导出按钮点击事件。
 */
async function handleExportClick() {
    const originalText = dom.exportDbBtn.innerHTML;
    ui.setButtonLoadingState(dom.exportDbBtn, true, originalText);

    try {
        const data = await exportDatabase();
        const jsonString = JSON.stringify(data, null, 2); // 使用2个空格缩进，方便阅读
        const blob = new Blob([jsonString], { type: 'application/json' });
        
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const date = new Date().toISOString().slice(0, 10);
        a.download = `anki-suite-backup-${date}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
    } catch (error) {
        console.error("导出数据库失败:", error);
        alert("导出数据时发生错误，详情请查看控制台。");
    } finally {
        ui.setButtonLoadingState(dom.exportDbBtn, false, originalText);
    }
}

/**
 * [新增] 处理导入文件选择事件。
 */
async function handleFileImport(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (!confirm("警告！\n\n导入新数据将会完全覆盖您当前的全部数据，此操作不可撤销。\n\n您确定要继续吗？")) {
        // 清空文件输入，以便下次可以选择相同的文件
        dom.importFileInput.value = '';
        return;
    }

    const originalText = dom.importDbBtn.innerHTML;
    ui.setButtonLoadingState(dom.importDbBtn, true, originalText);

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = JSON.parse(e.target.result);
            await importDatabase(data);
            alert("数据导入成功！应用即将刷新以加载新数据。");
            window.location.reload();
        } catch (error) {
            console.error("导入数据库失败:", error);
            alert(`导入数据失败：${error.message}\n详情请查看控制台。`);
            ui.setButtonLoadingState(dom.importDbBtn, false, originalText);
        }
    };
    reader.onerror = () => {
        alert("读取文件时发生错误。");
        ui.setButtonLoadingState(dom.importDbBtn, false, originalText);
    };
    reader.readAsText(file);
    
    // 清空文件输入
    dom.importFileInput.value = '';
}

// --- Public Functions ---

/**
 * 设置所有设置页面的事件监听器。
 */
export function setupEventListeners() {
    if (dom.themeSelector) dom.themeSelector.addEventListener('change', handleThemeChange);
    if (dom.autoSaveInput) dom.autoSaveInput.addEventListener('change', handleAutoSaveChange);
    
    // [新增] 数据库操作事件监听
    if (dom.exportDbBtn) dom.exportDbBtn.addEventListener('click', handleExportClick);
    if (dom.importDbBtn) dom.importDbBtn.addEventListener('click', () => dom.importFileInput.click());
    if (dom.importFileInput) dom.importFileInput.addEventListener('change', handleFileImport);
}

/**
 * 根据应用初始状态来初始化UI。
 */
export function initializeUI() {
    // 初始化主题
    const savedTheme = localStorage.getItem('app-theme') || '';
    applyTheme(savedTheme);
    if (dom.themeSelector) dom.themeSelector.value = savedTheme;

    // 初始化自动保存
    if (dom.autoSaveInput) dom.autoSaveInput.value = appState.settings.autoSaveInterval;
    setupAutoSaveTimer(appState.settings.autoSaveInterval);
}
