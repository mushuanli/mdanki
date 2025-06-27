// src/main.js

// --- Core Imports ---
import * as dom from './dom.js';
import { appState, setState } from './state.js';
import { connectToDatabase } from './db.js';
import * as dataService from './services/dataService.js';

// --- UI Module Imports ---
import { renderSessionList } from './ui/sessionListUI.js';
import { updatePreview, setupPreview, toggleAllClozeVisibility, invertAllCloze } from './ui/previewUI.js';
import { renderBreadcrumbs, createBackButton } from './ui/breadcrumbsUI.js';
import { openMoveModal, closeModal, setupModalEventListeners } from './ui/modalUI.js';
import { stopAudio, resumeAudio, pauseAudio } from './ui/audioUI.js';

// --- App-level Logic ---

/**
 * A central function to update all major UI components based on the current state.
 * This should be called whenever a significant state change occurs.
 */
function rerender() {
    renderSessionList();
    renderBreadcrumbs(handleGoBack, handleGoToFolder, handleGoToRoot);
    
    // Update editor content only if the session has changed
    const currentSession = dataService.getCurrentSession();
    if (dom.editor.value !== (currentSession?.content || '')) {
        dom.editor.value = currentSession?.content || '';
    }
    
    updatePreview();
}

/**
 * Wraps the current selection in the editor with given prefix and suffix.
 * @param {string} prefix - Text to insert before the selection.
 * @param {string} suffix - Text to insert after the selection, defaults to prefix.
 */
function wrapSelection(prefix, suffix = prefix) {
    const { selectionStart, selectionEnd, value } = dom.editor;
    const selectedText = value.substring(selectionStart, selectionEnd);
    const newText = `${prefix}${selectedText}${suffix}`;
    
    dom.editor.setRangeText(newText, selectionStart, selectionEnd, 'select');
    handleEditorInput(); // Trigger preview update
    dom.editor.focus();
}

// --- Event Handlers (Connect UI events to Data Service) ---

async function handleNewFile() {
    const fileName = prompt("请输入新文件的名称：", "新文件");
    if (fileName === null) return;
    await dataService.addFile(fileName.trim());
    rerender();
    dom.editor.focus();
}

async function handleNewFolder() {
    const folderName = prompt("请输入新目录的名称：", "新目录");
    if (folderName === null) return;
    await dataService.addFolder(folderName.trim());
    rerender();
}

async function handleSave() {
    const saved = await dataService.saveCurrentSessionContent(dom.editor.value);
    if (saved) {
        dom.saveBtn.innerHTML = '<i class="fas fa-check"></i> 已保存';
        setTimeout(() => dom.saveBtn.innerHTML = '<i class="fas fa-save"></i> 保存', 2000);
        rerender(); // Rerender for potential subsession changes
    }
}

async function handleSessionListClick(e) {
    const item = e.target.closest('.session-item');
    if (!item) return;

    const { id, type, parent } = item.dataset;
    const action = e.target.closest('.actions span');

    if (action) {
        e.stopPropagation();
        if (action.classList.contains('delete-btn')) {
            if (confirm(`确定删除此 ${type === 'file' ? '文件' : '目录'}?`)) {
                await dataService.removeItems([{ id, type }]);
                rerender();
            }
        } else if (action.classList.contains('edit-btn')) {
             const newName = prompt('输入新名称:', item.querySelector('.item-name').textContent);
             if (newName && newName.trim()) {
                 await dataService.updateItemName(id, newName.trim(), type);
                 rerender();
             }
        } else if (action.classList.contains('move-btn')) {
            setState({ movingItems: [{ id, type }] });
            openMoveModal();
        }
        return;
    }

    if (type === 'file') {
        dataService.selectSession(id);
    } else if (type === 'folder') {
        dataService.selectFolder(id);
    } else if (item.classList.contains('subsession')) {
        dataService.selectSubsession(parent, id);
    }

    rerender();
}

function handleGoBack() {
    dataService.goBack();
    rerender();
}

function handleGoToFolder(folderId, stackIndex) {
    dataService.goToFolder(folderId, stackIndex);
    rerender();
}

function handleGoToRoot() {
    dataService.goToRoot();
    rerender();
}

async function handleConfirmMove() {
    if (appState.selectedMoveTarget !== undefined && appState.movingItems.length > 0) {
        await dataService.moveItems(appState.movingItems, appState.selectedMoveTarget);
        closeModal();
        rerender();
    } else {
        alert('请选择一个目标目录。');
    }
}

async function handleDeleteSelected() {
    const selected = Array.from(dom.sessionList.querySelectorAll('.select-checkbox:checked'))
        .map(cb => ({ id: cb.dataset.id, type: cb.dataset.type }));
    
    if (selected.length === 0) {
        alert('请先选择要删除的项目。');
        return;
    }

    if (confirm(`确定要删除选中的 ${selected.length} 个项目吗？`)) {
        await dataService.removeItems(selected);
        dom.selectAllCheckbox.checked = false;
        rerender();
    }
}

function handleEditorInput() {
    clearTimeout(window.previewDebounce);
    window.previewDebounce = setTimeout(updatePreview, 300);
}

async function handleOpenFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
        await dataService.addFile(file.name, event.target.result);
        rerender();
    };
    reader.readAsText(file);
    dom.fileInput.value = '';
}

function handleEditAudioForCloze() {
    const { selectionStart, selectionEnd, value } = dom.editor;
    if (selectionStart === selectionEnd) {
        alert('请先选择一个Cloze卡片（包括--）来编辑音频');
        return;
    }
    dataService.updateClozeAudio(selectionStart, selectionEnd);
    handleEditorInput();
}

// --- NEWLY ADDED Handler for toggling editor panel ---
function handleToggleEditor() {
    dom.editorPanel.classList.toggle('collapsed');
    const isCollapsed = dom.editorPanel.classList.contains('collapsed');

    // Update button icon and title
    dom.toggleEditorBtn.innerHTML = isCollapsed ? '<i class="fas fa-chevron-down"></i>' : '<i class="fas fa-chevron-up"></i>';
    dom.toggleEditorBtn.title = isCollapsed ? "展开编辑器" : "收起编辑器";
    [dom.clozeBtn, dom.boldBtn, dom.italicBtn, dom.codeBtn, dom.linkBtn, dom.audioBtn].forEach(btn => btn.disabled = isCollapsed);
    if (isCollapsed) handleSave();
}


/**
 * Attaches all primary event listeners for the application.
 */
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

    dom.toggleSessionBtn.addEventListener('click', () => {
        dom.sessionSidebar.classList.toggle('hidden-session');
        const isHidden = dom.sessionSidebar.classList.contains('hidden-session');
        dom.toggleSessionBtn.innerHTML = isHidden ? '<i class="fas fa-arrow-right"></i>' : '<i class="fas fa-arrow-left"></i>';
    });

    dom.helpBtn.addEventListener('click', () => {
        dom.instructionsSection.scrollIntoView({ behavior: 'smooth' });
    });

    dom.toggleEditorBtn.addEventListener('click', handleToggleEditor);
    dom.clozeBtn.addEventListener('click', () => wrapSelection('--', '--'));
    dom.boldBtn.addEventListener('click', () => wrapSelection('**'));
    dom.italicBtn.addEventListener('click', () => wrapSelection('*'));
    dom.codeBtn.addEventListener('click', () => wrapSelection('`'));
    dom.linkBtn.addEventListener('click', () => wrapSelection('[', `](${prompt('URL:', 'https://')})`));
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

    // Persist state automatically for robustness
    window.addEventListener('beforeunload', () => dataService.persistState());
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
            dataService.persistState();
        }
    });
}

/**
 * The main entry point for the application.
 */
async function main() {
    // Show loading state
    document.body.classList.add('is-loading'); 
    
    try {
        // 1. Establish DB connection
        await connectToDatabase();
        
        // 2. Load all data and initialize the application state
        await dataService.initializeApp();
        
        // 3. Setup UI components that need initial state
        createBackButton(handleGoBack);
        setupPreview();
        
        // 4. Perform the first full render
        rerender();
        
        // 5. Attach all event listeners
        setupEventListeners();

        console.log("Application initialized successfully.");

    } catch (error) {
        console.error("Application failed to initialize:", error);
        // Display a user-friendly error message
        document.body.innerHTML = '<h1>应用程序加载失败</h1><p>无法连接到数据库。请检查您的浏览器设置并刷新页面。</p>';
    } finally {
        // Hide loading state
        document.body.classList.remove('is-loading');
    }
}

// Start the application once the DOM is ready.
document.addEventListener('DOMContentLoaded', main);