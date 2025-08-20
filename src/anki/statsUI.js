import * as dataService from '../services/dataService.js';
import { dom } from './anki_dom.js'; // [重构] 导入 dom 对象

let chartInstance = null;

/**
 * 渲染统计图表
 * @param {object} chartData - 格式为 { labels, datasets } 的数据
 */
function renderChart(chartData) {
    // 如果已有图表实例，先销毁
    if (chartInstance) {
        chartInstance.destroy();
    }

    // [重构] 使用 dom.statsChartCanvas 替代 document.getElementById
    if (!dom.statsChartCanvas) return;
    const ctx = dom.statsChartCanvas.getContext('2d');
    chartInstance = new Chart(ctx, {
        type: 'line', // 折线图
        data: chartData,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true, // Y轴从0开始
                    ticks: {
                        // 确保刻度为整数
                        precision: 0
                    }
                }
            },
            plugins: {
                legend: {
                    position: 'top', // 图例显示在顶部
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                }
            },
            interaction: {
                mode: 'nearest',
                axis: 'x',
                intersect: false
            }
        }
    });
}

/**
 * 打开统计模态框并加载数据
 */
export async function openStatsModal() {
    // [重构] 使用 dom.statsModal
    if (dom.statsModal) {
        dom.statsModal.style.display = 'flex';
        renderChart({ labels: [], datasets: [] });
        const chartData = await dataService.anki_getReviewStatsForChart();
        renderChart(chartData);
    }
}

/**
 * 关闭统计模态框
 */
export function closeStatsModal() {
    // [重构] 使用 dom.statsModal
    if (dom.statsModal) {
        dom.statsModal.style.display = 'none';
        if (chartInstance) {
            chartInstance.destroy();
            chartInstance = null;
        }
    }
}

/**
 * 设置模态框的关闭事件
 */
export function setupStatsModalEventListeners() {
    // [重构] 使用 dom 对象
    if (dom.statsModalCloseBtn) {
        dom.statsModalCloseBtn.addEventListener('click', closeStatsModal);
    }
    if (dom.statsModal) {
        dom.statsModal.addEventListener('click', (e) => {
            if (e.target === dom.statsModal) {
                closeStatsModal();
            }
        });
    }
}