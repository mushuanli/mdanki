// src/agent/agent_dom.js

/**
 * [修改后]
 * 将所有 agent 模块的 DOM 元素选择逻辑封装在一个类中。
 * 这样可以推迟 DOM 查询，直到类的实例被创建，确保元素已存在。
 */
export class DomElements {
    constructor() {
        // 辅助函数，保持封装性
        const $ = (selector, context = document) => context.querySelector(selector);
        const $id = (id) => document.getElementById(id);

        // 主视图容器
        this.agentView = $id('agent-view');

        // 侧边栏 (Topics Panel)
        this.topicsPanel = $('.agent_topics-panel');
        this.topicList = $id('agent_topicList');
        this.toggleTopicsBtn = $id('agent_toggleTopicsBtn');
        this.topicTagFilter = $id('agent_topicTagFilter');
        this.editTopicBtn = $id('agent_editTopicBtn');
        this.manageTopicsBtn = $id('agent_manageTopicsBtn');

        // 批量操作栏
        this.topicsBatchActions = $id('agent_topicsBatchActions');
        this.selectAllTopicsBtn = $id('agent_selectAllTopicsBtn');
        this.deleteSelectedTopicsBtn = $id('agent_deleteSelectedTopicsBtn');
        this.cancelTopicSelectionBtn = $id('agent_cancelTopicSelectionBtn');

        // 主内容面板 (History Panel)
        this.historyPanel = $('.agent_history-panel');
        this.historyContent = $id('agent_historyContent');
        this.historyHeaderTitle = $id('agent_historyHeaderTitle');
        this.historySearch = $id('agent_historySearch');
        this.conversationRoleSelector = $id('agent_conversationRoleSelector');

        // 聊天输入区域
        this.chatInputArea = $id('agent_chatInputArea');
        this.chatInput = $id('agent_chatInput');
        this.sendMessageBtn = $id('agent_sendMessageBtn');
        this.attachFileBtn = $id('agent_attachFileBtn');
        this.attachmentInput = $id('agent_attachmentInput');
        this.attachmentPreviewContainer = $id('agent_attachmentPreview');

        // 聊天导航
        this.chatNavUp = $id('agent_chatNavUp');
        this.chatNavDown = $id('agent_chatNavDown');
    }
}