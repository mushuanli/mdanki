// src/task/task_events.js

import * as dom from './task_dom.js';

/**
 * [重构后] Task 模块的事件处理器。
 */
export class TaskEvents {
    constructor(manager, ui, stats) {
        this.manager = manager;
        this.ui = ui;
        this.stats = stats;
        this.filters = { subject: 'all', tags: [], reasons: [] };
        this.currentPage = 1;
        this.pageSize = 5;
    }

    init() {
        dom.newFileBtn?.addEventListener('click', this._handleNewFile.bind(this));
        dom.toggleSessionBtn?.addEventListener('click', this._handleToggleSidebar.bind(this));
        dom.saveBtn?.addEventListener('click', this._handleSave.bind(this));
        dom.exportBtn?.addEventListener('click', this._handleExport.bind(this));
        dom.collapseBtn?.addEventListener('click', this._handleCollapseEditor.bind(this));
        dom.refreshBtn?.addEventListener('click', this.refreshView.bind(this));
        dom.loadYamlBtn?.addEventListener('click', () => dom.yamlFileInput.click());
        dom.yamlFileInput?.addEventListener('change', this._handleFileLoad.bind(this));
        dom.subjectFilter?.addEventListener('change', this._handleSubjectChange.bind(this));
        dom.tagFilterContainer?.addEventListener('click', this._handleFilterClick.bind(this, 'tags'));
        dom.reasonFilterContainer?.addEventListener('click', this._handleFilterClick.bind(this, 'reasons'));
        dom.listContainer?.addEventListener('click', this._handleListClick.bind(this));
        dom.previewContainer?.addEventListener('click', this._handlePreviewClick.bind(this));
        dom.paginationContainer?.addEventListener('click', this._handlePaginationClick.bind(this));
        dom.startReviewBtn?.addEventListener('click', () => alert('任务待办功能待实现！'));
        this.refreshView();
    }

    async refreshView() {
        const statsHtml = this.stats.getDashboardHtml(this.manager.tasks);
        dom.statsDashboard.innerHTML = statsHtml;

        const allFiltered = this.manager.getFilteredTasks(this.filters);
        const start = (this.currentPage - 1) * this.pageSize;
        const pagedTasks = allFiltered.slice(start, start + this.pageSize);
        
        this.ui.renderTaskList(pagedTasks);
        this.ui.renderTaskPreview(pagedTasks);
        this.ui.renderPagination(allFiltered.length, this.currentPage, this.pageSize);
    }

    _handleToggleSidebar() {
        dom.sidebar.classList.toggle('collapsed');
    }

    _handleNewFile() {
        const subject = prompt("请输入新任务集的主题:", "未命名任务集");
        if (!subject || subject.trim() === '') {
            return;
        }

        // [恢复] 使用了更丰富的模板，并将 `mistakes` 改为 `tasks`，`simple_problem` 改为 `simple_task`
        const yamlTemplate = `
subject: ${subject}
tasks:
  - title: "二次函数图像与系数关系"
    problem: |
      已知二次函数 $y = ax^2 + bx + c$ 的图像如图所示，下列结论中正确的是？
      A. $a > 0, c > 0$
      B. $b^2 - 4ac < 0$
      C. $a - b + c > 0$
      D. $abc > 0$
    attachments:
      - type: image
        url: "function_graph.png"
    my_answer:
      content: "A"
    correct_answer:
      content: "C"
      explanation: |
        1. **开口方向**: 图像开口向上, $a > 0$
        2. **对称轴**: $x = -b/2a < 0$ → $b > 0$
        3. **与y轴交点**: $c < 0$
        4. **特殊点**: $x = -1$ 时, $y > 0$ → $a - b + c > 0$
    analysis:
      reason_for_error: "概念混淆"
      difficulty: 3
    tags: ["二次函数", "图像分析"]

  # 简易模式任务
  - simple_task:
      problem: "二次函数的定义是什么？"
      answer: "形如 y = ax^2 + bx + c (a≠0) 的函数"
      difficulty: 2
      tags: ["简易", "二次函数", "定义"]
`.trim();

        dom.yamlEditor.value = yamlTemplate;
        dom.yamlEditor.focus();
    }

    async _handleSave() {
        const result = await this.manager.loadFromYAML(dom.yamlEditor.value);
        if (result.success) {
            dom.saveBtn.innerHTML = '<i class="fas fa-check"></i> 已保存';
            setTimeout(() => dom.saveBtn.innerHTML = '<i class="fas fa-save"></i>', 2000);
            this.ui.renderFilters(this.manager.getTaxonomy(), this.filters.subject);
            this.refreshView();
        } else {
            alert(`保存失败: ${result.error}`);
        }
    }

    _handleExport() {
        const blob = new Blob([dom.yamlEditor.value], { type: 'text/yaml;charset=utf-8' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'task-export.yml';
        link.click();
        URL.revokeObjectURL(link.href);
    }

    _handleCollapseEditor() {
        dom.editorPanel.classList.toggle('collapsed');
        const icon = dom.collapseBtn.querySelector('i');
        icon.className = dom.editorPanel.classList.contains('collapsed') ? 'fas fa-chevron-down' : 'fas fa-chevron-up';
        if (dom.editorPanel.classList.contains('collapsed')) this._handleSave();
    }

    async _handleFileLoad(e) {
        const file = e.target.files[0];
        if (!file) return;
        const text = await file.text();
        dom.yamlEditor.value = text;
        await this._handleSave();
        e.target.value = '';
    }

    _handleSubjectChange(e) {
        this.filters.subject = e.target.value;
        this.filters.tags = [];
        this.filters.reasons = [];
        this.currentPage = 1;
        this.ui.renderFilters(this.manager.getTaxonomy(), this.filters.subject);
        this.refreshView();
    }

    _handleFilterClick(type, e) {
        const target = e.target.closest('.tag');
        if (!target) return;
        target.classList.toggle('active');
        const container = type === 'tags' ? dom.tagFilterContainer : dom.reasonFilterContainer;
        this.filters[type] = Array.from(container.querySelectorAll('.tag.active')).map(el => el.dataset.value);
        this.currentPage = 1;
        this.refreshView();
    }
    
    _handleListClick(e) {
        const item = e.target.closest('.task-item');
        if (!item) return;
        const taskId = item.dataset.id;
        this.ui.setActiveListItem(taskId);
        const card = dom.previewContainer.querySelector(`.task-card[data-id="${taskId}"]`);
        if (card) {
            card.scrollIntoView({ behavior: 'smooth', block: 'center' });
            // [恢复] 调用 UI 方法来给卡片添加临时高亮
            this.ui.highlightPreviewCard(taskId);
        }
    }

    _handlePaginationClick(e) {
        const btn = e.target.closest('.page-btn');
        if (btn) {
            this.currentPage = parseInt(btn.dataset.page, 10);
            this.refreshView();
        }
    }
    
    async _handlePreviewClick(e) {
        const card = e.target.closest('.task-card');
        if (!card) return;
        const taskId = card.dataset.id;
        
        if (e.target.matches('.show-answer-btn')) {
            this.ui.toggleAnswer(card, true);
        }
        
        const reviewBtn = e.target.closest('.review-btn');
        if (reviewBtn) {
            const rating = parseInt(reviewBtn.dataset.rating, 10);
            const updatedTask = await this.manager.updateReviewStatus(taskId, rating);
            if (updatedTask) {
                this.ui.updateCardAfterReview(card, rating);
                this.ui.updateListItem(taskId, updatedTask);
            }
        }
    }
}
