// src/agent/agent_dom.js
import { $ } from '../common/dom.js';

// Agent-specific elements
export const navAgentList = $('.ai-agent-nav .agent-list');
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
