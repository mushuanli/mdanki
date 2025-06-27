// src/common/utils.js
export function generateId() {
    return 'id_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

export function escapeHTML(str) {
    if (!str) return '';
    return str.replace(/[&<>"']/g, 
        tag => ({
            '&': '&',
            '<': '<',
            '>': '>',
            '"': '"',
            "'": '\''
        }[tag] || tag));
}