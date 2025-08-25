// src/task/components/EditorComponent.js
export class EditorComponent {
    constructor(store) {
        this.store = store;
        this.dom = {
            editor: document.getElementById('task_yamlEditor'),
            panel: document.getElementById('task_editorPanel'),
            saveBtn: document.getElementById('task_saveBtn'),
            exportBtn: document.getElementById('task_exportBtn'),
            newFileBtn: document.getElementById('task_newFileBtn'),
            loadYamlBtn: document.getElementById('task_loadYamlBtn'),
            fileInput: document.getElementById('task_yamlFileInput'),
        };
        this.unsubscribe = store.subscribe(this.render.bind(this), ['yamlContent']);
        this.setupEventListeners();
    }

    setupEventListeners() {
        this.dom.editor.addEventListener('input', e => this.store.setYamlContent(e.target.value));
        this.dom.saveBtn.addEventListener('click', async () => {
            const result = await this.store.loadFromYAML();
            if (result.success) {
                this.dom.saveBtn.innerHTML = '<i class="fas fa-check"></i> 已保存';
                setTimeout(() => this.dom.saveBtn.innerHTML = '<i class="fas fa-save"></i>', 2000);
            }
        });
        this.dom.loadYamlBtn.addEventListener('click', () => this.dom.fileInput.click());
        this.dom.fileInput.addEventListener('change', async e => {
            if (!e.target.files[0]) return;
            this.store.setYamlContent(await e.target.files[0].text());
            await this.store.loadFromYAML();
            e.target.value = '';
        });
        // ... 其他按钮事件
    }

    render({ yamlContent }) {
        if (this.dom.editor.value !== yamlContent) {
            this.dom.editor.value = yamlContent;
        }
    }

    destroy() { this.unsubscribe(); }
}
