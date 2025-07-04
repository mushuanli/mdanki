// src/ui/previewUI.js
import * as dom from './anki_dom.js';
import { appState, setState } from '../common/state.js';
import { playMultimedia } from './audioUI.js';

// [MODIFIED] 导入需要的模块
import * as dataService from '../services/dataService.js';
import { simpleHash } from '../common/utils.js';

// --- 新的辅助函数，根据状态获取颜色 ---
function getClozeColorClassByState(clozeState) {
    const now = Date.now();
    if (clozeState.due > now) {
        const diffInDays = (clozeState.due - now) / (1000 * 60 * 60 * 24);
        if (diffInDays < 1) return 'cloze-1d';
        if (diffInDays < 2) return 'cloze-2d';
        if (diffInDays < 3) return 'cloze-3d';
        if (diffInDays < 5) return 'cloze-5d';
        if (diffInDays < 7) return 'cloze-7d';
        if (diffInDays < 14) return 'cloze-14d';
        return 'cloze-28d';
    }
    // 对于已到期的卡片
    if (clozeState.lastReview && (now - clozeState.lastReview < 15 * 60 * 1000) && clozeState.interval === 0) {
        return 'cloze-10m'; // 10分钟内需要复习的卡片
    }
    return 'cloze-28plus'; // 默认到期颜色
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

            const clozeContent = match[1];
            const contentWithBreaks = clozeContent.replace(/¶/g, '<br>');
            const multimedia = match[2] ? match[2].trim() : null;
            const fileId = appState.currentSessionId;
            const clozeState = dataService.getOrCreateClozeState(fileId, clozeContent);

            const clozeSpan = document.createElement('span');
            clozeSpan.className = `cloze hidden ${getClozeColorClassByState(clozeState)}`;
            clozeSpan.dataset.content = clozeContent;
            if (multimedia) clozeSpan.dataset.multimedia = multimedia;
            
            clozeSpan.innerHTML = `
                ${multimedia ? '<span class="media-icon" title="播放音频"><i class="fas fa-volume-up"></i></span>' : ''}
                <span class="cloze-content">${contentWithBreaks}</span>
                <span class="placeholder">[...]</span>
                <div class="cloze-actions" style="display: none;">
                    <button class="cloze-btn again" data-rating="0">重来</button>
                    <button class="cloze-btn hard" data-rating="1">困难</button>
                    <button class="cloze-btn double" data-rating="2">犹豫</button>
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
    // --- 1. 单击事件监听器 (用于复习) ---
    dom.preview.addEventListener('click', (e) => {
        const cloze = e.target.closest('.cloze');
        if (!cloze) return;

        // --- 1. [MODIFIED] 处理反馈按钮点击 ---
        if (e.target.closest('.cloze-btn')) {
            e.stopPropagation();
            const button = e.target.closest('.cloze-btn');
            const rating = parseInt(button.dataset.rating, 10);
            const fileId = appState.currentSessionId;
            const clozeContent = cloze.dataset.content;

            // 首先，清除任何可能存在的自动关闭计时器
            clearTimeout(cloze.closeTimer);

            // 步骤 1: 更新后台数据状态
            dataService.updateClozeState(fileId, clozeContent, rating);

            // 步骤 2: 获取更新后的最新状态，以便更新UI
            const newState = dataService.getOrCreateClozeState(fileId, clozeContent);
            const newColorClass = getClozeColorClassByState(newState);

            // 步骤 3: 直接操作DOM来更新UI，而不是完全重绘
            
            // a. 移除所有旧的颜色/状态类
            cloze.className.match(/cloze-(\w+)/g)?.forEach(c => cloze.classList.remove(c));
            
            // b. 添加新的颜色类
            cloze.classList.add(newColorClass);
            
            // c. 隐藏反馈按钮
            cloze.querySelector('.cloze-actions').style.display = 'none';

            // d. 根据评分决定卡片的可见性
            if (rating === 3) { // 如果是 "简单"
                // 保持卡片打开，并应用 'easy-open' 样式
                cloze.classList.remove('hidden', 'permanent-view');
                cloze.classList.add('easy-open');
            } else { // 重来, 困难, 犹豫
                // 立即隐藏卡片
                cloze.classList.add('hidden');
                cloze.classList.remove('easy-open', 'permanent-view');
            }

            // [重要] 不再调用 updatePreview()，以保留UI状态
            return;
        }

        // 如果点击的是媒体图标
        if (e.target.closest('.media-icon')) {
            e.stopPropagation();
            playMultimedia(cloze.dataset.multimedia);
            return;
        }

        // 如果是点击 Cloze 本身来显示答案 (并且它不是永久查看状态)
        if (cloze.classList.contains('hidden') && !cloze.classList.contains('permanent-view')) {
            clearTimeout(cloze.closeTimer);

            cloze.classList.remove('hidden');
            cloze.querySelector('.cloze-actions').style.display = 'flex';

            // [恢复] 自动播放音频功能
            if (cloze.dataset.multimedia) {
                playMultimedia(cloze.dataset.multimedia);
            }

            cloze.closeTimer = setTimeout(() => {
                if (!cloze.classList.contains('easy-open') && !cloze.classList.contains('permanent-view')) {
                    cloze.classList.add('hidden');
                    cloze.querySelector('.cloze-actions').style.display = 'none';
                }
            }, 60000);
        }
    });

    // --- 2. 双击事件监听器 (用于查阅) ---
    dom.preview.addEventListener('dblclick', (e) => {
        const cloze = e.target.closest('.cloze');
        if (!cloze) return;

        e.stopPropagation(); // 防止事件冒泡

        // 双击行为前，取消任何可能存在的自动关闭计时器
        clearTimeout(cloze.closeTimer);

        if (cloze.classList.contains('hidden')) {
            // 从隐藏 -> 永久查看
            cloze.classList.remove('hidden');
            cloze.classList.add('permanent-view');
            
            // [恢复] 双击显示时也自动播放音频
            if (cloze.dataset.multimedia) {
                playMultimedia(cloze.dataset.multimedia);
            }

            // 确保反馈按钮不显示
            cloze.querySelector('.cloze-actions').style.display = 'none';
        } else {
            // 从任何可见状态 -> 隐藏
            cloze.classList.add('hidden');
            cloze.classList.remove('permanent-view', 'easy-open');
            cloze.querySelector('.cloze-actions').style.display = 'none';
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