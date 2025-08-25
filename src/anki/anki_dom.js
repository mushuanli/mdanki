// src/anki/anki_dom.js

import { $, $id } from '../common/dom.js';

// 缓存DOM元素引用
const elementsCache = {};

// DOM元素定义
const elementDefinitions = {
    editor: () => $id('anki_editor'),
    preview: () => $id('anki_preview'),
    sessionList: () => $id('anki_sessionList'),
    emptySession: () => $id('anki_emptySession'),
    currentFolderContainer: () => $id('anki_currentFolderContainer'),
    fileInput: () => $id('anki_fileInput'),
    newFileBtn: () => $id('anki_newFileBtn'),
    newFolderBtn: () => $id('anki_newFolderBtn'),
    openFileBtn: () => $id('anki_openFileBtn'),
    saveBtn: () => $id('anki_saveBtn'),
    exportFileBtn: () => $id('anki_exportFileBtn'),
    printPreviewBtn: () => $id('anki_printPreviewBtn'),
    deleteSelectedBtn: () => $id('anki_deleteSelectedBtn'),
    moveSelectedBtn: () => $id('anki_moveSelectedBtn'),
    toggleSessionBtn: () => $id('anki_toggleSessionBtn'),
    toggleEditorBtn: () => $id('anki_toggleEditorBtn'),
    clozeBtn: () => $id('anki_clozeBtn'),
    boldBtn: () => $id('anki_boldBtn'),
    italicBtn: () => $id('anki_italicBtn'),
    codeBtn: () => $id('anki_codeBtn'),
    linkBtn: () => $id('anki_linkBtn'),
    audioBtn: () => $id('anki_audioBtn'),
    insertLinebreakBtn: () => $id('anki_insertLinebreakBtn'),
    sessionSidebar: () => $('#anki-view .anki_session-sidebar'),
    editorPreviewPanel: () => $id('anki_editorPreviewPanel'),
    selectAllCheckbox: () => $id('anki_selectAllCheckbox'),
    moveModal: () => $id('anki_moveModal'),
    folderList: () => $id('anki_folderList'),
    closeMoveModalBtn: () => $id('anki_closeMoveModalBtn'),
    confirmMoveBtn: () => $id('anki_confirmMoveBtn'),
    cancelMoveBtn: () => $id('anki_cancelMoveBtn'),
    audioControls: () => $id('anki_audioControls'),
    audioTitle: () => $id('anki_audioTitle'),
    audioProgress: () => $id('anki_audioProgressBar'),
    playBtn: () => $id('anki_playBtn'),
    pauseBtn: () => $id('anki_pauseBtn'),
    stopBtn: () => $id('anki_stopBtn'),
    sessionTitleContainer: () => $id('anki_sessionTitleContainer'),
    toggleVisibilityClozeBtn: () => $id('anki_toggleVisibilityClozeBtn'),
    invertClozeBtn: () => $id('anki_invertClozeBtn'),
    toggleEditPreviewBtn: () => $id('anki_toggleEditPreviewBtn'),
    editModeDot: () => $id('anki_editModeDot'),
    previewModeDot: () => $id('anki_previewModeDot'),
    reviewCount: () => $id('anki_reviewCount'),
    startReviewBtn: () => $id('anki_startReviewBtn'),
    reviewOptionsBtn: () => $id('anki_reviewOptionsBtn'),
    reviewDropdownMenu: () => $id('anki_reviewDropdownMenu'),
    customStudyBtn: () => $id('anki_customStudyBtn'),
    showStatsBtn: () => $id('anki_showStatsBtn'),
    customStudyModal: () => $id('anki_customStudyModal'),
    customStudyCloseBtn: () => $id('anki_customStudyCloseBtn'),
    customStudyCancelBtn: () => $id('anki_customStudyCancelBtn'),
    customStudyForm: () => $id('anki_customStudyForm'),
    filterByFile: () => $id('anki_filterByFile'),
    filterByLastReview: () => $id('anki_filterByLastReview'),
    maxCards: () => $id('anki_maxCards'),
    clozeNavUpBtn: () => $id('anki_clozeNavUpBtn'),
    clozeNavDownBtn: () => $id('anki_clozeNavDownBtn'),
    // [新增] 为 statsUI.js 添加元素定义
    statsModal: () => $id('anki_statsModal'),
    statsModalCloseBtn: () => $id('anki_statsModalCloseBtn'),
    statsChartCanvas: () => $id('anki_statsChart')
};

// 创建代理对象，延迟获取DOM元素
export const dom = new Proxy(elementsCache, {
    get(target, prop) {
        // 如果元素已在缓存中，直接返回
        if (target[prop] !== undefined) {
            return target[prop];
        }
        
        // 如果元素有定义，获取并缓存
        if (prop in elementDefinitions) {
            const element = elementDefinitions[prop]();
            if (!element && process.env.NODE_ENV === 'development') {
                console.warn(`DOM element not found: ${prop}`);
            }
            target[prop] = element;
            return element;
        }
        
        // 未定义的属性返回undefined
        return undefined;
    },
    
    set(target, prop, value) {
        target[prop] = value;
        return true;
    }
});

// 导出所有元素作为备用（不推荐直接使用）
export const {
    editor,
    preview,
    sessionList,
    emptySession,
    currentFolderContainer,
    fileInput,
    newFileBtn,
    newFolderBtn,
    openFileBtn,
    saveBtn,
    exportFileBtn,
    printPreviewBtn,
    deleteSelectedBtn,
    moveSelectedBtn,
    toggleSessionBtn,
    toggleEditorBtn,
    clozeBtn,
    boldBtn,
    italicBtn,
    codeBtn,
    linkBtn,
    audioBtn,
    insertLinebreakBtn,
    sessionSidebar,
    editorPreviewPanel,
    selectAllCheckbox,
    moveModal,
    folderList,
    closeMoveModalBtn,
    confirmMoveBtn,
    cancelMoveBtn,
    audioControls,
    audioTitle,
    audioProgress,
    playBtn,
    pauseBtn,
    stopBtn,
    sessionTitleContainer,
    toggleVisibilityClozeBtn,
    invertClozeBtn,
    toggleEditPreviewBtn,
    editModeDot,
    previewModeDot,
    reviewCount,
    startReviewBtn,
    reviewOptionsBtn,
    reviewDropdownMenu,
    customStudyBtn,
    showStatsBtn,
    customStudyModal,
    customStudyCloseBtn,
    customStudyCancelBtn,
    customStudyForm,
    filterByFile,
    filterByLastReview,
    maxCards,
    clozeNavUpBtn,
    clozeNavDownBtn,
    // [新增] 导出 statsUI.js 的元素
    statsModal,
    statsModalCloseBtn,
    statsChartCanvas
} = dom;