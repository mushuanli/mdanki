// src/mistakes/mistakeManager.js

import YAML from 'yaml';
import * as storage from '../services/storageService.js';
import { calculateNextReview } from '../services/srs.js';

export class MistakeManager {
    constructor() {
        this.mistakes = []; // 内存中的错题缓存
        this.taxonomy = {}; // { math: { tags: Set, reasons: Set }, ... }
    }

    /**
     * 从 IndexedDB 初始化管理器
     */
    async initialize() {
        this.mistakes = await storage.loadAllMistakes();
        this._buildTaxonomy();
        console.log(`MistakeManager initialized with ${this.mistakes.length} mistakes.`);
    }

    /**
     * 从 YAML 字符串加载并处理错题
     * @param {string} yamlString
     */
    async loadFromYAML(yamlString) {
        try {
            const data = YAML.parse(yamlString);
            if (!data.subject || !data.mistakes) {
                throw new Error("YAML must contain 'subject' and 'mistakes' keys.");
            }

            const newMistakes = data.mistakes.map(item => this._normalizeMistake(item, data.subject));
            
            // 合并新旧错题，使用 Set 和 map 保证 uuid 唯一性
            const mistakeMap = new Map(this.mistakes.map(m => [m.uuid, m]));
            newMistakes.forEach(m => mistakeMap.set(m.uuid, m));
            this.mistakes = Array.from(mistakeMap.values());
            
            await storage.saveAllMistakes(this.mistakes);
            this._buildTaxonomy(); // 重建分类
            return { success: true, count: newMistakes.length };
        } catch (error) {
            console.error("Failed to load from YAML:", error);
            return { success: false, error: error.message };
        }
    }

    /**
     * 标准化错题对象，转换简易格式并确保 review 对象存在
     * @private
     */
    _normalizeMistake(item, subject) {
        if (item.simple_problem) {
            const simple = item.simple_problem;
            return {
                uuid: crypto.randomUUID(),
                title: simple.problem.substring(0, 30) + (simple.problem.length > 30 ? "..." : ""),
                problem: simple.problem,
                attachments: [],
                my_answer: { content: "" },
                correct_answer: { content: simple.answer, explanation: "" },
                analysis: { 
                    reason_for_error: "知识点模糊", // 默认原因
                    difficulty: simple.difficulty || 3
                },
                tags: simple.tags || [],
                subject: subject,
                is_simple: true,
                review: { // 默认复习状态
                    due: Date.now(),
                    interval: 0,
                    easeFactor: 2.5,
                    state: 'new'
                }
            };
        }
        
        // 对于详细格式，确保 review 对象存在
        const fullMistake = { ...item, subject: subject };
        if (!fullMistake.review) {
            fullMistake.review = {
                due: Date.now(),
                interval: 0,
                easeFactor: 2.5,
                state: 'new'
            };
        }
        if (!fullMistake.uuid) {
            fullMistake.uuid = crypto.randomUUID();
        }
        return fullMistake;
    }

    /**
     * 从当前所有错题中构建科目、标签、原因的分类体系
     * @private
     */
    _buildTaxonomy() {
        const newTaxonomy = {};
        this.mistakes.forEach(m => {
            if (!m.subject) return;
            if (!newTaxonomy[m.subject]) {
                newTaxonomy[m.subject] = { tags: new Set(), reasons: new Set() };
            }
            m.tags?.forEach(tag => newTaxonomy[m.subject].tags.add(tag));
            if (m.analysis?.reason_for_error) {
                newTaxonomy[m.subject].reasons.add(m.analysis.reason_for_error);
            }
        });
        this.taxonomy = newTaxonomy;
    }

    /**
     * 根据筛选条件获取错题
     * @param {object} filters - { subject, tags, reasons }
     * @returns {Array<object>} - 排序后的错题数组
     */
    getFilteredMistakes(filters = {}) {
        const { subject = 'all', tags = [], reasons = [] } = filters;

        return this.mistakes.filter(m => {
            if (subject !== 'all' && m.subject !== subject) return false;
            if (tags.length > 0 && !tags.every(tag => m.tags?.includes(tag))) return false;
            if (reasons.length > 0 && !reasons.includes(m.analysis?.reason_for_error)) return false;
            return true;
        }).sort((a, b) => a.review.due - b.review.due);
    }
    
    /**
     * 更新错题的复习状态
     * @param {string} mistakeId 
     * @param {number} rating - 0:Again, 1:Hard, 2:Good, 3:Easy
     * @returns {object|null} - 更新后的错题
     */
    async updateReviewStatus(mistakeId, rating) {
        const mistake = this.mistakes.find(m => m.uuid === mistakeId);
        if (!mistake) return null;

        const newReviewStatus = calculateNextReview(mistake.review, rating);
        
        mistake.review = { ...mistake.review, ...newReviewStatus };
        mistake.lastReviewed = Date.now();

        await storage.updateMistake(mistake);
        return mistake;
    }
    
    getTaxonomy() {
        return this.taxonomy;
    }
}