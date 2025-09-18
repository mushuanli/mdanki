// src/common/RichContentRenderer.js
import { simpleHash } from './utils.js';

/**
 * A centralized service for rendering rich content like Markdown, Cloze, Mermaid, etc.
 */
export class RichContentRenderer {

    /**
     * Fully processes and renders a Markdown string into an HTML element.
     * @param {HTMLElement} element The target element to render into.
     * @param {string} markdownText The raw Markdown text.
     * @param {object} context Additional context for rendering (e.g., for Cloze).
     * @param {object} [context.clozeStates={}] The current states of all clozes.
     * @param {string} [context.fileId=''] The ID of the file containing the content.
     */
    static async render(element, markdownText, context = {}) {
        if (!element) return;
        
        // 1. Parse base Markdown to HTML
        let html = this.parseMarkdown(markdownText);
        
        // 2. Process custom syntaxes (like our foldable blocks)
        html = this.processFoldableBlocks(html);

        if (context.fileId && context.clozeStates) {
            html = this.processCloze(html, context.clozeStates, context.fileId);
        }
        
        // 4. Process task lists (checkboxes)
        html = this.processTaskLists(html);

        // 5. Set the final HTML and render 3rd party libraries
        element.innerHTML = html;
        await this.renderMathAndMermaid(element);
    }
    
    /**
     * Parses base Markdown to HTML using marked.js.
     * It uses a custom renderer to ensure indented content is always a blockquote.
     * @param {string} markdownText 
     * @returns {string} HTML string
     */
    static parseMarkdown(markdownText) {
        if (!window.marked) return `<p>${markdownText || ''}</p>`;
        
        // [REASON] We need to make indented content a blockquote for the regex to work.
        // We configure marked to treat our foldable blocks' indented content as blockquotes.
        const renderer = new marked.Renderer();
        const originalBlockquote = renderer.blockquote;
        renderer.blockquote = function(quote) {
             // This is a bit of a hack, but it works for our specific syntax.
             // We render it as a standard blockquote which our regex will then pick up.
            return `<blockquote>\n${quote}</blockquote>\n`;
        };
        
        return window.marked.parse(markdownText || '', { renderer });
    }

    /**
     * Transforms the custom `::>` syntax from parsed HTML into interactive <details> elements.
     * @param {string} html 
     * @returns {string} Transformed HTML
     */
    static processFoldableBlocks(html) {
        // [修正] 使 <blockquote> 部分成为可选，以匹配没有内容体的折叠块 (如 Level)。
        // The '?' makes the blockquote group optional.
        const FOLDABLE_BLOCK_REGEX = /<p>::&gt;\s*(?:\[([a-zA-Z0-9_]+)\])?\s*([^<]*)<\/p>\n?(<blockquote>((?:.|\n)*?)<\/blockquote>)?/g;
        
        return html.replace(FOLDABLE_BLOCK_REGEX, (match, fieldName, label, blockquoteGroup, content) => {
            // If content is undefined (because the blockquote was optional and didn't match), default to an empty string.
            const innerContent = content || '';
            return `<details class="foldable-block" open>
                        <summary>${label.trim()}</summary>
                        <div class="foldable-content">${innerContent.trim()}</div>
                    </details>`;
        });
    }

    /**
     * Processes Anki-style cloze deletions.
     * @param {string} html 
     * @param {object} clozeStates 
     * @param {string} fileId 
     * @returns {string} HTML with cloze elements
     */
    static processCloze(html, clozeStates, fileId) {
        const clozeRegex = /--(?:\s*\[([^\]]*)\])?\s*(.*?)--(?:\^\^audio:(.*?)\^\^)?/g;
        return html.replace(clozeRegex, (match, locator, content, audio) => {
            const clozeContent = content.trim();
            const clozeId = `${fileId}_${simpleHash(locator ? locator.trim() : clozeContent)}`;
            const clozeState = clozeStates[clozeId] || { state: 'new', due: Date.now() };

            const isHidden = clozeState.state !== 'mastered';
            const audioIcon = audio ? `<span class="media-icon" title="Play audio"><i class="fas fa-volume-up"></i></span>` : '';
            
            return `<span class="cloze ${isHidden ? 'hidden' : ''}" data-cloze-id="${clozeId}" data-multimedia="${audio || ''}">
                        ${audioIcon}
                        <span class="cloze-content">${clozeContent.replace(/¶/g, '<br>')}</span>
                        <span class="placeholder">[...]</span>
                    </span>`;
        });
    }
    
    /**
     * Processes Markdown task lists into interactive checkboxes.
     * @param {string} html 
     * @returns {string} HTML with interactive task lists
     */
    static processTaskLists(html) {
        const taskItemRegex = /<li[^>]*>\s*<input type="checkbox" disabled=""([^>]*)>(.*?)<\/li>/g;
        return html.replace(taskItemRegex, (match, checkboxAttrs, content) => {
            return `<li><input type="checkbox"${checkboxAttrs}> ${content}</li>`;
        });
    }

    /**
     * Renders MathJax and Mermaid diagrams in a given DOM element.
     * @param {HTMLElement} element 
     */
    static async renderMathAndMermaid(element) {
        // Render Mermaid
        if (window.mermaid) {
            try {
                const mermaidElements = element.querySelectorAll('.language-mermaid');
                if (mermaidElements.length > 0) {
                     await mermaid.run({ nodes: mermaidElements });
                }
            } catch (error) {
                console.error("Mermaid rendering failed:", error);
            }
        }

        // Render MathJax
        if (window.MathJax && typeof window.MathJax.typesetPromise === 'function') {
            try {
                await window.MathJax.typesetPromise([element]);
            } catch (error) {
                console.error("MathJax typesetting failed:", error);
            }
        }
    }
}
