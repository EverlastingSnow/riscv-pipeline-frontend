<script setup lang="ts">
import { computed } from 'vue';
import { usePipelineStore } from '../stores/pipeline';
import DraggableModal from './DraggableModal.vue';
import { Database } from 'lucide-vue-next';

const pipelineStore = usePipelineStore();

const registers = computed(() => pipelineStore.registers);

const formatValue = (value: string | number): string => {
  const num = typeof value === 'string' ? parseInt(value, 16) : value;
  if (num === 0) return '0x0';
  return '0x' + num.toString(16).toUpperCase();
};

const hasValue = (value: string | number): boolean => {
  const num = typeof value === 'string' ? parseInt(value, 16) : value;
  return num !== 0;
};

const registerAliases: Record<string, string> = {
  'x0': 'zero', 'x1': 'ra', 'x2': 'sp', 'x3': 'gp', 'x4': 'tp',
  'x5': 't0', 'x6': 't1', 'x7': 't2',
  'x8': 's0/fp', 'x9': 's1',
  'x10': 'a0', 'x11': 'a1', 'x12': 'a2', 'x13': 'a3', 'x14': 'a4', 'x15': 'a5', 'x16': 'a6', 'x17': 'a7',
  'x18': 's2', 'x19': 's3', 'x20': 's4', 'x21': 's5', 'x22': 's6', 'x23': 's7',
  'x24': 's8', 'x25': 's9', 'x26': 's10', 'x27': 's11',
  'x28': 't3', 'x29': 't4', 'x30': 't5', 'x31': 't6'
};

const getAlias = (name: string): string => {
  return registerAliases[name] || '';
};
</script>

<template>
  <DraggableModal
    :show="pipelineStore.activeModals.includes('register')"
    title="通用寄存器堆"
    :no-overlay="true"
    @close="pipelineStore.closeModal('register')"
  >
    <div class="register-modal">
      <!-- 通用寄存器 -->
      <div class="register-section">
        <div class="section-header">
          <Database class="w-4 h-4" />
          <h4>通用寄存器 (x0-x31)</h4>
        </div>
        <div class="register-grid">
          <div
            v-for="reg in registers"
            :key="reg.name"
            class="register-item"
            :class="{ 'has-value': hasValue(reg.value) }"
          >
            <div class="reg-name">{{ reg.name }}<span v-if="getAlias(reg.name)" class="reg-alias">({{ getAlias(reg.name) }})</span></div>
            <div class="reg-value mono">{{ formatValue(reg.value) }}</div>
          </div>
        </div>
      </div>
    </div>
  </DraggableModal>
</template>

<style scoped>
.register-modal {
  @apply space-y-4;
}

.register-section {
  @apply border border-gray-200 rounded-lg overflow-hidden;
}

.section-header {
  @apply flex items-center gap-2 px-3 py-2 bg-gray-100 border-b border-gray-200;
}

.section-header h4 {
  @apply text-sm font-medium text-gray-700;
}

.register-grid {
  @apply grid grid-cols-4 gap-1 p-2;
}

.register-item {
  @apply flex flex-col items-center px-2 py-1 rounded;
  @apply hover:bg-gray-50 cursor-pointer transition-colors;
}

.reg-name {
  @apply text-xs font-medium text-gray-600;
}

.reg-alias {
  @apply text-xs text-gray-400 ml-0.5;
}

.reg-value {
  @apply text-xs text-gray-800 font-mono bg-gray-100 px-1 rounded mt-1;
}

.register-item.has-value {
  background-color: #dbeafe;
}

.register-item.has-value .reg-value {
  background-color: #069def;
  color: #ffffff;
}

.info-note {
  @apply text-xs text-gray-400 text-center;
}
</style>
