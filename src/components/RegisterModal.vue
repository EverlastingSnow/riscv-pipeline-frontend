<script setup lang="ts">
import { computed } from 'vue';
import { usePipelineStore } from '../stores/pipeline';
import DraggableModal from './DraggableModal.vue';
import { Database } from 'lucide-vue-next';

const pipelineStore = usePipelineStore();

/**
 * 当前流水线状态中的通用寄存器集合
 * 每个元素包含 name（如 x0、x1 等）与 value（寄存器值，可能为十六进制字符串或数字）
 */
const registers = computed(() => pipelineStore.registers);

/**
 * 将寄存器值格式化为统一的十六进制显示字符串
 * @param {string | number} value 寄存器原始值，支持字符串（如 "0x1A"）或数字
 * @returns {string} 规范化后的十六进制字符串（如 "0x1A"）；空值或零值统一显示为 "0x0"
 */
const formatValue = (value: string | number): string => {
  // 空值或仅有前缀的占位值统一归零显示
  if (!value || value === '0x' || value === '0X') return '0x0';
  const strVal = typeof value === 'string' ? value : value.toString();
  // 去掉 "0x" / "0X" 前缀，便于后续通过 BigInt 解析
  const hexVal = strVal.startsWith('0x') || strVal.startsWith('0X') ? strVal.slice(2) : strVal;
  try {
    // 使用 BigInt 解析以支持 64 位 RISC-V 寄存器宽度的数值
    const bigIntVal = BigInt('0x' + hexVal);
    // 零值显示 "0x0" 而不是 "0x00...0"
    if (bigIntVal === BigInt(0)) return '0x0';
    return '0x' + bigIntVal.toString(16).toUpperCase().padStart(1, '0');
  } catch {
    // 解析失败时回退显示原始字符串
    return strVal;
  }
};

/**
 * 判断寄存器是否持有非零值
 * @param {string | number} value 寄存器原始值
 * @returns {boolean} 非零返回 true，用于 UI 上的高亮显示
 */
const hasValue = (value: string | number): boolean => {
  // 空值或仅有前缀的占位值视为零
  if (!value || value === '0x' || value === '0X') return false;
  const strVal = typeof value === 'string' ? value : value.toString();
  const hexVal = strVal.startsWith('0x') || strVal.startsWith('0X') ? strVal.slice(2) : strVal;
  try {
    // 通过 BigInt 与零比较，避免数字精度丢失
    return BigInt('0x' + hexVal) !== BigInt(0);
  } catch {
    return false;
  }
};

/**
 * RISC-V 通用寄存器别名表
 * 键为 ABI 寄存器编号（x0-x31），值为对应的助记符（如 ra、sp、a0 等）
 */
const registerAliases: Record<string, string> = {
  'x0': 'zero', 'x1': 'ra', 'x2': 'sp', 'x3': 'gp', 'x4': 'tp',
  'x5': 't0', 'x6': 't1', 'x7': 't2',
  'x8': 's0/fp', 'x9': 's1',
  'x10': 'a0', 'x11': 'a1', 'x12': 'a2', 'x13': 'a3', 'x14': 'a4', 'x15': 'a5', 'x16': 'a6', 'x17': 'a7',
  'x18': 's2', 'x19': 's3', 'x20': 's4', 'x21': 's5', 'x22': 's6', 'x23': 's7',
  'x24': 's8', 'x25': 's9', 'x26': 's10', 'x27': 's11',
  'x28': 't3', 'x29': 't4', 'x30': 't5', 'x31': 't6'
};

/**
 * 获取寄存器的 ABI 别名
 * @param {string} name 寄存器编号（x0-x31）
 * @returns {string} 别名字符串，未找到时返回空串
 */
const getAlias = (name: string): string => {
  return registerAliases[name] || '';
};
</script>

<template>
  <!-- 通用寄存器弹窗：受 pipelineStore.activeModals 控制显隐 -->
  <DraggableModal
    :show="pipelineStore.activeModals.includes('register')"
    title="通用寄存器堆"
    :no-overlay="true"
    @close="pipelineStore.closeModal('register')"
  >
    <!-- 寄存器弹窗内容容器 -->
    <div class="register-modal">
      <!-- 通用寄存器区域：x0-x31 共 32 个寄存器 -->
      <div class="register-section">
        <div class="section-header">
          <Database class="w-4 h-4" />
          <h4>通用寄存器 (x0-x31)</h4>
        </div>
        <!-- 寄存器网格：以 4 列展示所有通用寄存器项 -->
        <div class="register-grid">
          <!-- 单个寄存器项：非零时高亮显示 -->
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
