// src/task/task_dom.js

// 辅助函数，简化选择器
const $id = (id) => document.getElementById(id);
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => document.querySelectorAll(selector);

// 视图主容器
export const view = $id('task-view');

// 侧边栏和筛选器
export const sidebar = $id('task-view').querySelector('.task_session-sidebar');
export const subjectFilter = $id('task_subjectFilter');
export const tagFilterContainer = $id('task_tagFilterContainer');
export const reasonFilterContainer = $id('task_reasonFilterContainer');

// 列表和分页
export const listContainer = $id('task_list');
export const paginationContainer = $id('task_paginationContainer');

// 统计仪表盘
export const statsDashboard = $id('task_statsDashboard');

// 预览区
export const previewContainer = $id('task_previewContainer');
export const previewPanel = $id('task_previewPanel');

// 编辑器面板
export const editorPanel = $id('task_editorPanel');
export const yamlEditor = $id('task_yamlEditor');

// 头部/面板按钮
export const toggleSessionBtn = $id('task_toggleSessionBtn');
export const saveBtn = $id('task_saveBtn');
export const exportBtn = $id('task_exportBtn');
export const collapseBtn = $id('task_collapseBtn');
export const refreshBtn = $id('task_refreshBtn');
export const loadYamlBtn = $id('task_loadYamlBtn');
export const yamlFileInput = $id('task_yamlFileInput');
export const newFileBtn = $id('task_newFileBtn');

// 待办相关按钮
export const startReviewBtn = $id('task_startReviewBtn');