// src/task/store/taskStore.js
import YAML from 'yaml';
import * as storage from '../../services/storageService.js';
import { calculateNextReview } from '../../services/srs.js';

class TaskStore {
    constructor() {
        this.state = {
            // 数据状态
            tasks: [],
            taxonomy: {}, // { subject: { tags: Set, reasons: Set } }

            // UI 状态
            filters: { subject: 'all', tags: [], reasons: [] },
            currentPage: 1,
            pageSize: 5,
            selectedTaskId: null,
            selectedTaskIds: new Set(), // [NEW] For checkbox selection
            isSidebarVisible: true,
            mainViewMode: 'editor',
            
            // 编辑器状态
            yamlContent: '',

            // 临时状态
            isLoading: true,
            
            // 待办状态
            isReviewMode: false,
            currentReviewTask: null,

            // [NEW] Modal State
            isTaskModalVisible: false,
            taskModalContext: { mode: 'create', tempContent: '' }, // mode: 'create' | 'complete'
        };
        this.listeners = new Set();
    }

    // --- Store 基础方法 ---
    subscribe(listener, keysToWatch) {
        const enhancedListener = { callback: listener, keys: keysToWatch ? new Set(keysToWatch) : null };
        this.listeners.add(enhancedListener);
        return () => this.listeners.delete(enhancedListener);
    }

    setState(updates) {
        const oldState = { ...this.state };
        const hasChanged = Object.keys(updates).some(key => this.state[key] !== updates[key]);
        if (!hasChanged) return;
        this.state = { ...this.state, ...updates };
        this.notify(oldState, this.state);
    }

    notify(oldState, newState) {
        const changedKeys = new Set(Object.keys(newState).filter(key => oldState[key] !== newState[key]));
        if (changedKeys.size === 0) return;
        this.listeners.forEach(l => {
            if (!l.keys || [...l.keys].some(key => changedKeys.has(key))) {
                l.callback(newState, oldState);
            }
        });
    }
    
    getState() { return { ...this.state }; }

    // --- Selectors (派生数据) ---
    getFilteredTasks() {
        const { tasks, filters } = this.state;
        return tasks.filter(task => {
            if (filters.subject !== 'all' && task.subject !== filters.subject) return false;
            if (filters.tags.length > 0 && !filters.tags.every(tag => task.tags?.includes(tag))) return false;
            if (filters.reasons.length > 0 && !filters.reasons.includes(task.analysis?.reason_for_error)) return false;
            return true;
        }).sort((a, b) => (a.review.due || 0) - (b.review.due || 0));
    }

    getPagedTasks() {
        const filtered = this.getFilteredTasks();
        const start = (this.state.currentPage - 1) * this.state.pageSize;
        return filtered.slice(start, start + this.state.pageSize);
    }
    
    getTotalPages() {
        return Math.ceil(this.getFilteredTasks().length / this.state.pageSize);
    }

    getDueTasksCount() {
        const now = new Date();
        return this.getFilteredTasks().filter(task => 
            task.review.due && new Date(task.review.due) <= now
        ).length;
    }

    getStatistics() {
        const tasks = this.getFilteredTasks();
        const stats = { total: tasks.length, bySubject: {}, byReason: {}, dueToday: 0, overdue: 0 };
        const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);
        const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
        tasks.forEach(task => {
            const subject = task.subject || '未分类';
            stats.bySubject[subject] = (stats.bySubject[subject] || 0) + 1;
            const reason = task.analysis?.reason_for_error || '未知原因';
            stats.byReason[reason] = (stats.byReason[reason] || 0) + 1;
            const dueDate = new Date(task.review.due);
            if (dueDate < todayStart) stats.overdue++;
            else if (dueDate <= todayEnd) stats.dueToday++;
        });
        return stats;
    }

    // --- Actions (业务逻辑) ---
    async initialize() {
        this.setState({ isLoading: true });
        const tasks = await storage.loadAllTasks();
        this.state.tasks = tasks; // Use internal state to avoid render before taxonomy is built
        this._buildTaxonomy();
        // [Req 5] Default filter to 'all'
        this.setState({ 
            tasks, 
            taxonomy: this.state.taxonomy, 
            filters: { subject: 'all', tags: [], reasons: [] }, 
            isLoading: false 
        });
    }

    // [Req 1] Action to start creating a new task
    async createNewTask() {
        if (this.state.selectedTaskId === 'new') return;

        // Step 1: Check if the currently selected task has unsaved changes.
        const canProceed = await this.promptIfUnsaved();
        if (!canProceed) {
            return; // User cancelled the action.
        }

        // Step 2: Set the state to start creating a new task.
        // This is now a single, atomic state update.
        this.setState({
            selectedTaskId: 'new',
            yamlContent: 'problem: \ncorrect_answer:\n  content: \ntags: []\n',
            mainViewMode: 'editor',
            isTaskModalVisible: true,
            taskModalContext: { mode: 'create', tempContent: '' }
        });
    }
    
    // [Req 2] The new "save" button logic
    async saveCurrentTask() {
        const { selectedTaskId, yamlContent } = this.state;
        if (!selectedTaskId) return;

        if (selectedTaskId === 'new') {
            // If it's a new task, we must get name and tags first
            this.setState({
                isTaskModalVisible: true,
                taskModalContext: { mode: 'complete', tempContent: yamlContent }
            });
            return { success: false, reason: 'requires_naming' };
        } else {
            // It's an existing task, just update its content
            const task = this.state.tasks.find(t => t.uuid === selectedTaskId);
            if (task && yamlContent) {
                try {
                    const updatedData = YAML.parse(yamlContent);
                    // Preserve essential fields not in the editor
                    const updatedTask = { ...task, ...updatedData };
                    await storage.updateTask(updatedTask);
                    
                    const newTasks = this.state.tasks.map(t => t.uuid === selectedTaskId ? updatedTask : t);
                    this.state.tasks = newTasks;
                    this._buildTaxonomy();
                    this.setState({ tasks: newTasks, taxonomy: this.state.taxonomy });
                    return { success: true };
                } catch (error) {
                    alert(`保存失败: 无效的YAML格式 - ${error.message}`);
                    return { success: false, error };
                }
            }
        }
    }
    
    // [Req 1 & 2] Action called by the modal to finalize task creation/completion
    async commitTask(name, tags) {
        const { tempContent } = this.state.taskModalContext;
        const contentToParse = tempContent || this.state.yamlContent;
        let contentData;
        try {
            contentData = YAML.parse(contentToParse);
        } catch (e) {
            contentData = { problem: contentToParse, correct_answer: { content: '' } };
        }
    
        const newTaskData = { ...contentData, title: name, tags: tags };
        const subject = this.state.filters.subject === 'all' ? '未分类' : this.state.filters.subject;
        
        const newTask = this._normalizeTask(newTaskData, subject);
    
        await storage.updateTask(newTask); // `updateTask` (put) works for creation too
        
        const newTasks = [...this.state.tasks, newTask];
        this.state.tasks = newTasks;
        this._buildTaxonomy();
    
        this.setState({
            tasks: newTasks,
            taxonomy: this.state.taxonomy,
            selectedTaskId: newTask.uuid, // Select the newly created task
            yamlContent: this._taskToYAML(newTask), // Update editor with the full task
            isTaskModalVisible: false // Hide modal
        });
    }

    // [MODIFIED Req 2] setSelectedTask now checks for unsaved work
    async setSelectedTask(taskId) {
        if (this.state.selectedTaskId === taskId) return;
    
        const canProceed = await this.promptIfUnsaved();
        if (!canProceed) {
            return; // Abort selection change if user cancels.
        }
    
        const task = this.state.tasks.find(t => t.uuid === taskId);
        this.setState({ 
            selectedTaskId: taskId,
            yamlContent: task ? this._taskToYAML(task) : ''
        });
    }

    // [Req 3] Export filtered tasks
    exportFilteredTasks() {
        const tasksToExport = this.getFilteredTasks();
        if (tasksToExport.length === 0) {
            alert("当前筛选条件下没有可导出的任务。");
            return;
        }
        
        const exportableTasks = tasksToExport.map(t => this._taskToExportable(t));
        const subject = this.state.filters.tags.length > 0 ? this.state.filters.tags.join('_') : 'all_tasks';
        const yamlString = YAML.stringify({ subject: subject, tasks: exportableTasks });

        const blob = new Blob([yamlString], { type: 'text/yaml;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `tasks-export-${subject}.yaml`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }
    
    // [Req 4] Import tasks that match the current filter
    async importTasks(yamlContent) {
        try {
            const data = YAML.parse(yamlContent);
            if (!data || !Array.isArray(data.tasks)) {
                throw new Error("YAML格式无效，必须包含 'tasks' 数组。");
            }
            
            const currentFilterTags = new Set(this.state.filters.tags);
            const importedTasks = [];
            
            for (const item of data.tasks) {
                const taskTags = new Set(item.tags || []);
                // If no filter is active OR if the task has at least one tag matching the filter
                if (currentFilterTags.size === 0 || [...taskTags].some(tag => currentFilterTags.has(tag))) {
                    const normalizedTask = this._normalizeTask(item, item.subject || data.subject || '导入');
                    importedTasks.push(normalizedTask);
                }
            }

            if (importedTasks.length === 0) {
                alert("没有在文件中找到符合当前标签筛选条件的任务。");
                return;
            }

            const allTasks = [...this.state.tasks, ...importedTasks];
            await storage.saveAllTasks(allTasks);

            this.state.tasks = allTasks;
            this._buildTaxonomy();
            this.setState({ tasks: allTasks, taxonomy: this.state.taxonomy });
            
            alert(`成功导入 ${importedTasks.length} 个任务！`);
        } catch (error) {
            console.error("Failed to import from YAML:", error);
            alert(`导入失败: ${error.message}`);
        }
    }

    // --- Helper and Other Methods ---

    // [NEW] Helper to check for unsaved changes before switching context.
    async promptIfUnsaved() {
        const { selectedTaskId, yamlContent, tasks } = this.state;

        // Case 1: Editing a new, unnamed task
        if (selectedTaskId === 'new' && yamlContent.trim().length > 10) {
            return confirm("您正在编辑一个新任务，切换将丢失未保存的进度。是否继续？");
        }

        // Case 2: Editing an existing task that has been modified
        if (selectedTaskId && selectedTaskId !== 'new') {
            const currentTask = tasks.find(t => t.uuid === selectedTaskId);
            if (currentTask) {
                const originalYAML = this._taskToYAML(currentTask);
                if (yamlContent !== originalYAML) {
                    return confirm("当前任务有未保存的更改，切换将丢失这些更改。是否继续？");
                }
            }
        }
        
        return true; // No unsaved changes, safe to proceed.
    }

    // [NEW] Actions for selection
    toggleTaskSelection(taskId) {
        const newSelectedIds = new Set(this.state.selectedTaskIds);
        if (newSelectedIds.has(taskId)) {
            newSelectedIds.delete(taskId);
        } else {
            newSelectedIds.add(taskId);
        }
        this.setState({ selectedTaskIds: newSelectedIds });
    }

    selectAllTasks() {
        const visibleTaskIds = this.getFilteredTasks().map(task => task.uuid);
        this.setState({ selectedTaskIds: new Set(visibleTaskIds) });
    }

    deselectAllTasks() {
        this.setState({ selectedTaskIds: new Set() });
    }

    // [NEW] Action for renaming a task
    async renameTask(taskId, newName) {
        if (!newName || !newName.trim()) return;

        const tasks = [...this.state.tasks];
        const taskIndex = tasks.findIndex(t => t.uuid === taskId);
        if (taskIndex === -1) return;

        const updatedTask = { ...tasks[taskIndex], title: newName.trim() };
        tasks[taskIndex] = updatedTask;

        this.setState({ tasks });
        await storage.updateTask(updatedTask);
    }
    
    // [NEW] Action for deleting tasks
    async deleteTasks(taskIds) {
        if (!taskIds || taskIds.length === 0) return;
        if (!confirm(`确定要删除选中的 ${taskIds.length} 个任务吗？`)) return;

        await storage.deleteTasks(taskIds);

        const remainingTasks = this.state.tasks.filter(task => !taskIds.includes(task.uuid));
        
        const newState = {
            tasks: remainingTasks,
            selectedTaskIds: new Set(), // Clear selection
        };
        
        // If the currently active task was deleted, clear the editor
        if (taskIds.includes(this.state.selectedTaskId)) {
            newState.selectedTaskId = null;
            newState.yamlContent = '';
        }

        this.state.tasks = remainingTasks; // Update internal state before setState to rebuild taxonomy correctly
        this._buildTaxonomy();
        newState.taxonomy = this.state.taxonomy;

        this.setState(newState);
    }

    _normalizeTask(item, subject) {
        return {
            uuid: item.uuid || crypto.randomUUID(),
            title: item.title || '无标题任务',
            problem: item.problem || '',
            correct_answer: item.correct_answer || { content: '' },
            analysis: item.analysis || { difficulty: 3, reason_for_error: "知识点模糊" },
            tags: item.tags || [],
            subject: subject,
            review: item.review || { due: Date.now(), interval: 0, easeFactor: 2.5, state: 'new' }
        };
    }

    _buildTaxonomy() {
        const taxonomy = {};
        this.state.tasks.forEach(task => {
            const subject = task.subject || '未分类';
            if (!taxonomy[subject]) taxonomy[subject] = { tags: new Set(), reasons: new Set() };
            task.tags?.forEach(tag => taxonomy[subject].tags.add(tag));
            if (task.analysis?.reason_for_error) taxonomy[subject].reasons.add(task.analysis.reason_for_error);
        });
        this.state.taxonomy = taxonomy;
    }

    _taskToYAML(task) {
        if (!task) return '';
        const { uuid, title, subject, review, ...rest } = task;
        return YAML.stringify(rest);
    }
    
    _taskToExportable(task) {
        const { uuid, subject, review, ...rest } = task;
        return rest;
    }

    // --- Other Methods (Unchanged) ---
    async rateTask(taskId, rating) {
        const tasks = [...this.state.tasks];
        const task = tasks.find(t => t.uuid === taskId);
        if (!task) return;
        task.review = { ...task.review, ...calculateNextReview(task.review, rating) };
        task.lastReviewed = Date.now();
        await storage.updateTask(task);
        this.setState({ tasks });
    }

    async editSelectedTaskTags() {
        const { selectedTaskId, tasks } = this.state;
        if (!selectedTaskId || selectedTaskId === 'new') {
            alert("请先在列表中选择一个已保存的任务。");
            return;
        }

        const taskIndex = tasks.findIndex(t => t.uuid === selectedTaskId);
        if (taskIndex === -1) return;
        
        const task = tasks[taskIndex];
        const currentTags = task.tags ? task.tags.join(', ') : '';
        
        const newTagsStr = prompt("请输入新的标签，用逗号分隔：", currentTags);

        if (newTagsStr === null) return;

        const newTags = newTagsStr.trim() === '' 
            ? [] 
            : newTagsStr.split(',').map(tag => tag.trim()).filter(Boolean);

        const updatedTask = { ...task, tags: newTags };
        
        const newTasks = [...tasks];
        newTasks[taskIndex] = updatedTask;
        
        this.state.tasks = newTasks;
        this._buildTaxonomy();
        this.setState({ tasks: newTasks, taxonomy: this.state.taxonomy, yamlContent: this._taskToYAML(updatedTask) });
        
        await storage.updateTask(updatedTask);
    }

    setYamlContent(content) { this.setState({ yamlContent: content }); }
    setFilters(newFilters) { this.setState({ filters: { ...this.state.filters, ...newFilters }, currentPage: 1 }); }
    setCurrentPage(page) { this.setState({ currentPage: page }); }
    toggleSidebar() { this.setState({ isSidebarVisible: !this.state.isSidebarVisible }); }
    toggleMainViewMode() { this.setState({ mainViewMode: this.state.mainViewMode === 'editor' ? 'preview' : 'editor' }); }

    async startReview() {
        const dueTasks = this.getFilteredTasks().filter(task => new Date(task.review.due) <= new Date());
        if (dueTasks.length === 0) {
            alert('暂无需要待办的任务！');
            return;
        }
        this.setState({ isReviewMode: true, reviewQueue: dueTasks, reviewIndex: 0, currentReviewTask: dueTasks[0] });
    }

    async rateCurrentTask(rating) {
        const { currentReviewTask, reviewQueue, reviewIndex } = this.state;
        if (!currentReviewTask) return;

        // 使用SRS算法更新任务
        await this.rateTask(currentReviewTask.uuid, rating);
        const nextIndex = reviewIndex + 1;
        if (nextIndex >= reviewQueue.length) {
            this.setState({ isReviewMode: false, currentReviewTask: null, reviewQueue: [], reviewIndex: 0 });
            alert('待办完成！');
        } else {
            this.setState({ reviewIndex: nextIndex, currentReviewTask: reviewQueue[nextIndex] });
        }
    }

    exitReview() {
        this.setState({ isReviewMode: false, currentReviewTask: null, reviewQueue: [], reviewIndex: 0 });
    }

}

export const taskStore = new TaskStore();
