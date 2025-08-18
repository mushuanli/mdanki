// src/agent/agent_main.js

import { setupAgentEventListeners } from './agent_events.js';
import { renderAgentView } from './agent_ui.js';

/**
 * Initializes the entire AI Agent feature.
 * Loads data, renders the initial UI, and sets up event listeners.
 */
export async function initializeAgentApp() {
    console.log("Initializing AI Agent module UI...");
    
    // [删除] 数据加载步骤，因为它已在 main.js 中完成
    // await dataService.initializeAgentData(); // <--- REMOVED
    
    renderAgentView();
    setupAgentEventListeners();
}
