function $(selector) { return document.querySelector(selector); }
function $id(id) { return document.getElementById(id); }

// Export all needed DOM elements
export const editor = $id('editor');
export const preview = $id('preview');
export const sessionList = $id('sessionList');
export const emptySession = $id('emptySession');
export const currentFolderContainer = $id('currentFolderContainer');
export const fileInput = $id('fileInput');

// Buttons
export const newFileBtn = $id('newFileBtn');
export const newFolderBtn = $id('newFolderBtn');
export const openFileBtn = $id('openFileBtn');
export const saveBtn = $id('saveBtn');
export const exportFileBtn = $id('exportFileBtn');
export const deleteSelectedBtn = $id('deleteSelectedBtn');
export const moveSelectedBtn = $id('moveSelectedBtn');
export const helpBtn = $id('helpBtn');

// Toolbar Buttons
export const toggleSessionBtn = $id('toggleSessionBtn');
export const toggleEditorBtn = $id('toggleEditorBtn');
export const clozeBtn = $id('clozeBtn');
export const boldBtn = $id('boldBtn');
export const italicBtn = $id('italicBtn');
export const codeBtn = $id('codeBtn');
export const linkBtn = $id('linkBtn');
export const audioBtn = $id('audioBtn');

// Panels & Sidebars
export const sessionSidebar = $('.session-sidebar');
export const editorPanel = $id('editorPanel');

// Checkboxes
export const selectAllCheckbox = $id('selectAllCheckbox');

// Move Modal
export const moveModal = $id('moveModal');
export const folderList = $id('folderList');
export const closeMoveModalBtn = $id('closeMoveModalBtn');
export const confirmMoveBtn = $id('confirmMoveBtn');
export const cancelMoveBtn = $id('cancelMoveBtn');

// Audio Controls
export const audioControls = $id('audioControls');
export const audioTitle = $id('audioTitle');
export const audioProgress = $id('audioProgress');
export const playBtn = $id('playBtn');
export const pauseBtn = $id('pauseBtn');
export const stopBtn = $id('stopBtn');

// Special elements
export const sessionTitleContainer = $('.session-title');
export const instructionsSection = $('.instructions');

export const toggleVisibilityClozeBtn = $id('toggleVisibilityClozeBtn');
export const invertClozeBtn = $id('invertClozeBtn');