// src/anki/components/ToolbarComponent.js

export class ToolbarComponent {
    constructor(store) {
        this.store = store;
        this.dom = {
            // 主工具栏
            toggleSessionBtn: document.getElementById('anki_toggleSessionBtn'),
            toggleEditPreviewBtn: document.getElementById('anki_toggleEditPreviewBtn'),
            saveBtn: document.getElementById('anki_saveBtn'),
            startReviewBtn: document.getElementById('anki_startReviewBtn'),
            reviewCount: document.getElementById('anki_reviewCount'),
            customStudyBtn: document.getElementById('anki_customStudyBtn'),
            showStatsBtn: document.getElementById('anki_showStatsBtn'),
            clozeNavUpBtn: document.getElementById('anki_clozeNavUpBtn'),
            clozeNavDownBtn: document.getElementById('anki_clozeNavDownBtn'),
            toggleVisibilityClozeBtn: document.getElementById('anki_toggleVisibilityClozeBtn'),
            invertClozeBtn: document.getElementById('anki_invertClozeBtn'),
            
            // +++ 新增：导出和打印按钮
            exportFileBtn: document.getElementById('anki_exportFileBtn'),
            printPreviewBtn: document.getElementById('anki_printPreviewBtn'),
            
            // 编辑器子工具栏
            clozeBtn: document.getElementById('anki_clozeBtn'),
            boldBtn: document.getElementById('anki_boldBtn'),
            italicBtn: document.getElementById('anki_italicBtn'),
            codeBtn: document.getElementById('anki_codeBtn'),
            linkBtn: document.getElementById('anki_linkBtn'),
            audioBtn: document.getElementById('anki_audioBtn'),
            insertLinebreakBtn: document.getElementById('anki_insertLinebreakBtn'),
        };
        
        // 订阅所有与工具栏按钮状态相关的 state
        this.unsubscribe = store.subscribe(
            this.handleStateChange.bind(this),
        ['viewMode', 'isSaving', 'isSidebarVisible', 'reviewCount', 'areAllClozesVisible', 'currentSessionId', 'sessions'] // 添加这两个
        );
        this.setupEventListeners();
    }

    setupEventListeners() {
        // 主工具栏事件
        this.dom.toggleSessionBtn.addEventListener('click', () => this.store.toggleSidebar());
        this.dom.toggleEditPreviewBtn.addEventListener('click', () => this.store.setViewMode(this.store.getState().viewMode === 'edit' ? 'preview' : 'edit'));
        this.dom.saveBtn.addEventListener('click', () => this.store.saveCurrentSession());
        this.dom.startReviewBtn.addEventListener('click', () => this.store.startReviewSession());
        this.dom.customStudyBtn.addEventListener('click', (e) => { e.preventDefault(); this.store.showCustomStudyModal(); });
        this.dom.showStatsBtn.addEventListener('click', (e) => { e.preventDefault(); this.store.showStatsModal(); });
        this.dom.clozeNavUpBtn.addEventListener('click', () => this.store.navigateToCloze(-1));
        this.dom.clozeNavDownBtn.addEventListener('click', () => this.store.navigateToCloze(1));
        this.dom.toggleVisibilityClozeBtn.addEventListener('click', () => this.store.toggleAllClozesVisibility());
        this.dom.invertClozeBtn.addEventListener('click', () => this.store.invertAllClozesVisibility());

        // +++ 新增：为新按钮添加事件监听
        this.dom.exportFileBtn.addEventListener('click', () => this.handleExportFile());
        this.dom.printPreviewBtn.addEventListener('click', () => this.handlePrintPreview());

        // 编辑器子工具栏事件
        const editorEl = document.getElementById('anki_editor');
        const getSelection = () => ({ selectionStart: editorEl.selectionStart, selectionEnd: editorEl.selectionEnd });

        this.dom.clozeBtn.addEventListener('click', () => this.store.insertCloze(getSelection()));
        this.dom.boldBtn.addEventListener('click', () => this.store.wrapEditorSelection({ prefix: '**', ...getSelection() }));
        this.dom.italicBtn.addEventListener('click', () => this.store.wrapEditorSelection({ prefix: '*', ...getSelection() }));
        this.dom.codeBtn.addEventListener('click', () => this.store.wrapEditorSelection({ prefix: '`', ...getSelection() }));
        this.dom.insertLinebreakBtn.addEventListener('click', () => this.store.wrapEditorSelection({ prefix: '¶', suffix: '', ...getSelection() }));
        this.dom.linkBtn.addEventListener('click', () => this.store.wrapEditorSelection({ prefix: '[', suffix: `](${prompt('URL:', 'https://')})`, ...getSelection() }));
        this.dom.audioBtn.addEventListener('click', () => this.store.insertAudioPrompt(getSelection()));
    }

    
    // +++ 新增：文件导出处理函数
    handleExportFile() {
        const state = this.store.getState();
        if (!state.currentSessionId) {
            alert("请先选择一个文件进行导出。");
            return;
        }

        const currentSession = state.sessions.find(s => s.id === state.currentSessionId);
        if (!currentSession) return;

        const content = state.editorContent;
        const filename = `${currentSession.name}.md`;
        
        const blob = new Blob([content], { type: 'text/markdown;charset=utf-t8,' });
        const url = URL.createObjectURL(blob);
        
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', filename);
        document.body.appendChild(link);
        link.click();
        
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }
    
    // +++ 新增：打印预览处理函数 (逻辑从旧代码迁移)
    handlePrintPreview() {
        const previewContent = this.store.getState().previewContent;
        if (!previewContent) return;

        const printWindow = window.open('', '_blank');
        printWindow.document.write(`
            <!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><title>打印预览</title>
            <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
            <link rel="stylesheet" href="./styles.css">
            <style> 
                @media print { 
                    body { margin: 20px; -webkit-print-color-adjust: exact; print-color-adjust: exact; } 
                    .cloze-actions, .media-icon { display: none !important; } 
                    .cloze.hidden .cloze-content, .cloze .cloze-content { display: inline !important; visibility: visible !important; color: black !important; } 
                    .cloze .placeholder { display: none !important; } 
                    .cloze { -webkit-print-color-adjust: exact; print-color-adjust: exact; border-bottom: 1px dotted #ccc; } 
                    .cloze.hidden { background-color: #f0f0f0 !important; }
                } 
                body { font-family: sans-serif; } 
                .preview { display: block !important; padding: 20px; }
            </style></head><body>
            <div class="preview">${previewContent}</div>
            <script src="https://polyfill.io/v3/polyfill.min.js?features=es6"></script>
            <script id="MathJax-script" async src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js"></script>
            <script> 
                window.MathJax = { 
                    startup: { 
                        pageReady: () => { 
                            return window.MathJax.startup.defaultPageReady().then(() => { 
                                setTimeout(() => { // 等待渲染稳定
                                    window.print(); 
                                    window.close(); 
                                }, 500);
                            }); 
                        } 
                    } 
                }; 
            </script>
            </body></html>
        `);
        printWindow.document.close();
    }


    handleStateChange(newState, oldState) { // 修复：添加 oldState 参数
        // 更新视图切换按钮
        const icon = '<i class="fas fa-book-open"></i>';
        this.dom.toggleEditPreviewBtn.innerHTML = `${icon} ${newState.viewMode === 'edit' ? 'Preview' : 'Edit'}`;

        // 更新保存按钮状态
        this.dom.saveBtn.disabled = newState.isSaving;
        this.dom.saveBtn.innerHTML = newState.isSaving 
            ? '<i class="fas fa-spinner fa-spin"></i> Saving...' 
            : '<i class="fas fa-save"></i> Save';
        
        // +++ 新增：根据视图模式更新打印按钮的禁用状态
        this.dom.printPreviewBtn.disabled = newState.viewMode !== 'preview';

        // 更新待办计数
        this.dom.reviewCount.textContent = newState.reviewCount;
        
        // 更新“全部显示/隐藏”按钮的图标和标题
        if (newState.areAllClozesVisible) {
            this.dom.toggleVisibilityClozeBtn.innerHTML = '<i class="fas fa-eye"></i>';
            this.dom.toggleVisibilityClozeBtn.title = '全部隐藏';
        } else {
            this.dom.toggleVisibilityClozeBtn.innerHTML = '<i class="fas fa-eye-slash"></i>';
            this.dom.toggleVisibilityClozeBtn.title = '全部显示';
        }

        // 更新侧边栏显示状态
        document.querySelector('.anki_session-sidebar').classList.toggle('hidden-session', !newState.isSidebarVisible);
        
        // 修复：正确检查 oldState
        if (oldState && (newState.currentSessionId !== oldState.currentSessionId || 
            newState.sessions !== oldState.sessions)) {
            this.updatePanelTitle(newState);
        } else if (!oldState) {
            // 初始化时没有 oldState，直接更新
            this.updatePanelTitle(newState);
        }
    }

// 新增方法
updatePanelTitle(state) {
    const panelTitle = document.getElementById('anki_panelTitle');
    if (!panelTitle) return;

    if (state.currentSessionId && state.sessions) {
        const session = state.sessions.find(s => s.id === state.currentSessionId);
        if (session) {
            panelTitle.innerHTML = `<i class="fas fa-edit"></i> ${session.name}`;
            return;
        }
    }
    panelTitle.innerHTML = '<i class="fas fa-edit"></i> Anki 编辑器';
}

    destroy() {
        this.unsubscribe();
    }
}