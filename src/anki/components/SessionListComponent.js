// src/anki/components/SessionListComponent.js

import { escapeHTML } from '../../common/utils.js';

export class SessionListComponent {
    constructor(store) {
        this.store = store;
        this.listElement = document.getElementById('anki_sessionList');
        this.headerElement = document.querySelector('.session-header');
        this.breadcrumbsElement = document.getElementById('anki_currentFolderContainer');
        // [修正1] 获取 emptySession 元素的引用
        this.emptySessionElement = document.getElementById('anki_emptySession');
        
        // 订阅所有与列表和导航相关的状态
        this.unsubscribe = store.subscribe(
            this.handleStateChange.bind(this),
            ['sessions', 'folders', 'currentSessionId', 'currentFolderId', 'selectedItemIds', 'folderStack']
        );
        this.setupEventListeners();
    }
  
    setupEventListeners() {
        // 使用事件委托处理整个列表的点击
        this.listElement.addEventListener('click', (e) => {
            const item = e.target.closest('.session-item');
            if (!item) return;
            const { id, type } = item.dataset;

            // 处理复选框点击
            if (e.target.matches('.select-checkbox')) {
                this.store.toggleItemSelection(id, e.shiftKey);
                return;
            }
            // 处理操作按钮
            if (e.target.closest('.actions')) {
                // 可以在此处理重命名、删除单个项目等
                return;
            }
            // 处理项目导航
            if (type === 'file') this.store.navigateToFile(id);
            else if (type === 'folder') this.store.goToFolder(id);
        });

        // 处理面包屑导航点击
        this.breadcrumbsElement.addEventListener('click', (e) => {
            const link = e.target.closest('[data-folder-id]');
            if (link) {
                e.preventDefault();
                const folderId = link.dataset.folderId;
                if (folderId === 'root') this.store.goToRoot();
                else this.store.goToFolder(folderId);
            }
        });

        // 处理头部按钮点击
        this.headerElement.addEventListener('click', (e) => {
            const button = e.target.closest('button');
            if (!button) return;
            switch(button.id) {
                case 'anki_newFileBtn': this.store.createFile(); break;
                case 'anki_newFolderBtn': this.store.createFolder(); break;
                case 'anki_deleteSelectedBtn': this.store.deleteSelectedItems(); break;
                case 'anki_moveSelectedBtn': this.store.showMoveModal(); break;
                case 'anki_openFileBtn': document.getElementById('anki_fileInput').click(); break;
            }
        });
        
        // 处理全选复选框
        const selectAllCheckbox = document.getElementById('anki_selectAllCheckbox');
        selectAllCheckbox.addEventListener('change', (e) => {
            if (e.target.checked) this.store.selectAllItems();
            else this.store.deselectAllItems();
        });

        // 处理文件导入
        const fileInput = document.getElementById('anki_fileInput');
        fileInput.addEventListener('change', (e) => {
            this.store.importFiles(e.target.files);
            e.target.value = ''; // 清空以便再次选择
        });
    }
  
    handleStateChange(newState) {
        this.render(newState);
    }
  
    render(state) {
        this.renderBreadcrumbs(state);
        
        const fragment = document.createDocumentFragment();
        const itemsInCurrentFolder = [
            ...state.folders.filter(f => f.folderId === state.currentFolderId),
            ...state.sessions.filter(s => s.folderId === state.currentFolderId)
        ].sort((a, b) => {
            if (a.type === 'folder' && b.type === 'file') return -1;
            if (a.type === 'file' && b.type === 'folder') return 1;
            return (a.name || '').localeCompare(b.name || '');
        });

        if (itemsInCurrentFolder.length === 0) {
            if (state.currentFolderId === null) {
                // 场景一：根目录为空
                this.listElement.innerHTML = ''; // 清空列表
                this.emptySessionElement.style.display = 'block'; // 显示大图标提示
            } else {
                // 场景二：子目录为空
                this.listElement.innerHTML = '<li class="empty-folder">此目录为空</li>';
                this.emptySessionElement.style.display = 'none'; // 隐藏大图标提示
            }
        } else {
            // 场景三：目录不为空
            this.emptySessionElement.style.display = 'none'; // 隐藏大图标提示
            const fragment = document.createDocumentFragment();
            itemsInCurrentFolder.forEach(item => {
                const li = this.createItemElement(item, state);
                fragment.appendChild(li);
            });
            this.listElement.innerHTML = '';
            this.listElement.appendChild(fragment);
        }
        
        this.updateSelectAllCheckbox(itemsInCurrentFolder, state.selectedItemIds);
    }

    createItemElement(item, state) {
        const li = document.createElement('li');
        li.className = `session-item ${item.type}`;
        li.dataset.id = item.id;
        li.dataset.type = item.type;
        if (item.id === state.currentSessionId) li.classList.add('active');
        
        const isSelected = state.selectedItemIds.has(item.id);
        const iconClass = item.type === 'folder' 
            ? 'fa-folder folder-icon' 
            : 'fa-file-alt file-icon';

        li.innerHTML = `
            <div class="name-container">
                <input type="checkbox" class="select-checkbox" data-id="${item.id}" ${isSelected ? 'checked' : ''}>
                <span class="name"><i class="fas ${iconClass}"></i>${escapeHTML(item.name)}</span>
            </div>
            <div class="actions">
                 <i class="fas fa-pencil-alt edit-btn" title="重命名"></i>
            </div>`;
        return li;
    }

    renderBreadcrumbs(state) {
        let html = `<a href="#" data-folder-id="root"><i class="fas fa-folder-open"></i> 根目录</a>`;
        const folderMap = new Map(state.folders.map(f => [f.id, f.name]));

        state.folderStack.forEach(folderId => {
            html += ` / <a href="#" data-folder-id="${folderId}">${escapeHTML(folderMap.get(folderId) || '...')}</a>`;
        });

        if (state.currentFolderId) {
            html += ` / <span>${escapeHTML(folderMap.get(state.currentFolderId) || '...')}</span>`;
        }
        this.breadcrumbsElement.innerHTML = html;
    }
    
    updateSelectAllCheckbox(allItems, selectedIds) {
        const checkbox = document.getElementById('anki_selectAllCheckbox');
        if (allItems.length === 0) {
            checkbox.checked = false;
            checkbox.indeterminate = false;
            return;
        }
        const selectedCount = allItems.filter(item => selectedIds.has(item.id)).length;
        checkbox.checked = selectedCount === allItems.length;
        checkbox.indeterminate = selectedCount > 0 && selectedCount < allItems.length;
    }

    destroy() {
        this.unsubscribe();
    }
}