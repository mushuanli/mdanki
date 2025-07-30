// src/ui/sessionListUI.js
import * as dom from './anki_dom.js';
import { appState } from '../common/state.js';
import { escapeHTML } from '../common/utils.js';

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

/**
 * [新增] 创建一个二级标题 (H2) 的列表项。
 * @param {object} subsession - H2 标题对象。
 * @param {string} parentId - 所属文件 (H1) 的ID。
 * @returns {HTMLElement} - 返回创建的 li 元素。
 */
function createH2Li(subsession, parentId) {
    const li = document.createElement('li');
    // 使用 subsession-item 类以应用部分通用样式
    li.className = `session-item subsession h2-item ${subsession.id === appState.currentSubsessionId ? 'active' : ''}`;
    li.dataset.id = subsession.id;
    li.dataset.type = 'subsession';
    li.dataset.parent = parentId;

    li.innerHTML = `
        <div class="name-container">
            <span class="name">
                <i class="fas fa-stream"></i>
                <span class="item-name">${escapeHTML(subsession.text)}</span>
            </span>
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

/**
 * [重写] 渲染整个会话列表。
 * 现在支持文件夹、文件以及文件下的层级标题。
 */
export function renderSessionList() {
    dom.sessionList.innerHTML = '';
    const { sessions, folders, currentFolderId, fileSubsessions, currentSessionId } = appState;

    // 获取当前目录下的所有项目（文件夹和文件）并排序
    const itemsInCurrentFolder = [
        ...folders.filter(f => f.folderId === currentFolderId),
        ...sessions.filter(s => s.folderId === currentFolderId)
    ].sort((a, b) => {
        if (a.type === 'folder' && b.type === 'file') return -1;
        if (a.type === 'file' && b.type === 'folder') return 1;
        return a.name.localeCompare(b.name);
    });

    // 处理空状态显示
    dom.emptySession.style.display = itemsInCurrentFolder.length === 0 && currentFolderId === null ? 'block' : 'none';
    if (itemsInCurrentFolder.length === 0 && currentFolderId !== null) {
        dom.sessionList.innerHTML = '<li class="empty-folder">此目录为空</li>';
    }

    // 遍历并渲染项目
    itemsInCurrentFolder.forEach(item => {
        const li = createItemLi(item);
        dom.sessionList.appendChild(li);

        // 如果当前项是正在打开的文件，则渲染其下的层级标题
        if (item.type === 'file' && item.id === currentSessionId && fileSubsessions[item.id]?.length > 0) {
            const hierarchicalHeadings = fileSubsessions[item.id];
            
            hierarchicalHeadings.forEach(h1 => {
                const details = document.createElement('details');
                details.className = 'session-item-details';
                // 如果H1或其任何一个H2子项是当前选中的，则默认展开
                const isH1Active = h1.id === appState.currentSubsessionId;
                const isChildActive = h1.children.some(h2 => h2.id === appState.currentSubsessionId);
                if (isH1Active || isChildActive) {
                    details.open = true;
                }
                
                // 创建 H1 标题
                const summary = document.createElement('summary');
                summary.className = `session-item subsession h1-item ${isH1Active ? 'active' : ''}`;
                summary.dataset.id = h1.id;
                summary.dataset.type = 'subsession';
                summary.dataset.parent = item.id;
                summary.innerHTML = `
                    <div class="name-container">
                        <span class="name">
                            <i class="fas fa-heading"></i>
                            <span class="item-name">${escapeHTML(h1.text)}</span>
                        </span>
                    </div>`;
                
                details.appendChild(summary);

                // 如果有 H2 子标题，则创建并附加它们
                if (h1.children && h1.children.length > 0) {
                    const nestedList = document.createElement('ul');
                    nestedList.className = 'nested-items';
                    h1.children.forEach(h2 => {
                        nestedList.appendChild(createH2Li(h2, item.id));
                    });
                    details.appendChild(nestedList);
                }
                
                dom.sessionList.appendChild(details);
            });
        }
    });
}