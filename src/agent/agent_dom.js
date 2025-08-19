// src/agent/agent_dom.js

// [修复] 重新导出 common/dom 的所有内容，这样导入 agent_dom 的文件也能使用 $ 和 $id
export * from '../common/dom.js'; 

import { $ } from '../common/dom.js';

// Agent-specific elements
export const agentTopicsPanel = $('.agent-content-container .topics-panel');
export const agentHistoryPanel = $('.agent-content-container .history-panel');
export const agentTopicList = $('.agent-content-container .topic-list');
export const agentHistoryContent = $('.agent-content-container .history-content');

// --- Chat Input Area ---
export const chatInputArea = $('.chat-input-area');
export const chatInput = $('#chatInput');
export const sendMessageBtn = $('#sendMessageBtn');
export const attachFileBtn = $('#attachFileBtn');
export const attachmentInput = $('#attachmentInput');
export const attachmentPreviewContainer = $('#attachmentPreview');
