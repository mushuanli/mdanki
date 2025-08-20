// src/anki/anki_dom.js

import { $, $id } from '../common/dom.js';

// Anki-specific elements with 'anki_' prefix
export const editor = $id('anki_editor');
export const preview = $id('anki_preview');
export const sessionList = $id('anki_sessionList');
export const emptySession = $id('anki_emptySession');
export const currentFolderContainer = $id('anki_currentFolderContainer');
export const fileInput = $id('anki_fileInput'); // Note: HTML might not have this ID yet, assuming it will be added
export const newFileBtn = $id('anki_newFileBtn');
export const newFolderBtn = $id('anki_newFolderBtn');
export const openFileBtn = $id('anki_openFileBtn');
export const saveBtn = $id('anki_saveBtn');
export const exportFileBtn = $id('anki_exportFileBtn');
export const printPreviewBtn = $id('anki_printPreviewBtn');
export const deleteSelectedBtn = $id('anki_deleteSelectedBtn');
export const moveSelectedBtn = $id('anki_moveSelectedBtn');
export const toggleSessionBtn = $id('anki_toggleSessionBtn');
export const toggleEditorBtn = $id('anki_toggleEditorBtn');
export const clozeBtn = $id('anki_clozeBtn');
export const boldBtn = $id('anki_boldBtn');
export const italicBtn = $id('anki_italicBtn');
export const codeBtn = $id('anki_codeBtn');
export const linkBtn = $id('anki_linkBtn');
export const audioBtn = $id('anki_audioBtn');
export const insertLinebreakBtn = $id('anki_insertLinebreakBtn');

export const sessionSidebar = $('#anki-view .anki_session-sidebar');
export const editorPreviewPanel = $id('anki_editorPreviewPanel');
export const selectAllCheckbox = $id('anki_selectAllCheckbox');

// Modal elements
export const moveModal = $id('anki_moveModal');
export const folderList = $id('anki_folderList');
export const closeMoveModalBtn = $id('anki_closeMoveModalBtn');
export const confirmMoveBtn = $id('anki_confirmMoveBtn');
export const cancelMoveBtn = $id('anki_cancelMoveBtn');

// Audio controls
export const audioControls = $id('anki_audioControls');
export const audioTitle = $id('anki_audioTitle');
export const audioProgress = $id('anki_audioProgressBar');
export const playBtn = $id('anki_playBtn');
export const pauseBtn = $id('anki_pauseBtn');
export const stopBtn = $id('anki_stopBtn');

export const sessionTitleContainer = $id('anki_sessionTitleContainer');
export const toggleVisibilityClozeBtn = $id('anki_toggleVisibilityClozeBtn');
export const invertClozeBtn = $id('anki_invertClozeBtn');

// Edit/Preview mode indicators
export const toggleEditPreviewBtn = $id('anki_toggleEditPreviewBtn');
export const editModeDot = $id('anki_editModeDot');
export const previewModeDot = $id('anki_previewModeDot');

// Review related elements
export const reviewCount = $id('anki_reviewCount');
export const startReviewBtn = $id('anki_startReviewBtn');
export const reviewOptionsBtn = $id('anki_reviewOptionsBtn');
export const reviewDropdownMenu = $id('anki_reviewDropdownMenu');
export const customStudyBtn = $id('anki_customStudyBtn');
export const showStatsBtn = $id('anki_showStatsBtn');

// [ADDED] Custom Study Modal elements
export const customStudyModal = $id('anki_customStudyModal');
export const customStudyCloseBtn = $id('anki_customStudyCloseBtn');
export const customStudyCancelBtn = $id('anki_customStudyCancelBtn');
export const customStudyForm = $id('anki_customStudyForm');
export const filterByFile = $id('anki_filterByFile');
export const filterByLastReview = $id('anki_filterByLastReview');
export const maxCards = $id('anki_maxCards');

// [ADDED] Cloze navigation buttons
export const clozeNavUpBtn = $id('anki_clozeNavUpBtn');
export const clozeNavDownBtn = $id('anki_clozeNavDownBtn');