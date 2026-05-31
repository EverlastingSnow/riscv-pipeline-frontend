<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';

const API_URL = '/api/stats';

const visitCount = ref('--');
const totalTime = ref(0);
const loading = ref(true);
const error = ref(false);
let pollInterval: number | null = null;

const startDate = ref('2026-03-27');
const endDate = ref(getToday());
const isFiltered = ref(true);
const showResult = ref(false);
const dailyStats = ref<{ date: string; total_time: number; visit_count: number }[]>([]);

function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}秒`;
  } else if (seconds < 3600) {
    const mins = Math.floor(seconds / 60);
    return `${mins}分`;
  } else {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${hours}小时${mins}分`;
  }
}

function getToday(): string {
  const today = new Date();
  return today.toISOString().split('T')[0] as string;
}

function buildStatsUrl(start?: string, end?: string): string {
  const params: string[] = [];
  if (start) params.push(`start=${start}`);
  if (end) params.push(`end=${end}`);
  return params.length > 0 ? `${API_URL}?${params.join('&')}` : API_URL;
}

async function fetchStats(url: string = buildStatsUrl(startDate.value, endDate.value)) {
  try {
    loading.value = true;
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
    console.error('[UsageStats] Fetch error:', e);
    error.value = true;
  } finally {
    loading.value = false;
  }
}

async function searchByDate() {
  if (!startDate.value && !endDate.value) {
    isFiltered.value = false;
    showResult.value = false;
    await fetchStats(buildStatsUrl());
    return;
  }

  isFiltered.value = true;
  showResult.value = false;
  await fetchStats(buildStatsUrl(startDate.value, endDate.value));
  setTimeout(() => {
    showResult.value = true;
  }, 50);
}

function clearFilter() {
  startDate.value = '2026-03-27';
  endDate.value = getToday();
  isFiltered.value = true;
  showResult.value = false;
  fetchStats(buildStatsUrl(startDate.value, endDate.value));
  setTimeout(() => {
    showResult.value = true;
  }, 50);
}

onMounted(() => {
  fetchStats(buildStatsUrl(startDate.value, endDate.value));
  pollInterval = window.setInterval(() => {
    fetchStats(buildStatsUrl(startDate.value, endDate.value));
  }, 30000);
});

onUnmounted(() => {
  if (pollInterval) {
    clearInterval(pollInterval);
  }
});
</script>

<template>
  <div class="usage-stats">
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
    
    <!-- <div class="stats-row">
      <span class="stats-item">
        <span class="label">总访问：</span>
        <span class="value">{{ visitCount }} 次</span>
      </span>
      <span class="separator">|</span>
      <span class="stats-item">
        <span class="label">累计：</span>
        <span class="value">{{ formatDuration(totalTime) }}</span>
      </span>
    </div> -->
    <div class="stats-row developer-row">
      <span>研制者：杭州电子科技大学 网络空间安全省级实验教学示范中心&工业互联网研究院</span>
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
  font-weight: 700;
  color: #6f7b8f;
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
