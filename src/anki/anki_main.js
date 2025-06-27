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
    
    // The dataService's initializeApp loads Anki-specific data.
    await dataService.initializeApp();
    
    // Setup UI components that need to exist before the first render.
    createBackButton(handleGoBack);
    setupPreview();
    
    // Render the initial UI for the Anki feature.
    rerenderAnki();
    
    // Attach all event listeners for the Anki feature.
    setupAnkiEventListeners();
}