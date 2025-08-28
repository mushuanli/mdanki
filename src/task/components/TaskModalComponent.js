// src/task/components/TaskModalComponent.js

export class TaskModalComponent {
    constructor(store) {
        this.store = store;
        this.dom = {
            modal: document.getElementById('task_taskModal'),
            title: document.getElementById('task_modalTitle'),
            form: document.getElementById('task_taskForm'),
            nameInput: document.getElementById('task_modalName'),
            tagsInput: document.getElementById('task_modalTagsInput'),
            tagsList: document.getElementById('task_modalTagsList'),
            existingTagsDatalist: document.getElementById('task_existingTags'),
            confirmBtn: document.getElementById('task_modalConfirmBtn'),
            cancelBtn: document.getElementById('task_modalCancelBtn'),
            closeBtn: document.getElementById('task_modalCloseBtn'),
        };
        this.tags = new Set();
        this.unsubscribe = store.subscribe(this.render.bind(this), ['isTaskModalVisible', 'taskModalContext', 'taxonomy']);
        this.setupEventListeners();
    }

    setupEventListeners() {
        this.dom.form.addEventListener('submit', (e) => {
            e.preventDefault();
            const name = this.dom.nameInput.value.trim();
            if (name) {
                this.store.commitTask(name, Array.from(this.tags));
            } else {
                alert("任务名称不能为空。");
            }
        });

        this.dom.tagsInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const tag = this.dom.tagsInput.value.trim();
                if (tag) {
                    this.addTag(tag);
                    this.dom.tagsInput.value = '';
                }
            }
        });

        this.dom.tagsList.addEventListener('click', (e) => {
            if (e.target.classList.contains('remove-tag-btn')) {
                const tagElement = e.target.parentElement;
                // Get tag text, removing the '×'
                const tag = tagElement.firstChild.textContent.trim();
                this.removeTag(tag);
            }
        });
        
        const closeModal = () => this.store.setState({ isTaskModalVisible: false });
        this.dom.cancelBtn.addEventListener('click', closeModal);
        this.dom.closeBtn.addEventListener('click', closeModal);
    }

    addTag(tag) {
        this.tags.add(tag);
        this.updateTagsUI();
    }

    removeTag(tag) {
        this.tags.delete(tag);
        this.updateTagsUI();
    }

    updateTagsUI() {
        this.dom.tagsList.innerHTML = '';
        this.tags.forEach(tag => {
            const li = document.createElement('li');
            li.innerHTML = `${tag} <button type="button" class="remove-tag-btn">&times;</button>`;
            this.dom.tagsList.appendChild(li);
        });
    }

    render(state) {
        if (state.isTaskModalVisible) {
            this.dom.modal.style.display = 'flex';
            const { mode } = state.taskModalContext;

            // Populate tag suggestions
            const allTags = new Set();
            Object.values(state.taxonomy).forEach(subj => {
                subj.tags.forEach(tag => allTags.add(tag));
            });
            this.dom.existingTagsDatalist.innerHTML = [...allTags].map(tag => `<option value="${tag}"></option>`).join('');

            if (mode === 'create') {
                this.dom.title.textContent = '新建任务';
                this.dom.confirmBtn.textContent = '创建任务';
                this.dom.nameInput.value = '';
                this.tags.clear();
            } else { // 'complete' mode
                this.dom.title.textContent = '命名任务';
                this.dom.confirmBtn.textContent = '保存任务';
            }
            this.updateTagsUI();
            this.dom.nameInput.focus();
        } else {
            this.dom.modal.style.display = 'none';
        }
    }
    
    destroy() {
        this.unsubscribe();
    }
}
