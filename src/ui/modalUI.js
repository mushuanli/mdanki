//  src/ui/modalUI.js
import * as dom from '../dom.js';
import { appState, setState } from '../state.js';
import { escapeHTML } from '../utils.js';

function getDescendantFolderIds(folderId) {
    let descendants = [];
    const children = appState.folders.filter(f => f.folderId === folderId);
    for (const child of children) {
        descendants.push(child.id);
        descendants = descendants.concat(getDescendantFolderIds(child.id));
    }
    return descendants;
}

export function openMoveModal() {
    dom.folderList.innerHTML = '';
    
    const movedFolderIds = appState.movingItems.filter(item => item.type === 'folder').map(item => item.id);
    const exclusionIds = new Set(movedFolderIds);
    movedFolderIds.forEach(id => {
        getDescendantFolderIds(id).forEach(descId => exclusionIds.add(descId));
    });

    const rootItem = document.createElement('div');
    rootItem.className = 'folder-item';
    rootItem.dataset.id = 'root';
    rootItem.innerHTML = '<i class="fas fa-folder-open"></i> 根目录';
    dom.folderList.appendChild(rootItem);

    appState.folders.forEach(folder => {
        if (!exclusionIds.has(folder.id)) {
            const folderItem = document.createElement('div');
            folderItem.className = 'folder-item';
            folderItem.dataset.id = folder.id;
            folderItem.innerHTML = `<i class="fas fa-folder"></i> ${escapeHTML(folder.name)}`;
            dom.folderList.appendChild(folderItem);
        }
    });
    
    dom.moveModal.classList.add('active');
}

export function closeModal() {
    dom.moveModal.classList.remove('active');
    setState({ movingItems: [], selectedMoveTarget: null });
}

export function setupModalEventListeners(onConfirm) {
    dom.closeMoveModalBtn.addEventListener('click', closeModal);
    dom.cancelMoveBtn.addEventListener('click', closeModal);
    dom.confirmMoveBtn.addEventListener('click', onConfirm);

    dom.folderList.addEventListener('click', (e) => {
        const target = e.target.closest('.folder-item');
        if (!target) return;

        dom.folderList.querySelectorAll('.folder-item').forEach(item => item.classList.remove('selected'));
        target.classList.add('selected');
        
        const targetId = target.dataset.id === 'root' ? null : target.dataset.id;
        setState({ selectedMoveTarget: targetId });
    });
}