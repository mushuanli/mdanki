// src/agent/store/agentStore.js

import * as dataService from '../../services/dataService.js';
import * as llmService from '../../services/llm/llmService.js'; 
import { getDefaultApiPath } from '../../services/llm/llmProviders.js';
import { generateId } from '../../common/utils.js';

class AgentStore {
    constructor() {
        this.state = {
            // Data State
            apiConfigs: [],
            agents: [],
            topics: [],
            history: [],

            // UI State
            currentTopicId: null,
            currentConversationAgentId: null,
            topicScrollPositions: {},
            topicListFilterTag: 'all',

            // Transient State
            isAiThinking: false,
            isTopicsPanelHidden: false,
            isTopicSelectionMode: false,
            selectedTopicIds: new Set(),
        };
        this.listeners = new Set();
    }

    // --- Core Store Methods ---

    subscribe(listener, keysToWatch) {
        const enhancedListener = {
            callback: listener,
            keys: keysToWatch ? new Set(keysToWatch) : null,
        };
        this.listeners.add(enhancedListener);
        return () => this.listeners.delete(enhancedListener);
    }

    setState(updates) {
        const oldState = { ...this.state };
        const hasChanged = Object.keys(updates).some(key => this.state[key] !== updates[key]);
        if (!hasChanged && Object.keys(updates).length > 0) return;

        this.state = { ...this.state, ...updates };
        this.notify(oldState, this.state);
    }

    notify(oldState, newState) {
        const changedKeys = new Set();
        for (const key in newState) {
            if (oldState[key] !== newState[key]) changedKeys.add(key);
        }
        if (changedKeys.size === 0) return;

        this.listeners.forEach(listenerObj => {
            if (!listenerObj.keys || [...listenerObj.keys].some(key => changedKeys.has(key))) {
                listenerObj.callback(newState, oldState);
            }
        });
    }

    getState() {
        return { ...this.state };
    }

    // --- ACTIONS ---

    async initialize() {
        const agentData = await dataService.initializeAgentData();
        this.setState(agentData);
    }
    
    // --- Topic Management Actions ---
    
    async addTopic(title) {
      if (!title) return;
      const newTopic = await dataService.agent_addTopic(title, this.state.agents[0]?.id);

      // [新增] 检查 newTopic 是否成功创建
      if (newTopic) {
          this.setState({
              topics: [...this.state.topics, newTopic],
              currentTopicId: newTopic.id,
          });
      } else {
          // 可选：在这里可以添加错误提示
          console.error("Failed to add a new topic.");
      }
    }

    async selectTopic(topicId) {
        if (!topicId || topicId === this.state.currentTopicId) return;
        
        const historyContentEl = document.getElementById('agent_historyContent');
        const currentScrollTop = historyContentEl ? historyContentEl.scrollTop : 0;
        const newScrollPositions = { ...this.state.topicScrollPositions, [this.state.currentTopicId]: currentScrollTop };

      // 旧的、错误的调用
      // const { topic, lastConversationAgentId } = dataService.agent_getTopicDetails(topicId);

      // 新的、正确的调用
      const { topic, lastConversationAgentId } = dataService.agent_getTopicDetails(topicId, this.state);

      // 增加一个健壮性检查，防止在 topic 找不到时程序崩溃
      if (topic) {
        this.setState({
            currentTopicId: topic.id,
            currentConversationAgentId: lastConversationAgentId,
            topicScrollPositions: newScrollPositions,
        });
      } else {
          console.warn(`selectTopic: Topic with ID "${topicId}" not found.`);
      }
    }

    async renameCurrentTopic(newName) {
        const { currentTopicId } = this.state;
        if (!currentTopicId || !newName) return;
        const updatedTopic = await dataService.agent_updateTopic(currentTopicId, { title: newName });
        this.setState({
            topics: this.state.topics.map(t => t.id === currentTopicId ? updatedTopic : t),
        });
    }

    async deleteTopics(topicIds) {
        const idsToDelete = Array.isArray(topicIds) ? topicIds : Array.from(topicIds);
        if (idsToDelete.length === 0) return;

        const { remainingTopics, remainingHistory } = await dataService.agent_deleteTopics(idsToDelete);
        
        let newCurrentTopicId = this.state.currentTopicId;
        if (idsToDelete.includes(newCurrentTopicId)) {
            newCurrentTopicId = remainingTopics.length > 0 ? remainingTopics[0].id : null;
        }

        this.setState({
            topics: remainingTopics,
            history: remainingHistory,
            currentTopicId: newCurrentTopicId,
            isTopicSelectionMode: false,
            selectedTopicIds: new Set(),
        });
    }

    setTopicFilter(tag) {
        this.setState({ topicListFilterTag: tag });
    }

    // --- Topic Selection Mode Actions ---

    enterSelectionMode() {
        this.setState({ isTopicSelectionMode: true, selectedTopicIds: new Set() });
    }

    cancelSelectionMode() {
        this.setState({ isTopicSelectionMode: false, selectedTopicIds: new Set() });
    }

    toggleTopicSelection(topicId) {
        const newSelectedIds = new Set(this.state.selectedTopicIds);
        newSelectedIds.has(topicId) ? newSelectedIds.delete(topicId) : newSelectedIds.add(topicId);
        this.setState({ selectedTopicIds: newSelectedIds });
    }

    selectAllTopics() {
        const allVisibleTopicIds = dataService.agent_getFilteredTopics(this.state).map(t => t.id);
        const allSelected = allVisibleTopicIds.length > 0 && allVisibleTopicIds.length === this.state.selectedTopicIds.size;
        this.setState({
            selectedTopicIds: allSelected ? new Set() : new Set(allVisibleTopicIds),
        });
    }
    
    // --- Chat Actions ---

    async sendMessage(content, attachments) {
        const { currentTopicId, isAiThinking } = this.state;
        if (!currentTopicId || isAiThinking) return;

        const userMessage = await dataService.agent_addHistoryMessage(currentTopicId, 'user', content, attachments);
        this.setState({ history: [...this.state.history, userMessage] });

        const historyForAI = this.state.history.filter(h => h.topicId === currentTopicId && h.status !== 'streaming');
        await this._fetchAIResponse(historyForAI);
    }

    // [新增] 删除消息对
    async deleteMessagePair(messageId) {
        const allHistory = this.state.history;
        const message = allHistory.find(m => m.id === messageId);
        if (!message) return;
        
        const topicHistory = allHistory
            .filter(h => h.topicId === message.topicId)
            .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

        const msgIndex = topicHistory.findIndex(m => m.id === messageId);
        let idsToDelete = new Set([messageId]);

        if (message.role === 'user' && topicHistory[msgIndex + 1]?.role === 'assistant') {
            idsToDelete.add(topicHistory[msgIndex + 1].id);
        } else if (message.role === 'assistant' && topicHistory[msg-1]?.role === 'user') {
            idsToDelete.add(topicHistory[msgIndex-1].id);
        }

        const newHistory = allHistory.filter(h => !idsToDelete.has(h.id));
        await dataService.agent_deleteHistoryMessages(Array.from(idsToDelete));
        this.setState({ history: newHistory });
    }

    // [新增] 重新生成AI回复
    async regenerateAssistantResponse(assistantMessageId) {
        if (this.state.isAiThinking) return;
        const allHistory = this.state.history;
        const msgIndex = allHistory.findIndex(m => m.id === assistantMessageId);
        if (msgIndex === -1 || allHistory[msgIndex].role !== 'assistant') return;

        const topicId = allHistory[msgIndex].topicId;
        const truncatedHistory = allHistory.filter(m => m.id !== assistantMessageId);
        this.setState({ history: truncatedHistory });
        
        await dataService.agent_deleteHistoryMessages([assistantMessageId]);

        const historyForAI = truncatedHistory.filter(h => h.topicId === topicId && h.status !== 'streaming');
        await this._fetchAIResponse(historyForAI);
    }
    
    // [新增] 编辑用户消息并重新生成
    async editUserMessage(userMessageId, newContent) {
        if (this.state.isAiThinking) return;
        const allHistory = this.state.history;
        const msgIndex = allHistory.findIndex(m => m.id === userMessageId);
        if (msgIndex === -1 || allHistory[msgIndex].role !== 'user') return;

        const topicId = allHistory[msgIndex].topicId;
        
        const topicHistory = allHistory
            .filter(h => h.topicId === topicId)
            .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        const topicMsgIndex = topicHistory.findIndex(m => m.id === userMessageId);

        // 删除此消息之后的所有对话
        const idsToDelete = topicHistory.slice(topicMsgIndex + 1).map(m => m.id);
        await dataService.agent_deleteHistoryMessages(idsToDelete);

        // 更新用户消息并截断历史
        const updatedUserMessage = { ...allHistory[msgIndex], content: newContent };
        await dataService.agent_updateHistoryMessage(updatedUserMessage);
        
        const truncatedHistory = allHistory
            .filter(m => !idsToDelete.has(m.id))
            .map(m => m.id === userMessageId ? updatedUserMessage : m);
            
        this.setState({ history: truncatedHistory });
        
        const historyForAI = truncatedHistory.filter(h => h.topicId === topicId && h.status !== 'streaming');
        await this._fetchAIResponse(historyForAI);
    }

    // [新增] 内部辅助方法，用于执行AI请求
    async _fetchAIResponse(historyContext) {
        const { currentTopicId, currentConversationAgentId, apiConfigs, agents } = this.state;
        
        const llmConfig = dataService.agent_getLlmConfig(currentConversationAgentId, agents, apiConfigs);
        if (llmConfig.error) {
            alert(llmConfig.error);
            return;
        }
        
        this.setState({ isAiThinking: true });

        const aiMessageStub = await dataService.agent_addHistoryMessage(currentTopicId, 'assistant', '', [], 'streaming');
        this.setState({ history: [...this.state.history, aiMessageStub] });

        const agent = agents.find(a => a.id === currentConversationAgentId);
        const messagesToSendToAI = (agent && agent.sendHistory === false) ? historyContext.slice(-1) : historyContext;

        await llmService.streamChat(llmConfig, messagesToSendToAI, {
            onChunk: ({ type, text }) => {
                const currentHistory = this.state.history;
                const streamingMessage = currentHistory.find(m => m.id === aiMessageStub.id);
                if (streamingMessage) {
                    if (type === 'content') streamingMessage.content += text;
                    else if (type === 'thinking') streamingMessage.reasoning = (streamingMessage.reasoning || '') + text;
                    this.setState({ history: [...currentHistory] });
                }
            },
            onDone: async () => {
                const finalMessageState = this.state.history.find(m => m.id === aiMessageStub.id);
                if (finalMessageState) {
                    const finalMessage = { ...finalMessageState, status: 'completed' };
                    await dataService.agent_updateHistoryMessage(finalMessage);
                    this.setState({
                        history: this.state.history.map(msg => msg.id === aiMessageStub.id ? finalMessage : msg),
                        isAiThinking: false,
                    });
                }
            },
            onError: async (error) => {
                const errorText = `\n\n**错误:** ${error.message}`;
                const finalMessageState = this.state.history.find(m => m.id === aiMessageStub.id);
                if(finalMessageState) {
                    const finalMessage = { ...finalMessageState, content: finalMessageState.content + errorText, status: 'error' };
                    await dataService.agent_updateHistoryMessage(finalMessage);
                    this.setState({
                        history: this.state.history.map(msg => msg.id === aiMessageStub.id ? finalMessage : msg),
                        isAiThinking: false,
                    });
                }
            }
        });
    }

    // --- UI Actions ---
    toggleTopicsPanel() {
        this.setState({ isTopicsPanelHidden: !this.state.isTopicsPanelHidden });
    }

    async setConversationAgent(agentId) {
        const { currentTopicId, topics } = this.state;
        if (!currentTopicId) return;

        // 1. 立即更新UI状态，提供即时反馈
        this.setState({ currentConversationAgentId: agentId });

        // 2. 找到当前主题，并准备更新它
        const currentTopic = topics.find(t => t.id === currentTopicId);
        if (currentTopic && currentTopic.lastUsedAgentId !== agentId) {
        
            // 创建一个更新后的主题对象
            const updatedTopic = { ...currentTopic, lastUsedAgentId: agentId };

            // 3. 在后台异步更新数据库
            await dataService.agent_updateTopic(currentTopicId, { lastUsedAgentId: agentId });

            // 4. 更新Store中的topics数组，以保证状态一致性
            const newTopics = topics.map(t => t.id === currentTopicId ? updatedTopic : t);
        
            // 使用 setState 更新，但避免再次触发 currentConversationAgentId 的更新
            // 注意：这里我们只更新 topics 数组，因为 UI 状态已经提前更新了
            const oldState = { ...this.state };
            this.state.topics = newTopics;
            this.notify(oldState, this.state); // 手动通知，只针对 topics 的变化
        }
    }
}

export const agentStore = new AgentStore();
