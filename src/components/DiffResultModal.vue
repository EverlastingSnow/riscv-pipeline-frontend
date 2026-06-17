<script setup lang="ts">
import { computed } from 'vue';
import { usePipelineStore } from '../stores/pipeline';
import DraggableModal from './DraggableModal.vue';
import {
  AlertTriangle,
  CheckCircle,
  XCircle,
  Square,
  ArrowRight
} from 'lucide-vue-next';

const pipelineStore = usePipelineStore();

/**
 * 组件事件定义。
 *
 * @event close - 请求关闭弹窗时触发
 */
const emit = defineEmits<{
  (e: 'close'): void;
}>();

/** 当前差异比对结果（golden vs user），null 表示没有结果不展示弹窗 */
const diffResult = computed(() => pipelineStore.compareResult);

/**
 * 停止差分测试：通知 store 停止后续运行，并通知父组件关闭弹窗。
 *
 * @returns {void}
 */
function stopRun() {
  // 终止后端继续跑当前用例
  pipelineStore.stopAfterDiff();
  // 通知父组件关闭自身
  emit('close');
}
</script>

<template>
  <DraggableModal
    :show="!!diffResult"
    title="差异检测结果"
    @close="emit('close')"
  >
    <!-- 仅在有 diffResult 时才渲染内容，避免空数据访问 -->
    <div class="diff-result-modal" v-if="diffResult">
      <!-- 顶部状态头：根据是否检测到差异切换错误样式 -->
      <div class="result-header" :class="{ error: diffResult.detected }">
        <AlertTriangle class="w-10 h-10 text-red-500" />
        <div class="result-title">
          <h3>{{ diffResult.detected ? '检测到差异!' : '无差异' }}</h3>
          <p>比较阶段: {{ diffResult.stage }}</p>
        </div>
      </div>

      <!-- 附加说明信息：后端在某些情况下会附带文字解释 -->
      <div class="message-section" v-if="diffResult.message">
        <p>{{ diffResult.message }}</p>
      </div>

      <!-- 状态对比区域：左右并排展示 golden 与 user 的寄存器写回情况 -->
      <div class="comparison-section">
        <div class="comparison-header">
          <h4>状态对比</h4>
        </div>

        <div class="comparison-grid">
          <!-- Golden 列：后端默认的标准结果 -->
          <div class="comparison-column golden">
            <div class="column-header">
              <CheckCircle class="w-4 h-4 text-green-500" />
              <span>Golden (后端默认)</span>
            </div>
            <div class="column-content">
              <div class="info-row">
                <span class="label">PC:</span>
                <span class="value">{{ diffResult.goldenPC || 'N/A' }}</span>
              </div>
              <!-- 仅当 goldenResult 存在时展示寄存器写回详情 -->
              <template v-if="diffResult.goldenResult">
                <div class="info-row">
                  <span class="label">RegWrite:</span>
                  <span class="value">{{ diffResult.goldenResult.regWrite ? '1' : '0' }}</span>
                </div>
                <div class="info-row">
                  <span class="label">写地址:</span>
                  <span class="value">x{{ diffResult.goldenResult.waddr }}</span>
                </div>
                <div class="info-row">
                  <span class="label">写数据:</span>
                  <span class="value">{{ diffResult.goldenResult.wdata }}</span>
                </div>
              </template>
            </div>
          </div>

          <!-- 中间箭头：视觉上表示对比方向 -->
          <div class="comparison-arrow">
            <ArrowRight class="w-6 h-6 text-gray-400" />
          </div>

          <!-- User 列：用户输入/前端模拟的结果，与 golden 对比 -->
          <div class="comparison-column user">
            <div class="column-header">
              <XCircle class="w-4 h-4 text-red-500" />
              <span>User (您的输入)</span>
            </div>
            <div class="column-content">
              <div class="info-row">
                <span class="label">PC:</span>
                <span class="value">{{ diffResult.userPC || 'N/A' }}</span>
              </div>
              <!-- 仅当 userResult 存在时展示寄存器写回详情；不一致字段加 mismatch 高亮 -->
              <template v-if="diffResult.userResult">
                <div class="info-row">
                  <span class="label">RegWrite:</span>
                  <span class="value" :class="{ mismatch: diffResult.goldenResult?.regWrite !== diffResult.userResult?.regWrite }">
                    {{ diffResult.userResult.regWrite ? '1' : '0' }}
                  </span>
                </div>
                <div class="info-row">
                  <span class="label">写地址:</span>
                  <span class="value" :class="{ mismatch: diffResult.goldenResult?.waddr !== diffResult.userResult?.waddr }">
                    x{{ diffResult.userResult.waddr }}
                  </span>
                </div>
                <div class="info-row">
                  <span class="label">写数据:</span>
                  <span class="value" :class="{ mismatch: diffResult.goldenResult?.wdata !== diffResult.userResult?.wdata }">
                    {{ diffResult.userResult.wdata }}
                  </span>
                </div>
              </template>
            </div>
          </div>
        </div>
      </div>

      <!-- 操作区：提供停止测试的醒目按钮 -->
      <div class="actions">
        <button class="btn-stop-full" @click="stopRun">
          <Square class="w-4 h-4" />
          停止测试
        </button>
      </div>
    </div>
  </DraggableModal>
</template>

<style scoped>
.diff-result-modal {
  @apply space-y-4;
}

.result-header {
  @apply flex items-center gap-3 p-4 rounded-lg;
  @apply bg-green-50 border border-green-200;
}

.result-header.error {
  @apply bg-red-50 border-red-200;
}

.result-title h3 {
  @apply text-lg font-semibold text-gray-800;
}

.result-title p {
  @apply text-sm text-gray-600;
}

.message-section {
  @apply p-3 bg-yellow-50 border border-yellow-200 rounded-lg;
}

.message-section p {
  @apply text-sm text-yellow-800;
}

.comparison-section {
  @apply border border-gray-200 rounded-lg overflow-hidden;
}

.comparison-header {
  @apply px-3 py-2 bg-gray-100 border-b border-gray-200;
}

.comparison-header h4 {
  @apply text-sm font-medium text-gray-700;
}

.comparison-grid {
  @apply grid grid-cols-3 gap-2 p-3;
}

.comparison-column {
  @apply border rounded-lg overflow-hidden;
}

.comparison-column.golden {
  @apply border-green-200;
}

.comparison-column.user {
  @apply border-red-200;
}

.column-header {
  @apply flex items-center gap-2 px-3 py-2 text-sm font-medium;
}

.comparison-column.golden .column-header {
  @apply bg-green-50 text-green-700;
}

.comparison-column.user .column-header {
  @apply bg-red-50 text-red-700;
}

.column-content {
  @apply p-2 space-y-2;
}

.info-row {
  @apply flex justify-between items-center text-sm;
}

.info-row .label {
  @apply text-gray-500;
}

.info-row .value {
  @apply font-mono text-gray-800;
}

.info-row .value.mismatch {
  @apply text-red-600 font-bold;
}

.comparison-arrow {
  @apply flex items-center justify-center;
}

.actions {
  @apply flex justify-center pt-2;
}

.btn-stop-full {
  @apply flex items-center justify-center gap-2 w-full px-4 py-3 text-white bg-red-500 rounded-lg hover:bg-red-600 transition-colors font-medium;
}
</style>
