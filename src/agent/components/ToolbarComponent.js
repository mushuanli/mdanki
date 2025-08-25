// src/agent/components/ToolbarComponent.js
import { escapeHTML } from '../../common/utils.js';

export class ToolbarComponent {
    constructor(store) {
        this.store = store;
        this.dom = {
            toggleTopicsBtn: document.getElementById('agent_toggleTopicsBtn'),
            editTopicBtn: document.getElementById('agent_editTopicBtn'),
            manageTopicsBtn: document.getElementById('agent_manageTopicsBtn'),
            historyHeaderTitle: document.getElementById('agent_historyHeaderTitle'),
            conversationRoleSelector: document.getElementById('agent_conversationRoleSelector'),
        };
        this.store.subscribe(this.render.bind(this), [
            'isTopicsPanelHidden', 'currentTopicId', 'topics', 
            'agents', 'currentConversationAgentId'
        ]);
        this.setupEventListeners();
    }

    setupEventListeners() {
        this.dom.toggleTopicsBtn.addEventListener('click', () => this.store.toggleTopicsPanel());
        this.dom.manageTopicsBtn.addEventListener('click', () => this.store.enterSelectionMode());
        this.dom.editTopicBtn.addEventListener('click', () => {
            const topic = this.store.getState().topics.find(t => t.id === this.store.getState().currentTopicId);
            const newName = prompt("请输入新的主题名称:", topic.title);
            if (newName && newName.trim() !== topic.title) {
                this.store.renameCurrentTopic(newName.trim());
            }
        });
        this.dom.conversationRoleSelector.addEventListener('change', (e) => {
            this.store.setConversationAgent(e.target.value || null);
        });
    }

    render(state) {
        // Toggle Button
        this.dom.toggleTopicsBtn.title = state.isTopicsPanelHidden ? "显示主题栏" : "隐藏主题栏";

        // Edit/Manage Buttons
        this.dom.editTopicBtn.style.display = state.currentTopicId ? 'block' : 'none';
        
        // Header Title
        if (state.currentTopicId) {
            const topic = state.topics.find(t => t.id === state.currentTopicId);
            this.dom.historyHeaderTitle.textContent = topic ? `${escapeHTML(topic.title)} - 对话记录` : '对话记录';
        } else {
            this.dom.historyHeaderTitle.textContent = '选择一个主题开始';
        }

        // Role Selector
        this.dom.conversationRoleSelector.innerHTML = `<option value="">默认 AI (无角色)</option>`;
        state.agents.forEach(agent => {
            const option = document.createElement('option');
            option.value = agent.id;
            option.textContent = agent.name;
            this.dom.conversationRoleSelector.appendChild(option);
        });
        this.dom.conversationRoleSelector.value = state.currentConversationAgentId || "";
    }
}
