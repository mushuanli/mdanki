// src/services/srs.js (NEW FILE)

// --- 配置常量 ---
const AGAIN_INTERVAL = 10 * 60 * 1000; // 10分钟，单位毫秒
const INITIAL_EASE_FACTOR = 2.5; // Anki 默认简易度 250%

/**
 * 计算下一次复习的状态
 * @param {object} currentState - Cloze 当前的状态对象
 * @param {number} rating - 用户的评分 (0: Again, 1: Hard, 2: Good, 3: Easy)
 * @returns {object} - 更新后的状态对象 { due, interval, easeFactor }
 */
export function calculateNextReview(currentState, rating) {
    const now = Date.now();
    let { interval = 0, easeFactor = INITIAL_EASE_FACTOR, state = 'new' } = currentState;
    
    if (state === 'new') {
        // 对于新卡片
        switch (rating) {
            case 0: // Again
                return { due: now + AGAIN_INTERVAL, interval: 0, easeFactor, state: 'learning' };
            case 1: // Hard
                return { due: now + 1 * 24 * 3600 * 1000, interval: 1, easeFactor, state: 'review' };
            case 2: // Good
                return { due: now + 3 * 24 * 3600 * 1000, interval: 3, easeFactor, state: 'review' };
            case 3: // Easy
                return { due: now + 5 * 24 * 3600 * 1000, interval: 5, easeFactor, state: 'review' };
        }
    }

    // 对于正在复习的卡片
    switch (rating) {
        case 0: // Again
            easeFactor = Math.max(1.3, easeFactor - 0.2);
            return { due: now + AGAIN_INTERVAL, interval: 0, easeFactor, state: 'learning' };
        case 1: // Hard
            interval = Math.max(1, interval * 1.2);
            easeFactor = Math.max(1.3, easeFactor - 0.15);
            break;
        case 2: // Good
            // interval 不变，直接乘以 easeFactor
            break;
        case 3: // Easy
            easeFactor += 0.15;
            break;
    }
    
    // 计算下次间隔（天）并转换为毫秒
    const nextIntervalInDays = Math.max(1, interval * easeFactor);
    const nextDueDate = now + nextIntervalInDays * 24 * 3600 * 1000;

    return { 
        due: nextDueDate, 
        interval: nextIntervalInDays, 
        easeFactor, 
        state: 'review' 
    };
}