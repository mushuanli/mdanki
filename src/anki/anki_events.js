import * as dom from './anki_dom.js';
import { appState, setState } from '../common/state.js';
import * as dataService from '../services/dataService.js';
import { updatePreview, toggleAllClozeVisibility, invertAllCloze } from './previewUI.js';
import { openMoveModal, closeModal, setupModalEventListeners } from './modalUI.js';
import { stopAudio, resumeAudio, pauseAudio } from './audioUI.js';
import { rerenderAnki } from './anki_ui.js';

// --- Event Handlers ---

// Navigation handlers are exported so anki_ui.js can use them
export function handleGoBack() {
    dataService.goBack();
    rerenderAnki();
}

export function handleGoToFolder(folderId, stackIndex) {
    dataService.goToFolder(folderId, stackIndex);
    rerenderAnki();
}

export function handleGoToRoot() {
    dataService.goToRoot();
    rerenderAnki();
}

async function handleNewFile() {
    const fileName = prompt("请输入新文件的名称：", "新文件");
    if (fileName === null) return;
    await dataService.addFile(fileName.trim());
    rerenderAnki();
    dom.editor.focus();
}

async function handleNewFolder() {
    const folderName = prompt("请输入新目录的名称：", "新目录");
    if (folderName === null) return;
    await dataService.addFolder(folderName.trim());
    rerenderAnki();
}

async function handleSave() {
    const saved = await dataService.saveCurrentSessionContent(dom.editor.value);
    if (saved) {
        dom.saveBtn.innerHTML = '<i class="fas fa-check"></i> 已保存';
        setTimeout(() => dom.saveBtn.innerHTML = '<i class="fas fa-save"></i> 保存', 2000);
        rerenderAnki();
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
                rerenderAnki();
            }
        } else if (action.classList.contains('edit-btn')) {
             const newName = prompt('输入新名称:', item.querySelector('.item-name').textContent);
             if (newName && newName.trim()) {
                 await dataService.updateItemName(id, newName.trim(), type);
                 rerenderAnki();
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

    rerenderAnki();
}

async function handleConfirmMove() {
    if (appState.selectedMoveTarget !== undefined && appState.movingItems.length > 0) {
        await dataService.moveItems(appState.movingItems, appState.selectedMoveTarget);
        closeModal();
        rerenderAnki();
    } else {
        alert('请选择一个目标目录。');
    }
}

async function handleDeleteSelected() {
    const selected = Array.from(dom.sessionList.querySelectorAll('.select-checkbox:checked'))
        .map(cb => ({ id: cb.dataset.id, type: cb.dataset.type }));
    if (selected.length === 0) return alert('请先选择要删除的项目。');
    if (confirm(`确定要删除选中的 ${selected.length} 个项目吗？`)) {
        await dataService.removeItems(selected);
        dom.selectAllCheckbox.checked = false;
        rerenderAnki();
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
        rerenderAnki();
    };
    reader.readAsText(file);
    dom.fileInput.value = '';
}

function wrapSelection(prefix, suffix = prefix) {
    const { selectionStart, selectionEnd, value } = dom.editor;
    const selectedText = value.substring(selectionStart, selectionEnd);
    const newText = `${prefix}${selectedText}${suffix}`;
    dom.editor.setRangeText(newText, selectionStart, selectionEnd, 'select');
    handleEditorInput();
    dom.editor.focus();
}

// [MODIFIED] 新增辅助函数用于插入文本
function insertTextAtCursor(text) {
    const { selectionStart, selectionEnd } = dom.editor;
    dom.editor.setRangeText(text, selectionStart, selectionEnd, 'end');
    handleEditorInput();
    dom.editor.focus();
}


function handleToggleEditor() {
    dom.editorPanel.classList.toggle('collapsed');
    const isCollapsed = dom.editorPanel.classList.contains('collapsed');
    dom.toggleEditorBtn.innerHTML = isCollapsed ? '<i class="fas fa-chevron-down"></i>' : '<i class="fas fa-chevron-up"></i>';
    dom.toggleEditorBtn.title = isCollapsed ? "展开编辑器" : "收起编辑器";
    // [MODIFIED] 将新按钮加入禁用列表
    [dom.clozeBtn, dom.boldBtn, dom.italicBtn, dom.codeBtn, dom.linkBtn, dom.audioBtn, dom.insertLinebreakBtn].forEach(btn => btn.disabled = isCollapsed);
    if (isCollapsed) handleSave();
}

export function setupAnkiEventListeners() {
    dom.newFileBtn.addEventListener('click', handleNewFile);
    dom.newFolderBtn.addEventListener('click', handleNewFolder);
    dom.saveBtn.addEventListener('click', handleSave);
    dom.sessionList.addEventListener('click', handleSessionListClick);
    dom.deleteSelectedBtn.addEventListener('click', handleDeleteSelected);
    dom.editor.addEventListener('input', handleEditorInput);
    dom.openFileBtn.addEventListener('click', () => dom.fileInput.click());
    dom.fileInput.addEventListener('change', handleOpenFile);

    dom.moveSelectedBtn.addEventListener('click', () => {
        const selected = Array.from(dom.sessionList.querySelectorAll('.select-checkbox:checked')).map(cb => ({ id: cb.dataset.id, type: cb.dataset.type }));
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

    dom.helpBtn.addEventListener('click', () => dom.instructionsSection.scrollIntoView({ behavior: 'smooth' }));
    dom.toggleEditorBtn.addEventListener('click', handleToggleEditor);
    dom.clozeBtn.addEventListener('click', () => wrapSelection('--', '--'));
    dom.boldBtn.addEventListener('click', () => wrapSelection('**'));
    dom.italicBtn.addEventListener('click', () => wrapSelection('*'));
    // [MODIFIED] 为新按钮添加事件监听器
    dom.insertLinebreakBtn.addEventListener('click', () => insertTextAtCursor('¶'));
    dom.codeBtn.addEventListener('click', () => wrapSelection('`'));
    dom.linkBtn.addEventListener('click', () => wrapSelection('[', `](${prompt('URL:', 'https://')})`));
    
    dom.toggleVisibilityClozeBtn.addEventListener('click', toggleAllClozeVisibility);
    dom.invertClozeBtn.addEventListener('click', invertAllCloze);

    dom.playBtn.addEventListener('click', resumeAudio);
    dom.pauseBtn.addEventListener('click', pauseAudio);
    dom.stopBtn.addEventListener('click', stopAudio);

    setupModalEventListeners(handleConfirmMove);
}