// src/settings/settings_ui.js

/**
 * 更新按钮的UI，显示加载状态。
 * @param {HTMLElement} button - 要更新的按钮元素。
 * @param {boolean} isLoading - 是否正在加载。
 * @param {string} originalText - 按钮的原始文本。
 */
export function setButtonLoadingState(button, isLoading, originalText) {
    if (isLoading) {
        button.disabled = true;
        button.innerHTML = `<i class="fas fa-spinner fa-spin"></i> 处理中...`;
    } else {
        button.disabled = false;
        button.innerHTML = originalText;
    }
}
