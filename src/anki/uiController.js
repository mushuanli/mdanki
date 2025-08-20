// src/anki/uiController.js

import { dom } from './anki_dom.js';
import { appState } from '../common/state.js';
import { updatePreview } from './previewUI.js';
import * as dataService from '../services/dataService.js';

/**
 * 切换编辑/预览模式。这是纯粹的UI操作。
 * @param {'edit' | 'preview' | 'toggle'} [mode] - 目标模式，或'toggle'进行切换
 */
export function setEditPreviewMode(mode = 'toggle') {
    const panel = dom.editorPreviewPanel;
    const isCurrentlyPreview = panel.classList.contains('preview-active');

    let shouldBePreview;
    if (mode === 'toggle') {
        shouldBePreview = !isCurrentlyPreview;
    } else {
        shouldBePreview = mode === 'preview';
    }

    if (shouldBePreview === isCurrentlyPreview) return; // 如果已经是目标模式，则不执行任何操作

    if (shouldBePreview) {
        // --- 切换到预览模式 ---
        dataService.anki_saveCurrentSessionContent(dom.editor.value); // 切换前保存
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
        dom.printPreviewBtn.disabled = false;
    } else {
        // --- 切换到编辑模式 ---
        panel.classList.remove('preview-active');
        dom.toggleEditPreviewBtn.innerHTML = '<i class="fas fa-book-open"></i> Preview';
        dom.editModeDot.classList.add('active');
        dom.previewModeDot.classList.remove('active');
        dom.printPreviewBtn.disabled = true;
        
        requestAnimationFrame(() => {
            const editor = dom.editor;
            if (appState.editorScrollRatio !== undefined && (editor.scrollHeight > editor.clientHeight)) {
                editor.scrollTop = appState.editorScrollRatio * (editor.scrollHeight - editor.clientHeight);
            }
        });
        dom.editor.focus();
    }
}
