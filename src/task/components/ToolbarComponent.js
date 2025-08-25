// src/task/components/ToolbarComponent.js

export class ToolbarComponent {
    constructor(store) {
        this.store = store;
        this.dom = {
            // Panels to be toggled
            sidebar: document.querySelector('#task-view .task_session-sidebar'),
            editorPanel: document.getElementById('task_editorPanel'),
            // Buttons that trigger actions
            toggleSidebarBtn: document.getElementById('task_toggleSessionBtn'),
            collapseEditorBtn: document.getElementById('task_collapseBtn'),
            refreshBtn: document.getElementById('task_refreshBtn'),
        };

        this.unsubscribe = store.subscribe(this.handleStateChange.bind(this), ['isSidebarVisible', 'isEditorCollapsed']);
        this.setupEventListeners();
    }

    setupEventListeners() {
        this.dom.toggleSidebarBtn.addEventListener('click', () => {
            this.store.toggleSidebar();
        });

        this.dom.collapseEditorBtn.addEventListener('click', () => {
            // When collapsing the editor, also trigger a save action.
            if (!this.store.getState().isEditorCollapsed) {
                this.store.loadFromYAML(); 
            }
            this.store.toggleEditor();
        });

        // The refresh button re-runs the initialization process.
        this.dom.refreshBtn.addEventListener('click', () => {
            this.store.initialize();
        });
    }

    // This component performs targeted DOM updates instead of a full re-render.
    handleStateChange(newState, oldState) {
        if (newState.isSidebarVisible !== oldState.isSidebarVisible) {
            this.dom.sidebar.classList.toggle('collapsed', !newState.isSidebarVisible);
        }

        if (newState.isEditorCollapsed !== oldState.isEditorCollapsed) {
            this.dom.editorPanel.classList.toggle('collapsed', newState.isEditorCollapsed);
            const icon = this.dom.collapseEditorBtn.querySelector('i');
            icon.className = newState.isEditorCollapsed ? 'fas fa-chevron-down' : 'fas fa-chevron-up';
        }
    }

    destroy() {
        this.unsubscribe();
    }
}
