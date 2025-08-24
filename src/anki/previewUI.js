// src/anki/previewUI.js

import * as clozeManager from './clozeManager.js';
import { dom } from './anki_dom.js'; // [修正] 统一 import 风格
import { appState, setState } from '../common/state.js';
import { playMultimedia } from './audioUI.js';

// [MODIFIED] 导入需要的模块
import * as dataService from '../services/dataService.js';
import { simpleHash } from '../common/utils.js';
import { renderRichContent } from '../common/renderingService.js'; // [新增] 导入新服务
import { SRS_MASTERY_INTERVAL_DAYS } from '../common/config.js'; // [新增] 导入配置

let isPreviewUpdating = false; // <--- 1. 在顶部添加一个锁变量

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
        return 'cloze-10m'; // 10分钟内需要待办的卡片
    }
    return 'cloze-28plus'; // 默认到期颜色
}

// [NEW] 检查并高亮显示重复的 locator
function highlightDuplicateLocators() {
    const locatorsInFile = new Map();
    // 收集所有带 locator 的 cloze
    dom.preview.querySelectorAll('.cloze[data-locator]').forEach(clozeEl => {
        const locator = clozeEl.dataset.locator;
        if (!locatorsInFile.has(locator)) {
            locatorsInFile.set(locator, []);
        }
        locatorsInFile.get(locator).push(clozeEl);
    });

    // 遍历并高亮重复项
    for (const [locator, elements] of locatorsInFile.entries()) {
        if (elements.length > 1) {
            elements.forEach(el => {
                el.classList.add('cloze-error-duplicate');
                el.title = `错误：定位符 "[${locator}]" 在此文件中重复！这可能导致待办状态错乱。`;
            });
        }
    }
}


function processClozeElementsInNode(node) {
    if (node.nodeType === Node.TEXT_NODE) {
        // [MODIFIED] 使用新的正则表达式来捕获可选的定位符
        const clozeRegex = /--(?:\s*\[([^\]]*)\])?\s*(.*?)--(?:\^\^audio:(.*?)\^\^)?/g;
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
            
            // [MODIFIED] 从新的捕获组中提取数据
            const locator = match[1];        // 捕获组1: 定位信息
            const clozeContent = match[2];     // 捕获组2: 可见内容
            const multimedia = match[3] ? match[3].trim() : null; // 捕获组3: 音频信息

            const contentWithBreaks = clozeContent.replace(/¶/g, '<br>');
            const fileId = appState.currentSessionId;

            // [MODIFIED] 核心ID生成逻辑
            let clozeId;
            let locatorKey = null;
            if (locator && locator.trim()) {
                locatorKey = locator.trim();
                clozeId = `${fileId}_${simpleHash(locatorKey)}`;
            } else {
                clozeId = `${fileId}_${simpleHash(clozeContent)}`;
            }
            
            // [MODIFIED] 将计算好的 clozeId 传递给数据服务
            const clozeState = dataService.anki_getOrCreateClozeState(fileId, clozeContent, clozeId);

            const clozeSpan = document.createElement('span');

            // ======================================================
            //                 ▼▼▼ 需求 2 实现 ▼▼▼
            //         根据掌握程度决定初始可见性
            // ======================================================
            const isMastered = clozeState.interval >= SRS_MASTERY_INTERVAL_DAYS;
            
            // 如果已掌握，则默认不添加 'hidden' 类，否则添加
            const visibilityClass = isMastered ? '' : 'hidden';

            clozeSpan.className = `cloze ${visibilityClass} ${getClozeColorClassByState(clozeState)}`;
            
            // 如果已掌握，添加一个特殊的data属性便于样式和逻辑区分
            if (isMastered) {
                clozeSpan.dataset.mastered = 'true';
            }

            clozeSpan.dataset.clozeId = clozeId;
            clozeSpan.dataset.content = clozeContent;
            if (locatorKey) clozeSpan.dataset.locator = locatorKey;
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

/**
 * [新增] 处理任务列表，添加悬停提示和隐藏时间戳
 */
function processTaskLists() {
    const taskItems = dom.preview.querySelectorAll('li, details'); // 修改选择器
    const timeRegex = /\{([^}]+)\}/;

    taskItems.forEach(item => {
        const checkbox = item.tagName === 'LI' 
            ? item.querySelector('input[type="checkbox"]') 
            : item.querySelector('summary input[type="checkbox"]');

        if (!checkbox) return;

        // 步骤 1: 确保复选框是可点击的 (这一步保持不变)
        checkbox.disabled = false;

        // ======================================================
        //          ▼▼▼ 第 2 处核心修改（也是最终修复） ▼▼▼
        // 目的：正确定位到包含任务文本和日期的元素，无论其结构如何。
        // ======================================================

        // 步骤 2: 定义真正持有文本的元素
        let textHolderElement;
        if (item.tagName === 'LI') {
            textHolderElement = item; // 对于 <li>, 它自己就是文本持有者
        } else { // 对于 <details>
            textHolderElement = item.querySelector('.toggle-title-text'); // 文本在 <span class="toggle-title-text"> 内部
        }

        // 如果找不到文本持有元素，则跳过，增加健壮性
        if (!textHolderElement) return;

        // 步骤 3: [修正] 遍历 textHolderElement 的子节点来查找时间戳
        Array.from(textHolderElement.childNodes).forEach(node => {
            // 我们只关心文本节点，并且内容要匹配时间戳格式
            if (node.nodeType === Node.TEXT_NODE && timeRegex.test(node.nodeValue)) {
                const match = node.nodeValue.match(timeRegex);
                const fullBlock = match[0];       // e.g., "{₂₀₂₅-₇-₂₆|2025-07-26T...Z}"
                const contentBlock = match[1];    // e.g., "₂₀₂₅-₇-₂₆|2025-07-26T...Z"

                let displayDate = '';
                let machineDate = '';

                // 解析我们的双格式数据
                if (contentBlock.includes('|')) {
                    const parts = contentBlock.split('|');
                    displayDate = parts[0];
                    machineDate = parts[1];
                } else {
                    // 如果格式不符，则跳过，避免出错
                    return; 
                }

                try {
                    const date = new Date(machineDate);
                    if (isNaN(date.getTime())) return; // 无效日期则跳过

                    // 1. 设置悬停提示
                    item.title = `完成于: ${date.toLocaleString()}`;

                    // ======================================================
                    //          ▼▼▼ 第 1 处核心修改 ▼▼▼
                    // 目的：改变渲染顺序，将日期显示在任务内容前面。
                    // ======================================================

                    // 2. DOM 操作：用可见的日期和隐藏的数据块替换原始文本
                    const textContent = node.nodeValue.replace(fullBlock, '');

                    // 创建可见的日期文本节点，注意后面的空格用于分隔
                    const displayNode = document.createTextNode(` ${displayDate} `);

                    // 创建隐藏的数据存储节点
                    const storageNode = document.createElement('span');
                    storageNode.style.display = 'none';
                    storageNode.className = 'task-timestamp-data';
                    storageNode.textContent = fullBlock;
                    
                    // 3. 更新原始节点：只保留纯任务文本
                    node.nodeValue = textContent;
                
                    // 4. 在任务文本节点之前插入可见的日期节点（在正确的父元素下）
                    textHolderElement.insertBefore(displayNode, node);
                
                    // 5. 将隐藏的数据块附加到最外层的<li>或<details>的末尾
                    item.appendChild(storageNode);
                    
                } catch (e) {
                    console.warn("解析任务日期时出错:", e);
                }
            }
        });
    });
}


// ======================================================
//          [新增] 日期格式化辅助函数
// ======================================================
/**
 * 将日期格式化为包含 Unicode 下标数字的特殊字符串。
 * @param {Date} date - 要格式化的日期对象。
 * @returns {string} 格式化后的字符串，例如 "₂₀₂₅年₇月₂₆日"。
 */
function formatDateToSubscript(date) {
    const year = date.getFullYear().toString();
    const month = (date.getMonth() + 1).toString();
    const day = date.getDate().toString();

    const subscriptMap = {
        '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄',
        '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉'
    };

    const toSubscript = (str) => str.split('').map(char => subscriptMap[char] || char).join('');

    // 返回新的格式
    return `${toSubscript(year)}-${toSubscript(month)}-${toSubscript(day)}`;
}

function addClozeEventListeners() {
    // --- 1. 单击事件监听器 (用于待办) ---
    // [修改] 将事件处理器设为 async
    dom.preview.addEventListener('click', async (e) => {
        const cloze = e.target.closest('.cloze');
        if (!cloze) return;

        // --- 1. [MODIFIED] 处理反馈按钮点击 ---
        if (e.target.closest('.cloze-btn')) {
            e.stopPropagation();
            const button = e.target.closest('.cloze-btn');
            const rating = parseInt(button.dataset.rating, 10);
            const fileId = appState.currentSessionId;
            
            // [MODIFIED] 直接从 dataset 获取 ID 和内容
            const clozeId = cloze.dataset.clozeId;
            const clozeContent = cloze.dataset.content;

            if (!clozeId) {
                console.error("无法更新Cloze状态：缺少clozeId。");
                return;
            }

            clearTimeout(cloze.closeTimer);

            // [MODIFIED] 调用更新后的 dataService 函数，传入 clozeId
            await dataService.anki_updateClozeState(fileId, clozeContent, rating, clozeId);

            const newState = dataService.anki_getOrCreateClozeState(fileId, clozeContent, clozeId);
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
                await dataService.anki_recordReview(fileId);

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
            // [需求 1] 当点开 cloze 时记录当前位置
            // 调用 clozeManager 来记录这次交互
            clozeManager.recordClozeInteraction(cloze);

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

    // ======================================================
    //          [新增] 任务列表复选框交互逻辑
    // ======================================================
    // [核心修正 1] 将事件处理函数声明为 async
    dom.preview.addEventListener('change', async (e) => {
        const target = e.target;
        // 步骤 1: 确保事件源是列表项中的一个复选框
    if (target.tagName !== 'INPUT' || target.type !== 'checkbox' || (!target.closest('li') && !target.closest('summary'))) {
            return;
        }

        const isChecked = target.checked;
        const allCheckboxes = Array.from(dom.preview.querySelectorAll('li input[type="checkbox"], summary input[type="checkbox"]'));
        const clickedIndex = allCheckboxes.indexOf(target);
        if (clickedIndex === -1) return;

        const editorContent = dom.editor.value;
        const lines = editorContent.split('\n');
        const taskLineRegex = /^\s*- \[( |x)\]/;
        const toggleTaskLineRegex = /^::>\s*\[( |x)\]/;
        let taskCounter = 0;
        let contentChanged = false;
        let shouldRecordReview = false;

        const newLines = lines.map(line => {
            const isTaskLine = taskLineRegex.test(line);
            const isToggleTaskLine = !isTaskLine && toggleTaskLineRegex.test(line);
            if (!isTaskLine && !isToggleTaskLine) return line;

            // 如果这一行是任务项，检查它是否是我们要找的那个
            if (taskCounter === clickedIndex) {
                taskCounter++; // 别忘了增加计数器
                let modifiedLine = line;
                // 正是这一行！现在进行修改
                if (isChecked) {
                    // --- 场景：勾选复选框 ---
                    const dateBlockRegex = /\{([^}]+?)\|([^}]+?)\}/;
                    const match = line.match(dateBlockRegex);
                    const todayStr = new Date().toISOString().slice(0, 10);
                    let isAlreadyCompletedToday = false;

                    if (match && match[2]) { // 如果存在有效的时间戳块
                    try {
                        if (new Date(match[2]).toISOString().slice(0, 10) === todayStr) isAlreadyCompletedToday = true;
                    } catch (err) {}
                    }
                    if (isAlreadyCompletedToday) {
                        modifiedLine = isTaskLine 
                            ? line.replace(/^- \[\s\]/, '- [x]')
                            : line.replace(/^::> \[\s\]/, '::> [x]');
                    } else {
                        shouldRecordReview = true;
                        const content = line.replace(/\{[^}]+\}/g, '').trim();
                        const displayDate = formatDateToSubscript(new Date());
                        const machineDate = new Date().toISOString();
                        const newDateBlock = `{${displayDate}|${machineDate}}`;
                        if (isTaskLine) {
                            const taskText = content.replace(/^\s*- \[\s\]\s*/, '');
                            modifiedLine = `- [x] ${newDateBlock} ${taskText}`;
                        } else {
                            const taskText = content.replace(/^::>\s*\[\s\]\s*/, '');
                            modifiedLine = `::> [x] ${newDateBlock} ${taskText}`;
                        }
                    }
                } else {
                    modifiedLine = isTaskLine 
                        ? line.replace('- [x]', '- [ ]')
                        : line.replace('::> [x]', '::> [ ]');
                }
                if (modifiedLine !== line) contentChanged = true;
                return modifiedLine;
            } else {
                taskCounter++;
                return line;
            }
        });

        // 只有在文本内容确实发生变化时才执行后续操作
        if (contentChanged) {
            // 如果需要，执行统计
            if (shouldRecordReview) {
                await dataService.anki_recordReview(appState.currentSessionId);
            }

            // 更新编辑器内容并保存
            const newEditorContent = newLines.join('\n');
            const cursorPos = dom.editor.selectionStart;
            dom.editor.value = newEditorContent;
            dom.editor.setSelectionRange(cursorPos, cursorPos);
          
            // 保存并触发UI更新
            await dataService.anki_saveCurrentSessionContent(newEditorContent);
            await updatePreview();
            dom.editor.dispatchEvent(new Event('input', { bubbles: true }));
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

export async function updatePreview() {
    if (isPreviewUpdating) {
        console.log("Preview update already in progress. Skipping.");
        return; // 如果正在更新，则直接跳过这次调用
    }
    isPreviewUpdating = true; // 上锁

    try {
        const { currentSessionId, currentSubsessionId, fileSubsessions, sessions } = appState;
        const session = sessions.find(s => s.id === currentSessionId);
        if (!session) {
            dom.preview.innerHTML = '';
            isPreviewUpdating = false;
            return;
        }
        let markdownText = session.content;
        if (currentSubsessionId) {
            const subsession = fileSubsessions[currentSessionId]?.find(s => s.id === currentSubsessionId);
            if (subsession) markdownText = subsession.content;
        }

        // 1. 调用公共渲染服务
        await renderRichContent(dom.preview, markdownText);

        // 2. 执行 Anki 特有的后处理
        processClozeElementsInNode(dom.preview);
        processTaskLists();
        
        // [NEW] 检查并高亮显示重复的 locator
        highlightDuplicateLocators();

    // 3. [新增] 异步渲染 Mermaid 图表
    // 查找所有语言标记为 mermaid 的代码块
        const mermaidElements = dom.preview.querySelectorAll('pre code.language-mermaid');
    
        const mermaidRenderPromises = Array.from(mermaidElements).map(async (element, index) => {
            const preElement = element.parentNode;
            // 添加一个额外的安全检查，虽然在有锁的情况下非必须，但也是个好习惯
            if (!preElement || !preElement.parentNode) return;
            const graphDefinition = element.textContent;
            const graphId = `mermaid-graph-${Date.now()}-${index}`;
            try {
            // 使用 mermaid.render 生成 SVG
        // 使用 mermaid.parse 进行语法验证而不渲染
                await mermaid.parse(graphDefinition);
                const { svg } = await mermaid.render(graphId, graphDefinition);
            
            // 创建一个容器来包裹 SVG，方便设置样式
                const container = document.createElement('div');
                container.className = 'mermaid-diagram';
                container.innerHTML = svg;
            
                // 再次检查，确保在异步操作后元素仍在DOM中
                if (preElement.parentNode) {
                    preElement.parentNode.replaceChild(container, preElement);
                }
        } catch (error) {
/*
            console.error('Mermaid rendering error:', error);
            // 如果渲染失败，在原地显示错误信息
            const errorBox = document.createElement('div');
            errorBox.className = 'error-box';
            errorBox.innerHTML = `<strong>Mermaid Error:</strong><br><pre>${error.message}</pre>`;
                if (preElement.parentNode) {
                    preElement.parentNode.replaceChild(errorBox, preElement);
                }
*/
            }
    });

    // 等待所有 Mermaid 图表都处理完毕
        await Promise.all(mermaidRenderPromises);

    // 4. [保持] 最后渲染 MathJax 公式
        if (window.MathJax) {
            try {
                await window.MathJax.typesetPromise([dom.preview]);
            } catch (err) {
                console.log('MathJax error:', err);
            }
        }
    } catch (error) {
        console.error("Error during preview update:", error);
    } finally {
        isPreviewUpdating = false;
    }
}

export function setupPreview() {
    mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    suppressErrors: true,
    maxTextSize: 100000 // 增加最大文本大小限制
    });
    const mathExtension = {
        name: 'math',
        level: 'inline', // Process at inline level
        start(src) {
            // 寻找数学公式分隔符的起始位置
            // 【修正】在正则表达式的末尾添加 '|\\$' 来匹配单个美元符号
            return src.match(/\$\$|\\\(|\\\[|\\ce\{|\$/)?.index;
        },
        tokenizer(src, tokens) {
            let match;
            
            // 块级公式 $$...$$
            match = src.match(/^\$\$\s*([\s\S]+?)\s*\$\$/);
            if (match) return { type: 'math', raw: match[0] };

            // 块级公式 \[...\]
            match = src.match(/^\\\[\s*([\s\S]+?)\s*\\\]/);
            if (match) return { type: 'math', raw: match[0] };

            // 行内公式 \(...\)
            match = src.match(/^\\\(\s*([\s\S]+?)\s*\\\)/);
            if (match) return { type: 'math', raw: match[0] };
            
            // 快捷方式 \ce{...}
            match = src.match(/^\\ce\{([\s\S]+?)\}/);
            if (match) return { type: 'math', raw: match[0], isCeShorthand: true }; // 添加一个标志
            
            // 行内公式 $...$
            match = src.match(/^\$((?:\\\$|[^$])+?)\$/);
            if (match) return { type: 'math', raw: match[0] };

            return undefined;
        },
        renderer(token) {
            // 【核心修正】在这里统一处理渲染逻辑

            // 1. 如果是 \ce{...} 快捷方式，为其包裹上标准分隔符
            if (token.isCeShorthand) {
                return `\\(${token.raw}\\)`;
            }
            
            // 2. 如果是 $...$ 格式，将其转换为标准分隔符 \(...\)
            if (token.raw.startsWith('$') && !token.raw.startsWith('$$')) {
                // 截取掉前后的 '$'
                const content = token.raw.slice(1, -1);
                // 用标准分隔符包裹
                return `\\(${content}\\)`;
            }
            
            // 3. 对于其他格式 (如 $$...$$, \(...\) 等)，它们已经是标准格式，直接返回
            return token.raw;
        }
    };

    // 添加 toggle list 扩展
    const toggleListExtension = {
        name: 'toggleList',
        level: 'block',
        start(src) {
            const match = src.match(/\n::>/);
            return match ? match.index : undefined;
        },
        tokenizer(src, tokens) {
            const titleRule = /^::>\s*(.*)(?:\n|$)/;
            const titleMatch = titleRule.exec(src);
    
            if (titleMatch) {
                const title = titleMatch[1].trim();
                let raw = titleMatch[0];
                let body = '';
                let contentSrc = src.substring(raw.length);
                
                // 查找第一个非空内容行以确定基准缩进
                const firstContentLineMatch = contentSrc.match(/^( *)(?=\S)/m);
                const indent = firstContentLineMatch ? firstContentLineMatch[1].length : 0;
    
                if (indent > 0) {
                    const indentRegex = new RegExp(`^ {${indent}}`, 'gm');
                    // 匹配所有缩进的行，或完全是空/空格的行
                    const contentBlockRegex = new RegExp(`^((?: {${indent}}.*|\\s*)\\n?)+`, 'm');
                    const contentMatch = contentBlockRegex.exec(contentSrc);
    
                    if (contentMatch) {
                        const blockContent = contentMatch[0];
                        raw += blockContent;
                        // 去除每行的前导缩进
                        body = blockContent.replace(indentRegex, '');
                    }
                }
    
                const token = {
                    type: 'toggleList',
                    raw,
                    title,
                    body,
                    tokens: []
                };
    
                this.lexer.blockTokens(token.body, token.tokens);
                return token;
            }
        },
        renderer(token) {
            const checkboxRegex = /^\s*\[( |x)\]\s*(.*)/;
            const titleMatch = token.title.match(checkboxRegex);
            
            let summaryContent = '';
            if (titleMatch) {
                const checked = titleMatch[1] === 'x' ? 'checked' : '';
                const titleText = titleMatch[2];
                summaryContent = `<input type="checkbox" ${checked}><span class="toggle-title-text">${titleText}</span>`;
            } else {
                summaryContent = `<span class="toggle-title-text">${token.title}</span>`;
            }

            const bodyHtml = this.parser.parse(token.tokens);
            return `
                <details class="toggle-list">
                    <summary>${summaryContent}</summary>
                    <div class="toggle-content">
                        ${bodyHtml}
                    </div>
                </details>`;
        }
    };

    window.marked.use({ extensions: [mathExtension, toggleListExtension] });
    window.marked.setOptions({ 
        breaks: true,
        gfm: true
    });
    addClozeEventListeners();
}