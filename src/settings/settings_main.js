// src/settings/settings_main.js

import { setupEventListeners, initializeUI } from './settings_events.js';
import { renderSettingsView } from './settings_ui.js'; // [新增] 导入渲染函数

/**
 * 初始化设置模块。
 * 这是从外部调用的唯一函数。
 */
export function initializeSettingsApp() {
    // [修改后] 第 1 步：渲染UI，确保DOM元素存在
    renderSettingsView();

    // [修改后] 第 2 步：初始化UI状态（例如，设置选择框的当前值）
    initializeUI();
    
    // [修改后] 第 3 步：绑定所有事件监听器
    setupEventListeners();

    console.log("✅ 设置模块已成功初始化 (Template风格)。");
}