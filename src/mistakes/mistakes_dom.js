// src/mistakes/mistakes_dom.js

// 辅助函数，简化选择器
const $id = (id) => document.getElementById(id);
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => document.querySelectorAll(selector);

// 视图主容器
export const mistakesView = $id('mistakes-view');

// 侧边栏和筛选器
export const sidebar = $('#mistakes-view .session-sidebar');
export const subjectFilter = $id('subject-filter');
export const tagFilterContainer = $('#mistakes-view .filter-group[data-type="tags"] .tag-list');
export const reasonFilterContainer = $('#mistakes-view .filter-group[data-type="reasons"] .tag-list');

// 列表和分页
export const mistakesListContainer = $id('mistakes-list');
export const paginationContainer = $('#mistakes-view .pagination');

// 内容预览区
export const previewContainer = $id('mistakes-preview');

// 编辑器面板
export const editorPanel = $id('mistake-editor-panel');
export const yamlEditor = $id('yaml-editor');

// 头部/面板按钮 (使用特定ID避免与Anki视图冲突)
export const toggleSessionBtn = $id('mistakeToggleSessionBtn');
export const saveBtn = $id('mistakeSaveBtn');
export const exportBtn = $id('mistakeExportBtn');
export const collapseBtn = $id('mistakeCollapseBtn');
export const refreshBtn = $id('refresh-mistakes-btn'); // 统一ID
export const loadYamlBtn = $id('load-yaml-btn');
export const yamlFileInput = $id('yaml-file-input');

export const newMistakeFileBtn = $id('newMistakeFileBtn'); 

// 复习相关按钮
export const startReviewBtn = $id('mistakeStartReviewBtn');
export const reviewOptionsBtn = $id('mistakeReviewOptionsBtn');
export const reviewDropdownMenu = $id('mistakeReviewDropdownMenu');