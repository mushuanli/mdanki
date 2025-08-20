// src/settings/settings_main.js

// [重构] 直接导入 dom 代理对象，不再需要 SettingsDom 类
import { dom } from './settings_dom.js';
import { setupSettingsEventListeners, initializeSettingsUI } from './settings_events.js';
import { renderSettingsView } from './settings_ui.js';

/**
 * [重构后] 初始化 Settings 模块。
 * @param {object|null} context - 从其他模块传递来的上下文。
 */
export async function initializeSettingsApp(context = null) {
    // 步骤 1: 渲染视图骨架
    renderSettingsView();
    
    // 步骤 2: 使用 dom 代理对象初始化UI和事件
    // 无需再手动 new SettingsDom()，dom 代理对象立即可用，且不会立即查询DOM
    initializeSettingsUI(dom, context);
    setupSettingsEventListeners(dom);

    console.log("✅ Settings module initialized/updated correctly.");
}