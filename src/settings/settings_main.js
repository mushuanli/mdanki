// src/settings/settings_main.js

import { setupEventListeners, initializeUI } from './settings_events.js';
import { renderSettingsView } from './settings_ui.js';
import { $id } from '../common/dom.js'; // 导入 $id

/**
 * [整合后] 初始化设置模块。
 * 这是从外部调用的唯一函数。
 */
export function initializeSettingsApp(context = null) {
    const container = $id('settings-view');
    // 如果是带上下文的调用，意味着可能需要重绘
    if (context) {
        container.innerHTML = '';
    }

    // 1. 渲染UI (renderSettingsView 内部有防重复机制)
    renderSettingsView();

    // 2. 初始化UI状态 (包括旧的全局设置和新的上下文驱动设置)
    initializeUI(context);
    
    // 3. 绑定所有事件监听器 (包括旧的和新的)
    setupEventListeners();

    console.log("✅ 设置模块已成功初始化/更新。");
}