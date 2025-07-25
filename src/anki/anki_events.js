// src/anki/anki_events.js
import * as dom from './anki_dom.js';
import { appState, setState } from '../common/state.js';
import * as dataService from '../services/dataService.js';
import { updatePreview, toggleAllClozeVisibility, invertAllCloze } from './previewUI.js';

// [MODIFIED] 导入新的 reviewSession 模块
import { startReviewSession } from './reviewSession.js'; 

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
    dom.editorPreviewPanel.classList.toggle('collapsed');
    const isCollapsed = dom.editorPreviewPanel.classList.contains('collapsed');
    dom.toggleEditorBtn.innerHTML = isCollapsed ? '<i class="fas fa-chevron-down"></i>' : '<i class="fas fa-chevron-up"></i>';
    dom.toggleEditorBtn.title = isCollapsed ? "展开编辑器" : "收起编辑器";
    // [MODIFIED] 将新按钮加入禁用列表
    [dom.clozeBtn, dom.boldBtn, dom.italicBtn, dom.codeBtn, dom.linkBtn, dom.audioBtn, dom.insertLinebreakBtn].forEach(btn => btn.disabled = isCollapsed);
    if (isCollapsed) handleSave();
}

// ======================================================
//          [MODIFIED] 新增和修改的函数
// ======================================================

/**
 * [新增] 打印预览内容的处理函数
 */
function handlePrintPreview() {
    const previewContent = dom.preview.innerHTML;

    // 创建一个新窗口用于打印
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
        <!DOCTYPE html>
        <html lang="zh-CN">
        <head>
            <meta charset="UTF-8">
            <title>打印预览</title>
            <!-- 重新链接所有必要的样式表以确保打印视图的正确性 -->
            <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
            <link rel="stylesheet" href="./styles.css">
            <style>
                /* 打印专用样式 */
                @media print {
                    body { 
                        margin: 20px; 
                        -webkit-print-color-adjust: exact; /* 确保背景色和颜色在打印时正确显示 */
                        print-color-adjust: exact;
                    }
                    /* 隐藏不希望打印的元素，如操作按钮 */
                    .cloze-actions, .media-icon {
                        display: none !important;
                    }
                    /* 确保所有Cloze内容在打印时都是可见的 */
                    .cloze.hidden .cloze-content, .cloze .cloze-content {
                        display: inline !important;
                        visibility: visible !important;
                        color: black !important; /* 强制文字为黑色 */
                    }
                    .cloze .placeholder {
                        display: none !important;
                    }
                    /* 确保Cloze的背景颜色能被打印 */
                    .cloze {
                        -webkit-print-color-adjust: exact;
                        print-color-adjust: exact;
                    }
                }
                body {
                    font-family: sans-serif;
                }
            </style>
        </head>
        <body>
            <div class="preview" style="display: block !important;">
                ${previewContent}
            </div>
            <!-- 重新引入MathJax以渲染数学公式 -->
            <script src="https://polyfill.io/v3/polyfill.min.js?features=es6"></script>
            <script id="MathJax-script" async src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js"></script>
            <script>
                // 设置MathJax，在渲染完成后自动触发打印并关闭窗口
                window.MathJax = {
                    startup: {
                        pageReady: () => {
                            return window.MathJax.startup.defaultPageReady().then(() => {
                                console.log('MathJax has finished rendering. Triggering print.');
                                window.print();
                                window.close();
                            });
                        }
                    }
                };
            </script>
        </body>
        </html>
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
        dom.toggleEditPreviewBtn.title = "切换到预览";
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
        updatePreview(); // 更新预览内容
        
        // 使用 requestAnimationFrame 等待DOM更新，特别是内容渲染后
        requestAnimationFrame(() => {
            const preview = dom.preview;
            // 应用保存的滚动比例
            if (appState.editorScrollRatio !== undefined && (preview.scrollHeight > preview.clientHeight)) {
                preview.scrollTop = appState.editorScrollRatio * (preview.scrollHeight - preview.clientHeight);
            }
        });

        panel.classList.add('preview-active');
        dom.toggleEditPreviewBtn.innerHTML = '<i class="fas fa-edit"></i>';
        dom.toggleEditPreviewBtn.title = "切换到编辑模式";
        dom.editModeDot.classList.remove('active');
        dom.previewModeDot.classList.add('active');
        
        // [MODIFIED] Enable print button in preview mode
        dom.printPreviewBtn.disabled = false;
        
        // 切换到预览模式时自动保存
        handleSave();
        // 确保预览内容是最新的
        updatePreview();
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
    const reviewOptionsBtn = document.getElementById('reviewOptionsBtn');
    const reviewDropdownMenu = document.getElementById('reviewDropdownMenu');
    const customStudyBtn = document.getElementById('customStudyBtn');
    const customStudyModal = document.getElementById('customStudyModal');
    const customStudyCloseBtn = document.getElementById('customStudyCloseBtn');
    const customStudyCancelBtn = document.getElementById('customStudyCancelBtn');
    const customStudyForm = document.getElementById('customStudyForm');

    // 自动复习按钮
    document.getElementById('startReviewBtn').addEventListener('click', () => startReviewSession());

    // 下拉菜单逻辑
    reviewOptionsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isShown = reviewDropdownMenu.style.display === 'block';
        reviewDropdownMenu.style.display = isShown ? 'none' : 'block';
    });

    document.addEventListener('click', (e) => {
        const reviewGroup = document.querySelector('.review-btn-group');
        if (reviewGroup && !reviewGroup.contains(e.target)) {
            reviewDropdownMenu.style.display = 'none';
        }
    });

    // 打开模态框
    customStudyBtn.addEventListener('click', (e) => {
        e.preventDefault();
        reviewDropdownMenu.style.display = 'none';
        populateCustomStudyFilters();
        customStudyModal.style.display = 'flex';
    });

    // 关闭模态框
    const closeModal = () => customStudyModal.style.display = 'none';
    customStudyCloseBtn.addEventListener('click', closeModal);
    customStudyCancelBtn.addEventListener('click', closeModal);

    // 提交自定义复习表单
    customStudyForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const filters = {
            fileOrFolder: document.getElementById('filterByFile').value,
            cardStates: Array.from(document.querySelectorAll('input[name="cardState"]:checked')).map(cb => cb.value),
            lastReview: document.getElementById('filterByLastReview').value,
            maxCards: parseInt(document.getElementById('maxCards').value, 10),
        };
        closeModal();
        startReviewSession(filters);
    });
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
    });

    dom.toggleSessionBtn.addEventListener('click', () => {
        dom.sessionSidebar.classList.toggle('hidden-session');
        const isHidden = dom.sessionSidebar.classList.contains('hidden-session');
        dom.toggleSessionBtn.innerHTML = isHidden ? '<i class="fas fa-arrow-right"></i>' : '<i class="fas fa-arrow-left"></i>';
    });

    dom.toggleEditorBtn.addEventListener('click', handleToggleEditor);
    dom.clozeBtn.addEventListener('click', () => wrapSelection('--', '--'));
    dom.boldBtn.addEventListener('click', () => wrapSelection('**'));
    dom.italicBtn.addEventListener('click', () => wrapSelection('*'));
    // [MODIFIED] 为新按钮添加事件监听器
    dom.insertLinebreakBtn.addEventListener('click', () => insertTextAtCursor('¶'));
    dom.codeBtn.addEventListener('click', () => wrapSelection('`'));
    dom.linkBtn.addEventListener('click', () => wrapSelection('[', `](${prompt('URL:', 'https://')})`));
    
    // [MODIFIED] 绑定新的滚动事件监听器
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

    dom.playBtn.addEventListener('click', resumeAudio);
    dom.pauseBtn.addEventListener('click', pauseAudio);
    dom.stopBtn.addEventListener('click', stopAudio);

    setupModalEventListeners(handleConfirmMove);
    setupReviewUIEventListeners();
}