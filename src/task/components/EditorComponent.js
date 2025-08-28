// src/task/components/EditorComponent.js
export class EditorComponent {
    constructor(store) {
        this.store = store;
        this.dom = {
            editor: document.getElementById('task_yamlEditor'),
        };
        this.unsubscribe = store.subscribe(this.render.bind(this), ['yamlContent', 'selectedTaskId']);
        this.setupEventListeners();
    }

    setupEventListeners() {
        this.dom.editor.addEventListener('input', e => this.store.setYamlContent(e.target.value));
    }

    render({ yamlContent, selectedTaskId }) {
        if (this.dom.editor.value !== yamlContent) {
            this.dom.editor.value = yamlContent;
        }
        // Disable editor if no task is selected (unless it's a new one)
        this.dom.editor.disabled = !selectedTaskId;
    }

    destroy() { this.unsubscribe(); }
}
