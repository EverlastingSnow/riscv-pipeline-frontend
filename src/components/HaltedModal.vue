<script setup lang="ts">
import { computed } from 'vue';
import { usePipelineStore } from '../stores/pipeline';
import DraggableModal from './DraggableModal.vue';
import { CheckCircle } from 'lucide-vue-next';

const pipelineStore = usePipelineStore();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const haltedInfo = computed(() => pipelineStore.haltedState);
</script>

<template>
  <DraggableModal
    :show="!!haltedInfo"
    title="程序停止"
    @close="emit('close')"
  >
    <div class="halted-modal" v-if="haltedInfo">
      <div class="result-header">
        <CheckCircle class="w-10 h-10 text-green-500" />
        <div class="result-title">
          <h3>程序已停止</h3>
          <p v-if="haltedInfo.reason === 'ecall'">遇到 ECALL 指令</p>
          <p v-else-if="haltedInfo.reason === 'ebreak'">遇到 EBREAK 指令</p>
          <p v-else>程序执行结束</p>
        </div>
      </div>

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
