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

// --- [ADDED] MISTAKES Feature Import ---
// Assuming a modular structure similar to other features
import { initializeMistakesApp } from './mistakes/mistakes_main.js';


/**
 * Manages the visibility of the main application views based on appState.activeView.
 */
function handleViewChange() {
    const { activeView } = appState;
    const ankiNavBtn = $id('nav-anki');
    const agentNavBtn = $id('nav-agents');
    const mistakesNavBtn = $id('nav-mistakes');
    
    // Hide all views first
    dom.ankiView.style.display = 'none';
    dom.agentView.style.display = 'none';
    dom.mistakesView.style.display = 'none'; // [ADDED] Hide mistakes view
    dom.agentNav.style.display = 'none'; // Agent-specific nav

    // Reset all buttons
    ankiNavBtn.classList.remove('active');
    agentNavBtn.classList.remove('active');
    mistakesNavBtn.classList.remove('active');

    // Show selected view
    if (activeView === 'anki') {
        dom.ankiView.style.display = 'flex';
        ankiNavBtn.classList.add('active');
    } else if (activeView === 'agent') {
        dom.agentView.style.display = 'flex';
        dom.agentNav.style.display = 'flex';
        agentNavBtn.classList.add('active');
    } else if (activeView === 'mistakes') {
        dom.mistakesView.style.display = 'flex';
        mistakesNavBtn.classList.add('active');
    }
}

/**
 * Sets up the top-level navigation that switches between Anki and Agent views.
 */
function setupAppNavigation() {
    const ankiNavBtn = $id('nav-anki');
    const agentNavBtn = $id('nav-agents');
    const mistakesNavBtn = $id('nav-mistakes'); // [ADDED] Get mistakes button

    ankiNavBtn.addEventListener('click', () => {
        dataService.switchView('anki');
        handleViewChange();
    });

    agentNavBtn.addEventListener('click', () => {
        dataService.switchView('agent');
        handleViewChange();
    });

    mistakesNavBtn.addEventListener('click', () => {
        dataService.switchView('mistakes');
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
        
        // 2. Initialize all features in parallel.
        //    They will load their own data.
        await Promise.all([
            initializeAnkiApp(),
            initializeAgentApp(),
            initializeMistakesApp() // [ADDED] Initialize the mistakes module
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
        dataService.switchView(appState.activeView || 'anki');
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

// Helper function for getting elements by ID, used for clarity
function $id(id) {
    return document.getElementById(id);
}