// src/anki/components/EditorComponent.js

// 一个简单的防抖函数，用于优化输入事件
const debounce = (func, delay) => {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), delay);
    };
};

export class EditorComponent {
    constructor(store) {
        this.store = store;
        this.element = document.getElementById('anki_editor');
        this.container = document.getElementById('anki_editorContainer');
        
        // 防止 store 更新时触发不必要的 input 事件
        this.isUpdatingInternally = false;

        this.setupEventListeners();
        
        // [优化] 只订阅 'editorContent' 和 'viewMode' 的变化
        this.unsubscribe = store.subscribe(
            this.handleStateChange.bind(this),
            ['editorContent', 'viewMode', 'editorScrollRatio']
        );
    }
  
    setupEventListeners() {
        // 使用防抖处理输入，避免过于频繁地更新状态和触发预览
        this.element.addEventListener('input', debounce((e) => {
            if (this.isUpdatingInternally) return;
            // 记录撤销状态，并更新编辑器内容
            this.store.recordUndoState(this.store.getState().editorContent);
            this.store.setState({ editorContent: e.target.value });
            this.store.updatePreview(); // 请求更新预览
        }, 300));
      
        // 处理快捷键，例如保存
        this.element.addEventListener('keydown', (e) => {
            if (e.ctrlKey || e.metaKey) {
                switch (e.key) {
                    case 's':
                        e.preventDefault();
                        this.store.saveCurrentSession();
                        break;
                    case 'z':
                        e.preventDefault();
                        this.store.undo();
                        break;
                    case 'y':
                        e.preventDefault();
                        this.store.redo();
                        break;
                }
            }
        });

        // 监听滚动事件，用于同步预览区
        this.element.addEventListener('scroll', () => {
             // 仅在编辑模式下，由编辑器的滚动驱动同步
            if (this.store.getState().viewMode === 'edit') {
                const editor = this.element;
                if (editor.scrollHeight > editor.clientHeight) {
                    const scrollRatio = editor.scrollTop / (editor.scrollHeight - editor.clientHeight);
                    this.store.setScrollRatio(Math.min(1, Math.max(0, scrollRatio)));
                }
            }
        });
    }
  
    handleStateChange(newState, oldState) {
        // 1. 更新编辑器内容
        // 只有当 store 的内容与 textarea 的内容确实不同时才更新DOM，防止光标跳动
        if (newState.editorContent !== oldState.editorContent && newState.editorContent !== this.element.value) {
            const cursorPos = this.element.selectionStart;
            this.isUpdatingInternally = true;
            this.element.value = newState.editorContent;
            this.element.setSelectionRange(cursorPos, cursorPos);
            this.isUpdatingInternally = false;
        }
      
        // 根据视图模式，控制编辑器和预览的显示/隐藏
        if (newState.viewMode !== oldState.viewMode) {
            const isVisible = newState.viewMode === 'edit';
            this.element.style.display = isVisible ? '' : 'none';
        }

        // 3. 同步滚动位置
        // 仅在视图切换到编辑模式时，根据 store 的比例设置滚动条
        if (newState.viewMode === 'edit' && oldState.viewMode === 'preview') {
             requestAnimationFrame(() => {
                const editor = this.element;
                if (editor.scrollHeight > editor.clientHeight) {
                    editor.scrollTop = newState.editorScrollRatio * (editor.scrollHeight - editor.clientHeight);
                }
            });
        }
    }
  
    // 在组件销毁时调用，以防止内存泄漏
    destroy() {
        this.unsubscribe();
        // 这里还可以移除事件监听器，但在单页面应用中通常不是必须的
    }
}
