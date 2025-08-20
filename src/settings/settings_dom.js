// src/settings/settings_dom.js

import { $id } from '../common/dom.js';

// 缓存DOM元素引用
const elementsCache = {};

// 动态表单的 ID (保持不变，用于构建元素定义)
export const DYNAMIC_FORM_IDS = {
    apiConfig: 'settings_apiConfigFormDynamic',
    agent: 'settings_agentFormDynamic'
};

// DOM元素定义 (替换 SettingsDom 类)
const elementDefinitions = {
    // 主布局元素
    settingsView: () => $id('settings-view'),
    navList: () => $id('settings_navList'),
    detailTitle: () => $id('settings_detailTitle'),
    detailContent: () => $id('settings_detailContent'),
    saveBtn: () => $id('settings_saveBtn'),

    // “应用设置”面板中的元素
    themeSelector: () => $id('settings_themeSelector'),
    autoSaveInput: () => $id('settings_autosaveInterval'),
    exportDbBtn: () => $id('settings_exportDbBtn'),
    importDbBtn: () => $id('settings_importDbBtn'),
    importFileInput: () => $id('settings_importFileInput'),

    // [新增] 动态表单元素，实现完全统一访问
    apiConfigForm: () => $id(DYNAMIC_FORM_IDS.apiConfig),
    agentForm: () => $id(DYNAMIC_FORM_IDS.agent)
};

// 创建代理对象，延迟获取DOM元素
export const dom = new Proxy(elementsCache, {
    get(target, prop) {
        if (target[prop] !== undefined) {
            return target[prop];
        }
        if (prop in elementDefinitions) {
            const element = elementDefinitions[prop]();
            if (!element && process.env.NODE_ENV === 'development') {
                console.warn(`[Settings] DOM element not found: ${prop}`);
            }
            target[prop] = element;
            return element;
        }
        return undefined;
    },
    set(target, prop, value) {
        target[prop] = value;
        return true;
    }
});

// 模板元素可以在模块加载时立即获取，因为 <template> 标签本身存在于主HTML中
export const layoutTemplate = $id('settings_layoutTemplate');
export const generalFormTemplate = $id('settings_generalFormTemplate');
export const apiConfigFormTemplate = $id('settings_apiConfigFormTemplate');
export const agentFormTemplate = $id('settings_agentFormTemplate');
