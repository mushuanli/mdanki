// src/ui/breadcrumbsUI.js
import { dom } from './anki_dom.js';
import { appState } from '../common/state.js';

export let backButton;

function createBreadcrumbLink(text, onClick) {
    const link = document.createElement('a');
    link.href = '#';
    link.className = 'breadcrumb-link';
    link.innerHTML = text;
    link.addEventListener('click', e => {
        e.preventDefault();
        onClick();
    });
    return link;
}

export function renderBreadcrumbs(goBack, goToFolder, goToRoot) {
    dom.currentFolderContainer.innerHTML = '';
    
    // Root link
    const rootLink = createBreadcrumbLink('<i class="fas fa-folder-open"></i> 根目录', goToRoot);
    dom.currentFolderContainer.appendChild(rootLink);

    // Path links from stack
    appState.folderStack.forEach((folderId, index) => {
        const separator = document.createElement('span');
        separator.className = 'breadcrumb-separator';
        separator.textContent = '>';
        dom.currentFolderContainer.appendChild(separator);

        const folder = appState.folders.find(f => f.id === folderId);
        if (folder) {
            const pathLink = createBreadcrumbLink(folder.name, () => goToFolder(folderId, index));
            dom.currentFolderContainer.appendChild(pathLink);
        }
    });

    // Current folder name (if not root)
    if (appState.currentFolderId) {
        const folder = appState.folders.find(f => f.id === appState.currentFolderId);
        if(folder) {
            const separator = document.createElement('span');
            separator.className = 'breadcrumb-separator';
            separator.textContent = '>';
            dom.currentFolderContainer.appendChild(separator);

            const currentSpan = document.createElement('span');
            currentSpan.className = 'breadcrumb-current';
            currentSpan.textContent = folder.name;
            dom.currentFolderContainer.appendChild(currentSpan);
        }
    }
    
    backButton.style.display = appState.folderStack.length > 0 ? 'inline-flex' : 'none';
}

export function createBackButton(onClick) {
    backButton = document.createElement('button');
    backButton.id = 'backButton';
    backButton.className = 'session-btn';
    backButton.title = '返回上级目录';
    backButton.innerHTML = '<i class="fas fa-arrow-left"></i>';
    backButton.style.display = 'none';
    backButton.addEventListener('click', onClick);
    dom.sessionTitleContainer.prepend(backButton);
}