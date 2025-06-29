// src/mistakes/mistakes_dom.js
import { $, $id } from '../common/dom.js';

// --- Main containers ---
export const mistakesView = $id('mistakes-view');
export const sidebar = $('#mistakes-view .session-sidebar');
export const mistakesList = $('#mistakes-view .session-list');
export const editorPanel = $id('mistake-editor-panel');
export const previewPanel = $('.preview-panel');

// --- Sidebar elements ---
export const subjectFilter = $id('subject-filter');
export const knowledgePointTags = $('#mistakes-view .tag-list'); // Assuming one for now
// TODO: Add selectors for other filter sections if needed

// --- Editor Panel elements ---
export const yamlEditor = $id('yaml-editor');
export const preview = $id('mistakes-preview');

// --- Header Buttons (unique IDs are crucial) ---
export const toggleSessionBtn = $id('mistakeToggleSessionBtn');
export const saveBtn = $id('mistakeSaveBtn');
export const exportBtn = $id('mistakeExportBtn');
export const collapseBtn = $id('mistakeCollapseBtn');

// --- Header Review Buttons ---
export const startReviewBtn = $id('mistakeStartReviewBtn');
export const reviewOptionsBtn = $id('mistakeReviewOptionsBtn');
export const reviewDropdownMenu = $id('mistakeReviewDropdownMenu');
export const customStudyBtn = $id('mistakeCustomStudyBtn');