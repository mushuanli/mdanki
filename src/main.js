// src/main.js
import * as dom from './dom.js';
import { appState, setState } from './state.js';
import * as sessionManager from './services/sessionManager.js';
import * as storage from './services/storageManager.js';
import { renderSessionList } from './ui/sessionListUI.js';
import { 
    updatePreview, 
    setupPreview,
    toggleAllClozeVisibility,
    invertAllCloze
} from './ui/previewUI.js';
import { renderBreadcrumbs, createBackButton } from './ui/breadcrumbsUI.js';
import { openMoveModal, closeModal, setupModalEventListeners } from './ui/modalUI.js';
import { stopAudio, resumeAudio, pauseAudio } from './ui/audioUI.js';
import { INITIAL_CONTENT } from './config.js';

// --- Global UI Update Function ---
function rerender() {
    renderSessionList();
    renderBreadcrumbs(handleGoBack, handleGoToFolder, handleGoToRoot);
    updatePreview();
}

// --- Editor Formatting Helper ---
/**
 * Wraps the current selection in the editor with given prefix and suffix.
 * @param {string} prefix - Text to insert before the selection.
 * @param {string} suffix - Text to insert after the selection.
 */
function wrapSelection(prefix, suffix = '') {
    const editor = dom.editor;
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const selectedText = editor.value.substring(start, end);
    
    // If no suffix is provided, use the prefix (for things like **bold**)
    suffix = suffix === '' ? prefix : suffix;

    const newText = `${prefix}${selectedText}${suffix}`;
    
    // Replace the text
    editor.setRangeText(newText, start, end, 'select');

    // Manually trigger the input event to update the preview
    handleEditorInput();
    editor.focus();
}

// --- Event Handlers ---
function handleNewFile() {
    const fileName = prompt("请输入新文件的名称：");
    // 如果用户点击了“取消”或输入了空字符串，则不执行任何操作
    if (fileName === null) {
        return;
    }
    // 如果用户没有输入文件名，但点击了“确定”，则由 sessionManager 生成默认名
    const newFile = sessionManager.addFile(INITIAL_CONTENT, fileName.trim());
    dom.editor.value = newFile.content;
    rerender();
    dom.editor.focus();
}

function handleNewFolder() {
    const folderName = prompt("请输入新目录的名称：");
    // 如果用户点击了“取消”或输入了空字符串，则不执行任何操作
    if (folderName === null) {
        return;
    }
     // 如果用户没有输入目录名，但点击了“确定”，则由 sessionManager 生成默认名
    sessionManager.addFolder(folderName.trim());
    rerender();
}

function handleSave() {
    const saved = sessionManager.saveCurrentSessionContent(dom.editor.value);
    if (saved) {
        dom.saveBtn.innerHTML = '<i class="fas fa-check"></i> 已保存';
        setTimeout(() => {
            dom.saveBtn.innerHTML = '<i class="fas fa-save"></i> 保存';
        }, 2000);
        rerender(); // Rerender in case subsessions changed
    }
}

function handleSessionListClick(e) {
    const item = e.target.closest('.session-item');
    if (!item) return;

    const { id, type, parent } = item.dataset;
    
    // Action buttons
    const action = e.target.closest('.actions span');
    if (action) {
        e.stopPropagation();
        if (action.classList.contains('delete-btn')) {
            if (confirm(`确定删除此 ${type === 'file' ? '文件' : '目录'}?`)) {
                sessionManager.removeItems([{ id, type }]);
                rerender();
            }
        }
        if (action.classList.contains('edit-btn')) {
             const nameSpan = item.querySelector('.item-name');
             const currentName = nameSpan.textContent;
             const newName = prompt('输入新名称:', currentName);
             if (newName && newName.trim() !== currentName) {
                 sessionManager.updateItemName(id, newName.trim(), type);
                 rerender();
             }
        }
        if (action.classList.contains('move-btn')) {
            setState({ movingItems: [{ id, type }] });
            openMoveModal();
        }
        return;
    }

    // Item selection
    if (type === 'file') {
        setState({ currentSessionId: id, currentSubsessionId: null });
        dom.editor.value = appState.sessions.find(s => s.id === id)?.content || '';
    } else if (type === 'folder') {
        const newStack = [...appState.folderStack, appState.currentFolderId].filter(fid => fid != null);
        setState({ currentFolderId: id, folderStack: newStack });
    } else if (item.classList.contains('subsession')) {
        setState({ currentSessionId: parent, currentSubsessionId: id });
    }

    rerender();
}

function handleGoBack() {
    if (appState.folderStack.length > 0) {
        const newStack = [...appState.folderStack];
        const parentId = newStack.pop();
        setState({ currentFolderId: parentId, folderStack: newStack });
        rerender();
    }
}

function handleGoToFolder(folderId, stackIndex) {
    const newStack = appState.folderStack.slice(0, stackIndex);
    setState({ currentFolderId: folderId, folderStack: newStack });
    rerender();
}

function handleGoToRoot() {
    setState({ currentFolderId: null, folderStack: [] });
    rerender();
}

function handleConfirmMove() {
    if (appState.selectedMoveTarget !== undefined && appState.movingItems.length > 0) {
        sessionManager.moveItems(appState.movingItems, appState.selectedMoveTarget);
        closeModal();
        rerender();
    } else {
        alert('请选择一个目标目录。');
    }
}

function handleDeleteSelected() {
    const selected = Array.from(dom.sessionList.querySelectorAll('.select-checkbox:checked'))
        .map(cb => ({ id: cb.dataset.id, type: cb.dataset.type }));
    
    if (selected.length === 0) {
        alert('请先选择要删除的项目。');
        return;
    }

    if (confirm(`确定要删除选中的 ${selected.length} 个项目吗？`)) {
        sessionManager.removeItems(selected);
        dom.selectAllCheckbox.checked = false;
        rerender();
    }
}

function handleEditorInput() {
    // Debounce preview updates for performance
    clearTimeout(window.previewDebounce);
    window.previewDebounce = setTimeout(() => {
        updatePreview();
    }, 300);
}

function handleOpenFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
        const newFile = sessionManager.addFile(event.target.result, file.name);
        dom.editor.value = newFile.content;
        rerender();
    };
    reader.readAsText(file);
    dom.fileInput.value = ''; // Reset input
}

// --- NEWLY ADDED Editor Toolbar Handlers ---
function handleClozeClick() {
    if (dom.editor.selectionStart === dom.editor.selectionEnd) {
        alert('请先选择要转换为Cloze的文本');
        return;
    }
    wrapSelection('--', '--');
}

function handleLinkClick() {
    const url = prompt('请输入链接URL:', 'https://');
    if (url) {
        wrapSelection('[', `](${url})`);
    }
}

function handleEditAudioForCloze() {
    const editor = dom.editor;
    const start = editor.selectionStart;
    const end = editor.selectionEnd;

    if (start === end) {
        alert('请先选择一个Cloze卡片（包括--）来编辑音频');
        return;
    }

    const selectedText = editor.value.substring(start, end);
    const clozeRegex = /--(?<content>.*?)--(?:\^\^audio:(?<audio>.*?)\^\^)?/;
    const match = selectedText.match(clozeRegex);

    if (match && match.groups) {
        const { content, audio = '' } = match.groups;
        const newAudio = prompt(`编辑 "${content}" 的音频文本:`, audio);
        if (newAudio !== null) {
            const newCloze = `--${content}--^^audio:${newAudio}^^`;
            editor.setRangeText(newCloze, start, end, 'select');
            handleEditorInput();
            editor.focus();
        }
    } else {
        alert('选中的文本不是一个有效的Cloze卡片。请确保完整选中了\`--内容--\`部分。');
    }
}

// --- NEWLY ADDED Handler for toggling editor panel ---
function handleToggleEditor() {
    dom.editorPanel.classList.toggle('collapsed');
    const isCollapsed = dom.editorPanel.classList.contains('collapsed');

    // Update button icon and title
    dom.toggleEditorBtn.innerHTML = isCollapsed ? '<i class="fas fa-chevron-down"></i>' : '<i class="fas fa-chevron-up"></i>';
    dom.toggleEditorBtn.title = isCollapsed ? "展开编辑器" : "收起编辑器";

    // Disable/enable formatting buttons
    [dom.clozeBtn, dom.boldBtn, dom.italicBtn, dom.codeBtn, dom.linkBtn, dom.audioBtn].forEach(btn => {
        btn.disabled = isCollapsed;
    });

    // Save content when collapsing
    if (isCollapsed) {
        handleSave();
    }
}

// --- Setup ---
function setupEventListeners() {
    dom.newFileBtn.addEventListener('click', handleNewFile);
    dom.newFolderBtn.addEventListener('click', handleNewFolder);
    dom.saveBtn.addEventListener('click', handleSave);
    dom.sessionList.addEventListener('click', handleSessionListClick);
    dom.deleteSelectedBtn.addEventListener('click', handleDeleteSelected);
    dom.editor.addEventListener('input', handleEditorInput);
    dom.openFileBtn.addEventListener('click', () => dom.fileInput.click());
    dom.fileInput.addEventListener('change', handleOpenFile);
    
    dom.moveSelectedBtn.addEventListener('click', () => {
        const selected = Array.from(dom.sessionList.querySelectorAll('.select-checkbox:checked'))
            .map(cb => ({ id: cb.dataset.id, type: cb.dataset.type }));
        if (selected.length > 0) {
            setState({ movingItems: selected });
            openMoveModal();
        } else {
            alert('请选择要移动的项目。');
        }
    });

    dom.selectAllCheckbox.addEventListener('change', (e) => {
        dom.sessionList.querySelectorAll('.select-checkbox').forEach(cb => cb.checked = e.target.checked);
    });

    // Toolbar buttons
    dom.toggleSessionBtn.addEventListener('click', () => {
        dom.sessionSidebar.classList.toggle('hidden-session');
        const isHidden = dom.sessionSidebar.classList.contains('hidden-session');
        dom.toggleSessionBtn.innerHTML = isHidden ? '<i class="fas fa-arrow-right"></i>' : '<i class="fas fa-arrow-left"></i>';
    });

    dom.helpBtn.addEventListener('click', () => {
        dom.instructionsSection.scrollIntoView({ behavior: 'smooth' });
    });

    // --- ADDED/CORRECTED EVENT LISTENERS FOR EDITOR TOOLBAR ---
    dom.toggleEditorBtn.addEventListener('click', handleToggleEditor); // <-- THIS IS THE FIX
    dom.clozeBtn.addEventListener('click', handleClozeClick);
    dom.boldBtn.addEventListener('click', () => wrapSelection('**'));
    dom.italicBtn.addEventListener('click', () => wrapSelection('*'));
    dom.codeBtn.addEventListener('click', () => wrapSelection('`'));
    dom.linkBtn.addEventListener('click', handleLinkClick);
    dom.audioBtn.addEventListener('click', handleEditAudioForCloze);
    // -------------------------------------------------
    // --- ADDED EVENT LISTENERS FOR PREVIEW CONTROLS ---
    dom.toggleVisibilityClozeBtn.addEventListener('click', toggleAllClozeVisibility);
    dom.invertClozeBtn.addEventListener('click', invertAllCloze);

    // --------------------------------------------------

    // Audio controls
    dom.playBtn.addEventListener('click', resumeAudio);
    dom.pauseBtn.addEventListener('click', pauseAudio);
    dom.stopBtn.addEventListener('click', stopAudio);

    setupModalEventListeners(handleConfirmMove);
}

function initApp() {
    storage.loadStateFromStorage();
    
    // Set initial state if empty
    if (appState.sessions.length === 0) {
        sessionManager.addFile(INITIAL_CONTENT, '初始会话');
    }
    
    // Ensure currentSessionId is valid
    let currentSession = appState.sessions.find(s => s.id === appState.currentSessionId);
    if (!currentSession && appState.sessions.length > 0) {
        setState({ currentSessionId: appState.sessions[0].id });
        currentSession = appState.sessions[0];
    }
    dom.editor.value = currentSession ? currentSession.content : '';

    createBackButton(handleGoBack);
    setupPreview();
    setupEventListeners();
    rerender();
}

// Start the application
document.addEventListener('DOMContentLoaded', initApp);