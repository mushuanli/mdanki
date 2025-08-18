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


/**
 * Manages the visibility of the main application views based on appState.activeView.
 */
function handleViewChange() {
    console.log('[ViewChange] Switching to view:', appState.activeView);

    // 隐藏所有视图和特定导航
    dom.ankiView.style.display = 'none';
    dom.agentView.style.display = 'none';
    dom.mistakesView.style.display = 'none';
    dom.settingsView.style.display = 'none';
    if (dom.agentNav) dom.agentNav.style.display = 'none';
    
    // 从所有主视图容器移除 active 类
    document.querySelectorAll('.main-layout').forEach(view => view.classList.remove('active'));

    // 重置所有导航按钮状态
    document.querySelectorAll('.app-nav-btn').forEach(btn => {
        btn.classList.remove('active');
    });

    let activeViewElement = null;
    let activeButtonElement = null;

    // 根据 activeView 显示对应视图和激活按钮
    switch (appState.activeView) {
        case 'anki':
            activeViewElement = dom.ankiView;
            activeButtonElement = document.getElementById('nav-anki');
            break;
        case 'agent':
            activeViewElement = dom.agentView;
            if (dom.agentNav) dom.agentNav.style.display = 'flex';
            activeButtonElement = document.getElementById('nav-agents');
            break;
        case 'mistakes':
            activeViewElement = dom.mistakesView;
            activeButtonElement = document.getElementById('nav-mistakes');
            break;
        case 'settings':
            activeViewElement = dom.settingsView;
            activeButtonElement = document.getElementById('nav-settings');
            break;
        default:
            console.warn(`Unknown view: ${appState.activeView}, defaulting to agent`);
            activeViewElement = dom.agentView;
            if (dom.agentNav) dom.agentNav.style.display = 'flex';
            activeButtonElement = document.getElementById('nav-agents');
            break;
    }

    if (activeViewElement) {
        activeViewElement.style.display = 'flex';
        activeViewElement.classList.add('active'); // 同时管理 active 类
    }
    if (activeButtonElement) {
        activeButtonElement.classList.add('active');
    }
}

/**
 * Sets up the top-level navigation that switches between application views.
 */
function setupAppNavigation() {
    const appNavContainer = document.querySelector('.app-nav');
    if (!appNavContainer) {
        console.error('App navigation container (.app-nav) not found!');
        return;
    }
    
    appNavContainer.addEventListener('click', (e) => {
        const button = e.target.closest('.app-nav-btn');
        if (!button) return;
        
        // 阻止默认的链接跳转行为
        e.preventDefault();
        
        // [修改后] 使用 data-view 属性来获取目标视图，更健壮
        const targetView = button.dataset.view;
        
        if (!targetView) {
            console.warn('Clicked navigation button is missing data-view attribute:', button);
            return;
        }
        
        console.log(`[Navigation] Switching to view: ${targetView}`);
        dataService.switchView(targetView);
        handleViewChange();
    });
}

/**
 * 设置自动持久化逻辑。
 */
function setupAutoPersistence() {
    // [修正] 使用统一的持久化函数
    window.addEventListener('beforeunload', () => {
        dataService.persistAllAppState();
    });
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
            dataService.persistAllAppState();
        }
    });
}

/**
 * [REFACTORED] 封装应用初始化和重载的逻辑
 */
async function reinitializeAndRenderApp() {
    console.log("Re-initializing application state and UI...");
    document.body.classList.add('is-loading');

    try {
        await dataService.initializeApp();
        await dataService.initializeAgentData();

        await Promise.all([
            initializeAnkiApp(),
            initializeAgentApp(),
            initializeMistakesApp(),
            initializeSettingsApp()
        ]);

        const viewToShow = appState.activeView || 'anki';
        setState({ activeView: viewToShow });
        handleViewChange();

        console.log("Application re-initialization successful.");
    } catch(error) {
        console.error("Failed to re-initialize the application:", error);
    } finally {
        document.body.classList.remove('is-loading');
    }
}

/**
 * [NEW] 设置全局应用事件监听器
 */
function setupAppEventListeners() {
    window.addEventListener('app:dataImported', async () => {
        console.log("Event 'app:dataImported' received. Re-initializing app...");
        await reinitializeAndRenderApp();
    });
}

/**
 * 应用主入口函数
 */
async function main() {
    document.body.classList.add('is-loading'); 
    
    try {
        // [修正] 移除对 connectToDatabase 的调用。

        // 1. 初始化核心数据服务 (加载Anki和Agent的核心数据到state)
        // 这一步是串行的，因为它为后续模块提供了基础数据。
        await dataService.initializeApp();
        await dataService.initializeAgentData();

        // 2. 并行初始化各个功能模块的UI和事件监听。
        // 这些模块现在可以安全地从 appState 中读取已加载的数据。
        await Promise.all([
            initializeAnkiApp(),
            initializeAgentApp(),
            initializeMistakesApp(),
            initializeSettingsApp() // [新增] 初始化设置模块
        ]);
        
        // 3. Setup top-level navigation and automatic persistence
        setupAppNavigation();
        setupAutoPersistence();
        setupAppEventListeners(); // ✨ 核心改动：设置全局事件监听

        // 4. 设置并显示初始视图
        // 如果 appState 中没有 activeView，则默认为 'anki'
        const initialView = appState.activeView || 'anki';
        setState({ activeView: initialView }); // 确保状态被设置
        handleViewChange();

        console.log("Application initialized successfully.");

    } catch (error) {
        console.error("Application failed to initialize:", error);
        // [优化] 在页面上显示更友好的错误信息
        const errorContainer = document.createElement('div');
        errorContainer.className = 'error-overlay';
        errorContainer.innerHTML = `
            <h1><i class="fas fa-exclamation-triangle"></i> 应用程序加载失败</h1>
            <p>无法初始化应用。这可能是由于数据库结构变更或数据损坏导致的。</p>
            <p><strong>错误详情:</strong> ${error.message}</p>
            <p><strong>建议操作:</strong> 尝试清除浏览器缓存和IndexedDB数据后刷新页面。如果问题仍然存在，请联系开发者。</p>
            <button onclick="location.reload()">重试</button>
        `;
        document.body.innerHTML = ''; // 清空body
        document.body.appendChild(errorContainer);
        document.body.classList.remove('is-loading');
    } finally {
        document.body.classList.remove('is-loading');
    }
}

// Start the application
document.addEventListener('DOMContentLoaded', main);
