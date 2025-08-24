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
        // 只有当内容确实发生变化时才保存和更新预览
        if (dom.editor.value !== dataService.anki_getCurrentSession()?.content) {
            dataService.anki_saveCurrentSessionContent(dom.editor.value).then(() => {
                updatePreview().then(() => {
                    // 确保预览内容更新后再显示预览面板
                    panel.classList.add('preview-active');
                    
                    // 更新按钮状态
                    dom.toggleEditPreviewBtn.innerHTML = '<i class="fas fa-edit"></i>';
                    dom.editModeDot.classList.remove('active');
                    dom.previewModeDot.classList.add('active');
                    dom.printPreviewBtn.disabled = false;

                    requestAnimationFrame(() => {
                        const preview = dom.preview;
                        if (appState.editorScrollRatio !== undefined && (preview.scrollHeight > preview.clientHeight)) {
                            preview.scrollTop = appState.editorScrollRatio * (preview.scrollHeight - preview.clientHeight);
                        }
                    });
                });
            });
        } else {
            // 内容没有变化，直接切换
            panel.classList.add('preview-active');
            dom.toggleEditPreviewBtn.innerHTML = '<i class="fas fa-edit"></i>';
            dom.editModeDot.classList.remove('active');
            dom.previewModeDot.classList.add('active');
            dom.printPreviewBtn.disabled = false;
            
            requestAnimationFrame(() => {
                const preview = dom.preview;
                if (appState.editorScrollRatio !== undefined && (preview.scrollHeight > preview.clientHeight)) {
                    preview.scrollTop = appState.editorScrollRatio * (preview.scrollHeight - preview.clientHeight);
                }
            });
        }
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
