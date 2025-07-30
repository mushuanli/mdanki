// src/settings/settings_main.js

import { setupEventListeners, initializeUI } from './settings_events.js';

/**
 * 初始化设置模块。
 * 这是从外部调用的唯一函数。
 */
export function initializeSettingsApp() {
    // 初始化UI状态（例如，设置选择框的当前值）
    initializeUI();
    
    // 绑定所有事件监听器
    setupEventListeners();

    console.log("✅ 设置模块已成功初始化 (重构后)。");
}