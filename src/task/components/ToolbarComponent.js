// src/task/components/ToolbarComponent.js

export class ToolbarComponent {
    constructor(store) {
        this.store = store;
        this.dom = {
            // Panels to be toggled
            sidebar: document.querySelector('#task-view .task_session-sidebar'),
            // [修改] 指向新的主面板
            mainPanel: document.getElementById('task_mainPanel'),
            // [修改] 引用新的和已有的按钮
            toggleSidebarBtn: document.getElementById('task_toggleSessionBtn'),
            toggleViewBtn: document.getElementById('task_toggleViewBtn'),
            startReviewBtn: document.getElementById('task_startReviewBtn'),
            editTagsBtn: document.getElementById('task_editTagsBtn'),
            saveBtn: document.getElementById('task_saveBtn'),
            exportBtn: document.getElementById('task_exportBtn'),
            printPreviewBtn: document.getElementById('task_printPreviewBtn'),
            importBtn: document.getElementById('task_importBtn'),
            importInput: document.getElementById('task_yamlImportInput'),
            createTaskBtn: document.getElementById('task_createTaskBtn'),
            
            deleteSelectedBtn: document.getElementById('task_deleteSelectedBtn'),
            selectAllCheckbox: document.getElementById('task_selectAllCheckbox'),

            // Dynamic elements
            panelTitle: document.getElementById('task_panelTitle'),
            reviewCount: document.getElementById('task_reviewCount')
        };

        this.unsubscribe = store.subscribe(this.handleStateChange.bind(this), 
            ['isSidebarVisible', 'mainViewMode', 'selectedTaskId', 'tasks', 'filters', 'selectedTaskIds']
        );
        this.setupEventListeners();
    }

    setupEventListeners() {
        this.dom.toggleSidebarBtn.addEventListener('click', () => {
            this.store.toggleSidebar();
        });

        this.dom.toggleViewBtn.addEventListener('click', () => {
            this.store.toggleMainViewMode();
        });

        this.dom.startReviewBtn.addEventListener('click', () => {
            this.store.startReview();
        });
        
        this.dom.editTagsBtn.addEventListener('click', () => {
            this.store.editSelectedTaskTags();
        });
        
        this.dom.createTaskBtn.addEventListener('click', () => {
            this.store.createNewTask();
        });

        this.dom.saveBtn.addEventListener('click', async () => {
            const result = await this.store.saveCurrentTask();
            if (result && result.success) {
                this.dom.saveBtn.innerHTML = '<i class="fas fa-check"></i>';
                setTimeout(() => this.dom.saveBtn.innerHTML = '<i class="fas fa-save"></i>', 2000);
            }
        });

        this.dom.exportBtn.addEventListener('click', () => {
            this.store.exportFilteredTasks();
        });

        this.dom.importBtn.addEventListener('click', () => {
            this.dom.importInput.click();
        });
        this.dom.importInput.addEventListener('change', async (e) => {
            if (!e.target.files[0]) return;
            const content = await e.target.files[0].text();
            await this.store.importTasks(content);
            e.target.value = ''; // Reset for next import
        });

        this.dom.printPreviewBtn.addEventListener('click', () => {
            this.handlePrintPreview();
        });
        
                this.dom.deleteSelectedBtn.addEventListener('click', () => {
            const idsToDelete = Array.from(this.store.getState().selectedTaskIds);
            this.store.deleteTasks(idsToDelete);
        });

        this.dom.selectAllCheckbox.addEventListener('change', (e) => {
            if (e.target.checked) {
                this.store.selectAllTasks();
            } else {
                this.store.deselectAllTasks();
            }
        });

    }

    // This component performs targeted DOM updates instead of a full re-render.
    handleStateChange(newState, oldState) {
        if (newState.isSidebarVisible !== oldState.isSidebarVisible) {
            this.dom.sidebar.classList.toggle('collapsed', !newState.isSidebarVisible);
        }

        // --- View Mode Toggle ---
        if (newState.mainViewMode !== oldState.mainViewMode) {
            this.dom.mainPanel.classList.toggle('preview-mode', newState.mainViewMode === 'preview');
            this.dom.toggleViewBtn.innerHTML = newState.mainViewMode === 'preview' 
                ? '<i class="fas fa-edit"></i> 编辑' 
                : '<i class="fas fa-book-open"></i> 预览';
            this.dom.toggleViewBtn.title = newState.mainViewMode === 'preview' 
                ? '切换到编辑视图' 
                : '切换到预览视图';
        }
        
        // --- Dynamic Title and Button States ---
        const selectedTask = newState.tasks.find(t => t.uuid === newState.selectedTaskId);
        
        // Update Title
        if (newState.mainViewMode === 'preview' && selectedTask) {
            this.dom.panelTitle.innerHTML = `<i class="fas fa-eye"></i> ${selectedTask.title}`;
        } else if (newState.mainViewMode === 'preview') {
            this.dom.panelTitle.innerHTML = `<i class="fas fa-eye"></i> 任务预览`;
        } else if (newState.selectedTaskId === 'new') {
             this.dom.panelTitle.innerHTML = `<i class="fas fa-edit"></i> 编辑新任务`;
        } else if (selectedTask) {
            this.dom.panelTitle.innerHTML = `<i class="fas fa-edit"></i> ${selectedTask.title}`;
        } else {
            this.dom.panelTitle.innerHTML = `<i class="fas fa-code"></i> YAML 编辑器`;
        }
            
        // Update Button States
        this.dom.editTagsBtn.disabled = !selectedTask;
        this.dom.printPreviewBtn.disabled = newState.mainViewMode !== 'preview';
        
        // --- Update Review Count ---
        this.dom.reviewCount.textContent = this.store.getDueTasksCount();
        
        // [NEW] Update select all checkbox state
        const visibleTasks = this.store.getFilteredTasks();
        const { selectedTaskIds } = newState;
        
        if (visibleTasks.length === 0) {
            this.dom.selectAllCheckbox.checked = false;
            this.dom.selectAllCheckbox.indeterminate = false;
        } else {
            const selectedCount = visibleTasks.filter(task => selectedTaskIds.has(task.uuid)).length;
            this.dom.selectAllCheckbox.checked = selectedCount === visibleTasks.length;
            this.dom.selectAllCheckbox.indeterminate = selectedCount > 0 && selectedCount < visibleTasks.length;
        }

        // [NEW] Disable delete button if nothing is selected
        this.dom.deleteSelectedBtn.disabled = selectedTaskIds.size === 0;
    }

    handlePrintPreview() {
        const previewContent = document.getElementById('task_previewContainer').innerHTML;
        if (!previewContent) return;

        const printWindow = window.open('', '_blank');
        printWindow.document.write(`
            <!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><title>打印预览</title>
            <link rel="stylesheet" href="./styles.css">
            <style>
                body { margin: 20px; background: white; color: black; }
                .task-card .review-actions, .task-card .show-answer-btn { display: none !important; }
                .task-card .answer-section { display: block !important; visibility: visible !important; }
            </style></head><body>
            <div id="task_previewContainer">${previewContent}</div>
            </body></html>
        `);
        printWindow.document.close();
        setTimeout(() => {
             printWindow.print();
             printWindow.close();
        }, 500);
    }

    destroy() {
        this.unsubscribe();
    }
}
