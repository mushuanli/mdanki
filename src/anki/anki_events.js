// src/anki/anki_events.js
import * as dom from './anki_dom.js';
import { appState, setState } from '../common/state.js';
import * as dataService from '../services/dataService.js';
import { updatePreview, toggleAllClozeVisibility, invertAllCloze } from './previewUI.js';
import * as statsUI from './statsUI.js';

// [MODIFIED] 导入新的 reviewSession 模块
import { startReviewSession } from './reviewSession.js'; 

import { openMoveModal, closeModal, setupModalEventListeners } from './modalUI.js';
import { stopAudio, resumeAudio, pauseAudio } from './audioUI.js';
import { rerenderAnki } from './anki_ui.js';

let undoDebounceTimer = null;
const MAX_HISTORY_SIZE = 100; // Limit the history size to prevent memory issues

// [NEW] 用于跟踪 Shift-Click 多选操作的最后一个复选框索引
let lastCheckedIndex = -1;

// [新增] 用于 Cloze 导航的模块级变量
let currentClozeIndex = -1;

// --- Exported Navigation Handlers ---
export function anki_goBack() {
    dataService.anki_goBack();
    resetUIStateOnNavigate();
    rerenderAnki();
}

export function anki_goToFolder(folderId, stackIndex) {
    dataService.anki_goToFolder(folderId, stackIndex);
    resetUIStateOnNavigate();
    rerenderAnki();
}

export function anki_goToRoot() {
    dataService.anki_goToRoot();
    resetUIStateOnNavigate();
    rerenderAnki();
}

function resetUIStateOnNavigate() {
    lastCheckedIndex = -1;
    currentClozeIndex = -1;
}

async function handleNewFile() {
    const fileName = prompt("请输入新文件的名称：", "新笔记");
    if (fileName === null) return;
    await dataService.anki_addFile(fileName.trim());
    rerenderAnki();
    dom.editor.focus();
}

async function handleNewFolder() {
    const folderName = prompt("请输入新目录的名称：", "新目录");
    if (folderName === null) return;
    await dataService.anki_addFolder(folderName.trim());
    rerenderAnki();
}

async function handleSave() {
    const saved = await dataService.anki_saveCurrentSessionContent(dom.editor.value);
    if (saved) {
        dom.saveBtn.innerHTML = '<i class="fas fa-check"></i> 已保存';
        setTimeout(() => dom.saveBtn.innerHTML = '<i class="fas fa-save"></i>', 2000);
        // Note: rerenderAnki() is now called from saveCurrentSessionContent in dataService
    }
}

// [NEW] 处理复选框选择逻辑，包括Shift-Click
function handleSelection(event, checkbox) {
    const allCheckboxes = Array.from(dom.sessionList.querySelectorAll('.select-checkbox'));
    const currentIndex = allCheckboxes.indexOf(checkbox);

    // 检查是否按下了 Shift 键，并且之前已经点击过一个复选框
    if (event.shiftKey && lastCheckedIndex > -1) {
        const start = Math.min(currentIndex, lastCheckedIndex);
        const end = Math.max(currentIndex, lastCheckedIndex);

        // 遍历范围内的所有复选框
        for (let i = start; i <= end; i++) {
            // 将范围内的所有项都设置为与当前点击项相同的状态（勾选或取消勾选）
            allCheckboxes[i].checked = checkbox.checked;
        }
    }

    // 更新最后一次点击的索引
    lastCheckedIndex = currentIndex;

    // 更新“全选”复选框的状态
    const allSelected = allCheckboxes.length > 0 && allCheckboxes.every(cb => cb.checked);
    const someSelected = allCheckboxes.some(cb => cb.checked);
    dom.selectAllCheckbox.checked = allSelected;
    dom.selectAllCheckbox.indeterminate = !allSelected && someSelected;
}


// [REWRITTEN] 重写会话列表的点击处理函数，以支持多选
async function handleSessionListClick(e) {
    const item = e.target.closest('.session-item, .session-item-details summary');
    if (!item) return;

    // --- 1. 检查点击目标，区分“选择”与“导航” ---
    if (e.target.matches('.select-checkbox')) {
        // 如果点击的是复选框，则执行选择逻辑，然后停止
        handleSelection(e, e.target);
        return;
    }

    const action = e.target.closest('.actions span');
    if (action) {
        e.stopPropagation();
        const { id, type } = item.closest('.session-item').dataset;
        if (action.classList.contains('delete-btn')) {
            if (confirm(`确定删除此 ${type === 'file' ? '文件' : '目录'}?`)) {
                await dataService.anki_removeItems([{ id, type }]);
                rerenderAnki();
            }
        } else if (action.classList.contains('edit-btn')) {
             const newName = prompt('输入新名称:', item.querySelector('.item-name').textContent);
             if (newName && newName.trim()) {
                 await dataService.anki_updateItemName(id, newName.trim(), type);
                 rerenderAnki();
             }
        } else if (action.classList.contains('move-btn')) {
            setState({ movingItems: [{ id, type }] });
            openMoveModal();
        }
        return;
    }

    resetUIStateOnNavigate();
    const { id, type, parent } = item.dataset;

    if (appState.currentSessionId && id !== appState.currentSessionId) {
        await dataService.anki_saveCurrentSessionContent(dom.editor.value);
    }

    if (type === 'file') dataService.anki_selectSession(id);
    else if (type === 'folder') dataService.anki_selectFolder(id);
    else if (type === 'subsession') dataService.anki_selectSubsession(parent, id);

    rerenderAnki();
}

async function handleConfirmMove() {
    if (appState.selectedMoveTarget !== undefined && appState.movingItems.length > 0) {
        await dataService.anki_moveItems(appState.movingItems, appState.selectedMoveTarget);
        closeModal();
        rerenderAnki();
    }
}

async function handleDeleteSelected() {
    const selected = Array.from(dom.sessionList.querySelectorAll('.select-checkbox:checked'))
        .map(cb => ({ id: cb.dataset.id, type: cb.dataset.type }));
    if (selected.length === 0) return alert('请先选择要删除的项目。');
    if (confirm(`确定要删除选中的 ${selected.length} 个项目吗？`)) {
        await dataService.anki_removeItems(selected);
        dom.selectAllCheckbox.checked = false;
        rerenderAnki();
    }
}

function handleEditorInput() {
    clearTimeout(window.previewDebounce);
    window.previewDebounce = setTimeout(updatePreview, 300);
    clearTimeout(undoDebounceTimer);
    undoDebounceTimer = setTimeout(saveEditorStateForUndo, 500);
}

async function handleOpenFile(e) {
    const files = e.target.files; // 获取所有选中的文件 (FileList)
    if (!files || files.length === 0) return;

    // 定义一个读取单个文件的Promise函数
    const readFile = (file) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (event) => {
                // 解析成功后，返回文件名和内容
                resolve({ name: file.name, content: event.target.result });
            };
            reader.onerror = (error) => reject(error);
            reader.readAsText(file);
        });
    };

    try {
        // 等待所有文件都读取完毕
        const allFilesData = await Promise.all(Array.from(files).map(readFile));

        // 依次将读取到的文件添加到数据服务中
        for (const fileData of allFilesData) {
            const originalName = fileData.name;
            const lastDotIndex = originalName.lastIndexOf('.');

            // 判断条件 lastDotIndex > 0 可以：
            // 1. 处理 "file.txt" (lastDotIndex > 0) -> "file"
            // 2. 忽略 "filename" (没有扩展名, lastDotIndex = -1) -> "filename"
            // 3. 忽略 ".bashrc" (以点开头, lastDotIndex = 0) -> ".bashrc"
            const nameWithoutExtension = (lastDotIndex > 0)
                ? originalName.substring(0, lastDotIndex)
                : originalName;

            await dataService.anki_addFile(nameWithoutExtension, fileData.content);
        }

        // 所有文件都添加完毕后，刷新一次UI
        rerenderAnki();

    } catch (error) {
        console.error("读取一个或多个文件时出错:", error);
        alert("读取文件时发生错误。");
    } finally {
        // 清空input的值，以便用户可以再次选择相同的文件
        dom.fileInput.value = '';
    }
}

function wrapSelection(prefix, suffix = prefix) {
    saveEditorStateForUndo(); // <<< 添加这一行
    const { selectionStart, selectionEnd, value } = dom.editor;
    const selectedText = value.substring(selectionStart, selectionEnd);
    const newText = `${prefix}${selectedText}${suffix}`;
    dom.editor.setRangeText(newText, selectionStart, selectionEnd, 'select');
    handleEditorInput();
    dom.editor.focus();
}

// [MODIFIED] 新增辅助函数用于插入文本
function insertTextAtCursor(text) {
    saveEditorStateForUndo(); // <<< 添加这一行

    const { selectionStart, selectionEnd } = dom.editor;
    dom.editor.setRangeText(text, selectionStart, selectionEnd, 'end');
    handleEditorInput();
    dom.editor.focus();
}


function handleToggleEditor() {
    dom.editorPreviewPanel.classList.toggle('collapsed');
    const isCollapsed = dom.editorPreviewPanel.classList.contains('collapsed');
    dom.toggleEditorBtn.innerHTML = isCollapsed ? '<i class="fas fa-chevron-down"></i>' : '<i class="fas fa-chevron-up"></i>';
    dom.toggleEditorBtn.title = isCollapsed ? "展开编辑器" : "收起编辑器";
    // [MODIFIED] 将新按钮加入禁用列表
    [dom.clozeBtn, dom.boldBtn, dom.italicBtn, dom.codeBtn, dom.linkBtn, dom.audioBtn, dom.insertLinebreakBtn].forEach(btn => btn.disabled = isCollapsed);
    if (isCollapsed) handleSave();
}

// [NEW] Added audio prompt editing functionality
function handleAudioPrompt() {
    const editor = dom.editor;
    const text = editor.value;
    const cursorPos = editor.selectionStart;

    // Regex to find all clozes, including those with audio prompts
    const clozeRegex = /--(?:\s*\[[^\]]*\])?\s*.*?--(?:\^\^audio:.*?\^\^)?/g;
    let match;
    let targetCloze = null;

    // 1. Find if the cursor is inside any cloze
    while ((match = clozeRegex.exec(text)) !== null) {
        const startIndex = match.index;
        const endIndex = startIndex + match[0].length;
        if (cursorPos >= startIndex && cursorPos <= endIndex) {
            targetCloze = {
                content: match[0],
                start: startIndex,
                end: endIndex
            };
            break;
        }
    }

    // If cursor is not in a cloze, ignore the click (Requirement 1)
    if (!targetCloze) {
        // 如果光标不在任何 Cloze 中，则执行简单的包裹操作
        wrapSelection('--', '--^^audio:TEXT^^');
        return;
    }

    // Regex to parse the content and audio from the found cloze
    const parseRegex = /^--(\[\s*[^\]]*\s*\]\s*)?(.*?)--(?:(?:\^){2}audio:(.*)(?:\^){2})?$/;
    const parts = targetCloze.content.match(parseRegex);

    if (!parts) return; // Should not happen if the main regex matches

    const locatorPart = parts[1] || '';
    const clozeText = parts[2] ? parts[2].trim() : '';
    const existingAudio = parts[3] ? parts[3].trim() : '';

    // 2. If cloze has audio, dialog shows audio. (Requirement 2)
    // 3. If cloze has no audio, dialog shows cloze content. (Requirement 3)
    const defaultPrompt = existingAudio || clozeText;

    const newAudioText = prompt("请输入或编辑Cloze的音频提示文本:", defaultPrompt);

    // If user cancels, do nothing
    if (newAudioText === null) {
        return;
    }
    saveEditorStateForUndo(); // <<< 添加这一行

    // 4. Update audio content on confirmation
    const trimmedNewAudio = newAudioText.trim();
    let replacementString;

    if (trimmedNewAudio) {
        replacementString = `--${locatorPart}${clozeText}--^^audio:${trimmedNewAudio}^^`;
    } else {
        replacementString = `--${locatorPart}${clozeText}--`;
    }

    // Replace the old cloze string with the new one in the editor
    const newEditorValue = text.substring(0, targetCloze.start) + replacementString + text.substring(targetCloze.end);
    editor.value = newEditorValue;

    // Trigger preview update and save the changes
    handleEditorInput();
    handleSave();
    editor.focus();
}

function handleClozeButtonClick() {
    saveEditorStateForUndo();
    const { selectionStart, selectionEnd, value } = dom.editor;
    const selectedText = value.substring(selectionStart, selectionEnd);
    
    const defaultLocator = `c${Date.now()}`;
    const newText = `--[${defaultLocator}] ${selectedText}--`;

    dom.editor.setRangeText(newText, selectionStart, selectionEnd, 'end');
    
    const locatorStart = selectionStart + 3;
    const locatorEnd = locatorStart + defaultLocator.length;
    dom.editor.setSelectionRange(locatorStart, locatorEnd);

    handleEditorInput();
    dom.editor.focus();
}

function saveEditorStateForUndo() {
    const currentContent = dom.editor.value;
    const lastState = appState.undoStack[appState.undoStack.length - 1];

    // Don't save if the content hasn't changed
    if (lastState === currentContent) return;

    const newUndoStack = [...appState.undoStack, currentContent];

    // Limit the size of the undo stack
    if (newUndoStack.length > MAX_HISTORY_SIZE) {
        newUndoStack.shift();
    }
    
    // A new action invalidates the redo stack
    setState({
        undoStack: newUndoStack,
        redoStack: []
    });
}

/**
 * Handles the Undo action (Ctrl+Z).
 */
function handleUndo() {
    if (appState.undoStack.length === 0) return;

    const newUndoStack = [...appState.undoStack];
    const lastState = newUndoStack.pop();

    // Move the current state to the redo stack before reverting
    const newRedoStack = [dom.editor.value, ...appState.redoStack];

    dom.editor.value = lastState;
    setState({
        undoStack: newUndoStack,
        redoStack: newRedoStack
    });
    
    // Update the preview to reflect the change
    handleEditorInput();
}

/**
 * Handles the Redo action (Ctrl+R).
 */
function handleRedo() {
    if (appState.redoStack.length === 0) return;

    const newRedoStack = [...appState.redoStack];
    const nextState = newRedoStack.shift(); // Use shift because we prepend to the stack

    // Move the current state to the undo stack before applying the redo state
    const newUndoStack = [...appState.undoStack, dom.editor.value];

    dom.editor.value = nextState;
    setState({
        undoStack: newUndoStack,
        redoStack: newRedoStack
    });

    // Update the preview to reflect the change
    handleEditorInput();
}

/**
 * [新增] 打印预览内容的处理函数
 */
function handlePrintPreview() {
    const previewContent = dom.preview.innerHTML;

    // 创建一个新窗口用于打印
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
        <!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><title>打印预览</title>
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
        <link rel="stylesheet" href="./styles.css">
        <style>
            @media print { body { margin: 20px; -webkit-print-color-adjust: exact; print-color-adjust: exact; } .cloze-actions, .media-icon { display: none !important; } .cloze.hidden .cloze-content, .cloze .cloze-content { display: inline !important; visibility: visible !important; color: black !important; } .cloze .placeholder { display: none !important; } .cloze { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
            body { font-family: sans-serif; }
        </style></head><body>
        <div class="preview" style="display: block !important;">${previewContent}</div>
        <script src="https://polyfill.io/v3/polyfill.min.js?features=es6"></script>
        <script id="MathJax-script" async src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js"></script>
        <script>
            window.MathJax = { startup: { pageReady: () => { return window.MathJax.startup.defaultPageReady().then(() => { window.print(); window.close(); }); } } };
        </script>
        </body></html>
    `);
    printWindow.document.close(); // 必须调用 close() 来结束写入，这会触发页面加载
}


/**
 * [新增] 编辑器滚动事件处理。
 * 计算并存储当前滚动的百分比。
 */
function handleEditorScroll() {
    // 只有当编辑器可见时才更新状态，防止视图切换时触发不必要的更新
    if (dom.editorPreviewPanel.classList.contains('preview-active')) return;

    const editor = dom.editor;
    // 避免在内容不可滚动时除以零
    if (editor.scrollHeight > editor.clientHeight) {
        const scrollRatio = editor.scrollTop / (editor.scrollHeight - editor.clientHeight);
        // 将滚动比例保存到应用状态中
        setState({ editorScrollRatio: Math.min(1, Math.max(0, scrollRatio)) });
    }
}

/**
 * [新增] 预览区滚动事件处理。
 * 计算并存储当前滚动的百分比。
 */
function handlePreviewScroll() {
    // 只有当预览区可见时才更新状态
    if (!dom.editorPreviewPanel.classList.contains('preview-active')) return;

    const preview = dom.preview;
    if (preview.scrollHeight > preview.clientHeight) {
        const scrollRatio = preview.scrollTop / (preview.scrollHeight - preview.clientHeight);
        setState({ editorScrollRatio: scrollRatio });
    }
}

/**
 * [重写] 切换编辑/预览模式，并同步滚动位置。
 */
function toggleEditPreviewMode() {
    const panel = dom.editorPreviewPanel;
    const isPreviewMode = panel.classList.contains('preview-active');
    
    if (isPreviewMode) {
        // --- 从预览切换到编辑模式 ---
        panel.classList.remove('preview-active');
        dom.toggleEditPreviewBtn.innerHTML = '<i class="fas fa-book-open"></i> Preview';
        dom.editModeDot.classList.add('active');
        dom.previewModeDot.classList.remove('active');
        
        // [MODIFIED] Disable print button in edit mode
        dom.printPreviewBtn.disabled = true;
        
        // 使用 requestAnimationFrame 确保编辑器在DOM中可见并且其尺寸已计算
        requestAnimationFrame(() => {
            const editor = dom.editor;
            // 应用保存的滚动比例
            if (appState.editorScrollRatio !== undefined && (editor.scrollHeight > editor.clientHeight)) {
                editor.scrollTop = appState.editorScrollRatio * (editor.scrollHeight - editor.clientHeight);
            }
        });
        dom.editor.focus(); // 将焦点设置回编辑器

    } else {
        // --- 从编辑切换到预览模式 ---
        handleSave(); // 切换前保存
        updatePreview().then(() => {
            requestAnimationFrame(() => {
                const preview = dom.preview;
                if (appState.editorScrollRatio !== undefined && (preview.scrollHeight > preview.clientHeight)) {
                    preview.scrollTop = appState.editorScrollRatio * (preview.scrollHeight - preview.clientHeight);
                }
            });
        });
        panel.classList.add('preview-active');
        dom.toggleEditPreviewBtn.innerHTML = '<i class="fas fa-edit"></i>';
        dom.editModeDot.classList.remove('active');
        dom.previewModeDot.classList.add('active');
        
        // [MODIFIED] Enable print button in preview mode
        dom.printPreviewBtn.disabled = false;
    }
}

// [NEW] 填充自定义复习模态框的筛选器
function populateCustomStudyFilters() {
    const { sessions, folders } = appState;
    const filterSelect = document.getElementById('filterByFile');
    filterSelect.innerHTML = '<option value="all">所有文件</option>';

    folders.forEach(folder => {
        const opt = document.createElement('option');
        opt.value = `folder_${folder.id}`;
        opt.textContent = `目录: ${folder.name}`;
        filterSelect.appendChild(opt);
    });

    sessions.forEach(session => {
        const opt = document.createElement('option');
        opt.value = `file_${session.id}`;
        opt.textContent = `文件: ${session.name}`;
        filterSelect.appendChild(opt);
    });
}

// [NEW] 设置复习相关的UI事件
function setupReviewUIEventListeners() {
    // 自动复习按钮
    if (dom.startReviewBtn) {
        dom.startReviewBtn.addEventListener('click', () => startReviewSession());
    }

    // 下拉菜单逻辑
    if (dom.reviewOptionsBtn && dom.reviewDropdownMenu) {
        dom.reviewOptionsBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            dom.reviewDropdownMenu.style.display = dom.reviewDropdownMenu.style.display === 'block' ? 'none' : 'block';
        });

        // 点击页面其他地方关闭下拉菜单
        document.addEventListener('click', (e) => {
            const reviewGroup = dom.reviewOptionsBtn.parentElement; // More robust way to find parent
            if (reviewGroup && !reviewGroup.contains(e.target)) {
                dom.reviewDropdownMenu.style.display = 'none';
            }
        });
    }

    // 打开自定义复习模态框
    if (dom.customStudyBtn && dom.customStudyModal) {
        dom.customStudyBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (dom.reviewDropdownMenu) dom.reviewDropdownMenu.style.display = 'none';
            populateCustomStudyFilters(); // This function is ok
            dom.customStudyModal.style.display = 'flex';
        });
    }

    // 关闭模态框的通用函数
    const closeModal = () => {
        if (dom.customStudyModal) dom.customStudyModal.style.display = 'none';
    };
    if (dom.customStudyCloseBtn) dom.customStudyCloseBtn.addEventListener('click', closeModal);
    if (dom.customStudyCancelBtn) dom.customStudyCancelBtn.addEventListener('click', closeModal);

    // 提交自定义复习表单
    if (dom.customStudyForm) {
        dom.customStudyForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const filters = {
                fileOrFolder: dom.filterByFile.value,
                cardStates: Array.from(document.querySelectorAll('input[name="anki_cardState"]:checked')).map(cb => cb.value),
                lastReview: dom.filterByLastReview.value,
                maxCards: parseInt(dom.maxCards.value, 10),
            };
            closeModal();
            startReviewSession(filters);
        });
    }
}

// [新增] Cloze 导航函数
function navigateCloze(direction) {
    const clozeElements = Array.from(dom.preview.querySelectorAll('.cloze'));
    if (clozeElements.length === 0) return;

    // 移除旧的高亮
    const currentActive = dom.preview.querySelector('.cloze-nav-active');
    if (currentActive) currentActive.classList.remove('cloze-nav-active');

    // 计算新索引 (循环)
    currentClozeIndex = (currentClozeIndex + direction + clozeElements.length) % clozeElements.length;

    // 高亮并滚动到新元素
    const nextCloze = clozeElements[currentClozeIndex];
    if (nextCloze) {
        nextCloze.scrollIntoView({ behavior: 'smooth', block: 'center' });
        nextCloze.classList.add('cloze-nav-active');
    }
}

export function setupAnkiEventListeners() {
    dom.newFileBtn.addEventListener('click', handleNewFile);
    dom.newFolderBtn.addEventListener('click', handleNewFolder);
    dom.saveBtn.addEventListener('click', handleSave);
    dom.sessionList.addEventListener('click', handleSessionListClick);
    dom.deleteSelectedBtn.addEventListener('click', handleDeleteSelected);
    dom.editor.addEventListener('input', handleEditorInput);
    dom.editor.addEventListener('scroll', handleEditorScroll);
    dom.preview.addEventListener('scroll', handlePreviewScroll);
    
    // Open file is a bit different, it doesn't need a prefix as it's a global file input
    dom.openFileBtn.addEventListener('click', () => document.getElementById('anki_fileInput')?.click()); // Assuming you add this ID
    document.getElementById('anki_fileInput')?.addEventListener('change', handleOpenFile);

    // [MODIFIED] Add event listener for the print button
    dom.printPreviewBtn.addEventListener('click', handlePrintPreview);

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
        // [NEW] 重置 shift-click 状态
        lastCheckedIndex = -1;
    });

    dom.toggleSessionBtn.addEventListener('click', () => {
        dom.sessionSidebar.classList.toggle('hidden-session');
        dom.toggleSessionBtn.innerHTML = dom.sessionSidebar.classList.contains('hidden-session') ? '<i class="fas fa-arrow-right"></i>' : '<i class="fas fa-arrow-left"></i>';
    });

    dom.toggleEditorBtn.addEventListener('click', handleToggleEditor);

    // [FIXED] 恢复了旧代码的智能功能，而不是简单的文本插入
    dom.clozeBtn.addEventListener('click', handleClozeButtonClick);
    dom.audioBtn.addEventListener('click', handleAudioPrompt);

    dom.boldBtn.addEventListener('click', () => wrapSelection('**'));
    dom.italicBtn.addEventListener('click', () => wrapSelection('*'));
    // [MODIFIED] 为新按钮添加事件监听器
    dom.insertLinebreakBtn.addEventListener('click', () => insertTextAtCursor('¶'));
    dom.codeBtn.addEventListener('click', () => wrapSelection('`'));
    dom.linkBtn.addEventListener('click', () => wrapSelection('[', `](${prompt('URL:', 'https://')})`));
    
    dom.editor.addEventListener('scroll', handleEditorScroll);
    dom.preview.addEventListener('scroll', handlePreviewScroll);

    // [MODIFIED] 确保此按钮的点击事件由我们重写的函数处理
    dom.toggleEditPreviewBtn.addEventListener('click', toggleEditPreviewMode);
    
    // 修改全部隐藏按钮的图标
    dom.toggleVisibilityClozeBtn.innerHTML = '<i class="fas fa-eye-slash"></i>';
    dom.toggleVisibilityClozeBtn.title = "全部隐藏";
    
    // 修改反向显示按钮的图标
    dom.invertClozeBtn.innerHTML = '<i class="fas fa-random"></i>';
    dom.invertClozeBtn.title = "反向显示/隐藏";
    
    // 初始化编辑/预览模式
    dom.editorPreviewPanel.classList.remove('preview-active');
    dom.toggleEditPreviewBtn.innerHTML = '<i class="fas fa-book-open"></i>';
    dom.toggleEditPreviewBtn.title = "切换到预览模式";
    dom.editModeDot.classList.add('active');
    dom.previewModeDot.classList.remove('active');
    dom.toggleVisibilityClozeBtn.addEventListener('click', toggleAllClozeVisibility);
    dom.invertClozeBtn.addEventListener('click', invertAllCloze);

    dom.playBtn?.addEventListener('click', resumeAudio);
    dom.pauseBtn?.addEventListener('click', pauseAudio);
    dom.stopBtn?.addEventListener('click', stopAudio);

    dom.clozeNavUpBtn?.addEventListener('click', () => navigateCloze(-1));
    dom.clozeNavDownBtn?.addEventListener('click', () => navigateCloze(1));

        // [NEW] Add keydown event listener for Undo/Redo
    dom.editor.addEventListener('keydown', (e) => {
        // Undo: Ctrl + Z
        if (e.ctrlKey && e.key === 'z') {
            e.preventDefault(); // Prevent native browser undo
            handleUndo();
        }
        // Redo: Ctrl + R
        else if (e.ctrlKey && e.key === 'y') {
            e.preventDefault(); // IMPORTANT: Prevent page reload
            handleRedo();
        }
                // [MODIFIED] Save: Ctrl + S
        else if (e.ctrlKey && e.key === 's') {
            e.preventDefault(); // IMPORTANT: Prevent browser's save dialog
            handleSave();
        }
    });
    
    // 这部分在新旧代码中都存在，但为了完整性在此处确认
    setupReviewUIEventListeners(); // 调用 review UI 事件设置

    // [FIXED] 同样修复统计按钮的事件绑定
    dom.showStatsBtn?.addEventListener('click', (e) => {
        e.preventDefault();
        statsUI.openStatsModal();
        if (dom.reviewDropdownMenu) {
            dom.reviewDropdownMenu.style.display = 'none';
        }
    });

    setupModalEventListeners(handleConfirmMove);
    statsUI.setupStatsModalEventListeners();
}
