// src/agent/components/HistoryPanelComponent.js
import { renderRichContent } from '../../common/renderingService.js';
import { escapeHTML } from '../../common/utils.js';

export class HistoryPanelComponent {
    constructor(store) {
        this.store = store;
        this.dom = {
            content: document.getElementById('agent_historyContent'),
            chatInputArea: document.getElementById('agent_chatInputArea'),
            // [新增] 对话导航按钮
            chatNavUp: document.getElementById('agent_chatNavUp'),
            chatNavDown: document.getElementById('agent_chatNavDown'),
        };
        // [新增] 组件内部状态，用于导航
        this.turnElements = [];
        this.currentTurnIndex = -1;
        
        this.store.subscribe(this.render.bind(this), ['history', 'currentTopicId', 'isAiThinking']);
        this.setupEventListeners();
    }

    // [新增] 设置事件监听器
    setupEventListeners() {
        this.dom.content.addEventListener('click', e => this.handleActionClick(e));
        this.dom.chatNavUp.addEventListener('click', () => this.navigateTurns(-1));
        this.dom.chatNavDown.addEventListener('click', () => this.navigateTurns(1));
    }

    // [新增] 处理消息操作按钮点击
    handleActionClick(e) {
        if (this.store.getState().isAiThinking) {
            alert("AI 正在思考中，请稍后再试。");
            return;
        }

        const actionBtn = e.target.closest('.history-action-btn');
        if (!actionBtn) return;
        
        const messageItem = actionBtn.closest('.history-item');
        const messageId = messageItem.dataset.messageId;

        if (actionBtn.classList.contains('delete-btn')) {
            if (confirm("确定要删除这组对话吗？")) {
                this.store.deleteMessagePair(messageId);
            }
        } else if (actionBtn.classList.contains('edit-btn')) {
            const currentContent = this.store.getState().history.find(h => h.id === messageId)?.content || '';
            const newContent = prompt("编辑你的消息:", currentContent);
            if (newContent && newContent.trim() !== currentContent) {
                if (confirm("编辑将删除此后的对话并重新生成回应，是否继续？")) {
                    this.store.editUserMessage(messageId, newContent.trim());
                }
            }
        } else if (actionBtn.classList.contains('regenerate-btn')) {
            if (confirm("确定要重新生成这条回应吗？")) {
                this.store.regenerateAssistantResponse(messageId);
            }
        }
    }

    async render(state, oldState = {}) {
        if (!state.currentTopicId) {
            this.dom.content.innerHTML = `<div class="no-history"><p>请选择或创建一个主题来开始聊天</p></div>`;
            this.dom.chatInputArea.style.display = 'none';
            return;
        }

        this.dom.chatInputArea.style.display = 'flex';
        const currentHistory = state.history.filter(h => h.topicId === state.currentTopicId)
            .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

        if (currentHistory.length === 0) {
            this.dom.content.innerHTML = `<div class="no-history"><p>这个主题还没有对话记录。</p></div>`;
            this.updateNavState(); // 更新导航按钮状态
            return;
        }
        
        const isScrolledToBottom = this.dom.content.scrollHeight - this.dom.content.clientHeight <= this.dom.content.scrollTop + 5;
        
        await this.updateMessageList(currentHistory);

        this.updateNavState(); // 更新导航按钮状态

        // Scroll management
        if (state.history.length > oldState.history?.length || isScrolledToBottom) {
            this.dom.content.scrollTop = this.dom.content.scrollHeight;
        } else if (state.currentTopicId !== oldState.currentTopicId) {
            this.dom.content.scrollTop = state.topicScrollPositions[state.currentTopicId] || 0;
            this.currentTurnIndex = -1; // 重置导航索引
        }
    }
    
    async updateMessageList(messages) {
        const messageIdsOnScreen = new Set();
        for (const message of messages) {
            let item = this.dom.content.querySelector(`[data-message-id="${message.id}"]`);
            if (!item) {
                item = document.createElement('div');
                item.dataset.messageId = message.id;
                this.dom.content.appendChild(item);
            }
            await this.renderMessageItem(item, message);
            messageIdsOnScreen.add(message.id);
        }
        
        // Remove deleted messages
        this.dom.content.querySelectorAll('.history-item').forEach(el => {
            if (!messageIdsOnScreen.has(el.dataset.messageId)) el.remove();
        });
    }

    async renderMessageItem(item, message) {
        item.className = `history-item role-${message.role}`;
        
        let contentHTML;
        if (message.status === 'streaming') {
            contentHTML = `<div class="streaming-content-container"><p><i class="fas fa-spinner fa-pulse"></i> ${escapeHTML(message.content)}</p></div>`;
        } else {
            let markdownText = message.content || '';
            if (message.role === 'assistant' && message.reasoning) {
                const thinkingBlock = `<details class="thinking-block"><summary>AI 思考过程</summary><pre><code>${escapeHTML(message.reasoning)}</code></pre></details>`;
                markdownText = thinkingBlock + markdownText;
            }
            contentHTML = await renderRichContent(null, markdownText);
        }
        
        item.innerHTML = `
            <div class="history-item-header">
                <span class="role ${message.role}">${message.role === 'user' ? '用户' : 'AI助手'}</span>
                <span>${new Date(message.timestamp).toLocaleString()}</span>
            </div>
            <div class="history-item-content">${contentHTML}</div>
            <div class="history-item-actions">
                <button class="history-action-btn regenerate-btn" title="重新生成" style="display: ${message.role === 'assistant' ? 'inline-flex' : 'none'};"><i class="fas fa-redo"></i></button>
                <button class="history-action-btn edit-btn" title="编辑并重新生成" style="display: ${message.role === 'user' ? 'inline-flex' : 'none'};"><i class="fas fa-edit"></i></button>
                <button class="history-action-btn delete-btn" title="删除"><i class="fas fa-trash"></i></button>
            </div>
        `;
    }

    // [新增] 更新导航按钮的可用状态
    updateNavState() {
        this.turnElements = Array.from(this.dom.content.querySelectorAll('.history-item.role-user'));
        const hasTurns = this.turnElements.length > 0;
        this.dom.chatNavUp.disabled = !hasTurns;
        this.dom.chatNavDown.disabled = !hasTurns;
        if (!hasTurns) {
            this.currentTurnIndex = -1;
        }
    }

    // [新增] 实现上下回合导航
    navigateTurns(direction) {
        if (this.turnElements.length === 0) return;

        // 移除旧的高亮
        this.dom.content.querySelectorAll('.highlighted').forEach(el => el.classList.remove('highlighted'));

        // 计算新索引
        if (this.currentTurnIndex === -1) {
             this.currentTurnIndex = (direction === 1) ? 0 : this.turnElements.length - 1;
        } else {
             this.currentTurnIndex = (this.currentTurnIndex + direction + this.turnElements.length) % this.turnElements.length;
        }

        const userTurnEl = this.turnElements[this.currentTurnIndex];
        if (userTurnEl) {
            userTurnEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            
            // 高亮当前回合（用户+AI）
            userTurnEl.classList.add('highlighted');
            const nextEl = userTurnEl.nextElementSibling;
            if (nextEl && nextEl.classList.contains('role-assistant')) {
                nextEl.classList.add('highlighted');
            }
        }
    }
}
