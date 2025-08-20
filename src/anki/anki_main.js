// src/anki/anki_main.js

import { setupAnkiEventListeners, anki_goBack } from './anki_events.js'; // [FIXED] 导入 anki_goBack
import { rerenderAnki } from './anki_ui.js';
import * as dataService from '../services/dataService.js';
import { createBackButton } from './breadcrumbsUI.js'; // [RESTORED] 导入 createBackButton
import { setupPreview } from './previewUI.js'; // [RESTORED] 导入 setupPreview

/**
 * Initializes the Anki feature module.
 * It loads data via the dataService, sets up UI components,
 * renders the initial view, and attaches event listeners.
 */
export async function initializeAnkiApp() {
    console.log("Initializing Anki module...");
    
    // [RESTORED] 确保数据已加载，使模块自包含
    await dataService.initializeApp();

    // Initialize Mermaid.js for diagrams
    if (window.mermaid) {
        mermaid.initialize({
            startOnLoad: false,
            theme: 'neutral',
            securityLevel: 'loose'
        });
    }

    // [RESTORED] 设置需要在首次渲染前就位的UI组件
    createBackButton(anki_goBack);
    setupPreview();

    // 更新Anki特有的UI元素
    await dataService.anki_updateTodaysReviewCountUI();
    
    // Render the initial UI for the Anki feature.
    rerenderAnki();
    
    // Attach all event listeners for the Anki feature.
    setupAnkiEventListeners();

    console.log("✅ Anki module initialized successfully.");
}