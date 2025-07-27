// src/anki/anki_main.js
import { createBackButton } from './breadcrumbsUI.js';
import { setupPreview } from './previewUI.js';
import { setupAnkiEventListeners, handleGoBack } from './anki_events.js';
import * as dataService from '../services/dataService.js';
import { rerenderAnki } from './anki_ui.js';

/**
 * Initializes the Anki feature module.
 * It loads data via the dataService, sets up UI components,
 * renders the initial view, and attaches event listeners.
 */
export async function initializeAnkiApp() {
    console.log("Initializing Anki module...");
    
    // [NEW] Initialize Mermaid.js
    if (window.mermaid) {
        mermaid.initialize({
            startOnLoad: false, // We will manually trigger rendering
            theme: 'neutral',   // Or 'default', 'dark', 'forest'
            securityLevel: 'loose'
        });
    }

    // The dataService's initializeApp loads Anki-specific data.
    await dataService.initializeApp();
        // [新增] 初始化时更新一次今日复习计数
    await dataService.updateTodaysReviewCountUI();
    
    // Setup UI components that need to exist before the first render.
    createBackButton(handleGoBack);
    setupPreview();
    
    // Render the initial UI for the Anki feature.
    rerenderAnki();
    
    // Attach all event listeners for the Anki feature.
    setupAnkiEventListeners();
}