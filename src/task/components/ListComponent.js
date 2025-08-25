// src/task/components/ListComponent.js
export class ListComponent {
    constructor(store) {
        this.store = store;
        this.dom = { container: document.getElementById('task_list') };
        this.unsubscribe = store.subscribe(this.render.bind(this), ['tasks', 'filters', 'currentPage', 'selectedTaskId']);
        this.setupEventListeners();
    }

    setupEventListeners() {
        this.dom.container.addEventListener('click', e => {
            const item = e.target.closest('.task-item');
            if (item) this.store.setSelectedTask(item.dataset.id);
        });
    }

    render() {
        const tasks = this.store.getPagedTasks();
        const { selectedTaskId } = this.store.getState();
        if (tasks.length === 0) {
            this.dom.container.innerHTML = `<li class="session-item-placeholder"><i class="fas fa-check-circle"></i><p>没有符合条件的任务</p></li>`;
            return;
        }
        this.dom.container.innerHTML = tasks.map(task => {
            const { className, text } = this._getDueDateStatus(task.review.due);
            return `<li class="session-item task-item ${task.uuid === selectedTaskId ? 'active' : ''}" data-id="${task.uuid}">
                <div class="item-content">
                    <div class="item-title">${task.title}</div>
                    <div class="item-meta"><span class="meta-info ${className}">${text}</span><span class="meta-info">${task.subject || '未分类'}</span></div>
                </div></li>`;
        }).join('');
    }
    
    _getDueDateStatus(dueDateTimestamp) {
        const diffDays = Math.ceil((new Date(dueDateTimestamp).setHours(0,0,0,0) - new Date().setHours(0,0,0,0)) / 864e5);
        if (diffDays < 0) return { className: 'status-overdue', text: `过期${-diffDays}天` };
        if (diffDays === 0) return { className: 'status-today', text: '今天' };
        return { className: 'status-future', text: `${diffDays}天后` };
    }

    destroy() { this.unsubscribe(); }
}