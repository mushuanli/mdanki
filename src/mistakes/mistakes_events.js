// src/mistakes/mistakes_events.js

import * as dom from './mistakes_dom.js';

export class MistakesEvents {
    constructor(manager, ui, stats) {
        this.manager = manager;
        this.ui = ui;
        this.stats = stats;

        this.filters = { subject: 'all', tags: [], reasons: [] };
        this.currentPage = 1;
        this.pageSize = 5; // 每页显示5个错题
        this.previewDebounceTimer = null;
    }

    /**
     * 初始化所有事件监听器
     */
    init() {
        // --- 头部/面板按钮 ---
    dom.newMistakeFileBtn?.addEventListener('click', this._handleNewMistakeFile.bind(this)); 
        dom.toggleSessionBtn?.addEventListener('click', this._handleToggleSidebar.bind(this));
        dom.saveBtn?.addEventListener('click', this._handleSaveFromYaml.bind(this));
        dom.exportBtn?.addEventListener('click', this._handleExportToYaml.bind(this));
        dom.collapseBtn?.addEventListener('click', this._handleCollapseEditor.bind(this));
        dom.refreshBtn?.addEventListener('click', this.refreshView.bind(this));
        
        // --- 文件导入 ---
        dom.loadYamlBtn?.addEventListener('click', () => dom.yamlFileInput.click());
        dom.yamlFileInput?.addEventListener('change', this._handleFileLoad.bind(this));
        
        // --- YAML 编辑器 ---
        dom.yamlEditor?.addEventListener('input', this._handleEditorInput.bind(this));
        
        // --- 筛选器 ---
        dom.subjectFilter?.addEventListener('change', this._handleSubjectChange.bind(this));
        dom.tagFilterContainer?.addEventListener('click', this._handleFilterTagClick.bind(this, 'tags'));
        dom.reasonFilterContainer?.addEventListener('click', this._handleFilterTagClick.bind(this, 'reasons'));

        // --- 列表、预览和分页 ---
        dom.mistakesListContainer?.addEventListener('click', this._handleMistakeListClick.bind(this));
        dom.previewContainer?.addEventListener('click', this._handlePreviewClick.bind(this));
        dom.paginationContainer?.addEventListener('click', this._handlePaginationClick.bind(this));

        // --- 复习功能 (占位) ---
        dom.startReviewBtn?.addEventListener('click', () => alert('错题本复习功能待实现！'));
        dom.reviewOptionsBtn?.addEventListener('click', () => dom.reviewDropdownMenu.style.display = dom.reviewDropdownMenu.style.display === 'none' ? 'block' : 'none');

        // 初始加载
        this.refreshView();
    }

    /**
     * 刷新整个视图（列表、预览、分页、统计）
     */
    async refreshView() {
        // --- 渲染统计面板 ---
        // 获取统计HTML
        const statsHtml = this.stats.getDashboardHtml(this.manager.mistakes);
        // 找到预览面板的头部并插入统计HTML
        const previewHeader = document.querySelector('#mistakes-preview-panel .panel-header');
        // 为了避免重复，先移除旧的
        previewHeader.querySelector('.stats-dashboard-inline')?.remove();
        // 插入新的
        previewHeader.insertAdjacentHTML('afterend', `<div class="stats-dashboard-inline">${statsHtml}</div>`);

        // --- 渲染列表和预览 ---
        const allFiltered = this.manager.getFilteredMistakes(this.filters);
        
        const start = (this.currentPage - 1) * this.pageSize;
        const end = start + this.pageSize;
        const pagedMistakes = allFiltered.slice(start, end);
        
        this.ui.renderMistakeList(pagedMistakes);
        this.ui.renderMistakePreview(pagedMistakes);
        this.ui.renderPagination(allFiltered.length, this.currentPage, this.pageSize);
    }
    
    // --- 事件处理器实现 ---

    _handleToggleSidebar() {
       // 将 'hidden' 修改为 'hidden-session'
        dom.sidebar.classList.toggle('hidden-session'); 
        
        // 相应的，检查的类名也要修改
        const isHidden = dom.sidebar.classList.contains('hidden-session');
        dom.toggleSessionBtn.innerHTML = isHidden ? '<i class="fas fa-arrow-right"></i>' : '<i class="fas fa-arrow-left"></i>';
    }
    
    /**
 * 处理点击“新建错题文件”按钮的事件
 */
_handleNewMistakeFile() {
    const fileName = prompt("请输入新错题文件的标题:", "未命名错题集");

    // 如果用户点击了“取消”或没有输入文件名，则不执行任何操作
    if (!fileName || fileName.trim() === '') {
        return; 
    }

    // 定义YAML模板。使用模板字符串（反引号）可以轻松处理多行文本。
    const yamlTemplate = `
mistakes:
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

  
  # 简易模式错题
  - simple_problem:
    - problem: "二次函数的定义是什么？"
      answer: "形如 y = ax^2 + bx + c (a≠0) 的函数"
      difficulty: 2
      tags: ["简易","二次函数", "定义"]
`.trim(); // .trim() 移除开头和结尾的空白
// 将模板内容设置到YAML编辑器中
dom.yamlEditor.value = yamlTemplate;

// （可选）让编辑器获得焦点，方便用户立即开始编辑
dom.yamlEditor.focus();
}


    async _handleSaveFromYaml() {
        const yamlContent = dom.yamlEditor.value;
        const result = await this.manager.loadFromYAML(yamlContent);
        if (result.success) {
            dom.saveBtn.innerHTML = '<i class="fas fa-check"></i> 已保存';
            setTimeout(() => dom.saveBtn.innerHTML = '<i class="fas fa-save"></i>', 2000);
            this.ui.renderFilters(this.manager.getTaxonomy(), this.filters.subject);
            this.refreshView();
        } else {
            alert(`保存失败: ${result.error}`);
        }
    }

    _handleExportToYaml() {
        const content = dom.yamlEditor.value;
        const blob = new Blob([content], { type: 'text/yaml;charset=utf-8' });
        let fileName = 'mistake-export.yml';
        try {
            const titleMatch = content.match(/title:\s*["']?(.*?)["']?\s*\n/);
            if (titleMatch && titleMatch[1]) {
                fileName = `${titleMatch[1].replace(/[\/\\?%*:|"<>]/g, '-')}.yml`;
            }
        } catch (e) { /* Fallback */ }
        
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = fileName;
        link.click();
        URL.revokeObjectURL(link.href);
    }

    _handleCollapseEditor() {
        dom.editorPanel.classList.toggle('collapsed');
        const isCollapsed = dom.editorPanel.classList.contains('collapsed');
        const icon = dom.collapseBtn.querySelector('i');
        icon.className = isCollapsed ? 'fas fa-chevron-down' : 'fas fa-chevron-up';
        dom.collapseBtn.title = isCollapsed ? "展开编辑器" : "收起编辑器";
        if (isCollapsed) this._handleSaveFromYaml(); // 收起时自动保存
    }

    _handleEditorInput() {
        clearTimeout(this.previewDebounceTimer);
        this.previewDebounceTimer = setTimeout(() => {
            console.log("Debounced: Ready to update preview from YAML editor content.");
            // 可以在此处添加从YAML编辑器直接渲染单条预览的逻辑
        }, 500);
    }

    _handleSubjectChange(e) {
        this.filters.subject = e.target.value;
        this.filters.tags = [];
        this.filters.reasons = [];
        this.currentPage = 1;
        this.ui.renderFilters(this.manager.getTaxonomy(), this.filters.subject);
        this.refreshView();
    }

    _handleFilterTagClick(type, e) {
        const target = e.target.closest('.tag');
        if (!target) return;
        target.classList.toggle('active');
        const container = type === 'tags' ? dom.tagFilterContainer : dom.reasonFilterContainer;
        this.filters[type] = Array.from(container.querySelectorAll('.tag.active')).map(el => el.dataset.value);
        this.currentPage = 1;
        this.refreshView();
    }
    
    _handleMistakeListClick(e) {
        const item = e.target.closest('.mistake-list-item');
        if (!item) return;
        const mistakeId = item.dataset.id;
        
        // --- 调用UI方法来设置高亮 ---
        this.ui.setActiveListItem(mistakeId);

        const correspondingCard = dom.previewContainer.querySelector(`.mistake-card[data-id="${mistakeId}"]`);
        if (correspondingCard) {
            correspondingCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
            // 添加高亮效果
            correspondingCard.classList.add('highlight');
            setTimeout(() => correspondingCard.classList.remove('highlight'), 1500);
        }
    }

    _handlePaginationClick(e) {
        const btn = e.target.closest('.page-btn');
        if (btn) {
            this.currentPage = parseInt(btn.dataset.page);
            this.refreshView();
        }
    }
    
    async _handlePreviewClick(e) {
        const card = e.target.closest('.mistake-card');
        if (!card) return;
        const mistakeId = card.dataset.id;
        
        if (e.target.matches('.show-answer-btn')) {
            this.ui.toggleAnswer(card, true);
        }
        
        const reviewBtn = e.target.closest('.review-btn');
        if (reviewBtn) {
            const rating = parseInt(reviewBtn.dataset.rating);
            const updatedMistake = await this.manager.updateReviewStatus(mistakeId, rating);
            
            if (updatedMistake) {
                this.ui.updateCardAfterReview(card, updatedMistake, rating);
                this.ui.updateListItem(mistakeId, updatedMistake);

                // 如果是 "重做"，立即隐藏答案
                if (rating === 0) {
                     setTimeout(() => this.ui.toggleAnswer(card, false), 500);
                }
            }
        }
    }

    _handleFileLoad(e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
            await this._handleSaveFromYaml(event.target.result); //复用保存逻辑
            dom.yamlEditor.value = event.target.result; // 将内容填入编辑器
        };
        reader.onerror = () => alert('读取文件失败！');
        reader.readAsText(file);
        e.target.value = ''; // 允许再次选择同一个文件
    }
}