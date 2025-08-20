// src/task/task_main.js

import { TaskManager } from './taskManager.js';
import { TaskUI } from './task_ui.js';
import { TaskEvents } from './task_events.js';
import { TaskStatistics } from './task_statistics.js';

/**
 * [重构后] 初始化 Task 模块。
 * 这是从 main.js 调用的唯一函数。
 */
export async function initializeTaskApp() {
    console.log("Initializing Task Management System...");

    // 1. 初始化UI和统计模块 (无依赖)
    const ui = new TaskUI();
    const stats = new TaskStatistics(ui);
    
    // 2. 初始化数据管理器 (有异步操作)
    const manager = new TaskManager();
    await manager.initialize();

    // 3. 初始化事件处理器 (依赖 manager, ui, stats)
    const events = new TaskEvents(manager, ui, stats);
    
    // 4. 执行首次渲染
    const initialSubject = Object.keys(manager.getTaxonomy())[0] || 'all';
    events.filters.subject = initialSubject;
    ui.renderFilters(manager.getTaxonomy(), initialSubject);
    
    // 5. 启动事件监听
    events.init();

    console.log("Task Management System is ready.");
}