// src/agent/agent_main.js

import { DomElements } from './agent_dom.js'; // [新增] 导入 DomElements 类
import { setupAgentEventListeners, initAgentEvents } from './agent_events.js'; // [修改] 导入 init 函数
import { renderAgentView, initAgentUI } from './agent_ui.js'; // [修改] 导入 init 函数
import * as dataService from '../services/dataService.js';

/**
 * Initializes the entire AI Agent feature.
 * Loads data, renders the initial UI, and sets up event listeners.
 */
export async function initializeAgentApp() {
    console.log("Initializing AI Agent module UI...");
    
    // [修改] 调整初始化顺序，确保 DOM 引用在其他函数调用前就绪
    // 1. 创建 DOM 引用实例
    const dom = new DomElements();

    // 2. 初始化 UI 和 Events 模块，将 DOM 引用传递给它们
    initAgentUI(dom);
    initAgentEvents(dom);

    // 3. 现在可以安全地调用渲染和事件设置函数
    renderAgentView();
    setupAgentEventListeners();
}
