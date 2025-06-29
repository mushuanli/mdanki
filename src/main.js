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


/**
 * Manages the visibility of the main application views based on appState.activeView.
 */
function handleViewChange() {
    // [调试] 打印当前要切换的视图
    console.log('[ViewChange] Attempting to switch to view:', appState.activeView);

    const { activeView } = appState;
    const navButtons = {
        anki: document.getElementById('nav-anki'),
        agent: document.getElementById('nav-agents'),
        mistakes: document.getElementById('nav-mistakes'),
    };

    // 隐藏所有视图和特定导航
    dom.ankiView.style.display = 'none';
    dom.agentView.style.display = 'none';
    dom.mistakesView.style.display = 'none';
    if (dom.agentNav) dom.agentNav.style.display = 'none';

    // 重置按钮状态
    Object.values(navButtons).forEach(btn => btn?.classList.remove('active'));

    // 根据 activeView 显示对应视图并激活按钮
    switch (activeView) {
        case 'anki':
            console.log('[ViewChange] Showing anki-view.');
            dom.ankiView.style.display = 'flex';
            navButtons.anki?.classList.add('active');
            break;
        case 'agent':
            console.log('[ViewChange] Showing agent-view.');
            dom.agentView.style.display = 'flex';
            if (dom.agentNav) {
                console.log('[ViewChange] Showing ai-agent-nav.');
                dom.agentNav.style.display = 'flex';
            } else {
                // [调试] 如果 agentNav 元素不存在，给出警告
                console.warn('[ViewChange] dom.agentNav element not found!');
            }
            navButtons.agent?.classList.add('active');
            break;
        case 'mistakes':
            console.log('[ViewChange] Showing mistakes-view.');
            dom.mistakesView.style.display = 'flex';
            navButtons.mistakes?.classList.add('active');
            break;
        default:
            console.log(`[ViewChange] Defaulting to anki-view because activeView is '${activeView}'.`);
            dom.ankiView.style.display = 'flex';
            navButtons.anki?.classList.add('active');
            break;
    }
}

/**
 * Sets up the top-level navigation that switches between Anki and Agent views.
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

        const targetView = button.dataset.target.replace('-view', '');
        
        // [调试] 打印点击事件和目标视图
        console.log(`[Navigation] Clicked button for view: '${targetView}'`);

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
 * 应用主入口函数。
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
            initializeMistakesApp() // [ADDED] Initialize the mistakes module
        ]);
        
        // 3. Setup top-level navigation and automatic persistence
        setupAppNavigation();
        setupAutoPersistence();

        // 4. 设置并显示初始视图
        // 如果 appState 中没有 activeView，则默认为 'mistakes'
        const initialView = appState.activeView || 'mistakes';
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
