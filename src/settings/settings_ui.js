// src/settings/settings_ui.js
import { $id } from '../common/dom.js';

/**
 * [新增] 从模板渲染设置视图。
 * 必须在任何尝试访问设置页面内DOM元素的代码之前调用。
 */
export function renderSettingsView() {
    const container = $id('settings-view');
    const template = $id('settings-section-template');

    if (!container || !template) {
        console.error('Settings container or template not found in the DOM.');
        return;
    }

    // 如果已经渲染过，则不再重复渲染
    if (container.children.length > 0) {
        return;
    }

    const content = template.content.cloneNode(true);
    container.appendChild(content);
}


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
