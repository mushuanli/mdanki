// src/common/dom.js

export const $ = (selector) => document.querySelector(selector);
export const $id = (id) => document.getElementById(id);

// --- App-level Containers & Navigation ---
export const ankiView = $('.main-layout');
export const agentView = $('.agent-content-container');
export const agentNav = $('.ai-agent-nav');