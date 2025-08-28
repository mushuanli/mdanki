// src/anki/components/PreviewComponent.js

import { renderMathAndMermaid, processTaskLists } from '../services/renderService.js';
import { audioService } from '../services/audioService.js'; // +++ 新增导入

export class PreviewComponent {
    constructor(store) {
        this.store = store;
        this.element = document.getElementById('anki_preview');

        // [优化] 只订阅 'previewContent' 和 'viewMode' 的变化
        this.unsubscribe = store.subscribe(
            this.handleStateChange.bind(this),
            ['previewContent', 'viewMode', 'clozeStates', 'areAllClozesVisible', 'highlightedClozeId', 'editorScrollRatio']
        );
        this.setupEventListeners();
    }
  
    setupEventListeners() {
        // 使用事件委托处理所有交互
        this.element.addEventListener('click', this.handleClick.bind(this));
        this.element.addEventListener('dblclick', this.handleDoubleClick.bind(this));

        // 监听滚动事件，用于同步编辑器
        this.element.addEventListener('scroll', () => {
            if (this.store.getState().viewMode === 'preview') {
                const preview = this.element;
                if (preview.scrollHeight > preview.clientHeight) {
                    const scrollRatio = preview.scrollTop / (preview.scrollHeight - preview.clientHeight);
                    this.store.setScrollRatio(Math.min(1, Math.max(0, scrollRatio)));
                }
            }
        });
    }

    handleClick(e) {
        const cloze = e.target.closest('.cloze');
        if (!cloze) return;

        // 1. 处理评分按钮
        if (e.target.closest('.cloze-btn')) {
            e.stopPropagation();
            const button = e.target.closest('.cloze-btn');
            const rating = parseInt(button.dataset.rating, 10);
            const clozeId = cloze.dataset.clozeId;
            this.store.rateCloze(clozeId, rating);
            return;
        }

        // 2. 处理媒体图标
        if (e.target.closest('.media-icon')) {
            e.stopPropagation();
            // --- 修改开始 ---
            const audioText = cloze.dataset.multimedia;
            if (audioText) {
                audioService.play(audioText);
            }
            // --- 修改结束 ---
            console.log("Audio playback requested for:", cloze.dataset.multimedia);
            return;
        }
        
        // 3. 处理普通点击以显示Cloze
        this.store.recordClozeInteraction(cloze.dataset.clozeId);
        this.store.toggleClozeVisibility(cloze.dataset.clozeId);
    }

    handleDoubleClick(e) {
        const cloze = e.target.closest('.cloze');
        if (cloze) {
            e.stopPropagation();
            // 双击用于永久切换可见性 (这个逻辑可以在 store action 中实现)
            this.store.toggleClozeVisibility(cloze.dataset.clozeId);
        }
    }
  
    async handleStateChange(newState, oldState) {
        // 添加调试日志
        console.log("Preview state change:", {
            hasContent: !!newState.previewContent,
            viewMode: newState.viewMode,
            currentSession: newState.currentSessionId
        });

        // 1. 当核心HTML内容变化时，完全重绘
        if (newState.previewContent !== oldState.previewContent || !oldState.previewContent) {
          if (newState.previewContent) {
              this.element.innerHTML = newState.previewContent;
              // 处理任务列表
              const processedHtml = processTaskLists(this.element.innerHTML);
              this.element.innerHTML = processedHtml;
              // 渲染数学公式和图表
              await renderMathAndMermaid(this.element);
          } else {
              // 如果没有内容，显示提示
              this.element.innerHTML = '<div class="empty-preview"><p>暂无内容</p></div>';
          }
        }

        // 2. 高效更新Cloze的可见性，避免重绘
        if (newState.clozeStates !== oldState.clozeStates || newState.areAllClozesVisible !== oldState.areAllClozesVisible) {
            this.updateClozeVisibility(newState);
        }

        // 3. 处理视图模式切换
        if (newState.viewMode !== oldState.viewMode || oldState.viewMode === undefined) {
            const isVisible = newState.viewMode === 'preview';
        this.element.style.display = isVisible ? 'block' : 'none';
        // 🔧 修复：如果是预览模式，确保其他可能影响显示的样式
        if (isVisible) {
            this.element.style.visibility = 'visible';
            this.element.style.opacity = '1';
        }
        }

        // 4. 同步滚动位置
        if (newState.viewMode === 'preview' && oldState.viewMode === 'edit') {
            requestAnimationFrame(() => {
                const preview = this.element;
                if (preview.scrollHeight > preview.clientHeight) {
                    preview.scrollTop = newState.editorScrollRatio * (preview.scrollHeight - preview.clientHeight);
                }
            });
        }
        
        // 5. 处理导航高亮
        if (newState.highlightedClozeId && newState.highlightedClozeId !== oldState.highlightedClozeId) {
            this.highlightAndScrollToCloze(newState.highlightedClozeId);
        }
    }

    updateClozeVisibility(state) {
        const allClozes = this.element.querySelectorAll('.cloze');
        allClozes.forEach(clozeEl => {
            const id = clozeEl.dataset.clozeId;
            const clozeState = state.clozeStates[id];
            if (!clozeState) return;

            const isHidden = !state.areAllClozesVisible && !clozeState.tempVisible;
            clozeEl.classList.toggle('hidden', isHidden);
            
            const actionsEl = clozeEl.querySelector('.cloze-actions');
            if (actionsEl) {
                actionsEl.style.display = !isHidden && !state.areAllClozesVisible ? 'flex' : 'none';
            }
        });
    }

    highlightAndScrollToCloze(clozeId) {
        const target = this.element.querySelector(`.cloze[data-cloze-id="${clozeId}"]`);
        if (target) {
            target.scrollIntoView({ behavior: 'smooth', block: 'center' });
            target.classList.add('cloze-nav-active');
            setTimeout(() => target.classList.remove('cloze-nav-active'), 1500);
        }
    }
  
    destroy() {
        this.unsubscribe();
    }
}
