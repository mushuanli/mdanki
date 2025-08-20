// src/agent/agent_dom.js

import { $, $id } from '../common/dom.js';

// 主视图容器
export const agentView = $id('agent-view');

// 侧边栏 (Topics Panel)
export const topicsPanel = $('.agent_topics-panel');
export const topicList = $id('agent_topicList');
export const toggleTopicsBtn = $id('agent_toggleTopicsBtn');
export const topicTagFilter = $id('agent_topicTagFilter');
export const editTopicBtn = $id('agent_editTopicBtn');
export const manageTopicsBtn = $id('agent_manageTopicsBtn');

// 批量操作栏
export const topicsBatchActions = $id('agent_topicsBatchActions');
export const selectAllTopicsBtn = $id('agent_selectAllTopicsBtn');
export const deleteSelectedTopicsBtn = $id('agent_deleteSelectedTopicsBtn');
export const cancelTopicSelectionBtn = $id('agent_cancelTopicSelectionBtn');

// 主内容面板 (History Panel)
export const historyPanel = $('.agent_history-panel');
export const historyContent = $id('agent_historyContent');
export const historyHeaderTitle = $id('agent_historyHeaderTitle');
export const historySearch = $id('agent_historySearch');
export const conversationRoleSelector = $id('agent_conversationRoleSelector');

// 聊天输入区域
export const chatInputArea = $id('agent_chatInputArea');
export const chatInput = $id('agent_chatInput');
export const sendMessageBtn = $id('agent_sendMessageBtn');
export const attachFileBtn = $id('agent_attachFileBtn');
export const attachmentInput = $id('agent_attachmentInput');
export const attachmentPreviewContainer = $id('agent_attachmentPreview');

// 聊天导航
export const chatNavUp = $id('agent_chatNavUp');
export const chatNavDown = $id('agent_chatNavDown');