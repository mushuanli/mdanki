// src/mistakes/statistics.js

export class MistakeStatistics {
    // [REMOVED] 构造函数不再需要 ui 对象
    constructor() {}

    generateStats(allMistakes) {
        const stats = {
            total: allMistakes.length,
            bySubject: {},
            byReason: {},
            dueToday: 0,
            overdue: 0,
        };

        const today = new Date();
        today.setHours(23, 59, 59, 999);
        const startOfToday = new Date();
        startOfToday.setHours(0,0,0,0);

        allMistakes.forEach(m => {
            // 按科目
            stats.bySubject[m.subject] = (stats.bySubject[m.subject] || 0) + 1;
            // 按原因
            const reason = m.analysis.reason_for_error;
            stats.byReason[reason] = (stats.byReason[reason] || 0) + 1;
            
            // 复习状态
            const dueDate = new Date(m.review.due);
            if (dueDate < startOfToday) stats.overdue++;
            else if (dueDate <= today) stats.dueToday++;
        });
        return stats;
    }

    /**
     * [REVISED] 此方法现在返回 HTML 字符串，而不是直接渲染
     * @param {Array<object>} allMistakes 
     * @returns {string} - The HTML string for the dashboard
     */
    getDashboardHtml(allMistakes) {
        const stats = this.generateStats(allMistakes);
        const reasonEntries = Object.entries(stats.byReason).sort((a,b) => b[1] - a[1]).slice(0, 3);
        const subjectEntries = Object.entries(stats.bySubject).sort((a,b) => b[1] - a[1]).slice(0, 3);
        
        return `
            <div class="stats-card">
                <div class="stats-card-header"><i class="fas fa-chart-line"></i> 复习状态</div>
                <div class="stats-card-body">
                    <div class="stat-item"><span class="stat-value overdue">${stats.overdue}</span><span class="stat-label">已过期</span></div>
                    <div class="stat-item"><span class="stat-value today">${stats.dueToday}</span><span class="stat-label">今日到期</span></div>
                    <div class="stat-item"><span class="stat-value">${stats.total}</span><span class="stat-label">总数</span></div>
                </div>
            </div>
            <div class="stats-card">
                <div class="stats-card-header"><i class="fas fa-book"></i> 科目分布</div>
                <div class="stats-card-body list-style">
                    ${subjectEntries.length > 0 ? subjectEntries.map(([key, val]) => `<div class="list-item"><span>${key}</span><span class="list-value">${val}</span></div>`).join('') : '<span>暂无数据</span>'}
                </div>
            </div>
            <div class="stats-card">
                <div class="stats-card-header"><i class="fas fa-diagnoses"></i> 主要错误原因</div>
                <div class="stats-card-body list-style">
                    ${reasonEntries.length > 0 ? reasonEntries.map(([key, val]) => `<div class="list-item"><span>${key}</span><span class="list-value">${val}</span></div>`).join('') : '<span>暂无数据</span>'}
                </div>
            </div>
        `;
    }
}