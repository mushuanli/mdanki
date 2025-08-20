//src/anki/anki_ui.js
import * as dom from './anki_dom.js';
import * as dataService from '../services/dataService.js';
import { renderSessionList } from './sessionListUI.js';
import { renderBreadcrumbs } from './breadcrumbsUI.js';
import { updatePreview } from './previewUI.js';
import { anki_goBack, anki_goToFolder, anki_goToRoot } from './anki_events.js';

/**
 * A central function to update all major UI components for the Anki view.
 */
export function rerenderAnki() {
    // Render the list of files and folders
    renderSessionList();
    
    // Render the navigation breadcrumbs
    renderBreadcrumbs(anki_goBack, anki_goToFolder, anki_goToRoot);
    
    // Update the editor's content
    const currentSession = dataService.anki_getCurrentSession();
    const editorContent = currentSession ? currentSession.content : '';
    // Avoid resetting editor cursor if content hasn't changed
    if (dom.editor.value !== editorContent) {
        dom.editor.value = editorContent;
    }
    
    updatePreview();
}