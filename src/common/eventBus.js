// src/common/eventBus.js

const events = new Map();

/**
 * 订阅一个事件。
 * @param {string} eventName - 事件名称。
 * @param {Function} callback - 事件触发时执行的回调函数。
 * @returns {Function} - 用于取消订阅的函数。
 */
export function on(eventName, callback) {
    if (!events.has(eventName)) {
        events.set(eventName, []);
    }
    events.get(eventName).push(callback);

    // 返回一个取消订阅的函数
    return () => {
        const subscribers = events.get(eventName);
        if (subscribers) {
            const index = subscribers.indexOf(callback);
            if (index > -1) {
                subscribers.splice(index, 1);
            }
        }
    };
}

/**
 * 发布一个事件。
 * @param {string} eventName - 事件名称。
 * @param {*} [data] - 传递给回调函数的数据。
 */
export function emit(eventName, data) {
    const subscribers = events.get(eventName);
    if (subscribers) {
        subscribers.forEach(callback => {
            try {
                callback(data);
            } catch (error) {
                console.error(`Error in event bus callback for event "${eventName}":`, error);
            }
        });
    }
}

// 导出一个单例对象
export const bus = { on, emit };
