// src/task/task_dom.js

/**
 * [修改后]
 * 将所有 DOM 元素的选择逻辑封装在一个类中。
 * 这样可以推迟 DOM 查询，直到类的实例被创建。
 */
export class DomElements {
    constructor() {
        // 辅助函数
        const $id = (id) => document.getElementById(id);

        // 视图主容器
        this.view = $id('task-view');

        // 侧边栏和筛选器
        this.sidebar = this.view.querySelector('.task_session-sidebar');
        this.subjectFilter = $id('task_subjectFilter');
        this.tagFilterContainer = $id('task_tagFilterContainer');
        this.reasonFilterContainer = $id('task_reasonFilterContainer');

        // 列表和分页
        this.listContainer = $id('task_list');
        this.paginationContainer = $id('task_paginationContainer');

        // 统计仪表盘
        this.statsDashboard = $id('task_statsDashboard');

        // 预览区
        this.previewContainer = $id('task_previewContainer');
        this.previewPanel = $id('task_previewPanel');

        // 编辑器面板
        this.editorPanel = $id('task_editorPanel');
        this.yamlEditor = $id('task_yamlEditor');

        // 头部/面板按钮
        this.toggleSessionBtn = $id('task_toggleSessionBtn'); // <- 现在在这里查询
        this.saveBtn = $id('task_saveBtn');
        this.exportBtn = $id('task_exportBtn');
        this.collapseBtn = $id('task_collapseBtn');
        this.refreshBtn = $id('task_refreshBtn');
        this.loadYamlBtn = $id('task_loadYamlBtn');
        this.yamlFileInput = $id('task_yamlFileInput');
        this.newFileBtn = $id('task_newFileBtn');

        // 待办相关按钮
        this.startReviewBtn = $id('task_startReviewBtn');
    }
}