import * as dataService from '../services/dataService.js';

// DOM 元素引用
const statsModal = document.getElementById('statsModal');
const statsModalCloseBtn = document.getElementById('statsModalCloseBtn');
const statsChartCanvas = document.getElementById('statsChart');
let chartInstance = null; // 用于存储 Chart.js 实例

/**
 * 渲染统计图表
 * @param {object} chartData - 格式为 { labels, datasets } 的数据
 */
function renderChart(chartData) {
    // 如果已有图表实例，先销毁
    if (chartInstance) {
        chartInstance.destroy();
    }

    const ctx = statsChartCanvas.getContext('2d');
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
    if (statsModal) {
        statsModal.style.display = 'flex';
        // 显示加载动画或提示
        renderChart({ labels: [], datasets: [] }); // 清空旧图表
        
        // 异步获取数据并渲染
        const chartData = await dataService.anki_getReviewStatsForChart();
        renderChart(chartData);
    }
}

/**
 * 关闭统计模态框
 */
export function closeStatsModal() {
    if (statsModal) {
        statsModal.style.display = 'none';
        // 销毁图表实例以释放内存
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
    if (statsModalCloseBtn) {
        statsModalCloseBtn.addEventListener('click', closeStatsModal);
    }
    // 点击模态框外部区域也可以关闭
    if (statsModal) {
        statsModal.addEventListener('click', (e) => {
            if (e.target === statsModal) {
                closeStatsModal();
            }
        });
    }
}