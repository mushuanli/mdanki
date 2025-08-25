// src/task/components/StatisticsComponent.js
export class StatisticsComponent {
    constructor(store) {
        this.store = store;
        this.dom = { dashboard: document.getElementById('task_statsDashboard') };
        this.unsubscribe = store.subscribe(this.render.bind(this), ['tasks', 'filters']);
    }
    render() {
        const stats = this.store.getStatistics();
        const topSubjects = Object.entries(stats.bySubject).sort((a,b)=>b[1]-a[1]).slice(0,3);
        const topReasons = Object.entries(stats.byReason).sort((a,b)=>b[1]-a[1]).slice(0,3);
        const list = (items) => items.map(([k,v]) => `<div class="list-item"><span>${k}</span><span class="list-value">${v}</span></div>`).join('') || '<span>暂无数据</span>';
        this.dom.dashboard.innerHTML = `
            <div class="stats-card"><div class="stats-card-header"><i class="fas fa-chart-line"></i> 待办状态</div><div class="stats-card-body"><div class="stat-item"><span class="stat-value overdue">${stats.overdue}</span><span class="stat-label">已过期</span></div><div class="stat-item"><span class="stat-value today">${stats.dueToday}</span><span class="stat-label">今日到期</span></div><div class="stat-item"><span class="stat-value">${stats.total}</span><span class="stat-label">总数</span></div></div></div>
            <div class="stats-card"><div class="stats-card-header"><i class="fas fa-book"></i> 任务分布</div><div class="stats-card-body list-style">${list(topSubjects)}</div></div>
            <div class="stats-card"><div class="stats-card-header"><i class="fas fa-diagnoses"></i> 主要任务状态</div><div class="stats-card-body list-style">${list(topReasons)}</div></div>`;
    }
    destroy() { this.unsubscribe(); }
}
