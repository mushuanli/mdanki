// src/anki/navigationController.js
import { appState, setState } from '../common/state.js';
import * as dataService from '../services/dataService.js';
import { rerenderAnki } from './anki_ui.js';
import { bus } from '../common/eventBus.js';

class NavigationController {
    constructor() {
        this.isNavigating = false;
    }
    
    async navigateToSession(sessionId, options = {}) {
        if (this.isNavigating) return;
        
        this.isNavigating = true;
        
        try {
            // 1. 保存当前编辑内容
            if (appState.currentSessionId && appState.currentSessionId !== sessionId) {
                const editor = document.getElementById('anki_editor');
                if (editor) {
                    await dataService.anki_saveCurrentSessionContent(editor.value);
                }
            }
            
            // 2. 切换会话
            await dataService.anki_selectSession(sessionId);
            
            // 3. 渲染新内容
            await rerenderAnki();
            
            // 4. 等待DOM稳定
            await this.waitForDOMStability();
            
            // 5. 切换到预览模式（如果需要）
            if (options.switchToPreview !== false) {
                bus.emit('ui:setEditPreviewMode', 'preview');
            }
            
        } finally {
            this.isNavigating = false;
        }
    }
    
    async navigateToFolder(folderId) {
        if (this.isNavigating) return;
        
        this.isNavigating = true;
        
        try {
            await dataService.anki_selectFolder(folderId);
            await rerenderAnki();
        } finally {
            this.isNavigating = false;
        }
    }
    
    async navigateToSubsession(parentId, subsessionId, options = {}) {
        if (this.isNavigating) return;
        
        this.isNavigating = true;
        
        try {
            await dataService.anki_selectSubsession(parentId, subsessionId);
            await rerenderAnki();
            await this.waitForDOMStability();
            
            if (options.switchToPreview !== false) {
                bus.emit('ui:setEditPreviewMode', 'preview');
            }
        } finally {
            this.isNavigating = false;
        }
    }
    
    waitForDOMStability() {
        return new Promise(resolve => {
            requestAnimationFrame(() => {
                setTimeout(resolve, 50);
            });
        });
    }
}

export const navigationController = new NavigationController();
