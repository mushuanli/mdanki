// src/mistakes/mistakes_ui.js
import { marked } from 'https://cdn.jsdelivr.net/npm/marked/lib/marked.esm.js';

export class MistakesUI {
    constructor() {
        this.elements = {
            subjectFilter: document.getElementById('subject-filter'),
            tagFilterContainer: document.querySelector('.filter-group[data-type="tags"] .tag-list'),
            reasonFilterContainer: document.querySelector('.filter-group[data-type="reasons"] .tag-list'),
            listContainer: document.querySelector('#mistakes-list'),
            previewContainer: document.getElementById('mistakes-preview'),
            paginationContainer: document.querySelector('.pagination'),
            statsContainer: document.getElementById('statistics-dashboard'),
        };
    }
    
    renderFilters(taxonomy, currentSubject) {
        // 渲染科目
        this.elements.subjectFilter.innerHTML = '<option value="all">所有科目</option>';
        Object.keys(taxonomy).sort().forEach(subject => {
            const option = new Option(subject, subject);
            option.selected = subject === currentSubject;
            this.elements.subjectFilter.add(option);
        });

        // 渲染标签和原因
        const subjectData = taxonomy[currentSubject] || { tags: new Set(), reasons: new Set() };
        this._renderFilterAccordion(this.elements.tagFilterContainer, '知识点标签', Array.from(subjectData.tags).sort());
        this._renderFilterAccordion(this.elements.reasonFilterContainer, '错误原因', Array.from(subjectData.reasons).sort());
    }


    /**
     * [NEW] 辅助方法，创建可折叠的筛选面板
     * @private
     */
    _renderFilterAccordion(container, title, items) {
        // 使用与 Anki 视图一致的 <details> 结构
        container.innerHTML = `
            <details class="filter-accordion-item" open>
                <summary>
                    <span><i class="fas fa-tags"></i> ${title}</span>
                    <i class="fas fa-chevron-down toggle-icon"></i>
                </summary>
                <div class="tag-list-content">
                    ${items.map(item => `<div class="tag" data-value="${item}">${item}</div>`).join('')}
                </div>
            </details>
        `;
    }

    _renderFilterItems(container, items) {
        container.innerHTML = ''; // 清空
        items.forEach(item => {
            const tagEl = document.createElement('div');
            tagEl.className = 'tag';
            tagEl.textContent = item;
            tagEl.dataset.value = item;
            container.appendChild(tagEl);
        });
    }

    renderMistakeList(mistakes) {
        const listContainer = this.elements.listContainer;
        listContainer.innerHTML = ''; 
        if (mistakes.length === 0) {
            // 使用截图中的占位符样式
            listContainer.innerHTML = `
                <li class="session-item-placeholder">
                    <i class="fas fa-check-circle"></i>
                    <p>没有符合条件的错题</p>
                    <span>尝试放宽筛选条件或导入新的错题。</span>
                </li>
            `;
            return;
        }

        mistakes.forEach(mistake => {
            const li = document.createElement('li');
            // 复用 Anki 视图的 session-item 样式
            li.className = 'session-item'; 
            li.dataset.id = mistake.uuid;

            // --- 计算到期状态 ---
            const { className, text } = this._getDueDateStatus(mistake.review.due);

            // 生成与 Anki 视图完全一致的 HTML 结构
            li.innerHTML = `
                <div class="item-icon-wrapper">
                    <i class="fas fa-book-medical item-icon"></i>
                </div>
                <div class="item-content">
                    <div class="item-title">${mistake.title}</div>
                    <div class="item-meta">
                        <span class="meta-info ${className}">${text}</span>
                        <span class="meta-info">${mistake.subject || '未分类'}</span>
                    </div>
                </div>
            `;
            listContainer.appendChild(li);
        });
    }
    /**
     * [NEW] 辅助方法，根据到期日计算样式和文本
     * @private
     */
    _getDueDateStatus(dueDateTimestamp) {
        const dueDate = new Date(dueDateTimestamp);
        const today = new Date();
        // 将时间部分清零，只比较日期
        dueDate.setHours(0, 0, 0, 0);
        today.setHours(0, 0, 0, 0);

        const diffTime = dueDate.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays < 0) {
            return { className: 'status-overdue', text: `过期${Math.abs(diffDays)}天` };
        }
        if (diffDays === 0) {
            return { className: 'status-today', text: '今天' };
        }
        if (diffDays === 1) {
            return { className: 'status-soon', text: '明天' };
        }
        return { className: 'status-future', text: `${diffDays}天后` };
    }

    /**
     * [NEW] 方法，用于在列表和预览卡片之间同步高亮状态
     */
    setActiveListItem(mistakeId) {
        // 移除所有旧的高亮
        this.elements.listContainer.querySelectorAll('.mistake-list-item.active')
            .forEach(el => el.classList.remove('active'));
        
        // 为新项添加高亮
        if (mistakeId) {
            const listItem = this.elements.listContainer.querySelector(`.mistake-list-item[data-id="${mistakeId}"]`);
            listItem?.classList.add('active');
        }
    }

    renderMistakePreview(mistakes) {
        this.elements.previewContainer.innerHTML = '';
        mistakes.forEach(mistake => {
            const card = this._createMistakeCard(mistake);
            this.elements.previewContainer.appendChild(card);
        });
    }

    _createMistakeCard(mistake) {
        const card = document.createElement('div');
        card.className = 'mistake-card';
        card.dataset.id = mistake.uuid;

        card.innerHTML = `
            <div class="problem-section">
                <div class="problem-header">
                    <h4>${mistake.title}</h4>
                    <div class="problem-meta">
                        <span class="meta-item reason">原因: ${mistake.analysis.reason_for_error}</span>
                        <span class="meta-item difficulty">难度: ${'★'.repeat(mistake.analysis.difficulty)}${'☆'.repeat(5 - mistake.analysis.difficulty)}</span>
                    </div>
                </div>
                <div class="problem-content">${marked.parse(mistake.problem || '')}</div>
                ${mistake.attachments?.map(a => this._renderAttachment(a)).join('') || ''}
                <div class="problem-tags">
                    ${mistake.tags?.map(t => `<span class="tag">${t}</span>`).join('') || ''}
                </div>
                <div class="my-answer-preview"><strong>我的答案:</strong> ${mistake.my_answer?.content || '未作答'}</div>
                <button class="show-answer-btn">显示答案</button>
            </div>

            <div class="answer-section hidden">
                <div class="correct-answer">
                    <strong>正确答案:</strong>
                    <div class="content">${marked.parse(mistake.correct_answer?.content || '')}</div>
                </div>
                <div class="correct-explanation">
                    <strong>解析:</strong>
                    <div class="content">${marked.parse(mistake.correct_answer?.explanation || '')}</div>
                </div>
                <div class="review-actions">
                    <button class="review-btn redo" data-rating="0">重做 (10m)</button>
                    <button class="review-btn hard" data-rating="1">困难</button>
                    <button class="review-btn medium" data-rating="2">犹豫</button>
                    <button class="review-btn easy" data-rating="3">简单</button>
                </div>
            </div>
        `;
        return card;
    }
    
    _renderAttachment(attachment) {
        if (attachment.type === 'image') {
            return `<img src="${attachment.url}" alt="错题附件" class="problem-image">`;
        }
        return '';
    }

    _formatDueDate(dueDate) {
        const date = new Date(dueDate);
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        
        const diffDays = Math.ceil((date - now) / (1000 * 60 * 60 * 24));

        if (diffDays === 0) return '今天';
        if (diffDays === 1) return '明天';
        if (diffDays > 1 && diffDays < 7) return `${diffDays}天后`;
        if (diffDays < 0) return `${Math.abs(diffDays)}天前`;
        return date.toLocaleDateString();
    }

    toggleAnswer(card, show) {
        const answerSection = card.querySelector('.answer-section');
        const showBtn = card.querySelector('.show-answer-btn');
        if (show) {
            answerSection.classList.remove('hidden');
            showBtn.classList.add('hidden');
        } else {
            answerSection.classList.add('hidden');
            showBtn.classList.remove('hidden');
        }
    }
    
    updateCardAfterReview(card, mistake, rating) {
        // "简单"评级保持答案展开，其他评级则隐藏
        if (rating !== 3) {
            this.toggleAnswer(card, false);
        }
        // 可选：显示一个短暂的 "已更新" 提示
        const actions = card.querySelector('.review-actions');
        actions.insertAdjacentHTML('afterend', '<div class="update-feedback">已更新!</div>');
        setTimeout(() => {
            card.querySelector('.update-feedback')?.remove();
        }, 1500);
    }
    
    updateListItem(itemId, mistake) {
        const listItem = this.elements.listContainer.querySelector(`[data-id="${itemId}"]`);
        if(listItem) {
            listItem.querySelector('.mistake-due-date').textContent = `复习: ${this._formatDueDate(mistake.review.due)}`;
        }
    }

    renderPagination(total, page, pageSize) {
        this.elements.paginationContainer.innerHTML = '';
        const totalPages = Math.ceil(total / pageSize);
        if (totalPages <= 1) return;

        for (let i = 1; i <= totalPages; i++) {
            const btn = document.createElement('button');
            btn.className = 'page-btn';
            btn.textContent = i;
            btn.dataset.page = i;
            if (i === page) {
                btn.classList.add('active');
            }
            this.elements.paginationContainer.appendChild(btn);
        }
    }
}