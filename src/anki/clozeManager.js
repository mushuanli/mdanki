// src/anki/clozeManager.js
import { dom } from './anki_dom.js';

// 模块内部状态，记录最后一次交互（点击打开）的 cloze 在所有 cloze 中的索引
let lastInteractedClozeIndex = -1;

/**
 * 获取预览区内所有的 cloze 元素
 * @returns {HTMLElement[]}
 */
function getAllClozes() {
    return Array.from(dom.preview.querySelectorAll('.cloze'));
}

/**
 * 记录用户与哪个 cloze 进行了交互。
 * 这个函数应该在 cloze 被点击打开时调用。
 * @param {HTMLElement} clozeElement - 被点击的 cloze 元素。
 */
export function recordClozeInteraction(clozeElement) {
    const allClozes = getAllClozes();
    const index = allClozes.indexOf(clozeElement);
    if (index !== -1) {
        lastInteractedClozeIndex = index;
    }
}

/**
 * 导航到上一个或下一个关闭的 cloze。
 * @param {number} direction - 导航方向, -1 表示上一个, 1 表示下一个。
 */
export function navigateToCloze(direction) {
    const allClozes = getAllClozes();
    if (allClozes.length === 0) return;

    // 移除旧的高亮
    const currentActive = dom.preview.querySelector('.cloze-nav-active');
    if (currentActive) {
        currentActive.classList.remove('cloze-nav-active');
    }

    // 确定搜索的起始点
    // 如果从未交互过，向上导航从末尾开始，向下导航从头开始
    let startIndex = lastInteractedClozeIndex === -1 
        ? (direction === 1 ? 0 : allClozes.length - 1)
        : (lastInteractedClozeIndex + direction + allClozes.length) % allClozes.length;

    let targetCloze = null;
    let searchedCount = 0;

    // 循环查找下一个关闭的 cloze
    let currentIndex = startIndex;
    while (searchedCount < allClozes.length) {
        const candidate = allClozes[currentIndex];
        // 关键条件：必须是隐藏的（关闭的）cloze
        if (candidate.classList.contains('hidden')) {
            targetCloze = candidate;
            break;
        }
        currentIndex = (currentIndex + direction + allClozes.length) % allClozes.length;
        searchedCount++;
    }

    // 如果找到了目标
    if (targetCloze) {
        targetCloze.scrollIntoView({ behavior: 'smooth', block: 'center' });
        targetCloze.classList.add('cloze-nav-active');
        // 更新最后交互位置，以便下次导航从这里开始
        lastInteractedClozeIndex = allClozes.indexOf(targetCloze);
    }
}
