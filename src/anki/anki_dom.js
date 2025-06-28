// src/anki/anki_dom.js
import { $, $id } from '../common/dom.js';

// Anki-specific elements
export const editor = $id('editor');
export const preview = $id('preview');
export const sessionList = $id('sessionList');
export const emptySession = $id('emptySession');
export const currentFolderContainer = $id('currentFolderContainer');
export const fileInput = $id('fileInput');
export const newFileBtn = $id('newFileBtn');
export const newFolderBtn = $id('newFolderBtn');
export const openFileBtn = $id('openFileBtn');
export const saveBtn = $id('saveBtn');
export const exportFileBtn = $id('exportFileBtn');
export const deleteSelectedBtn = $id('deleteSelectedBtn');
export const moveSelectedBtn = $id('moveSelectedBtn');
export const helpBtn = $id('helpBtn');
export const toggleSessionBtn = $id('toggleSessionBtn');
export const toggleEditorBtn = $id('toggleEditorBtn');
export const clozeBtn = $id('clozeBtn');
export const boldBtn = $id('boldBtn');
export const italicBtn = $id('italicBtn');
export const codeBtn = $id('codeBtn');
export const linkBtn = $id('linkBtn');
export const audioBtn = $id('audioBtn');
// [MODIFIED] 导出新按钮的引用
export const insertLinebreakBtn = $id('insertLinebreakBtn');
export const sessionSidebar = $('.session-sidebar');
export const editorPanel = $id('editorPanel');
export const selectAllCheckbox = $id('selectAllCheckbox');
export const moveModal = $id('moveModal');
export const folderList = $id('folderList');
export const closeMoveModalBtn = $id('closeMoveModalBtn');
export const confirmMoveBtn = $id('confirmMoveBtn');
export const cancelMoveBtn = $id('cancelMoveBtn');
export const audioControls = $id('audioControls');
export const audioTitle = $id('audioTitle');
export const audioProgress = $id('audioProgress');
export const playBtn = $id('playBtn');
export const pauseBtn = $id('pauseBtn');
export const stopBtn = $id('stopBtn');
export const sessionTitleContainer = $('.session-title');
export const instructionsSection = $('.instructions');
export const toggleVisibilityClozeBtn = $id('toggleVisibilityClozeBtn');
export const invertClozeBtn = $id('invertClozeBtn');