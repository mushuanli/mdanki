// src/settings/settings_dom.js
import { $id } from '../common/dom.js';

// 主布局元素
export const settingsView = $id('settings-view');
export const navList = $id('settings_navList');
export const detailTitle = $id('settings_detailTitle');
export const detailContent = $id('settings_detailContent');
export const saveBtn = $id('settings_saveBtn');

// “应用设置”面板中的元素
export const themeSelector = $id('settings_themeSelector');
export const autoSaveInput = $id('settings_autosaveInterval');
export const exportDbBtn = $id('settings_exportDbBtn');
export const importDbBtn = $id('settings_importDbBtn');
export const importFileInput = $id('settings_importFileInput');

// 动态表单模板
export const layoutTemplate = $id('settings_layoutTemplate');
export const generalFormTemplate = $id('settings_generalFormTemplate');
export const apiConfigFormTemplate = $id('settings_apiConfigFormTemplate');
export const agentFormTemplate = $id('settings_agentFormTemplate');

// 动态表单的 ID (用于获取表单)
export const DYNAMIC_FORM_IDS = {
    apiConfig: 'settings_apiConfigFormDynamic',
    agent: 'settings_agentFormDynamic'
};