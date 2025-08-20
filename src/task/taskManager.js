// src/task/taskManager.js

import YAML from 'yaml';
import * as storage from '../services/storageService.js';
import { calculateNextReview } from '../services/srs.js';

/**
 * [重构后] Task 模块的核心业务逻辑管理器。
 */
export class TaskManager {
    constructor() {
        this.tasks = []; // 内存中的任务缓存
        this.taxonomy = {}; // 分类体系: { subject: { tags: Set, reasons: Set } }
    }

    /**
     * 从 IndexedDB 初始化管理器。
     */
    async initialize() {
        this.tasks = await storage.loadAllTasks();
        this._buildTaxonomy();
        console.log(`TaskManager initialized with ${this.tasks.length} tasks.`);
    }

    /**
     * 从 YAML 字符串加载并处理任务。
     * @param {string} yamlString
     */
    async loadFromYAML(yamlString) {
        try {
            const data = YAML.parse(yamlString);
            if (!data.subject || !data.tasks) { // [重构] mistakes -> tasks
                throw new Error("YAML must contain 'subject' and 'tasks' keys.");
            }

            const newTasks = data.tasks.map(item => this._normalizeTask(item, data.subject));
            
            const taskMap = new Map(this.tasks.map(t => [t.uuid, t]));
            newTasks.forEach(t => taskMap.set(t.uuid, t));
            this.tasks = Array.from(taskMap.values());
            
            await storage.saveAllTasks(this.tasks);
            this._buildTaxonomy();
            return { success: true, count: newTasks.length };
        } catch (error) {
            console.error("Failed to load from YAML:", error);
            return { success: false, error: error.message };
        }
    }

    /**
     * 标准化任务对象，处理简易格式并确保 review 对象存在。
     * @private
     */
    _normalizeTask(item, subject) {
        // [重构] mistake -> task, simple_problem -> simple_task
        if (item.simple_task) {
            const simple = item.simple_task;
            return {
                uuid: crypto.randomUUID(),
                title: simple.problem.substring(0, 30) + (simple.problem.length > 30 ? "..." : ""),
                problem: simple.problem,
                attachments: [],
                my_answer: { content: "" },
                correct_answer: { content: simple.answer, explanation: "" },
                analysis: { 
                    reason_for_error: "知识点模糊",
                    difficulty: simple.difficulty || 3
                },
                tags: simple.tags || [],
                subject: subject,
                is_simple: true,
                review: { due: Date.now(), interval: 0, easeFactor: 2.5, state: 'new' }
            };
        }
        
        const fullTask = { ...item, subject: subject };
        if (!fullTask.review) {
            fullTask.review = { due: Date.now(), interval: 0, easeFactor: 2.5, state: 'new' };
        }
        if (!fullTask.uuid) {
            fullTask.uuid = crypto.randomUUID();
        }
        return fullTask;
    }

    /**
     * 构建分类体系。
     * @private
     */
    _buildTaxonomy() {
        const newTaxonomy = {};
        this.tasks.forEach(task => {
            const subject = task.subject || '未分类';
            if (!newTaxonomy[subject]) {
                newTaxonomy[subject] = { tags: new Set(), reasons: new Set() };
            }
            task.tags?.forEach(tag => newTaxonomy[subject].tags.add(tag));
            if (task.analysis?.reason_for_error) {
                newTaxonomy[subject].reasons.add(task.analysis.reason_for_error);
            }
        });
        this.taxonomy = newTaxonomy;
    }

    /**
     * 根据筛选条件获取任务。
     * @param {object} filters - { subject, tags, reasons }
     * @returns {Array<object>} - 排序后的任务数组。
     */
    getFilteredTasks(filters = {}) {
        const { subject = 'all', tags = [], reasons = [] } = filters;
        return this.tasks.filter(task => {
            if (subject !== 'all' && task.subject !== subject) return false;
            if (tags.length > 0 && !tags.every(tag => task.tags?.includes(tag))) return false;
            if (reasons.length > 0 && !reasons.includes(task.analysis?.reason_for_error)) return false;
            return true;
        }).sort((a, b) => a.review.due - b.review.due);
    }
    
    /**
     * 更新任务的复习状态。
     * @param {string} taskId 
     * @param {number} rating - 0:Again, 1:Hard, 2:Good, 3:Easy
     * @returns {object|null} - 更新后的任务。
     */
    async updateReviewStatus(taskId, rating) {
        const task = this.tasks.find(t => t.uuid === taskId);
        if (!task) return null;

        const newReviewStatus = calculateNextReview(task.review, rating);
        
        task.review = { ...task.review, ...newReviewStatus };
        task.lastReviewed = Date.now();

        await storage.updateTask(task);
        return task;
    }
    
    getTaxonomy() {
        return this.taxonomy;
    }
}
