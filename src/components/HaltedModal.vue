<script setup lang="ts">
import { computed } from 'vue';
import { usePipelineStore } from '../stores/pipeline';
import DraggableModal from './DraggableModal.vue';
import { CheckCircle } from 'lucide-vue-next';

const pipelineStore = usePipelineStore();

/**
 * 组件 Emits 定义
 * @event close 当用户点击弹窗关闭按钮时触发，通知父组件关闭弹窗
 */
const emit = defineEmits<{
  (e: 'close'): void;
}>();

/**
 * 流水线停止状态信息
 * 包含 reason（停止原因）与 pc（停止时的程序计数器）等字段
 * 当为 null 时弹窗隐藏
 */
const haltedInfo = computed(() => pipelineStore.haltedState);
</script>

<template>
  <!-- 程序停止原因弹窗：仅当 haltedInfo 存在时显示 -->
  <DraggableModal
    :show="!!haltedInfo"
    title="程序停止"
    @close="emit('close')"
  >
    <!-- 弹窗主体：显示停止原因与 PC 等信息 -->
    <div class="halted-modal" v-if="haltedInfo">
      <!-- 顶部结果摘要：图标 + 标题 + 停止原因描述 -->
      <div class="result-header">
        <CheckCircle class="w-10 h-10 text-green-500" />
        <div class="result-title">
          <h3>程序已停止</h3>
          <!-- 根据停止原因显示对应的中文描述 -->
          <p v-if="haltedInfo.reason === 'ecall'">遇到 ECALL 指令</p>
          <p v-else-if="haltedInfo.reason === 'ebreak'">遇到 EBREAK 指令</p>
          <p v-else>程序执行结束</p>
        </div>
      </div>

      <!-- 详细信息区域：展示原始 reason 与停止时的 PC 值 -->
      <div class="info-section">
        <div class="info-row">
          <span class="label">停止原因:</span>
          <span class="value">{{ haltedInfo.reason }}</span>
        </div>
        <div class="info-row">
          <span class="label">PC:</span>
          <span class="value">{{ haltedInfo.pc }}</span>
        </div>
      </div>

      <!-- 操作提示：引导用户使用关闭按钮 -->
      <div class="info-hint">
        点击右上角关闭按钮关闭窗口
      </div>
    </div>
  </DraggableModal>
</template>

<style scoped>
.halted-modal {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.result-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1rem;
  border-radius: 0.5rem;
  background-color: #f0fdf4;
  border: 1px solid #bbf7d0;
}

.result-title h3 {
  font-size: 1.125rem;
  font-weight: 600;
  color: #1f2937;
}

.result-title p {
  font-size: 0.875rem;
  color: #4b5563;
}

.info-section {
  padding: 0.75rem;
  background-color: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 0.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.info-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.info-row .label {
  font-size: 0.875rem;
  color: #4b5563;
}

.info-row .value {
  font-size: 0.875rem;
  font-family: monospace;
  color: #1f2937;
}

.info-hint {
  font-size: 0.875rem;
  color: #6b7280;
  text-align: center;
  padding-top: 0.5rem;
}
</style>
