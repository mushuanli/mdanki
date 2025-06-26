// src/ui/previewUI.js
import * as dom from '../dom.js';
import { appState, setState } from '../state.js';
import { saveStateToStorage } from '../services/storageManager.js';
import { playMultimedia } from './audioUI.js';
import { escapeHTML } from '../utils.js';

let clozeUpdateTimer = null;

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

function processClozeElementsInNode(node, onUpdate) {
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
            const content = match[1];
            const multimedia = match[2] ? match[2].trim() : null;
            
            const clozeSpan = document.createElement('span');
            clozeSpan.className = `cloze hidden ${getClozeColorClass(appState.clozeAccessTimes[content])}`;
            clozeSpan.dataset.content = content;
            if (multimedia) clozeSpan.dataset.multimedia = multimedia;
            
            let innerHTML = '';
            if (multimedia) {
                innerHTML += `<span class="media-icon" title="播放音频"><i class="fas fa-volume-up"></i></span>`;
            }
            innerHTML += `<span class="cloze-content">${content}</span><span class="placeholder">[...]</span>`;
            clozeSpan.innerHTML = innerHTML;

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
        // Recursively process child nodes
        Array.from(node.childNodes).forEach(child => processClozeElementsInNode(child, onUpdate));
    }
}

function addClozeEventListeners() {
    dom.preview.addEventListener('click', (e) => {
        const cloze = e.target.closest('.cloze');
        if (!cloze) return;

        if (e.target.closest('.media-icon')) {
            e.stopPropagation();
            if (cloze.dataset.multimedia) playMultimedia(cloze.dataset.multimedia);
            return;
        }
        
        if (cloze.classList.contains('permanent')) return;

        if (cloze.classList.contains('temporary')) {
            clearTimeout(cloze.timer);
            cloze.classList.remove('temporary');
            cloze.classList.add('permanent');
            return;
        }
        
        cloze.classList.remove('hidden');
        cloze.classList.add('temporary');

        const content = cloze.dataset.content;
        const newClozeAccessTimes = { ...appState.clozeAccessTimes, [content]: Date.now() };
        setState({ clozeAccessTimes: newClozeAccessTimes });
        
        // Batch updates to localStorage
        clearTimeout(clozeUpdateTimer);
        clozeUpdateTimer = setTimeout(saveStateToStorage, 2000);

        // Re-apply color class
        const colorClass = getClozeColorClass(newClozeAccessTimes[content]);
        cloze.className.match(/cloze-\w+/g)?.forEach(c => cloze.classList.remove(c));
        cloze.classList.add(colorClass);

        cloze.timer = setTimeout(() => {
            if (cloze.classList.contains('temporary')) {
                cloze.classList.remove('temporary');
                cloze.classList.add('hidden');
            }
        }, 15000);
    });

    dom.preview.addEventListener('dblclick', (e) => {
        const cloze = e.target.closest('.cloze');
        if (!cloze) return;
        
        e.stopPropagation();
        clearTimeout(cloze.timer);
        cloze.classList.remove('temporary', 'permanent');
        cloze.classList.add('hidden');
    });
}

// --- 新的核心 Cloze 控制函数 ---
/**
 * 切换所有 Cloze 的可见性。
 */
export function toggleAllClozeVisibility() {
    // 1. 读取当前状态的反向作为目标状态
    const shouldShow = !appState.areAllClozeVisible;
    
    const clozeElements = dom.preview.querySelectorAll('.cloze');
    clozeElements.forEach(cloze => {
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
    const clozeElements = dom.preview.querySelectorAll('.cloze');
    let allVisibleAfterInvert = true; // 假设反转后都是可见的

    clozeElements.forEach(cloze => {
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
    let markdownText = dom.editor.value;
    
    const session = sessions.find(s => s.id === currentSessionId);
    if (!session) {
        dom.preview.innerHTML = '';
        return;
    }

    if (currentSubsessionId) {
        const subsession = fileSubsessions[currentSessionId]?.find(s => s.id === currentSubsessionId);
        markdownText = subsession ? subsession.content : session.content;
    } else {
        markdownText = session.content;
    }

    dom.preview.innerHTML = marked.parse(markdownText || '');
    processClozeElementsInNode(dom.preview);
    
    if (window.MathJax) {
        MathJax.typesetPromise([dom.preview]).catch(err => console.log('MathJax error:', err));
    }
}

export function setupPreview() {
    marked.setOptions({ breaks: true });
    addClozeEventListeners();
}