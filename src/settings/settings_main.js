// src/settings/settings_main.js

import { setupSettingsEventListeners, initializeSettingsUI } from './settings_events.js';
import { renderSettingsView } from './settings_ui.js';

/**
 * [重构后] 初始化 Settings 模块。
 */
export async function initializeSettingsApp(context = null) {
    const container = document.getElementById('settings-view');
    // 如果是带上下文的调用，或容器为空，则重绘
    if (context || container.innerHTML.trim() === '') {
        container.innerHTML = '';
        renderSettingsView();
    }
    
    initializeSettingsUI(context);
    setupSettingsEventListeners();

    console.log("✅ Settings module initialized/updated.");
}