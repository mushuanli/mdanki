// src/task/components/ListComponent.js
export class ListComponent {
    constructor(store) {
        this.store = store;
        this.dom = { container: document.getElementById('task_list') };
        // [MODIFIED] Subscribe to selectedTaskIds as well
        this.unsubscribe = store.subscribe(this.render.bind(this), ['tasks', 'filters', 'currentPage', 'selectedTaskId', 'selectedTaskIds']);
        this.setupEventListeners();
    }

    setupEventListeners() {
        this.dom.container.addEventListener('click', e => {
            const item = e.target.closest('.task-item');
            if (!item) return;

            const taskId = item.dataset.id;
            if (!taskId || taskId === 'new') return;

            // Handle checkbox click
            if (e.target.matches('.select-checkbox')) {
                this.store.toggleTaskSelection(taskId);
                return;
            }
            
            // Handle rename button click
            if (e.target.matches('.edit-btn')) {
                const currentTitle = item.querySelector('.item-title').textContent;
                const newTitle = prompt("输入新的任务名称:", currentTitle);
                if (newTitle) {
                    this.store.renameTask(taskId, newTitle);
                }
                return;
            }

            // Handle delete button click
            if (e.target.matches('.delete-btn')) {
                this.store.deleteTasks([taskId]);
                return;
            }

            // Handle item selection for viewing/editing
            this.store.setSelectedTask(taskId);
        });
    }

    render() {
        const { selectedTaskId, selectedTaskIds } = this.store.getState();
        const tasks = this.store.getPagedTasks();
        let listHTML = '';

        // If creating a new task, add a temporary item at the top
        if (selectedTaskId === 'new') {
            listHTML += `<li class="session-item task-item active" data-id="new">
                <div class="item-content">
                    <div class="item-title"><em>新任务...</em></div>
                    <div class="item-meta"><span class="meta-info">正在创建</span></div>
                </div>
            </li>`;
        }
        
        if (tasks.length === 0 && selectedTaskId !== 'new') {
            this.dom.container.innerHTML = `<li class="session-item-placeholder">...</li>`;
            return;
        }

        listHTML += tasks.map(task => {
            const { className, text } = this._getDueDateStatus(task.review.due);
            const isSelected = selectedTaskIds.has(task.uuid);
            
            return `
            <li class="session-item task-item ${task.uuid === selectedTaskId ? 'active' : ''}" data-id="${task.uuid}">
                <div class="name-container">
                    <input type="checkbox" class="select-checkbox" ${isSelected ? 'checked' : ''}>
                    <div class="item-content">
                        <div class="item-title">${task.title}</div>
                        <div class="item-meta">
                            <span class="meta-info ${className}">${text}</span>
                            <span class="meta-info">${task.subject || '未分类'}</span>
                        </div>
                    </div>
                </div>
                <div class="actions">
                    <i class="fas fa-pencil-alt edit-btn" title="重命名"></i>
                    <i class="fas fa-trash delete-btn" title="删除"></i>
                </div>
            </li>`;
        }).join('');
        
        this.dom.container.innerHTML = listHTML;
    }
    
    _getDueDateStatus(dueDateTimestamp) {
        if (!dueDateTimestamp) return { className: 'status-future', text: '新' };
        const diffDays = Math.ceil((new Date(dueDateTimestamp).setHours(0,0,0,0) - new Date().setHours(0,0,0,0)) / 864e5);
        if (diffDays < 0) return { className: 'status-overdue', text: `过期${-diffDays}天` };
        if (diffDays === 0) return { className: 'status-today', text: '今天' };
        return { className: 'status-future', text: `${diffDays}天后` };
    }

    destroy() { this.unsubscribe(); }
}