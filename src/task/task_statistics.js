// src/task/task_statistics.js

/**
 * [重构后] Task 模块的统计数据生成器。
 */
export class TaskStatistics {
    generateStats(allTasks) {
        const stats = { total: allTasks.length, bySubject: {}, byReason: {}, dueToday: 0, overdue: 0 };
        const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);
        const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);

        allTasks.forEach(task => {
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

    getDashboardHtml(allTasks) {
        const stats = this.generateStats(allTasks);
        const topSubjects = Object.entries(stats.bySubject).sort((a,b) => b[1] - a[1]).slice(0, 3);
        const topReasons = Object.entries(stats.byReason).sort((a,b) => b[1] - a[1]).slice(0, 3);
        
        const renderList = (items) => items.length > 0
            ? items.map(([key, val]) => `<div class="list-item"><span>${key}</span><span class="list-value">${val}</span></div>`).join('')
            : '<span>暂无数据</span>';

        return `
            <div class="stats-card">
                <div class="stats-card-header"><i class="fas fa-chart-line"></i> 待办状态</div>
                <div class="stats-card-body">
                    <div class="stat-item"><span class="stat-value overdue">${stats.overdue}</span><span class="stat-label">已过期</span></div>
                    <div class="stat-item"><span class="stat-value today">${stats.dueToday}</span><span class="stat-label">今日到期</span></div>
                    <div class="stat-item"><span class="stat-value">${stats.total}</span><span class="stat-label">总数</span></div>
                </div>
            </div>
            <div class="stats-card">
                <div class="stats-card-header"><i class="fas fa-book"></i> 任务分布</div>
                <div class="stats-card-body list-style">${renderList(topSubjects)}</div>
            </div>
            <div class="stats-card">
                <div class="stats-card-header"><i class="fas fa-diagnoses"></i> 主要任务状态</div>
                <div class="stats-card-body list-style">${renderList(topReasons)}</div>
            </div>
        `;
    }
}