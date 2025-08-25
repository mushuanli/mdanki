// src/task/components/PreviewComponent.js
import { renderRichContent } from '../../common/renderingService.js';

export class PreviewComponent {
    constructor(store) {
        this.store = store;
        this.dom = { container: document.getElementById('task_previewContainer') };
        // [修改] 订阅一个更复杂的处理器，而不仅仅是 render
        this.unsubscribe = store.subscribe(this.handleStateChange.bind(this), ['tasks', 'filters', 'currentPage', 'selectedTaskId']);
        this.setupEventListeners();
    }

    setupEventListeners() {
        this.dom.container.addEventListener('click', e => {
            const card = e.target.closest('.task-card');
            if (!card) return;
            if (e.target.matches('.show-answer-btn')) {
                card.querySelector('.answer-section').classList.remove('hidden');
                e.target.classList.add('hidden');
            }
            const reviewBtn = e.target.closest('.review-btn');
            if (reviewBtn) {
                this.store.rateTask(card.dataset.id, parseInt(reviewBtn.dataset.rating, 10));
            }
        });
    }

    // [新增] 状态变化处理器
    handleStateChange(newState, oldState) {
        // 1. 始终执行渲染
        this.render(newState);

        // 2. 检查 selectedTaskId 是否发生了变化，并触发高亮和滚动
        if (newState.selectedTaskId && newState.selectedTaskId !== oldState.selectedTaskId) {
            const card = this.dom.container.querySelector(`.task-card[data-id="${newState.selectedTaskId}"]`);
            if (card) {
                // 滚动到视图
                card.scrollIntoView({ behavior: 'smooth', block: 'center' });
                // 添加高亮效果，并在 1.5 秒后移除
                card.classList.add('highlight');
                setTimeout(() => card.classList.remove('highlight'), 1500);
            }
        }
    }

    // [修改] render 方法现在接收 state 作为参数，并且不再处理滚动逻辑
    render({ selectedTaskId }) {
        const tasks = this.store.getPagedTasks();
        // [修改] selectedTaskId 从参数中解构
        this.dom.container.innerHTML = tasks.map(task => this._createCardHTML(task, selectedTaskId)).join('');
        
        // Render markdown, math, and mermaid
        this.dom.container.querySelectorAll('.task-card').forEach(cardElement => {
            renderRichContent(cardElement.querySelector('.problem-content'), cardElement.dataset.problem);
            renderRichContent(cardElement.querySelector('.correct-answer .content'), cardElement.dataset.answer);
            renderRichContent(cardElement.querySelector('.correct-explanation .content'), cardElement.dataset.explanation);
        });
    }

    // [修改] _createCardHTML 方法现在也接收 selectedTaskId 以便列表项可以根据它来决定是否激活
    _createCardHTML(task, selectedTaskId) {
        // 虽然这个组件不渲染列表，但保持接口一致性是有益的。
        // 在 ListComponent 中，这个参数用于添加 'active' 类
        return `<div class="mistake-card task-card" data-id="${task.uuid}" 
            data-problem="${task.problem || ''}" data-answer="${task.correct_answer?.content || ''}" data-explanation="${task.correct_answer?.explanation || ''}">
            <div class="problem-section">
                <h4>${task.title}</h4>
                <div class="problem-meta"><span>原因: ${task.analysis.reason_for_error}</span><span>难度: ${'★'.repeat(task.analysis.difficulty)}${'☆'.repeat(5 - task.analysis.difficulty)}</span></div>
                <div class="problem-content"></div> <!-- Content rendered by renderRichContent -->
                ${task.attachments?.map(a => a.type === 'image' ? `<img src="${a.url}" class="problem-image">` : '').join('') || ''}
                <div class="problem-tags">${task.tags?.map(t => `<span class="tag">${t}</span>`).join('') || ''}</div>
                <div class="my-answer-preview"><strong>我的答案:</strong> ${task.my_answer?.content || '未作答'}</div>
                <button class="show-answer-btn">显示答案</button>
            </div>
            <div class="answer-section hidden">
                <div class="correct-answer"><strong>正确答案:</strong><div class="content"></div></div>
                <div class="correct-explanation"><strong>解析:</strong><div class="content"></div></div>
                <div class="review-actions">
                    <button class="review-btn redo" data-rating="0">重做</button><button class="review-btn hard" data-rating="1">困难</button>
                    <button class="review-btn medium" data-rating="2">犹豫</button><button class="review-btn easy" data-rating="3">简单</button>
                </div>
            </div>
        </div>`;
    }

    destroy() { this.unsubscribe(); }
}
