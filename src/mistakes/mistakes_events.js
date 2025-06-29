// src/mistakes/mistakes_events.js

import * as dom from './mistakes_dom.js';
// Note: We might need a separate state management for mistakes if it becomes complex
// For now, we assume a global state or a dedicated mistakes state module.
import { appState, setState } from '../common/state.js'; 

// --- Data & UI Services (To be created or adapted) ---
// TODO: Create a dedicated mistakesDataService to handle CRUD for mistakes.
// import * as mistakesDataService from '../services/mistakesDataService.js';
// TODO: Create a dedicated mistakes_ui.js to handle rendering logic.
// import { rerenderMistakes } from './mistakes_ui.js';

// ===================================================================
//                        EVENT HANDLERS
// ===================================================================

/**
 * Handles toggling the visibility of the mistakes sidebar.
 */
function handleToggleSidebar() {
    dom.sidebar.classList.toggle('hidden-session');
    const isHidden = dom.sidebar.classList.contains('hidden-session');
    dom.toggleSessionBtn.innerHTML = isHidden 
        ? '<i class="fas fa-arrow-right"></i>' 
        : '<i class="fas fa-bars"></i>';
}

/**
 * Handles saving the current mistake data from the YAML editor.
 */
async function handleSaveMistake() {
    const yamlContent = dom.yamlEditor.value;
    console.log("Saving mistake...");
    
    // TODO: Implement the data saving logic
    // const result = await mistakesDataService.saveCurrentMistake(yamlContent);
    // if (result.success) {
    //     dom.saveBtn.innerHTML = '<i class="fas fa-check"></i> 已保存';
    //     setTimeout(() => dom.saveBtn.innerHTML = '<i class="fas fa-save"></i>', 2000);
    //     rerenderMistakes(); // Update UI, e.g., the mistakes list
    // } else {
    //     alert(`保存失败: ${result.error}`);
    // }
    
    // Placeholder alert
    alert('保存功能待实现！\n内容:\n' + yamlContent.substring(0, 200) + '...');
}

/**
 * Handles exporting the current mistake's YAML content as a file.
 */
function handleExportMistake() {
    const content = dom.yamlEditor.value;
    const blob = new Blob([content], { type: 'text/yaml;charset=utf-8' });
    
    let fileName = 'mistake.yml';
    try {
        const titleMatch = content.match(/title:\s*["']?(.*?)["']?\s*\n/);
        if (titleMatch && titleMatch[1]) {
            fileName = `${titleMatch[1].replace(/[\/\\?%*:|"<>]/g, '-')}.yml`;
        }
    } catch (e) { /* Fallback to default name if parsing fails */ }
    
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

/**
 * Handles collapsing and expanding the editor panel.
 */
function handleCollapseEditor() {
    dom.editorPanel.classList.toggle('collapsed');
    const isCollapsed = dom.editorPanel.classList.contains('collapsed');
    const icon = dom.collapseBtn.querySelector('i');
    
    if (isCollapsed) {
        icon.classList.remove('fa-chevron-up');
        icon.classList.add('fa-chevron-down');
        dom.collapseBtn.title = "展开编辑器";
        handleSaveMistake(); // Good practice to save when collapsing
    } else {
        icon.classList.remove('fa-chevron-down');
        icon.classList.add('fa-chevron-up');
        dom.collapseBtn.title = "收起编辑器";
    }
}

/**
 * Handles editor input to trigger a debounced preview update.
 */
function handleEditorInput() {
    clearTimeout(window.mistakePreviewDebounce);
    window.mistakePreviewDebounce = setTimeout(() => {
        // TODO: Implement the function to update the mistake preview from YAML
        // updateMistakePreview(dom.yamlEditor.value);
        console.log("Debounced: Time to update mistake preview.");
    }, 400);
}

/**
 * Handles clicks within the mistakes list to select a mistake.
 * @param {Event} e - The click event.
 */
function handleMistakeListClick(e) {
    const item = e.target.closest('.mistake-item');
    if (!item) return;

    const mistakeId = item.dataset.id; // Assuming each item has a data-id
    
    // TODO: Implement logic to select a mistake
    // mistakesDataService.selectMistake(mistakeId);
    // rerenderMistakes();
    
    console.log(`Mistake with ID: ${mistakeId} clicked. (Selection logic to be implemented)`);
}

/**
 * Placeholder for starting a review session for mistakes.
 */
function handleStartReview() {
    // TODO: Implement the mistake review logic.
    // This could involve:
    // 1. Collecting all mistakes or filtering them.
    // 2. Converting them into a format the review session manager understands.
    // 3. Calling a generalized `startReviewSession` function.
    alert('错题本复习功能待实现！');
}


// ===================================================================
//                   MAIN EVENT LISTENER SETUP
// ===================================================================

/**
 * Attaches all event listeners for the mistakes view.
 * This function should be called once when the application initializes.
 */
export function setupMistakesEventListeners() {
    console.log("Setting up event listeners for Mistakes module...");

    // --- Header Buttons ---
    dom.toggleSessionBtn?.addEventListener('click', handleToggleSidebar);
    dom.saveBtn?.addEventListener('click', handleSaveMistake);
    dom.exportBtn?.addEventListener('click', handleExportMistake);
    dom.collapseBtn?.addEventListener('click', handleCollapseEditor);
    
    // --- Editor ---
    dom.yamlEditor?.addEventListener('input', handleEditorInput);

    // --- Sidebar (Filters) ---
    dom.mistakesList?.addEventListener('click', handleMistakeListClick);
    
    // TODO: Add listeners for subject filter, tag clicks, etc.
    // dom.subjectFilter?.addEventListener('change', handleFilterChange);
    // dom.knowledgePointTags?.addEventListener('click', handleTagFilterClick);

    // --- Review Functionality ---
    dom.startReviewBtn?.addEventListener('click', handleStartReview);
    
    // TODO: Add event listeners for the custom review dropdown menu,
    // similar to the `setupReviewUIEventListeners` in anki_events.js.
    // This will involve handling the dropdown visibility and form submission.
    dom.reviewOptionsBtn?.addEventListener('click', () => {
        alert('自定义复习选项待实现！');
    });
}