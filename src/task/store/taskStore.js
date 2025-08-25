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
            isSidebarVisible: true,
            isEditorCollapsed: false,
            
            // 编辑器状态
            yamlContent: '',

            // 临时状态
            isLoading: true,
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
            if (filters.reasons.length > 0 && !reasons.includes(task.analysis?.reason_for_error)) return false;
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

    getStatistics() {
        const tasks = this.getFilteredTasks();
        const stats = { total: tasks.length, bySubject: {}, byReason: {}, dueToday: 0, overdue: 0 };
        const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);
        const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
        tasks.forEach(task => {
            const subject = task.subject || '未分类';
            stats.bySubject[subject] = (stats.bySubject[subject] || 0) + 1;
            const reason = task.analysis.reason_for_error || '未知原因';
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
        const firstSubject = Object.keys(this.state.taxonomy)[0] || 'all';
        this.setState({ tasks, taxonomy: this.state.taxonomy, filters: { ...this.state.filters, subject: firstSubject }, isLoading: false });
    }

    async loadFromYAML() {
        try {
            const data = YAML.parse(this.state.yamlContent);
            if (!data.subject || !data.tasks) throw new Error("YAML must contain 'subject' and 'tasks' keys.");
            
            const newTasks = data.tasks.map(item => this._normalizeTask(item, data.subject));
            const taskMap = new Map(this.state.tasks.map(t => [t.uuid, t]));
            newTasks.forEach(t => taskMap.set(t.uuid, t));
            const allTasks = Array.from(taskMap.values());
            
            await storage.saveAllTasks(allTasks);
            this.state.tasks = allTasks;
            this._buildTaxonomy();
            this.setState({ tasks: allTasks, taxonomy: this.state.taxonomy });
            return { success: true };
        } catch (error) {
            console.error("Failed to load from YAML:", error);
            alert(`保存失败: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    async rateTask(taskId, rating) {
        const tasks = [...this.state.tasks];
        const task = tasks.find(t => t.uuid === taskId);
        if (!task) return;
        task.review = { ...task.review, ...calculateNextReview(task.review, rating) };
        task.lastReviewed = Date.now();
        await storage.updateTask(task);
        this.setState({ tasks });
    }

    _normalizeTask(item, subject) {
        if (item.simple_task) {
            const s = item.simple_task;
            return {
                uuid: crypto.randomUUID(), title: s.problem.substring(0, 30), problem: s.problem,
                correct_answer: { content: s.answer }, analysis: { difficulty: s.difficulty || 3, reason_for_error: "知识点模糊" },
                tags: s.tags || [], subject, review: { due: Date.now(), interval: 0, easeFactor: 2.5, state: 'new' }
            };
        }
        return { ...item, subject, uuid: item.uuid || crypto.randomUUID(), review: item.review || { due: Date.now(), interval: 0, easeFactor: 2.5, state: 'new' } };
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

    // --- UI State Actions ---
    setYamlContent(content) { this.setState({ yamlContent: content }); }
    setFilters(newFilters) { this.setState({ filters: { ...this.state.filters, ...newFilters }, currentPage: 1 }); }
    setCurrentPage(page) { this.setState({ currentPage: page }); }
    setSelectedTask(taskId) { this.setState({ selectedTaskId: taskId }); }
    toggleSidebar() { this.setState({ isSidebarVisible: !this.state.isSidebarVisible }); }
    toggleEditor() { this.setState({ isEditorCollapsed: !this.state.isEditorCollapsed }); }
}

export const taskStore = new TaskStore();
