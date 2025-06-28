// src/anki/reviewSession.js
import { appState, setState } from '../common/state.js';
import { rerenderAnki } from './anki_ui.js';

let reviewQueue = [];
let currentReviewIndex = -1;

/**
 * [MODIFIED] 启动复习会话，支持自动和自定义模式
 * @param {object} [filters=null] - 自定义筛选条件，为 null 则为自动模式
 */
export function startReviewSession(filters = null) {
    let allClozeStates = Object.values(appState.clozeStates);
    let filteredCloze;

    if (filters) {
        // --- 手动自定义复习模式 ---
        console.log("Starting custom study with filters:", filters);
        filteredCloze = allClozeStates.filter(cs => {
            // 1. 文件/目录筛选
            if (filters.fileOrFolder !== 'all') {
                const [type, id] = filters.fileOrFolder.split('_');
                if (type === 'file') {
                    if (cs.fileId !== id) return false;
                } else if (type === 'folder') {
                    // 需要根据 folderId 找到所有子文件ID, 然后再判断
                    // 这是一个简化的实现，实际需要一个辅助函数
                    const fileInFolder = appState.sessions.find(s => s.id === cs.fileId && s.folderId === id);
                    if (!fileInFolder) return false;
                }
            }

            // 2. 卡片状态筛选
            if (!filters.cardStates.includes(cs.state)) return false;

            // 3. 最后复习时间筛选
            const now = Date.now();
            const lastReview = cs.lastReview || 0;
            const daysSinceReview = (now - lastReview) / (1000 * 60 * 60 * 24);
            
            switch (filters.lastReview) {
                case 'last7days': if (lastReview === 0 || daysSinceReview > 7) return false; break;
                case 'last30days': if (lastReview === 0 || daysSinceReview > 30) return false; break;
                case 'over30days': if (lastReview !== 0 && daysSinceReview <= 30) return false; break;
                case 'never': if (lastReview !== 0) return false; break;
            }
            return true;
        });
        
        // 随机打乱并截取最大数量
        filteredCloze.sort(() => Math.random() - 0.5);
        reviewQueue = filteredCloze.slice(0, filters.maxCards);

    } else {
        // --- 自动复习模式 (原有逻辑) ---
        console.log("Starting automatic review.");
        reviewQueue = allClozeStates
            .filter(cs => cs.due <= Date.now())
            .sort((a, b) => a.due - b.due);
    }

    // 更新全局复习计数器 (这应该在每次状态变化时更新)
    // document.getElementById('reviewCount').textContent = reviewQueue.length;

    if (reviewQueue.length === 0) {
        alert("没有找到符合条件的卡片。");
        return;
    }

    currentReviewIndex = 0;
    showNextReviewCard();
}

// ... (showNextReviewCard 和 moveToNextCardInSession 函数保持不变) ...
// (为确保可访问性，将它们移到 reviewSession.js 中)
export function showNextReviewCard() {
    if (currentReviewIndex >= reviewQueue.length) {
        alert("复习会话结束！");
        reviewQueue = [];
        currentReviewIndex = -1;
        // 可以在这里 rerender 一次，清除高亮等
        rerenderAnki();
        return;
    }
    
    const cardToReview = reviewQueue[currentReviewIndex];
    
    // 1. 切换到卡片所在的文件
    if (appState.currentSessionId !== cardToReview.fileId) {
        setState({ currentSessionId: cardToReview.fileId });
        rerenderAnki();
    }

    // 2. 滚动到并高亮对应的 Cloze
    setTimeout(() => {
        // 清除之前的高亮
        document.querySelectorAll('.highlight-review').forEach(el => el.classList.remove('highlight-review'));

        const clozeElement = document.querySelector(`.cloze[data-content="${cardToReview.content}"]`);
        if (clozeElement) {
            clozeElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            clozeElement.classList.add('highlight-review');
            
            // 自动点击显示答案
            if (clozeElement.classList.contains('hidden')) {
                clozeElement.click();
            }
        } else {
            console.error("Could not find cloze element for review:", cardToReview);
            moveToNextCardInSession(); // 如果找不到，跳到下一个
        }
    }, appState.currentSessionId !== cardToReview.fileId ? 300 : 50);
}

export function moveToNextCardInSession() {
    currentReviewIndex++;
    showNextReviewCard();
}

export function isInReviewSession() {
    return reviewQueue.length > 0 && currentReviewIndex !== -1;
}