// src/task/task_ui.js

import { marked } from 'https://cdn.jsdelivr.net/npm/marked/lib/marked.esm.js';
import * as dom from './task_dom.js';

/**
 * [重构后] Task 模块的 UI 渲染类。
 */
export class TaskUI {
    renderFilters(taxonomy, currentSubject) {
        // 渲染任务
        dom.subjectFilter.innerHTML = '<option value="all">所有任务</option>';
        Object.keys(taxonomy).sort().forEach(subject => {
            const option = new Option(subject, subject);
            option.selected = subject === currentSubject;
            dom.subjectFilter.add(option);
        });

        // 渲染标签和原因
        const subjectData = taxonomy[currentSubject] || { tags: new Set(), reasons: new Set() };
        this._renderFilterAccordion(dom.tagFilterContainer, '标签类型', Array.from(subjectData.tags).sort());
        this._renderFilterAccordion(dom.reasonFilterContainer, '任务状态', Array.from(subjectData.reasons).sort());
    }

    _renderFilterAccordion(container, title, items) {
        container.innerHTML = `
            <details class="filter-accordion-item" open>
                <summary><span><i class="fas fa-tags"></i> ${title}</span></summary>
                <div class="tag-list-content">
                    ${items.map(item => `<div class="tag" data-value="${item}">${item}</div>`).join('')}
                </div>
            </details>
        `;
    }

    renderTaskList(tasks) {
        dom.listContainer.innerHTML = ''; 
        if (tasks.length === 0) {
            dom.listContainer.innerHTML = `<li class="session-item-placeholder"><i class="fas fa-check-circle"></i><p>没有符合条件的任务</p></li>`;
            return;
        }

        tasks.forEach(task => {
            const li = document.createElement('li');
            li.className = 'session-item task-item';
            li.dataset.id = task.uuid;

            const { className, text } = this._getDueDateStatus(task.review.due);

            li.innerHTML = `
                <div class="item-content">
                    <div class="item-title">${task.title}</div>
                    <div class="item-meta">
                        <span class="meta-info ${className}">${text}</span>
                        <span class="meta-info">${task.subject || '未分类'}</span>
                    </div>
                </div>
            `;
            dom.listContainer.appendChild(li);
        });
    }

    _getDueDateStatus(dueDateTimestamp) {
        const dueDate = new Date(dueDateTimestamp);
        const today = new Date();
        dueDate.setHours(0, 0, 0, 0);
        today.setHours(0, 0, 0, 0);

        const diffDays = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));

        if (diffDays < 0) return { className: 'status-overdue', text: `过期${Math.abs(diffDays)}天` };
        if (diffDays === 0) return { className: 'status-today', text: '今天' };
        return { className: 'status-future', text: `${diffDays}天后` };
    }

    setActiveListItem(taskId) {
        dom.listContainer.querySelectorAll('.task-item.active').forEach(el => el.classList.remove('active'));
        if (taskId) {
            const listItem = dom.listContainer.querySelector(`.task-item[data-id="${taskId}"]`);
            listItem?.classList.add('active');
        }
    }

    renderTaskPreview(tasks) {
        dom.previewContainer.innerHTML = '';
        tasks.forEach(task => {
            dom.previewContainer.appendChild(this._createTaskCard(task));
        });
    }

    /**
     * [恢复] 新增一个私有方法用于渲染附件，目前只支持图片。
     * @private
     */
    _renderAttachment(attachment) {
        if (attachment.type === 'image') {
            // 使用 .problem-image 样式复用旧版样式
            return `<img src="${attachment.url}" alt="任务附件" class="problem-image">`;
        }
        return '';
    }

    _createTaskCard(task) {
        const card = document.createElement('div');
        card.className = 'mistake-card task-card'; // 保留 .mistake-card 以复用样式
        card.dataset.id = task.uuid;

        card.innerHTML = `
            <div class="problem-section">
                <h4>${task.title}</h4>
                <div class="problem-meta">
                    <span>原因: ${task.analysis.reason_for_error}</span>
                    <span>难度: ${'★'.repeat(task.analysis.difficulty)}${'☆'.repeat(5 - task.analysis.difficulty)}</span>
                </div>
                <div class="problem-content">${marked.parse(task.problem || '')}</div>
                
                <!-- [恢复] 附件渲染区域 -->
                ${task.attachments?.map(a => this._renderAttachment(a)).join('') || ''}

                <div class="problem-tags">${task.tags?.map(t => `<span class="tag">${t}</span>`).join('') || ''}</div>

                <!-- [恢复] 我的答案预览区域 -->
                <div class="my-answer-preview"><strong>我的答案:</strong> ${task.my_answer?.content || '未作答'}</div>

                <button class="show-answer-btn">显示答案</button>
            </div>
            <div class="answer-section hidden">
                <div class="correct-answer"><strong>正确答案:</strong><div class="content">${marked.parse(task.correct_answer?.content || '')}</div></div>
                <div class="correct-explanation"><strong>解析:</strong><div class="content">${marked.parse(task.correct_answer?.explanation || '')}</div></div>
                <div class="review-actions">
                    <button class="review-btn redo" data-rating="0">重做</button>
                    <button class="review-btn hard" data-rating="1">困难</button>
                    <button class="review-btn medium" data-rating="2">犹豫</button>
                    <button class="review-btn easy" data-rating="3">简单</button>
                </div>
            </div>
        `;
        return card;
    }

    /**
     * [恢复] 新增一个公共方法，用于给预览卡片添加临时高亮效果。
     * @param {string} taskId 
     */
    highlightPreviewCard(taskId) {
        const card = dom.previewContainer.querySelector(`.task-card[data-id="${taskId}"]`);
        if (card) {
            card.classList.add('highlight');
            setTimeout(() => card.classList.remove('highlight'), 1500); // 1.5秒后移除高亮
        }
    }

    toggleAnswer(card, show) {
        card.querySelector('.answer-section').classList.toggle('hidden', !show);
        card.querySelector('.show-answer-btn').classList.toggle('hidden', show);
    }

    updateCardAfterReview(card, rating) {
        if (rating !== 3) this.toggleAnswer(card, false);
        const actions = card.querySelector('.review-actions');
        actions.insertAdjacentHTML('afterend', '<div class="update-feedback">已更新!</div>');
        setTimeout(() => card.querySelector('.update-feedback')?.remove(), 1500);
    }

    updateListItem(itemId, task) {
        const listItem = dom.listContainer.querySelector(`[data-id="${itemId}"] .meta-info`);
        if (listItem) {
            const { className, text } = this._getDueDateStatus(task.review.due);
            listItem.className = `meta-info ${className}`;
            listItem.textContent = text;
        }
    }

    renderPagination(total, page, pageSize) {
        dom.paginationContainer.innerHTML = '';
        const totalPages = Math.ceil(total / pageSize);
        if (totalPages <= 1) return;
        for (let i = 1; i <= totalPages; i++) {
            const btn = document.createElement('button');
            btn.className = `page-btn ${i === page ? 'active' : ''}`;
            btn.textContent = i;
            btn.dataset.page = i;
            dom.paginationContainer.appendChild(btn);
        }
    }
}
