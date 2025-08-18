// src/main.js

// --- Core Imports ---
import * as dom from './common/dom.js';
import { appState, setState } from './common/state.js'; // 引入 setState 用于设置默认视图
import * as dataService from './services/dataService.js';

// --- ANKI Feature Imports ---
import { initializeAnkiApp } from './anki/anki_main.js';

// --- AGENT Feature Imports ---
import { initializeAgentApp } from './agent/agent_main.js';

// --- [ADDED] MISTAKES Feature Import ---
// Assuming a modular structure similar to other features
import { initializeMistakesApp } from './mistakes/mistakes_main.js';
// [新增] 引入 settings 模块的初始化函数
import { initializeSettingsApp } from './settings/settings_main.js';

// --- [新增] 状态管理，防止重复初始化 ---
const initializationState = {
    anki: false,
    mistakes: false,
    agent: false,
    settings: false,
};

/**
 * [重构后] 管理视图切换，并按需进行初始化。
 * @param {object|null} context - 传递给初始化函数的上下文 (主要用于settings)
 */
async function handleViewChange(context = null) {
    console.log('[ViewChange] Switching to view:', appState.activeView);

    // 隐藏所有视图和特定导航
    dom.ankiView.style.display = 'none';
    dom.agentView.style.display = 'none';
    dom.mistakesView.style.display = 'none';
    dom.settingsView.style.display = 'none';
    if (dom.agentNav) dom.agentNav.style.display = 'none';
    
    document.querySelectorAll('.app-nav-btn').forEach(btn => btn.classList.remove('active'));

    // 2. 根据 activeView 确定目标视图和按钮
    const viewName = appState.activeView || 'anki';
    const activeViewElement = dom[`${viewName}View`];
    const activeButtonElement = document.getElementById(`nav-${viewName === 'agent' ? 'agents' : viewName}`);

    // 3. [新增] 按需初始化逻辑
    if (!initializationState[viewName]) {
        console.log(`[Lazy Init] Initializing ${viewName} module for the first time.`);
        try {
            switch (viewName) {
                case 'anki': await initializeAnkiApp(); break;
                case 'agent': await initializeAgentApp(); break;
                case 'mistakes': await initializeMistakesApp(); break;
                case 'settings': initializeSettingsApp(context); break;
            }
            initializationState[viewName] = true;
        } catch (error) {
            console.error(`Failed to lazy-initialize ${viewName} view:`, error);
        }
    } else if (viewName === 'settings' && context) {
        // 特殊情况：如果 settings 视图已初始化，但需要根据新上下文更新
        console.log(`[Lazy Init] Re-initializing settings module with new context.`);
        initializeSettingsApp(context);
    }
    
    // 4. 显示目标视图和激活按钮
    if (activeViewElement) {
        activeViewElement.style.display = 'flex';
    }
    if (activeButtonElement) {
        activeButtonElement.classList.add('active');
    }

    if (viewName === 'agent' && dom.agentNav) {
        dom.agentNav.style.display = 'flex';
    }
}

/**
 * Sets up the top-level navigation that switches between application views.
 */
function setupAppNavigation() {
    const appNavContainer = document.querySelector('.app-nav');
    appNavContainer.addEventListener('click', (e) => {
        const button = e.target.closest('.app-nav-btn');
        if (!button) return;
        
        e.preventDefault();
        const targetView = button.dataset.view;
        if (!targetView) return;
        
        if (targetView !== appState.activeView) {
            dataService.switchView(targetView);
            handleViewChange();
        }
    });

    // [新增] 监听从其他模块发来的导航请求
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

/**
 * 设置自动持久化逻辑。
 */
function setupAutoPersistence() {
    window.addEventListener('beforeunload', () => dataService.persistAllAppState());
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
            dataService.persistAllAppState();
        }
    });
}

/**
 * [重构后] 封装应用初始化和重载的逻辑
 */
async function reinitializeAndRenderApp() {
    console.log("Re-initializing application state and UI...");
    document.body.classList.add('is-loading');

    try {
        await dataService.initializeApp();
        // [修复] 更新函数名
        await dataService.initializeSettingsData(); 

        // [修改] 重置所有模块的初始化状态
        Object.keys(initializationState).forEach(key => {
            initializationState[key] = false;
        });

        // [修改] 只重新初始化并显示当前活动的视图
        const viewToShow = appState.activeView || 'anki';
        setState({ activeView: viewToShow });
        await handleViewChange(); // `handleViewChange` 现在是异步的

        console.log("Application re-initialization successful.");
    } catch(error) {
        console.error("Failed to re-initialize the application:", error);
    } finally {
        document.body.classList.remove('is-loading');
    }
}

/**
 * [保留] 设置全局应用事件监听器
 */
function setupAppEventListeners() {
    window.addEventListener('app:dataImported', async () => {
        console.log("Event 'app:dataImported' received. Re-initializing app...");
        // 这里可以直接reload，因为数据已写入IndexedDB，更简单可靠
        alert("数据导入成功！应用将刷新以应用更改。");
        location.reload();
        // 或者使用 reinitializeAndRenderApp() 进行无刷新更新
        // await reinitializeAndRenderApp();
    });
}

/**
 * 应用主入口函数
 */
async function main() {
    document.body.classList.add('is-loading'); 
    
    try {
        // 1. 初始化核心数据服务 (串行)
        await dataService.initializeApp();
        // [修复] 更新函数名
        await dataService.initializeSettingsData(); 

        // 2. [修改] 不再并行初始化所有模块
        // await Promise.all([...]); // <--- 删除此块

        // 3. 设置顶层导航、持久化和全局事件监听
        setupAppNavigation();
        setupAutoPersistence();
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
        errorContainer.innerHTML = `...`; // 省略
        document.body.innerHTML = '';
        document.body.appendChild(errorContainer);
    } finally {
        document.body.classList.remove('is-loading');
    }
}

// Start the application
document.addEventListener('DOMContentLoaded', main);
