// src/ui/previewUI.js
import * as dom from './anki_dom.js';
import { appState, setState } from '../common/state.js';
import { playMultimedia } from './audioUI.js';

// [MODIFIED] 导入需要的模块
import * as dataService from '../services/dataService.js';
import { moveToNextCardInSession, isInReviewSession } from '../anki/reviewSession.js';

function getClozeColorClass(lastAccessTime) {
    if (!lastAccessTime) return 'cloze-28plus';
    const diffInDays = (Date.now() - lastAccessTime) / (1000 * 60 * 60 * 24);
    if (diffInDays < 1) return 'cloze-1d';
    if (diffInDays < 2) return 'cloze-2d';
    if (diffInDays < 3) return 'cloze-3d';
    if (diffInDays < 5) return 'cloze-5d';
    if (diffInDays < 7) return 'cloze-7d';
    if (diffInDays < 14) return 'cloze-14d';
    if (diffInDays < 28) return 'cloze-28d';
    return 'cloze-28plus';
}

function processClozeElementsInNode(node) {
    if (node.nodeType === Node.TEXT_NODE) {
        const clozeRegex = /--(.*?)--(?:\^\^audio:(.*?)\^\^)?/g;
        const parent = node.parentNode;
        if (!parent || ['CODE', 'PRE', 'SCRIPT', 'STYLE'].includes(parent.tagName)) return;
        
        let match;
        const fragments = [];
        let lastIndex = 0;
        
        while ((match = clozeRegex.exec(node.nodeValue)) !== null) {
            // Text before the match
            if (match.index > lastIndex) {
                fragments.push(document.createTextNode(node.nodeValue.substring(lastIndex, match.index)));
            }
            // The cloze element itself
            
            let contentWithBreaks = match[1].replace(/¶/g, '<br>');
            const multimedia = match[2] ? match[2].trim() : null;
            
            const clozeSpan = document.createElement('span');

            // 获取 Cloze 状态并应用视觉提示
            const fileId = appState.currentSessionId;
            const clozeState = dataService.getOrCreateClozeState(fileId, match[1]);
            const isDue = clozeState.due <= Date.now();
            
            clozeSpan.className = `cloze hidden ${isDue ? 'due' : ''}`;
            clozeSpan.dataset.content = match[1];
            if (multimedia) clozeSpan.dataset.multimedia = multimedia;
            
            clozeSpan.innerHTML = `
                ${multimedia ? '<span class="media-icon" title="播放音频"><i class="fas fa-volume-up"></i></span>' : ''}
                <span class="cloze-content">${contentWithBreaks}</span>
                <span class="placeholder">[...]</span>
                <div class="cloze-actions" style="display: none;">
                    <button class="cloze-btn again" data-rating="0">重来</button>
                    <button class="cloze-btn hard" data-rating="1">困难</button>
                    <button class="cloze-btn good" data-rating="2">良好</button>
                    <button class="cloze-btn easy" data-rating="3">简单</button>
                </div>
            `;

            fragments.push(clozeSpan);
            lastIndex = clozeRegex.lastIndex;
        }

        if (fragments.length > 0) {
            // Text after the last match
            if (lastIndex < node.nodeValue.length) {
                fragments.push(document.createTextNode(node.nodeValue.substring(lastIndex)));
            }
            // Replace the original text node with the new fragments
            fragments.forEach(fragment => parent.insertBefore(fragment, node));
            parent.removeChild(node);
        }
    } else if (node.nodeType === Node.ELEMENT_NODE) {
        Array.from(node.childNodes).forEach(child => processClozeElementsInNode(child));
    }
}

function addClozeEventListeners() {
    dom.preview.addEventListener('click', (e) => {
        const cloze = e.target.closest('.cloze');
        if (!cloze) return;

        // --- 1. 处理反馈按钮的点击 ---
        const clozeBtn = e.target.closest('.cloze-btn');
        if (clozeBtn) {
            e.stopPropagation();
            const rating = parseInt(clozeBtn.dataset.rating, 10);
            const fileId = appState.currentSessionId;
            const clozeContent = cloze.dataset.content;
            const currentState = dataService.getOrCreateClozeState(fileId, clozeContent);
            
            dataService.updateClozeState(currentState, rating);
            
            // 更新UI：隐藏按钮，并更新状态样式
            cloze.querySelector('.cloze-actions').style.display = 'none';
            cloze.classList.remove('due');
            cloze.classList.add('answered');
            
            // 如果在复习会话中，则自动跳到下一张卡
            if (isInReviewSession()) {
                moveToNextCardInSession();
            }
            return;
        }

        // --- 2. 处理媒体图标点击 ---
        if (e.target.closest('.media-icon')) {
            e.stopPropagation();
            if (cloze.dataset.multimedia) playMultimedia(cloze.dataset.multimedia);
            return;
        }

        // --- 3. 处理 Cloze 自身的点击 (显示答案) ---
        if (cloze.classList.contains('hidden')) {
            cloze.classList.remove('hidden');
            cloze.querySelector('.cloze-actions').style.display = 'flex'; // 显示反馈按钮
            
            // 自动播放音频
            if (cloze.dataset.multimedia) {
                playMultimedia(cloze.dataset.multimedia);
            }
        }
    });

    // --- [NEW] 重新加入并修改双击事件监听器 ---
    dom.preview.addEventListener('dblclick', (e) => {
        const cloze = e.target.closest('.cloze');
        if (!cloze) return;

        e.stopPropagation(); // 防止事件冒泡

        // 双击的作用是：在“隐藏”和“永久显示(无按钮)”之间切换
        // 这提供了一个不评分而只是查看答案的途径

        if (cloze.classList.contains('hidden')) {
            // 如果是隐藏的，双击则显示答案，但不显示反馈按钮
            cloze.classList.remove('hidden');
            cloze.classList.add('permanent-view'); // 使用一个新class来标记这种状态
        } else {
            // 如果是显示的（无论是通过单击还是双击），双击则立即隐藏它
            cloze.classList.remove('permanent-view');
            cloze.classList.add('hidden');
            // 确保反馈按钮也被隐藏
            const actions = cloze.querySelector('.cloze-actions');
            if (actions) {
                actions.style.display = 'none';
            }
        }
    });
}

// --- 新的核心 Cloze 控制函数 ---
/**
 * 切换所有 Cloze 的可见性。
 */
export function toggleAllClozeVisibility() {
    // 1. 读取当前状态的反向作为目标状态
    const shouldShow = !appState.areAllClozeVisible;
    
    dom.preview.querySelectorAll('.cloze').forEach(cloze => {
        clearTimeout(cloze.timer);
        
        if (shouldShow) {
            cloze.classList.remove('hidden', 'temporary');
            cloze.classList.add('permanent');
        } else {
            cloze.classList.remove('permanent', 'temporary');
            cloze.classList.add('hidden');
        }
    });

    // 2. 更新按钮的 UI
    updateToggleVisibilityButton(shouldShow);

    // 3. 更新应用状态
    setState({ areAllClozeVisible: shouldShow });
}

/**
 * 反转所有 Cloze 的可见性。
 */
export function invertAllCloze() {
    let allVisibleAfterInvert = true;
    dom.preview.querySelectorAll('.cloze').forEach(cloze => {
        clearTimeout(cloze.timer);
        if (cloze.classList.contains('hidden')) {
            cloze.classList.remove('hidden');
            cloze.classList.add('permanent');
        } else {
            cloze.classList.remove('permanent', 'temporary');
            cloze.classList.add('hidden');
            allVisibleAfterInvert = false; // 只要有一个被隐藏，全局状态就不是“全部可见”
        }
    });
    
    // 更新主切换按钮的状态和 UI
    updateToggleVisibilityButton(allVisibleAfterInvert);
    setState({ areAllClozeVisible: allVisibleAfterInvert });
}

/**
 * 根据状态更新切换按钮的图标和标题。
 * @param {boolean} isVisible - 当前是否为全部可见模式。
 */
export function updateToggleVisibilityButton(isVisible) {
    if (isVisible) {
        dom.toggleVisibilityClozeBtn.innerHTML = '<i class="fas fa-eye"></i>';
        dom.toggleVisibilityClozeBtn.title = '全部隐藏';
    } else {
        dom.toggleVisibilityClozeBtn.innerHTML = '<i class="fas fa-eye-slash"></i>';
        dom.toggleVisibilityClozeBtn.title = '全部显示';
    }
}

export function updatePreview() {
    const { currentSessionId, currentSubsessionId, fileSubsessions, sessions } = appState;
    
    const session = sessions.find(s => s.id === currentSessionId);
    if (!session) {
        dom.preview.innerHTML = '';
        return;
    }

    let markdownText = session.content;
    if (currentSubsessionId) {
        const subsession = fileSubsessions[currentSessionId]?.find(s => s.id === currentSubsessionId);
        if (subsession) markdownText = subsession.content;
    }

    dom.preview.innerHTML = window.marked.parse(markdownText || '');
    processClozeElementsInNode(dom.preview);
    
    if (window.MathJax) {
        window.MathJax.typesetPromise([dom.preview]).catch(err => console.log('MathJax error:', err));
    }
}

export function setupPreview() {
    window.marked.setOptions({ breaks: true });
    addClozeEventListeners();
}