// src/common/renderingService.js

/**
 * 渲染一个包含Markdown、Mermaid和MathJax的DOM元素。
 * @param {HTMLElement} element - 需要被渲染的DOM元素。
 * @param {string} markdownText - 待渲染的Markdown原文。
 */
export async function renderRichContent(element, markdownText) {
    if (!element) return;

    // 1. 使用 Marked.js 解析 Markdown
    element.innerHTML = window.marked.parse(markdownText || '');

    // 2. 异步渲染 Mermaid 图表
    const mermaidElements = element.querySelectorAll('pre code.language-mermaid');
    if (window.mermaid && mermaidElements.length > 0) {
        const renderPromises = Array.from(mermaidElements).map(async (el, index) => {
            const pre = el.parentNode;
            const graphDefinition = el.textContent;
            const graphId = `mermaid-${Date.now()}-${index}`;
            try {
                // 使用 mermaid.render 生成 SVG
                const { svg } = await mermaid.render(graphId, graphDefinition);
                const container = document.createElement('div');
                container.className = 'mermaid-diagram';
                container.innerHTML = svg;
                if (pre.parentNode) {
                    pre.parentNode.replaceChild(container, pre);
                }
            } catch (error) {
                console.error('Mermaid rendering error:', error);
                pre.innerHTML = `<div class="error-box">Mermaid Error: ${error.message}</div>`;
            }
        });
        await Promise.all(renderPromises);
    }

    // 3. 异步渲染 MathJax 公式
    if (window.MathJax && (markdownText.includes('$') || markdownText.includes('\\'))) {
        try {
            await window.MathJax.typesetPromise([element]);
        } catch (err) {
            console.error('MathJax error:', err);
        }
    }
}