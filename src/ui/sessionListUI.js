// src/ui/sessionListUI.js
import * as dom from '../dom.js';
import { appState } from '../state.js';
import { escapeHTML } from '../utils.js';

function createItemLi(item) {
    const li = document.createElement('li');
    li.className = `session-item ${item.type} ${item.id === appState.currentSessionId ? 'active' : ''}`;
    li.dataset.id = item.id;
    li.dataset.type = item.type;

    li.innerHTML = `
        <div class="name-container">
            <input type="checkbox" class="select-checkbox" data-id="${item.id}" data-type="${item.type}">
            <span class="name">
                <i class="${item.type === 'folder' ? 'fas fa-folder folder-icon' : 'fas fa-file file-icon'}"></i>
                <span class="item-name">${escapeHTML(item.name)}</span>
            </span>
        </div>
        <div class="actions">
            <span class="move-btn" title="移动"><i class="fas fa-arrows-alt"></i></span>
            <span class="edit-btn" title="编辑"><i class="fas fa-pencil-alt"></i></span>
            <span class="delete-btn" title="删除"><i class="fas fa-trash"></i></span>
        </div>
    `;
    return li;
}

function createSubsessionLi(subsession) {
    const li = document.createElement('li');
    li.className = `session-item subsession ${subsession.id === appState.currentSubsessionId ? 'active' : ''}`;
    li.dataset.id = subsession.id;
    li.dataset.parent = subsession.parentId;
    li.innerHTML = `
        <div class="name-container">
            <span class="name">
                <i class="fas fa-stream"></i>
                ${escapeHTML(subsession.title)}
            </span>
        </div>`;
    return li;
}

export function renderSessionList() {
    dom.sessionList.innerHTML = '';
    const { sessions, folders, currentFolderId, fileSubsessions, currentSessionId } = appState;

    const itemsInCurrentFolder = [
        ...folders.filter(f => f.folderId === currentFolderId),
        ...sessions.filter(s => s.folderId === currentFolderId)
    ].sort((a, b) => {
        if (a.type === 'folder' && b.type === 'file') return -1;
        if (a.type === 'file' && b.type === 'folder') return 1;
        return a.name.localeCompare(b.name);
    });

    dom.emptySession.style.display = itemsInCurrentFolder.length === 0 && currentFolderId === null ? 'block' : 'none';

    if (itemsInCurrentFolder.length === 0 && currentFolderId !== null) {
        dom.sessionList.innerHTML = '<li class="empty-folder"><div class="empty-message"><i class="fas fa-inbox"></i> 此目录为空</div></li>';
    }

    itemsInCurrentFolder.forEach(item => {
        const li = createItemLi(item);
        dom.sessionList.appendChild(li);

        if (item.type === 'file' && item.id === currentSessionId && fileSubsessions[item.id]?.length > 0) {
            const nestedList = document.createElement('ul');
            nestedList.className = 'nested-items';
            fileSubsessions[item.id].forEach(sub => {
                nestedList.appendChild(createSubsessionLi(sub));
            });
            dom.sessionList.appendChild(nestedList);
        }
    });
}