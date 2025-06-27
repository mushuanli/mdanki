// src/agent_/agent_main.js

import { setupAgentEventListeners } from './agent_events.js';
import { renderAgentView } from './agent_ui.js';
import * as dataService from '../services/dataService.js';

/**
 * Initializes the entire AI Agent feature.
 * Loads data, renders the initial UI, and sets up event listeners.
 */
export async function initializeAgentApp() {
    console.log("Initializing AI Agent module...");
    await dataService.initializeAgentData();
    renderAgentView();
    setupAgentEventListeners();
}