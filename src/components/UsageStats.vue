<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';

/** 后端使用统计接口地址 */
const API_URL = '/api/stats';

/** 访问次数（字符串 "--" 表示尚未加载完成） */
const visitCount = ref('--');
/** 累计使用时长（秒） */
const totalTime = ref(0);
/** 是否正在加载统计数据 */
const loading = ref(true);
/** 是否发生请求错误 */
const error = ref(false);
/** 轮询定时器句柄，用于组件卸载时清理 */
let pollInterval: number | null = null;

/** 查询起始日期 */
const startDate = ref('2026-03-27');
/** 查询结束日期 */
const endDate = ref(getToday());
/** 是否应用了日期过滤 */
const isFiltered = ref(true);
/** 是否展示带动画的查询结果行 */
const showResult = ref(false);
/** 按日聚合的统计数据 */
const dailyStats = ref<{ date: string; total_time: number; visit_count: number }[]>([]);

/**
 * 将秒数格式化为中文友好展示的时长字符串
 *
 * @param {number} seconds - 待格式化的秒数
 * @returns {string} 形如 "5分"、"2小时30分" 的字符串
 */
function formatDuration(seconds: number): string {
  // 不足 1 分钟：直接以秒为单位
  if (seconds < 60) {
    return `${seconds}秒`;
  } else if (seconds < 3600) {
    // 不足 1 小时：仅展示分钟
    const mins = Math.floor(seconds / 60);
    return `${mins}分`;
  } else {
    // 超过 1 小时：拼接小时与分钟
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${hours}小时${mins}分`;
  }
}

/**
 * 获取当前日期（YYYY-MM-DD 格式）
 *
 * @returns {string} 今日的 ISO 日期字符串
 */
function getToday(): string {
  const today = new Date();
  return today.toISOString().split('T')[0] as string;
}

/**
 * 拼接带查询参数的统计接口 URL
 *
 * @param {string} [start] - 起始日期，缺省时不附加
 * @param {string} [end] - 结束日期，缺省时不附加
 * @returns {string} 完整的接口地址
 */
function buildStatsUrl(start?: string, end?: string): string {
  const params: string[] = [];
  if (start) params.push(`start=${start}`);
  if (end) params.push(`end=${end}`);
  return params.length > 0 ? `${API_URL}?${params.join('&')}` : API_URL;
}

/**
 * 异步拉取统计接口数据并写入本地响应式状态
 * 包含 loading 状态切换、错误捕获与 finally 清理
 *
 * @param {string} [url] - 自定义接口地址，默认使用当前过滤区间
 * @returns {Promise<void>}
 */
async function fetchStats(url: string = buildStatsUrl(startDate.value, endDate.value)) {
  try {
    loading.value = true;
    // 异步请求：等待后端返回使用统计
    const response = await fetch(url);
    if (response.ok) {
      const data = await response.json();
      totalTime.value = data.total_time || 0;
      visitCount.value = data.visit_count || 0;
      if (data.daily) {
        dailyStats.value = data.daily;
      }
      error.value = false;
    } else {
      error.value = true;
    }
  } catch (e) {
    // 网络层异常时打印错误便于排查
    console.error('[UsageStats] Fetch error:', e);
    error.value = true;
  } finally {
    // 无论成功失败都要复位 loading 状态
    loading.value = false;
  }
}

/**
 * 按用户选择的起止日期进行查询
 * 无日期时退回到不附加参数的全量查询
 *
 * @returns {Promise<void>}
 */
async function searchByDate() {
  // 起始与结束日期均为空时，视为清除过滤
  if (!startDate.value && !endDate.value) {
    isFiltered.value = false;
    showResult.value = false;
    await fetchStats(buildStatsUrl());
    return;
  }

  isFiltered.value = true;
  showResult.value = false;
  await fetchStats(buildStatsUrl(startDate.value, endDate.value));
  // 短暂延时后显示结果，触发淡入动画
  setTimeout(() => {
    showResult.value = true;
  }, 50);
}

/**
 * 重置日期过滤为默认区间（项目起始日 → 今日）并重新查询
 *
 * @returns {void}
 */
function clearFilter() {
  startDate.value = '2026-03-27';
  endDate.value = getToday();
  isFiltered.value = true;
  showResult.value = false;
  fetchStats(buildStatsUrl(startDate.value, endDate.value));
  // 延时显示结果，复用淡入动画
  setTimeout(() => {
    showResult.value = true;
  }, 50);
}

/**
 * 组件挂载：立即拉取一次数据，并启动 30 秒一次的轮询
 * 轮询用于在用户长时间停留时刷新统计
 */
onMounted(() => {
  fetchStats(buildStatsUrl(startDate.value, endDate.value));
  // 定时轮询：每 30 秒自动刷新统计数据
  pollInterval = window.setInterval(() => {
    fetchStats(buildStatsUrl(startDate.value, endDate.value));
  }, 30000);
});

/**
 * 组件卸载：清理轮询定时器，避免内存泄漏
 */
onUnmounted(() => {
  if (pollInterval) {
    clearInterval(pollInterval);
  }
});
</script>

<template>
  <div class="usage-stats">
    <!-- 顶部：日期过滤与查询结果 -->
    <div class="date-filter">
      <input
        type="date"
        v-model="startDate"
        class="date-input"
        placeholder="开始日期"
      />
      <span class="date-separator">至</span>
      <input
        type="date"
        v-model="endDate"
        class="date-input"
        placeholder="结束日期"
      />
      <button @click="searchByDate" class="search-btn">查询</button>
      <button v-if="isFiltered" @click="clearFilter" class="clear-btn">清除</button>
      <!-- 查询结果行：过滤态下展示，按 show 切换淡入动画 -->
      <div v-if="isFiltered" class="stats-row result-row" :class="{ 'show': showResult }">
        <span class="stats-item">
          <span class="label">查询结果: 访问:</span>
          <span class="value">{{ visitCount }}次</span>
          <span class="separator">|</span>
          <span class="label">累计:</span>
          <span class="value">{{ formatDuration(totalTime) }}</span>
        </span>
      </div>
    </div>
    <!-- 底部：研制者信息 -->
    <div class="stats-row developer-row">
      <span>研制者：杭州电子科技大学 工业互联网研究院</span>
    </div>
  </div>
</template>

<style scoped>
.usage-stats {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 0.25rem;
  padding: 0.5rem 1rem;
  font-size: 0.875rem;
  color: #6f7b8f;
}

.date-filter {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.25rem;
}

.date-input {
  padding: 0.25rem 0.5rem;
  border: 1px solid #d1d5db;
  border-radius: 0.25rem;
  font-size: 0.75rem;
  color: #374151;
  background-color: white;
  cursor: pointer;
  width: 6.875rem;
}

.date-input::-webkit-calendar-picker-indicator {
  cursor: pointer;
  opacity: 0.6;
}

.date-input::-webkit-calendar-picker-indicator:hover {
  opacity: 1;
}

.date-separator {
  color: #9ca3af;
}

.search-btn,
.clear-btn {
  padding: 0.25rem 0.75rem;
  border: none;
  border-radius: 0.25rem;
  font-size: 0.75rem;
  cursor: pointer;
  transition: all 0.2s;
}

.search-btn {
  background-color: #3b82f6;
  color: white;
}

.search-btn:hover {
  background-color: #2563eb;
}

.clear-btn {
  background-color: #9ca3af;
  color: white;
}

.clear-btn:hover {
  background-color: #6b7280;
}

.stats-row {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 1rem;
}

.developer-row {
  font-size: 0.8125rem;
  font-weight: 500;
  letter-spacing: 0.05em;
  color: #94a3b8;
  font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", "Helvetica Neue", Arial, sans-serif;
  margin-top: -0.25rem;
  padding: 0.125rem 0;
}

.result-row {
  opacity: 0;
  transform: translateY(-0.3125rem);
  transition: opacity 0.4s ease-out, transform 0.4s ease-out, color 0.4s ease-out;
  color: #9ca3af;
}

.result-row.show {
  opacity: 1;
  transform: translateY(0);
  color: #069def;
}

.stats-item {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.label {
  color: #6f7b8f;
}

.value {
  font-family: 'Courier New', monospace;
  font-weight: 700;
  color: #6f7b8f;
}

.separator {
  color: #9CA3AF;
}

.daily-list {
  max-height: 6rem;
  overflow-y: auto;
  margin-top: 0.25rem;
  padding: 0.25rem;
  background-color: #f9fafb;
  border-radius: 0.25rem;
  width: 100%;
}

.daily-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.125rem 0.5rem;
  font-size: 0.75rem;
}

.daily-item:nth-child(odd) {
  background-color: #f3f4f6;
}

.daily-date {
  color: #374151;
  font-weight: 500;
}

.daily-visit,
.daily-time {
  color: #6b7280;
  font-family: 'Courier New', monospace;
}
</style>
