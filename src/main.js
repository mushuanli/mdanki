// src/main.js

// --- Core Imports ---
import * as dom from './common/dom.js';
import { appState, setState } from './common/state.js';
import * as dataService from './services/dataService.js';

// 各模块的初始化函数
import { initializeAnkiApp } from './anki/anki_main.js';
import { initializeAgentApp } from './agent/agent_main.js';
import { initializeTaskApp } from './task/task_main.js'; // [重构]
import { initializeSettingsApp } from './settings/settings_main.js';

// --- [新增] 状态管理，防止重复初始化 ---
const initializationState = {
    anki: false,
    task: false, // [重构]
    agent: false,
    settings: false,
};

/**
 * [恢复] 管理视图切换，并按需进行初始化，增加了 context 参数处理
 * @param {object|null} context - 传递给初始化函数的上下文 (主要用于settings)
 */
async function handleViewChange(context = null) {
    console.log('[ViewChange] Switching to view:', appState.activeView);

    // 隐藏所有视图
    Object.values(dom.appViews).forEach(view => view.style.display = 'none');
    document.querySelectorAll('.app-nav-btn').forEach(btn => btn.classList.remove('active'));

    // 2. 根据 activeView 确定目标视图和按钮
    const viewName = appState.activeView || 'anki';
    const activeViewElement = dom.appViews[viewName];
    const activeButtonElement = document.getElementById(`nav-${viewName}`);

    // 3. [新增] 按需初始化逻辑
    if (!initializationState[viewName]) {
        console.log(`[Lazy Init] Initializing ${viewName} module...`);
        try {
            switch (viewName) {
                case 'anki': await initializeAnkiApp(); break;
                case 'agent': await initializeAgentApp(); break;
                case 'task': await initializeTaskApp(); break;
                // [恢复] settings 初始化时传递 context
                case 'settings': await initializeSettingsApp(context); break;
            }
            initializationState[viewName] = true;
        } catch (error) {
            console.error(`Failed to lazy-initialize ${viewName} view:`, error);
        }
    // [恢复] 增加对 settings 视图的特殊处理逻辑
    } else if (viewName === 'settings' && context) {
        console.log(`[Re-init] Re-initializing settings module with new context.`);
        await initializeSettingsApp(context);
    }
    
    // 4. 显示目标视图和激活按钮
    if (activeViewElement) {
        activeViewElement.style.display = 'flex';
        activeViewElement.classList.add('active'); // 使用类来控制显示
    }
    if (activeButtonElement) {
        activeButtonElement.classList.add('active');
    }

}

/**
 * Sets up the top-level navigation that switches between application views.
 */
function setupAppNavigation() {
    document.querySelector('.app-nav').addEventListener('click', (e) => {
        const button = e.target.closest('.app-nav-btn');
        if (!button) return;
        
        e.preventDefault();
        const targetView = button.dataset.view;
        if (targetView && targetView !== appState.activeView) {
            dataService.switchView(targetView);
            handleViewChange();
        }
    });

    // [恢复] 监听从其他模块发来的导航请求 ('app:navigateTo')
    window.addEventListener('app:navigateTo', (e) => {
        const { view, context } = e.detail;
        if (view && view !== appState.activeView) {
            dataService.switchView(view);
            handleViewChange(context);
        } else if (view && view === appState.activeView && context) {
            // 如果已经在目标视图，但有新的上下文，也需要处理
            handleViewChange(context);
        }
    });
}

function setupAutoPersistence() {
    let timerId = null;

    const setupTimer = () => {
        if (timerId) clearInterval(timerId);
        const interval = appState.settings?.autoSaveInterval;
        if (interval > 0) {
            timerId = setInterval(dataService.autoSave, interval * 60 * 1000);
            console.log(`Auto-save timer set for every ${interval} minutes.`);
        }
    };
    
    setupTimer(); // Initial setup

    // 监听状态变化（如果需要动态调整间隔）
    window.addEventListener('state-changed', (e) => {
        if (e.detail.settings && e.detail.settings.autoSaveInterval !== undefined) {
            setupTimer();
        }
    });

    window.addEventListener('beforeunload', () => dataService.persistAllAppState());
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
            dataService.persistAllAppState();
        }
    });
}

/**
 * [恢复] 增加了旧代码中的全局应用事件监听器
 */
function setupAppEventListeners() {
    window.addEventListener('app:dataImported', async () => {
        console.log("Event 'app:dataImported' received. Re-initializing app...");
        alert("数据导入成功！应用将刷新以应用更改。");
        location.reload();
    });
}

async function main() {
    document.body.classList.add('is-loading'); 
    
    try {
        // 1. Initialize core data services sequentially
        await dataService.initializeApp(); // Loads Anki core data
        await dataService.initializeAgentData(); // Loads Agent/Settings data

        // 2. Setup application shell functionalities
        setupAppNavigation();
        setupAutoPersistence();
        // [恢复] 调用全局事件监听设置函数
        setupAppEventListeners();

        // 4. [修改] 设置并按需初始化第一个视图
        const initialView = appState.activeView || 'anki';
        setState({ activeView: initialView });
        await handleViewChange(); // `handleViewChange` 现在负责初始化

        console.log("Application initialized successfully.");

    } catch (error) {
        console.error("Application failed to initialize:", error);
        // [保留] 友好的错误显示逻辑
        const errorContainer = document.createElement('div');
        errorContainer.className = 'error-overlay';
        errorContainer.innerHTML = `<h1>应用启动失败</h1><p>请检查控制台以获取详细信息。</p><pre>${error.stack}</pre>`;
        document.body.innerHTML = '';
        document.body.appendChild(errorContainer);
    } finally {
        document.body.classList.remove('is-loading');
    }
}

// Start the application
document.addEventListener('DOMContentLoaded', main);
