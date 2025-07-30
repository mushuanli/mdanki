// src/common/dom.js

export const $ = (selector) => document.querySelector(selector);
export const $id = (id) => document.getElementById(id);

// --- App-level Containers & Navigation ---

// [MODIFIED] Using unique IDs for each main view container to avoid conflicts.
// Please ensure your HTML has these IDs on the corresponding containers.
// - Anki's <div class="main-layout"> should have id="anki-view"
// - Agent's <div class="agent-content-container"> should have id="agent-view"
// - Mistakes' <div id="mistakes-view"> is already correct
export const ankiView = $id('anki-view'); 
export const agentView = $id('agent-view');
export const mistakesView = $id('mistakes-view');
// [新增] 导出设置视图
export const settingsView = $id('settings-view');

export const agentNav = document.querySelector('.ai-agent-nav');
