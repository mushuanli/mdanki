// src/anki/previewUI.js
import * as dom from './anki_dom.js';
import { appState, setState } from '../common/state.js';
import { playMultimedia } from './audioUI.js';

// [MODIFIED] 导入需要的模块
import * as dataService from '../services/dataService.js';
import { simpleHash } from '../common/utils.js';

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

/**
 * [新增] 处理任务列表，添加悬停提示和隐藏时间戳
 */
function processTaskLists() {
    const taskItems = dom.preview.querySelectorAll('li');
    const timeRegex = /\{([^}]+)\}/; // 匹配 {...} 中的内容

    taskItems.forEach(item => {
        // 寻找复选框
        const checkbox = item.querySelector('input[type="checkbox"]');
        if (!checkbox) return;

        // 步骤 1: 确保复选框是可点击的 (这一步保持不变)
        checkbox.disabled = false;
        // ======================================================

        // 步骤 2: [核心修改] 精确查找并替换时间戳文本节点
        // 遍历 li 的所有直接子节点
        Array.from(item.childNodes).forEach(node => {
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
                    
                    // 4. 在任务文本节点之前插入可见的日期节点
                    item.insertBefore(displayNode, node);
                    
                    // 5. 将隐藏的数据块附加到<li>的末尾（它的位置不影响显示）
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

    // ======================================================
    //          [新增] 任务列表复选框交互逻辑
    // ======================================================
    // [核心修正 1] 将事件处理函数声明为 async
    dom.preview.addEventListener('change', async (e) => {
        const target = e.target;
        // 步骤 1: 确保事件源是列表项中的一个复选框
        if (target.tagName !== 'INPUT' || target.type !== 'checkbox' || !target.closest('li')) {
            return;
        }

        // 步骤 2: 确定被点击的复选框是所有复选框中的第几个
        const allCheckboxes = Array.from(dom.preview.querySelectorAll('li input[type="checkbox"]'));
        const clickedIndex = allCheckboxes.indexOf(target);
        if (clickedIndex === -1) {
            return;
        }

        const isChecked = target.checked;
        const editorContent = dom.editor.value;
        const lines = editorContent.split('\n');
        
        // 用于识别任务列表项的正则表达式
        const taskLineRegex = /^\s*- \[( |x)\]/;
        let taskCounter = 0; // 专门用于对源文本中的任务项进行计数

        // 步骤 3: 遍历每一行来定位和修改目标行
        const newLines = lines.map(line => {
            // 如果这一行不是任务项，直接返回原样
            if (!taskLineRegex.test(line)) {
                return line;
            }

            // 如果这一行是任务项，检查它是否是我们要找的那个
            if (taskCounter === clickedIndex) {
                taskCounter++; // 别忘了增加计数器
                
                // 正是这一行！现在进行修改
                if (isChecked) {
                    // --- 场景：勾选复选框 ---
                    // 1. 去掉旧的日期块（如果有的话），避免重复
                    let content = line.replace(/\{[^}]+\}/g, '').trim();
                    // 2. 提取纯任务文本
                    let taskText = content.replace(/^\s*- \[\s\]\s*/, '');
                    
                    // 3. 创建新的日期块
                    const displayDate = formatDateToSubscript(new Date());
                    const machineDate = new Date().toISOString();
                    const newDateBlock = `{${displayDate}|${machineDate}}`;
                    
                    // 4. 组装成新的、已完成的任务行
                    return `- [x] ${newDateBlock} ${taskText}`;
                } else {
                    // --- 场景：取消勾选 ---
                    // 1. 只需将 "[x]" 替换为 "[ ]"
                    // 2. 您的原始逻辑保留了日期，这种做法可以保持任务的元数据，这里我们遵循它。
                    return line.replace('[x]', '[ ]');
                }
            } else {
                // 是任务行，但不是被点击的那个，原样返回
                taskCounter++;
                return line;
            }
        });

        // 步骤 4: 将修改后的行数组合并成新文本，并更新编辑器
        const newEditorContent = newLines.join('\n');
        
        if (editorContent !== newEditorContent) {
            const cursorPos = dom.editor.selectionStart;
            dom.editor.value = newEditorContent;
            dom.editor.setSelectionRange(cursorPos, cursorPos);
          
            // 保存并触发UI更新
            await dataService.saveCurrentSessionContent(newEditorContent);
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
        isPreviewUpdating = false; // 解锁
        return;
    }

    let markdownText = session.content;
    if (currentSubsessionId) {
        const subsession = fileSubsessions[currentSessionId]?.find(s => s.id === currentSubsessionId);
        if (subsession) markdownText = subsession.content;
    }

    dom.preview.innerHTML = window.marked.parse(markdownText || '');
    processClozeElementsInNode(dom.preview);
        processTaskLists(); // [新增] 调用任务列表处理函数
    
    // 3. [新增] 异步渲染 Mermaid 图表
    // 查找所有语言标记为 mermaid 的代码块
    const mermaidElements = dom.preview.querySelectorAll('pre code.language-mermaid');
    
    const mermaidRenderPromises = Array.from(mermaidElements).map(async (element, index) => {
        const preElement = element.parentNode;
            // 添加一个额外的安全检查，虽然在有锁的情况下非必须，但也是个好习惯
            if (!preElement || !preElement.parentNode) {
                return; 
            }
        const graphDefinition = element.textContent;
        const graphId = `mermaid-graph-${Date.now()}-${index}`;

        try {
            // 使用 mermaid.render 生成 SVG
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
            console.error('Mermaid rendering error:', error);
            // 如果渲染失败，在原地显示错误信息
            const errorBox = document.createElement('div');
            errorBox.className = 'error-box';
            errorBox.innerHTML = `<strong>Mermaid Error:</strong><br><pre>${error.message}</pre>`;
                if (preElement.parentNode) {
                    preElement.parentNode.replaceChild(errorBox, preElement);
                }
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
        isPreviewUpdating = false; // 无论成功或失败，最后都要解锁
    }
}

export function setupPreview() {
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

    // Use the improved math extension
    window.marked.use({ extensions: [mathExtension] });

    // 【修改】在这里添加 gfm: true 选项
    window.marked.setOptions({ 
        breaks: true,
        gfm: true // 启用GitHub Flavored Markdown支持
    });
    
    addClozeEventListeners();
}