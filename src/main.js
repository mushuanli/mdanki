// src/main.js

// --- Core Imports ---
import * as dom from './common/dom.js';
import { appState } from './common/state.js';
import { connectToDatabase } from './common/db.js';
import * as dataService from './services/dataService.js';

// --- ANKI Feature Imports ---
import { initializeAnkiApp } from './anki/anki_main.js';

// --- AGENT Feature Imports ---
import { initializeAgentApp } from './agent/agent_main.js';

/**
 * Manages the visibility of the main application views based on appState.activeView.
 */
function handleViewChange() {
    const { activeView } = appState;
    const ankiNavBtn = document.getElementById('nav-anki-btn');
    const agentNavBtn = document.getElementById('nav-agent-btn');
    const agentNav = document.querySelector('.ai-agent-nav');

    if (activeView === 'anki') {
        dom.ankiView.style.display = 'flex';
        dom.agentView.style.display = 'none';
        agentNav.style.display = 'none'; // Hide agent-specific nav
        ankiNavBtn.classList.add('active');
        agentNavBtn.classList.remove('active');
    } else if (activeView === 'agent') {
        dom.ankiView.style.display = 'none';
        dom.agentView.style.display = 'flex';
        agentNav.style.display = 'flex'; // Show agent-specific nav
        ankiNavBtn.classList.remove('active');
        agentNavBtn.classList.add('active');
    }
}

/**
 * Sets up the top-level navigation that switches between Anki and Agent views.
 */
function setupAppNavigation() {
    const ankiNavBtn = document.getElementById('nav-anki-btn');
    const agentNavBtn = document.getElementById('nav-agent-btn');

    ankiNavBtn.addEventListener('click', () => {
        dataService.switchView('anki');
        handleViewChange();
    });

    agentNavBtn.addEventListener('click', () => {
        dataService.switchView('agent');
        handleViewChange();
    });
}

/**
 * The main entry point for the entire application.
 */
async function main() {
    document.body.classList.add('is-loading'); 
    
    try {
        // 1. Connect to DB (once for the whole app)
        await connectToDatabase();
        
        // 2. Initialize both features. They will load their own data.
        await Promise.all([
            initializeAnkiApp(),
            initializeAgentApp()
        ]);
        
        // 3. Setup top-level navigation and automatic persistence
        setupAppNavigation();
        window.addEventListener('beforeunload', () => {
            dataService.persistState();
            dataService.persistAgentState();
        });
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') {
                dataService.persistState();
                dataService.persistAgentState();
            }
        });

        // 4. Set the initial view (default to anki)
        dataService.switchView('anki');
        handleViewChange();

        console.log("Application initialized successfully.");

    } catch (error) {
        console.error("Application failed to initialize:", error);
        document.body.innerHTML = '<h1>应用程序加载失败</h1><p>无法连接到数据库或初始化模块。请检查控制台获取更多信息。</p>';
    } finally {
        document.body.classList.remove('is-loading');
    }
}

// Start the application
document.addEventListener('DOMContentLoaded', main);