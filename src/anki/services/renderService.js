// src/anki/services/renderService.js

import { ankiStore } from '../store/ankiStore.js';
import { simpleHash } from '../../common/utils.js';
import { SRS_MASTERY_INTERVAL_DAYS } from '../../common/config.js';

// --- Helper Functions ---
function getClozeColorClassByState(clozeState) {
    const now = Date.now();
    if (clozeState.due > now) {
        const diffInDays = (clozeState.due - now) / (1000 * 60 * 60 * 24);
        if (diffInDays < 1) return 'cloze-1d';
        if (diffInDays < 7) return 'cloze-7d';
        if (diffInDays < 14) return 'cloze-14d';
        return 'cloze-28d';
    }
    return 'cloze-28plus'; // Due or overdue
}

function formatDateToSubscript(date) {
    const year = date.getFullYear().toString();
    const month = (date.getMonth() + 1).toString();
    const day = date.getDate().toString();
    const subscriptMap = { '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉' };
    const toSubscript = (str) => str.split('').map(char => subscriptMap[char] || char).join('');
    return `${toSubscript(year)}-${toSubscript(month)}-${toSubscript(day)}`;
}


// --- Main Rendering Functions ---

/**
 * Parses Markdown text and processes custom syntax like clozes and task lists.
 * @param {string} markdownText - The raw Markdown content.
 * @returns {string} The fully processed HTML string.
 */
export async function renderMarkdown(markdownText) {
    if (!window.marked) {
        console.error("Marked.js library not found.");
        return `<p>${markdownText}</p>`;
    }
    return window.marked.parse(markdownText || '');
}

/**
 * Takes HTML content and transforms custom syntax (like --cloze--) into interactive elements.
 * @param {string} html - HTML content produced by Marked.js.
 * @returns {string} - HTML with interactive cloze elements.
 */
export async function processCloze(html) {
    const { clozeStates, currentSessionId } = ankiStore.getState();
    if (!currentSessionId) return html;

    // Regex to find all custom cloze syntax variations.
    const clozeRegex = /--(?:\s*\[([^\]]*)\])?\s*(.*?)--(?:\^\^audio:(.*?)\^\^)?/g;
    
    return html.replace(clozeRegex, (match, locator, content, audio) => {
        const clozeContent = content.trim();
        const locatorKey = locator ? locator.trim() : null;
        
        const clozeId = locatorKey 
            ? `${currentSessionId}_${simpleHash(locatorKey)}` 
            : `${currentSessionId}_${simpleHash(clozeContent)}`;

        const defaultState = { id: clozeId, fileId: currentSessionId, content: clozeContent, state: 'new', due: Date.now(), interval: 0, easeFactor: 2.5 };
        const clozeState = clozeStates[clozeId] || defaultState;

        const isMastered = clozeState.interval >= SRS_MASTERY_INTERVAL_DAYS;
        const visibilityClass = isMastered ? '' : 'hidden';
        const colorClass = getClozeColorClassByState(clozeState);

        // Build data attributes
        let dataAttrs = `data-cloze-id="${clozeId}" data-content="${clozeContent.replace(/"/g, '&quot;')}"`;
        if (locatorKey) dataAttrs += ` data-locator="${locatorKey}"`;
        if (audio) dataAttrs += ` data-multimedia="${audio.trim().replace(/"/g, '&quot;')}"`;
        if (isMastered) dataAttrs += ` data-mastered="true"`;

        const contentWithBreaks = clozeContent.replace(/¶/g, '<br>');

        return `
            <span class="cloze ${visibilityClass} ${colorClass}" ${dataAttrs}>
                ${audio ? '<span class="media-icon" title="播放音频"><i class="fas fa-volume-up"></i></span>' : ''}
                <span class="cloze-content">${contentWithBreaks}</span>
                <span class="placeholder">[...]</span>
                <div class="cloze-actions" style="display: none;">
                    <button class="cloze-btn again" data-rating="0">重来</button>
                    <button class="cloze-btn hard" data-rating="1">困难</button>
                    <button class="cloze-btn double" data-rating="2">犹豫</button>
                    <button class="cloze-btn easy" data-rating="3">简单</button>
                </div>
            </span>`;
    });
}

/**
 * [新增] Transforms task list items in HTML to be interactive and display formatted dates.
 * @param {string} html - HTML content that has already been processed by Marked.js.
 * @returns {string} HTML with enhanced task list items.
 */
export function processTaskLists(html) {
    // This regex finds a list item (<li>) containing a checkbox.
    const taskItemRegex = /<li[^>]*>\s*<input type="checkbox" disabled=""([^>]*)>(.*?)<\/li>/g;
    
    return html.replace(taskItemRegex, (match, checkboxAttrs, content) => {
        // Regex to find our custom date block inside the content.
        const dateRegex = /\{([^|]+)\|([^}]+)\}/;
        let newContent = content;
        let titleAttr = '';
        let dateSpan = '';

        const dateMatch = content.match(dateRegex);
        if (dateMatch) {
            const displayDate = dateMatch[1]; // The subscript version for display
            const machineDate = dateMatch[2]; // The ISO string for the tooltip

            try {
                // Create a user-friendly tooltip from the ISO string.
                const formattedDate = new Date(machineDate).toLocaleString();
                titleAttr = ` title="完成于: ${formattedDate}"`;
            } catch (e) {
                // Ignore if date is invalid
            }
            
            // Create the visible date span and remove the original block from the content.
            dateSpan = `<span class="task-date">${displayDate}</span>`;
            newContent = content.replace(dateRegex, '').trim();
        }

        // Reconstruct the list item:
        // 1. Add the tooltip attribute to the <li>.
        // 2. Remove the 'disabled=""' from the <input> tag.
        // 3. Append the formatted date span.
        return `<li${titleAttr}><input type="checkbox"${checkboxAttrs}> ${newContent} ${dateSpan}</li>`;
    });
}

/**
 * Renders third-party libraries like Mermaid and MathJax on a given DOM element.
 * This should be called *after* the processed HTML has been inserted into the DOM.
 * @param {HTMLElement} element - The DOM element containing the content.
 */
export async function renderMathAndMermaid(element) {
    // Render Mermaid diagrams
    if (window.mermaid) {
        try {
            const mermaidElements = element.querySelectorAll('.mermaid');
            if (mermaidElements.length > 0) {
                 await mermaid.run({ nodes: mermaidElements });
            }
        } catch (error) {
            console.error("Mermaid rendering failed:", error);
        }
    }

    // Render MathJax formulas
    if (window.MathJax && typeof window.MathJax.typesetPromise === 'function') {
        try {
            await window.MathJax.typesetPromise([element]);
        } catch (error) {
            console.error("MathJax typesetting failed:", error);
        }
    }
}
