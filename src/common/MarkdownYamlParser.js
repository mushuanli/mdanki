// src/common/MarkdownYamlParser.js

// Regex to find foldable blocks.
// Captures: 1=fieldName, 2=label, 3=indented content block
const FOLDABLE_BLOCK_REGEX = /^::>\s*(?:\[([a-zA-Z0-9_]+)\])?\s*(.*)\n?((?:^[ \t]{4,}.*\n?)*)/gm;

export class MarkdownYamlParser {

    /**
     * Parses enhanced Markdown text into a structured JavaScript object.
     * @param {string} markdownText The Markdown content from the editor.
     * @returns {{success: boolean, data?: object, error?: string}}
     */
    static parseMarkdownToYaml(markdownText) {
        const data = {};
        const fieldNames = new Set();
        let detailsContent = markdownText;

        // Create a new regex instance for each call to reset its state
        const regex = new RegExp(FOLDABLE_BLOCK_REGEX);
        let match;

        while ((match = regex.exec(markdownText)) !== null) {
            const [fullMatch, fieldName, label, content] = match;
            const key = fieldName || label.trim().toLowerCase().replace(/\s+/g, '_');

            if (fieldNames.has(key)) {
                return { success: false, error: `字段名 "${key}" 重复。请确保每个折叠块的字段名唯一。` };
            }
            fieldNames.add(key);
            
            // Handle special case for 'priority' which has no content block
            if (key === 'priority') {
                const priorityMatch = label.match(/:\s*(\d+)/);
                data[key] = priorityMatch ? parseInt(priorityMatch[1], 10) : 1;
            } else {
                // Dedent content: remove the first 4 spaces from each line
                data[key] = content.split('\n').map(line => line.substring(4)).join('\n').trim();
            }
            
            // Remove the matched block from the main details content
            detailsContent = detailsContent.replace(fullMatch, '');
        }

        data.details = detailsContent.trim();
        return { success: true, data };
    }

    /**
     * Converts a task data object into enhanced Markdown text.
     * @param {object} taskData The task object from the database.
     * @returns {string} The Markdown text for the editor.
     */
    static parseYamlToMarkdown(taskData) {
        let markdown = taskData.details || '';
        
        const standardFields = ['note', 'reason'];

        // Handle standard fields first to maintain order
        for (const field of standardFields) {
            // Ensure the field exists and has content before creating a block
            if (taskData[field] && String(taskData[field]).trim()) {
                const label = field.charAt(0).toUpperCase() + field.slice(1);
                const indentedContent = String(taskData[field]).split('\n').map(line => `    ${line}`).join('\n');
                markdown += `\n\n::> [${field}]${label}\n${indentedContent}`;
            }
        }
        
        // Handle priority separately
        if (taskData.priority) {
            markdown += `\n\n::> [priority]Priority: ${taskData.priority}`;
        }
        
        // Handle other custom fields
        for (const key in taskData) {
            if (!['details', 'note', 'reason', 'priority', 'tags', 'title', 'uuid', 'subject', 'review'].includes(key)) {
                if (taskData[key] && String(taskData[key]).trim()) {
                    const indentedContent = String(taskData[key]).split('\n').map(line => `    ${line}`).join('\n');
                    markdown += `\n\n::> [${key}]${key}\n${indentedContent}`;
                }
            }
        }

        return markdown.trim();
    }
}
