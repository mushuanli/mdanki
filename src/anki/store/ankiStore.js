// src/anki/store/ankiStore.js

// 导入依赖的服务
import * as dataService from '../services/dataService.js';
import { renderMarkdown, processCloze } from '../services/renderService.js';
import { calculateNextReview } from '../../services/srs.js'; // 导入SRS算法服务
import { INITIAL_CONTENT } from '../../common/config.js';


const MAX_UNDO_HISTORY = 100;

class AnkiStore {
    constructor() {
        this.state = {
            // 数据状态
            currentSessionId: null,
            currentFolderId: null,
            folderStack: [],
            sessions: [],
            folders: [],
            clozeStates: {}, // { [clozeId]: { srsState..., tempVisible: boolean } }
            reviewCount: 0,
            
            // --- UI 状态 ---
            viewMode: 'preview', // 'edit' | 'preview'
            isEditorCollapsed: false,
            isSidebarVisible: true,
            selectedItemIds: new Set(),
            areAllClozesVisible: false,

            // --- 模态框可见性 ---
            isMoveModalVisible: false,
            isCustomStudyModalVisible: false,
            isStatsModalVisible: false,

            // --- 编辑器状态 ---
            editorContent: '',
            undoStack: [],
            redoStack: [],
            // [NEW] 状态来同步滚动位置
            editorScrollRatio: 0,
          
            // --- 预览状态 ---
            previewContent: '',
            // [NEW] 状态来支持Cloze导航
            lastInteractedClozeId: null,
            highlightedClozeId: null, // UI组件将监听此ID以高亮和滚动
          
            // --- 复习会话状态 ---
            reviewQueue: [],
            currentReviewIndex: -1,

            // --- 临时状态 (防止竞态) ---
            isNavigating: false,
            isSaving: false,
            isUpdatingPreview: false
        };
      
        // 私有属性，不放入 state
        this._lastToggledItemId = null; 
        this.listeners = new Set();
        this.currentUpdatePromise = null; // 用于跟踪进行中的预览更新
    }
  
    /** 获取当前状态的只读副本 */
    getState() {
        return { ...this.state };
    }
  
    /** 更新状态并通知所有订阅者 */
    setState(updates) {
        const oldState = { ...this.state };
        
        // 检查是否有实际变化
        const hasChanged = Object.keys(updates).some(key => this.state[key] !== updates[key]);
        if (!hasChanged) return;

        this.state = { ...this.state, ...updates };
        this.notify(oldState, this.state);
    }
  
    /**
     * [优化] 订阅状态变化。
     * @param {function} listener - 当状态变化时要执行的回调函数。
     * @param {string[]} [keysToWatch] - (可选) 一个包含状态键名的数组。只有当这些键之一发生变化时，才会调用监听器。
     *                                   如果未提供，则任何状态变化都会触发。
     */
    subscribe(listener, keysToWatch) {
        const enhancedListener = {
            callback: listener,
            keys: keysToWatch ? new Set(keysToWatch) : null // 使用 Set 以提高查找效率
        };
        this.listeners.add(enhancedListener);
        
        return () => this.listeners.delete(enhancedListener);
    }
  
    /** 通知所有监听器状态已改变 */
    notify(oldState, newState) {
        // [优化] 检查哪些键发生了变化
        const changedKeys = new Set();
        for (const key in newState) {
            if (oldState[key] !== newState[key]) {
                changedKeys.add(key);
            }
        }
        
        if (changedKeys.size === 0) return;

        this.listeners.forEach(listenerObj => {
            // 如果监听器没有指定 keys (全局监听)，或者它关心的 key 发生了变化
            if (!listenerObj.keys || [...listenerObj.keys].some(key => changedKeys.has(key))) {
                listenerObj.callback(newState, oldState);
            }
        });
    }
  
    // ======================================================
    //                   ACTIONS (业务逻辑)
    // ======================================================

    // --- 初始化与数据加载 ---
    async initialize() {
        const initialState = await dataService.loadInitialAnkiState();
        this.setState(initialState);
        await this.updateReviewCount();
        if(initialState.currentSessionId) {
            await this.updatePreview();
        }
    }
    
    // --- 文件与目录管理 Actions ---
    async createFile() {
        const fileName = prompt("请输入新文件的名称：", "新笔记");
        if (!fileName || !fileName.trim()) return;
    
        try {
            const newFile = await dataService.anki_addFile(fileName.trim(), INITIAL_CONTENT, this.state.currentFolderId);
        
            // 确保新文件被添加到状态中
            this.setState({ 
                sessions: [...this.state.sessions, newFile] 
            });
        
            // 导航到新文件
            await this.navigateToFile(newFile.id);
        
            console.log("New file created:", newFile); // 调试日志
        } catch (error) {
            console.error("Failed to create file:", error);
            alert("创建文件失败，请重试。");
        }
    }
    
    async createFolder() {
        const folderName = prompt("请输入新目录的名称：", "新目录");
        if (!folderName || !folderName.trim()) return;

        const newFolder = await dataService.anki_addFolder(folderName.trim(), this.state.currentFolderId);
        this.setState({ folders: [...this.state.folders, newFolder] });
    }

    async deleteSelectedItems() {
        const { selectedItemIds, sessions, folders } = this.state;
        if (selectedItemIds.size === 0) return;
        if (!confirm(`确定要删除选中的 ${selectedItemIds.size} 个项目吗？`)) return;

        const { remainingSessions, remainingFolders, remainingClozeStates } = await dataService.anki_removeItems(Array.from(selectedItemIds));
        
        const newState = {
            sessions: remainingSessions,
            folders: remainingFolders,
            clozeStates: remainingClozeStates,
            selectedItemIds: new Set()
        };
        
        // 如果当前文件被删除，导航到第一个文件
        if (selectedItemIds.has(this.state.currentSessionId)) {
            const nextSessionId = remainingSessions.length > 0 ? remainingSessions[0].id : null;
            await this.navigateToFile(nextSessionId);
        }

        this.setState(newState);
        await this.updateReviewCount();
    }

    async moveSelectedItems(targetFolderId) {
        const itemsToMove = Array.from(this.state.selectedItemIds);
        if (itemsToMove.length === 0) return;

        const { updatedSessions, updatedFolders } = await dataService.anki_moveItems(itemsToMove, targetFolderId);
        this.setState({
            sessions: updatedSessions,
            folders: updatedFolders,
            isMoveModalVisible: false,
            selectedItemIds: new Set()
        });
    }

    /**
     * [NEW] Action: 从文件系统导入一个或多个文件
     * @param {File[]} files - 从 <input type="file"> 获取的 File 对象数组
     */
    async importFiles(files) {
        if (!files || files.length === 0) return;

        const readFile = (file) => new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (event) => resolve({ name: file.name, content: event.target.result });
            reader.onerror = (error) => reject(error);
            reader.readAsText(file);
        });

        try {
            const allFilesData = await Promise.all(Array.from(files).map(readFile));
            const newSessions = [];

            for (const fileData of allFilesData) {
                const nameWithoutExt = fileData.name.lastIndexOf('.') > 0 
                    ? fileData.name.substring(0, fileData.name.lastIndexOf('.'))
                    : fileData.name;
                
                const newFile = await dataService.anki_addFile(nameWithoutExt, fileData.content, this.state.currentFolderId);
                newSessions.push(newFile);
            }

            this.setState({ sessions: [...this.state.sessions, ...newSessions] });

            // 导航到最后一个导入的文件
            if (newSessions.length > 0) {
                await this.navigateToFile(newSessions[newSessions.length - 1].id);
            }
        } catch (error) {
            console.error("文件导入失败:", error);
            alert("读取文件时发生错误。");
        }
    }

    async renameItem(itemId, itemType) {
        const items = itemType === 'file' ? this.state.sessions : this.state.folders;
        const item = items.find(i => i.id === itemId);
        if (!item) return;

        const newName = prompt('输入新名称:', item.name);
        if (!newName || newName.trim() === item.name) return;
        
        const updatedItem = await dataService.anki_updateItemName(itemId, newName.trim(), itemType);
        const updatedCollection = items.map(i => i.id === itemId ? updatedItem : i);

        this.setState(itemType === 'file' ? { sessions: updatedCollection } : { folders: updatedCollection });
    }

    // --- 导航 Actions ---
    async navigateToFile(fileId) { /* ... (与之前版本相同) ... */ }
    async goToFolder(folderId) {
        const { newCurrentFolderId, newFolderStack } = dataService.getFolderNavigationState(this.state.folderStack, this.state.currentFolderId, folderId);
        this.setState({
            currentFolderId: newCurrentFolderId,
            folderStack: newFolderStack,
            currentSessionId: null, // 进入文件夹时取消文件选中
            editorContent: '',
            previewContent: ''
        });
    }
    /** Action: 返回上一级目录 */
    goBack() {
        const stack = [...this.state.folderStack];
        // 弹出最后一个元素作为新的当前目录ID (如果栈为空则为 null)
        const parentId = stack.pop() || null; 
        
        this.setState({ 
            currentFolderId: parentId, 
            folderStack: stack,
            currentSessionId: null, // 进入文件夹时取消文件选中
            editorContent: '',
            previewContent: ''
        });
    }

    goToRoot() { this.setState({ currentFolderId: null, folderStack: [] }); }
    // --- 选择与UI交互 Actions ---
    toggleItemSelection(itemId, isShiftClick) {
        const newSelectedIds = new Set(this.state.selectedItemIds);
        const allItems = [...this.state.folders, ...this.state.sessions].filter(i => i.folderId === this.state.currentFolderId);
        
        if (isShiftClick && this._lastToggledItemId) {
            const lastIdx = allItems.findIndex(i => i.id === this._lastToggledItemId);
            const currentIdx = allItems.findIndex(i => i.id === itemId);
            if (lastIdx !== -1 && currentIdx !== -1) {
                const start = Math.min(lastIdx, currentIdx);
                const end = Math.max(lastIdx, currentIdx);
                for (let i = start; i <= end; i++) {
                    newSelectedIds.add(allItems[i].id);
                }
            }
        } else {
            if (newSelectedIds.has(itemId)) {
                newSelectedIds.delete(itemId);
            } else {
                newSelectedIds.add(itemId);
            }
        }
        
        this._lastToggledItemId = itemId;
        this.setState({ selectedItemIds: newSelectedIds });
    }
    
    selectAllItems() {
        const allVisibleIds = [...this.state.folders, ...this.state.sessions]
            .filter(i => i.folderId === this.state.currentFolderId)
            .map(i => i.id);
        this.setState({ selectedItemIds: new Set(allVisibleIds) });
    }
    
    deselectAllItems() {
        this.setState({ selectedItemIds: new Set() });
    }

    toggleSidebar() {
        this.setState({ isSidebarVisible: !this.state.isSidebarVisible });
    }

    /**
     * [NEW] Action: 设置编辑器/预览的滚动同步比例
     * @param {number} ratio - 0到1之间的小数
     */
    setScrollRatio(ratio) {
        if (typeof ratio === 'number' && ratio >= 0 && ratio <= 1) {
            this.setState({ editorScrollRatio: ratio });
        }
    }

    // --- 编辑器 Actions ---
    recordUndoState(content) {
        const { undoStack } = this.state;
        // 避免重复记录相同的状态
        if (undoStack[undoStack.length - 1] === content) return;

        const newUndoStack = [...undoStack, content];
        if (newUndoStack.length > MAX_UNDO_HISTORY) {
            newUndoStack.shift();
        }
        this.setState({ undoStack: newUndoStack, redoStack: [] });
    }

    undo() {
        const { undoStack, editorContent } = this.state;
        if (undoStack.length === 0) return;

        const newUndoStack = [...undoStack];
        const lastState = newUndoStack.pop();

        this.setState({
            undoStack: newUndoStack,
            redoStack: [editorContent, ...this.state.redoStack],
            editorContent: lastState
        });
        this.updatePreview();
    }

    redo() {
        const { redoStack, editorContent } = this.state;
        if (redoStack.length === 0) return;
        
        const newRedoStack = [...redoStack];
        const nextState = newRedoStack.shift();

        this.setState({
            undoStack: [...this.state.undoStack, editorContent],
            redoStack: newRedoStack,
            editorContent: nextState
        });
        this.updatePreview();
    }

    /**
     * [NEW] Action: 在编辑器中包裹选中的文本
     * @param {{prefix: string, suffix?: string, selectionStart: number, selectionEnd: number}} options
     */
    wrapEditorSelection({ prefix, suffix = prefix, selectionStart, selectionEnd }) {
        const { editorContent } = this.state;
        const selectedText = editorContent.substring(selectionStart, selectionEnd);
        const newText = `${prefix}${selectedText}${suffix}`;
        
        const newContent = editorContent.substring(0, selectionStart) + newText + editorContent.substring(selectionEnd);
        
        this.recordUndoState(editorContent); // 记录撤销状态
        this.setState({ editorContent: newContent });
        this.updatePreview();
    }

    /**
     * [NEW] Action: 在编辑器中插入Cloze标记
     * @param {{selectionStart: number, selectionEnd: number}} options
     */
    insertCloze({ selectionStart, selectionEnd }) {
        const { editorContent } = this.state;
        const selectedText = editorContent.substring(selectionStart, selectionEnd);
        const locator = `c${Date.now()}`;
        const newText = `--[${locator}] ${selectedText}--`;

        const newContent = editorContent.substring(0, selectionStart) + newText + editorContent.substring(selectionEnd);

        this.recordUndoState(editorContent);
        this.setState({ editorContent: newContent });
        this.updatePreview();
    }
    
    /**
     * [NEW] Action: 在编辑器中插入带音频提示的Cloze标记
     * @param {{selectionStart: number, selectionEnd: number}} options
     */
    insertAudioPrompt({ selectionStart, selectionEnd }) {
        const { editorContent } = this.state;
        const selectedText = editorContent.substring(selectionStart, selectionEnd);
        // 提示用户输入音频文本，此处的 'TEXT' 是占位符
        const newAudioText = prompt("请输入Cloze的音频提示文本:", selectedText);
        if (newAudioText === null) return; // 用户取消

        const newText = `--${selectedText}--^^audio:${newAudioText.trim()}^^`;
        const newContent = editorContent.substring(0, selectionStart) + newText + editorContent.substring(selectionEnd);
        
        this.recordUndoState(editorContent);
        this.setState({ editorContent: newContent });
        this.updatePreview();
    }

    // --- 预览与 Cloze Actions ---
    async rateCloze(clozeId, rating) {
        const { clozeStates, currentSessionId } = this.state;
        const currentState = clozeStates[clozeId];
        if (!currentState) return;

        const updates = calculateNextReview(currentState, rating);
        const newState = { ...currentState, ...updates, lastReview: Date.now() };

        const newClozeStates = { ...clozeStates, [clozeId]: newState };
        this.setState({ clozeStates: newClozeStates });
        
        await dataService.anki_updateClozeState(newState);
        await this.updateReviewCount();
    }
    
    toggleClozeVisibility(clozeId) {
        const { clozeStates } = this.state;
        const cloze = clozeStates[clozeId];
        if (!cloze) return;

        const updatedCloze = { ...cloze, tempVisible: !cloze.tempVisible };
        this.setState({
            clozeStates: { ...clozeStates, [clozeId]: updatedCloze }
        });
    }

    toggleAllClozesVisibility() {
        const newVisibility = !this.state.areAllClozesVisible;
        this.setState({ areAllClozesVisible: newVisibility });
    }
    
    invertAllClozesVisibility() {
        const { clozeStates, areAllClozesVisible } = this.state;
        const newClozeStates = { ...clozeStates };
        let allVisibleAfterInvert = true;

        Object.keys(newClozeStates).forEach(id => {
            if (newClozeStates[id].fileId === this.state.currentSessionId) {
                // 如果全局是“全显示”模式，则双击隐藏；否则，双击显示
                newClozeStates[id].tempVisible = areAllClozesVisible ? false : !newClozeStates[id].tempVisible;
                if (!newClozeStates[id].tempVisible) {
                    allVisibleAfterInvert = false;
                }
            }
        });

        this.setState({ 
            clozeStates: newClozeStates,
            areAllClozesVisible: allVisibleAfterInvert
        });
    }
    
    /**
     * [NEW] Action: 记录用户交互的Cloze，用于后续导航
     * @param {string} clozeId 
     */
    recordClozeInteraction(clozeId) {
        this.setState({ lastInteractedClozeId: clozeId });
    }

      /**
     * [NEW] Action: 导航到上一个或下一个隐藏的Cloze
     * @param {number} direction - -1 for previous, 1 for next
     */
    navigateToCloze(direction) {
        const { clozeStates, currentSessionId, lastInteractedClozeId, areAllClozesVisible } = this.state;

        // 获取当前文件内的所有cloze，并按其在文本中的自然顺序排序（假设ID哈希值能近似反映顺序）
        const clozesInFile = Object.values(clozeStates)
            .filter(c => c.fileId === currentSessionId)
            .sort((a, b) => a.id.localeCompare(b.id));

        if (clozesInFile.length === 0) return;

        // 确定搜索的起始索引
        let startIndex = clozesInFile.findIndex(c => c.id === lastInteractedClozeId);
        if (startIndex === -1) {
            startIndex = direction === 1 ? -1 : clozesInFile.length;
        }

        // 循环查找
        for (let i = 1; i <= clozesInFile.length; i++) {
            const currentIndex = (startIndex + i * direction + clozesInFile.length) % clozesInFile.length;
            const candidate = clozesInFile[currentIndex];

            // 检查该Cloze是否为“隐藏”状态
            const isHidden = !areAllClozesVisible && !candidate.tempVisible;
            if (isHidden) {
                this.setState({
                    highlightedClozeId: candidate.id,
                    lastInteractedClozeId: candidate.id // 更新最后交互位置
                });
                // 清除高亮，让UI组件在下一次渲染后重新添加，以产生闪烁效果
                setTimeout(() => this.setState({ highlightedClozeId: null }), 500);
                return;
            }
        }
    }

    // --- 复习/SRS Actions ---
    async updateReviewCount() {
        const count = await dataService.anki_getTodaysTotalCount();
        this.setState({ reviewCount: count });
    }

    async startReviewSession(filters) {
        const dueClozes = await dataService.anki_getDueClozes(filters);
        if (dueClozes.length === 0) {
            alert("太棒了！当前范围内没有需要复习的卡片。");
            return;
        }

        this.setState({ 
            reviewQueue: dueClozes,
            currentReviewIndex: 0,
            isCustomStudyModalVisible: false,
        });

        await this.showNextReviewCard();
    }
    
    async showNextReviewCard() {
        const { reviewQueue, currentReviewIndex } = this.state;
        if (currentReviewIndex >= reviewQueue.length) {
            alert("复习会话结束！");
            this.setState({ reviewQueue: [], currentReviewIndex: -1 });
            return;
        }

        const cardToReview = reviewQueue[currentReviewIndex];
        
        if (this.state.currentSessionId !== cardToReview.fileId) {
            await this.navigateToFile(cardToReview.fileId);
        } else {
            this.setViewMode('preview');
        }
    }

    moveToNextCardInSession() {
        this.setState({ currentReviewIndex: this.state.currentReviewIndex + 1 });
        this.showNextReviewCard();
    }
    
    // --- 模态框 Actions ---
    showMoveModal() { this.setState({ isMoveModalVisible: true }); }
    showCustomStudyModal() { this.setState({ isCustomStudyModalVisible: true }); }
    showStatsModal() { this.setState({ isStatsModalVisible: true }); }
    hideAllModals() {
        this.setState({
            isMoveModalVisible: false,
            isCustomStudyModalVisible: false,
            isStatsModalVisible: false
        });
    }


    /** Action: 导航到指定文件 */
    async navigateToFile(fileId) {
        if (this.state.isNavigating || this.state.currentSessionId === fileId) return;
        this.setState({ isNavigating: true });
    
        try {
            // 保存当前会话
            if (this.state.currentSessionId) {
                await this.saveCurrentSession();
            }
        
            // 查找目标文件
            const session = this.state.sessions.find(s => s.id === fileId);
            if (!session) {
                console.error("Session not found:", fileId);
                this.setState({
                    currentSessionId: null,
                    editorContent: '',
                    previewContent: '',
                viewMode: 'preview', // 确保切换到预览模式
                isNavigating: false
                });
                return;
            }
        
            // 设置新的会话状态
            this.setState({
                currentSessionId: fileId,
                editorContent: session.content || '',
                viewMode: 'preview' // 导航后默认进入预览模式
            });
        
            // 立即更新预览
            await this.updatePreview();
            
            console.log("Navigated to file:", session); // 调试日志
            
        } catch (error) {
            console.error("Navigation failed:", error);
        } finally {
            this.setState({ isNavigating: false });
        }
    }

  
    /** Action: 保存当前会话内容 */
    async saveCurrentSession() {
        if (this.state.isSaving) return;
      
        this.setState({ isSaving: true });
      
        try {
          const { currentSessionId, editorContent, fileSubsessions } = this.state;
          if (!currentSessionId) return;
      
          // 乐观更新：立即更新UI状态
          const sessions = this.state.sessions.map(s =>
              s.id === currentSessionId
                  ? { ...s, content: editorContent }
                  : s
          );
      
          // 持久化到数据服务，并获取返回的 subsessions
          const { subsessions: newSubsessions } = await dataService.saveSession(currentSessionId, editorContent);
      
          // 同时更新 sessions 和 fileSubsessions 状态
          this.setState({ 
              sessions,
              fileSubsessions: {
                  ...fileSubsessions,
                  [currentSessionId]: newSubsessions
              }
          });
        } catch (error) {
            console.error("Save failed:", error);
            // 可在此处添加错误处理和状态回滚逻辑
        } finally {
            this.setState({ isSaving: false });
        }
    }
  
    /** Action: 更新预览内容 */
    async updatePreview() {
        // 如果已有更新正在进行，则等待该更新完成
        if (this.state.isUpdatingPreview) {
            return this.currentUpdatePromise;
        }
      
        this.setState({ isUpdatingPreview: true });
        
        // 创建一个新的Promise来跟踪本次更新
        this.currentUpdatePromise = this._doUpdatePreview();
      
        try {
            await this.currentUpdatePromise;
        } catch (error) {
            console.error("Preview update failed:", error);
        } finally {
            this.setState({ isUpdatingPreview: false });
            this.currentUpdatePromise = null;
        }
    }
  
    async _doUpdatePreview() {
    const { editorContent, currentSessionId } = this.state;
    
    // 修复：确保即使没有当前会话也要设置空内容
    if (!currentSessionId) {
        this.setState({ previewContent: '' });
        return;
    }
    
    // 修复：即使 editorContent 为空也要渲染
    try {
        const previewHTML = await renderMarkdown(editorContent || '');
        const processedHTML = await processCloze(previewHTML);
        this.setState({ previewContent: processedHTML });
        } catch (error) {
          console.error("Preview rendering failed:", error);
          this.setState({ previewContent: '<p>预览渲染失败</p>' });
        }
    }
  
    /** Action: 切换视图模式 ('edit' | 'preview') */
    setViewMode(mode) {
        if (mode === this.state.viewMode) return;
      
        if (mode === 'preview') {
            // 切换到预览前，确保内容是最新的
            this.updatePreview().then(() => {
                this.setState({ viewMode: mode });
            });
        } else {
            this.setState({ viewMode: mode });
        }
    }

    debugState() {
        console.log("Current Anki State:", {
            currentSessionId: this.state.currentSessionId,
            sessionsCount: this.state.sessions.length,
            editorContent: this.state.editorContent?.substring(0, 100) + "...",
            previewContent: this.state.previewContent?.substring(0, 100) + "...",
            viewMode: this.state.viewMode
        });
    }
}

// 导出Store的单例
export const ankiStore = new AnkiStore();
