//src/anki/anki_ui.js
import * as dom from './anki_dom.js';
import * as dataService from '../services/dataService.js';
import { renderSessionList } from './sessionListUI.js';
import { renderBreadcrumbs } from './breadcrumbsUI.js';
import { updatePreview } from './previewUI.js';
import { handleGoBack, handleGoToFolder, handleGoToRoot } from './anki_events.js'; // We will import from anki_events

/**
 * A central function to update all major UI components for the Anki view.
 */
export function rerenderAnki() {
    renderSessionList();
    renderBreadcrumbs(handleGoBack, handleGoToFolder, handleGoToRoot);
    
    const currentSession = dataService.getCurrentSession();
    const editorContent = currentSession ? currentSession.content : '';
    // Avoid resetting editor cursor if content hasn't changed
    if (dom.editor.value !== editorContent) {
        dom.editor.value = editorContent;
    }
    
    updatePreview();
}