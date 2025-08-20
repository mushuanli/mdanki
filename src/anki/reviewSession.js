// src/anki/reviewSession.js
import { appState, setState } from '../common/state.js';
import { rerenderAnki } from './anki_ui.js';
import * as dataService from '../services/dataService.js';
// [修改] 导入事件总线，不再导入 anki_events
import { bus } from '../common/eventBus.js';
import { dom } from './anki_dom.js';

let reviewQueue = [];
let currentReviewIndex = -1;

/**
 * [重写] 启动待办会话，逻辑更健壮。
 * @param {object} [filters=null] - 自定义筛选条件。
 */
export function startReviewSession(filters = null) {
    const allClozeStates = Object.values(appState.clozeStates);
    
    // [核心修改 1] 无论何种模式，都先从到期的卡片开始筛选
    let dueClozes = allClozeStates.filter(cs => cs.due <= Date.now());

    if (filters) {
        // --- 自定义待办模式 ---
        console.log("Starting custom study with filters:", filters);
        const { currentSessionId, currentFolderId, sessions } = appState;

        // [核心修改 2] 在已到期的卡片基础上，再应用自定义筛选
        let filteredCloze = dueClozes.filter(cs => {
            // 文件/目录筛选
            const fileOrFolderFilter = filters.fileOrFolder;
            if (fileOrFolderFilter) {
                if (fileOrFolderFilter === 'scope_current_file') {
                    if (!currentSessionId || cs.fileId !== currentSessionId) return false;
                } else if (fileOrFolderFilter === 'scope_current_directory') {
                    if (currentFolderId === null) return false;
                    const session = sessions.find(s => s.id === cs.fileId);
                    if (!session || session.folderId !== currentFolderId) return false;
                } else if (fileOrFolderFilter !== 'all') {
                    const [type, id] = fileOrFolderFilter.split('_');
                    if (type === 'file') {
                        if (cs.fileId !== id) return false;
                    } else if (type === 'folder') {
                        const session = sessions.find(s => s.id === cs.fileId);
                        if (!session || session.folderId !== id) return false;
                    }
                }
            }

            // 2. 卡片状态筛选
            if (filters.cardStates && !filters.cardStates.includes(cs.state)) return false;

            // 3. 最后待办时间筛选
            const now = Date.now();
            const lastReview = cs.lastReview || 0;
            const daysSinceReview = (now - lastReview) / (1000 * 60 * 60 * 24);
            if (filters.lastReview && filters.lastReview !== 'any') {
                 switch (filters.lastReview) {
                    case 'last7days': if (lastReview === 0 || daysSinceReview > 7) return false; break;
                    case 'last30days': if (lastReview === 0 || daysSinceReview > 30) return false; break;
                    case 'over30days': if (lastReview !== 0 && daysSinceReview <= 30) return false; break;
                    case 'never': if (lastReview !== 0) return false; break;
                }
            }
            return true;
        });
        
        // 随机打乱并截取最大数量
        filteredCloze.sort(() => Math.random() - 0.5);
        reviewQueue = filters.maxCards ? filteredCloze.slice(0, filters.maxCards) : filteredCloze;

    } else {
        // --- 自动待办模式 (原有逻辑) ---
        console.log("Starting automatic review.");
        // 直接使用已筛选出的到期卡片
        reviewQueue = dueClozes.sort((a, b) => a.due - b.due);
    }

    // 更新全局待办计数器 (这应该在每次状态变化时更新)
    // document.getElementById('reviewCount').textContent = reviewQueue.length;

    if (reviewQueue.length === 0) {
        alert("太棒了！当前范围内没有需要复习的卡片。");
        return;
    }

    currentReviewIndex = 0;
    showNextReviewCard();
}

/**
 * [新增] 查找并跳转到指定范围内最紧急的待办卡片。
 * @param {('current_file'|'current_directory'|'all')} scope - 查找范围。
 */
export async function jumpToMostUrgentCloze(scope = 'all') {
    const { clozeStates, currentSessionId, currentFolderId, sessions } = appState;
    
    let candidates = Object.values(clozeStates).filter(cs => cs.due <= Date.now());

    // 根据范围筛选
    switch (scope) {
        case 'current_file':
            if (!currentSessionId) {
                alert("请先打开一个文件。");
                return;
            }
            candidates = candidates.filter(cs => cs.fileId === currentSessionId);
            break;
        case 'current_directory':
             if (currentFolderId === null) {
                alert("当前在根目录，请进入一个子目录。");
                return;
            }
            candidates = candidates.filter(cs => {
                const session = sessions.find(s => s.id === cs.fileId);
                return session && session.folderId === currentFolderId;
            });
            break;
        case 'all':
        default:
            // 不需要额外筛选
            break;
    }

    if (candidates.length === 0) {
        alert(`在指定范围 (${scope}) 内没有到期的卡片。`);
        return;
    }

    // 排序找到最紧急的（due 值最小）
    candidates.sort((a, b) => a.due - b.due);
    const cardToReview = candidates[0];

    // 导航并高亮
    const isDifferentFile = appState.currentSessionId !== cardToReview.fileId;
    
    if (isDifferentFile) {
        // 先保存当前文件内容
        const editor = document.getElementById('anki_editor');
        if (editor) {
            await dataService.anki_saveCurrentSessionContent(editor.value);
        }
        // 切换文件
        await dataService.anki_selectSession(cardToReview.fileId);
        rerenderAnki(); // 重绘UI
    }

    // 使用 setTimeout 确保 DOM 更新完毕
    setTimeout(() => {
        document.querySelectorAll('.highlight-review').forEach(el => el.classList.remove('highlight-review'));
        
        // 使用 clozeId 来精确定位
        const clozeElement = document.querySelector(`.cloze[data-cloze-id="${cardToReview.id}"]`);
        
        if (clozeElement) {
            clozeElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            clozeElement.classList.add('highlight-review');
            
            if (clozeElement.classList.contains('hidden')) {
                clozeElement.click(); // 自动打开答案
            }
        } else {
            console.error("找不到待办的 Cloze 元素:", cardToReview);
            alert("找到了待办卡片，但在页面上找不到对应的元素。预览可能需要刷新。");
        }
    }, isDifferentFile ? 300 : 50); // 如果切换了文件，等待更长时间
}

// ... (showNextReviewCard 和 moveToNextCardInSession 函数保持不变) ...
// (为确保可访问性，将它们移到 reviewSession.js 中)
export async function showNextReviewCard() {
    if (currentReviewIndex >= reviewQueue.length) {
        alert("待办会话结束！");
        reviewQueue = [];
        currentReviewIndex = -1;
        
        // [解耦] 发布事件请求切换回编辑模式，而不是直接调用
        bus.emit('ui:setEditPreviewMode', 'edit');
        
        rerenderAnki();
        return;
    }
    
    const cardToReview = reviewQueue[currentReviewIndex];
    
    // 步骤 1: 切换到卡片所在的文件
    const isDifferentFile = appState.currentSessionId !== cardToReview.fileId;
    if (isDifferentFile) {
        const editor = document.getElementById('anki_editor');
        if (editor) await dataService.anki_saveCurrentSessionContent(editor.value);
        await dataService.anki_selectSession(cardToReview.fileId);
        rerenderAnki();
    }
    // [解耦] 发布事件请求切换到预览模式
    bus.emit('ui:setEditPreviewMode', 'preview');

    // 步骤 2: 确保进入预览模式
    // [新增] 使用 requestAnimationFrame 确保在DOM更新后再检查模式
    requestAnimationFrame(() => {
        // 如果当前不是预览模式，则切换过去
        if (!dom.editorPreviewPanel.classList.contains('preview-active')) {
            toggleEditPreviewMode();
        }

        // 步骤 3: 滚动到并高亮对应的 Cloze
        // [新增] 再次使用 setTimeout/requestAnimationFrame 来确保预览模式切换完成
        setTimeout(() => {
            document.querySelectorAll('.highlight-review').forEach(el => el.classList.remove('highlight-review'));

            const clozeElement = document.querySelector(`.cloze[data-cloze-id="${cardToReview.id}"]`);
            if (clozeElement) {
                clozeElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                clozeElement.classList.add('highlight-review');
                
                // [核心修改] 复习时，确保 cloze 是关闭的，而不是自动打开
                // 我们不再调用 .click()，而是确保它处于隐藏状态
                if (!clozeElement.classList.contains('hidden')) {
                    // 如果因为某种原因它是打开的，强制关闭它
                    clozeElement.classList.add('hidden');
                    // 隐藏可能显示的反馈按钮
                    const actions = clozeElement.querySelector('.cloze-actions');
                    if(actions) actions.style.display = 'none';
                }
            } else {
                console.error("Could not find cloze element for review:", cardToReview);
                moveToNextCardInSession(); // 如果找不到，跳到下一个
            }
        }, 100); // 给UI切换留出一点时间
    });
}

export function moveToNextCardInSession() {
    currentReviewIndex++;
    showNextReviewCard();
}
