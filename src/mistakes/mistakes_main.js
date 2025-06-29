// src/mistakes/mistakes_main.js

import { MistakeManager } from './mistakeManager.js';
import { MistakesUI } from './mistakes_ui.js';
import { MistakesEvents } from './mistakes_events.js';
import { MistakeStatistics } from './statistics.js';

export async function initializeMistakesApp() {
    console.log("Initializing Mistakes Management System...");

    // 1. 初始化UI和统计模块 (无依赖)
    const ui = new MistakesUI();
    const stats = new MistakeStatistics(ui);
    
    // 2. 初始化数据管理器 (有异步操作)
    const manager = new MistakeManager();
    await manager.initialize();

    // 3. 初始化事件处理器 (依赖 manager, ui, stats)
    const events = new MistakesEvents(manager, ui, stats);
    
    // 4. 执行首次渲染
    const initialSubject = Object.keys(manager.getTaxonomy())[0] || 'all';
    events.filters.subject = initialSubject;
    ui.renderFilters(manager.getTaxonomy(), initialSubject);
    
    // 5. 启动事件监听
    events.init();

    console.log("Mistakes Management System is ready.");
}