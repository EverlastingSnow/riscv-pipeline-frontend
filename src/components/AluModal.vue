<script setup lang="ts">
import { computed } from 'vue';
import { usePipelineStore } from '../stores/pipeline';
import DraggableModal from './DraggableModal.vue';
import { Calculator } from 'lucide-vue-next';

const pipelineStore = usePipelineStore();

/** 当前 ALU 的运算数据（操作数、运算类型、结果等），来自流水线状态仓库 */
const aluData = computed(() => pipelineStore.aluData);

/**
 * 将 ALU 操作助记符翻译为中文描述，用于界面友好展示。
 *
 * @returns {string} 当前 ALU 操作对应的中文名称
 */
const operationType = computed(() => {
  const op = aluData.value.operation;
  // R 型与 I 型算术运算分支
  if (op === 'ADD' || op === 'ADDI') return '加法';
  if (op === 'SUB') return '减法';
  // 位运算分支
  if (op === 'AND' || op === 'ANDI') return '与运算';
  if (op === 'OR' || op === 'ORI') return '或运算';
  if (op === 'XOR' || op === 'XORI') return '异或运算';
  // 移位运算分支
  if (op === 'SLL' || op === 'SLLI') return '逻辑左移';
  if (op === 'SRL' || op === 'SRLI') return '逻辑右移';
  if (op === 'SRA' || op === 'SRAI') return '算术右移';
  // 比较运算分支
  if (op === 'SLT') return '小于比较';
  if (op === 'SLTI') return '小于比较(立即数)';
  // 加载指令分支（ALU 仅计算地址）
  if (op === 'LB' || op === 'LH' || op === 'LW' || op === 'LBU' || op === 'LHU') return '加载';
  // 未识别时直接显示原文
  return op;
});

/**
 * 将 64 位十六进制字符串转换为定长 64 位二进制字符串，便于在界面上对齐展示。
 *
 * @param {string} hex - 待转换的十六进制字符串（可带 0x/0X 前缀）
 * @returns {string} 长度固定为 64 位的二进制表示
 */
function hexToBinary(hex: string): string {
  // 兼容空值与 0 的情况，统一返回 64 位全 0
  if (!hex || hex === '0x0' || hex === '0X0') {
    return '0'.padStart(64, '0');
  }
  // 去掉 0x/0X 前缀后转 BigInt，避免 32 位 JS 数值溢出
  const hexVal = hex.startsWith('0x') || hex.startsWith('0X') ? hex.slice(2) : hex;
  const bigIntVal = BigInt('0x' + hexVal);
  // toString(2) 转为二进制，再左侧补 0 至 64 位
  return bigIntVal.toString(2).padStart(64, '0');
}
</script>

<template>
  <DraggableModal
    :show="pipelineStore.activeModals.includes('alu')"
    title="ALU 详情"
    :no-overlay="true"
    @close="pipelineStore.closeModal('alu')"
  >
    <div class="alu-modal">
      <!-- ALU 基本信息头部：图标 + 标题与功能描述 -->
      <div class="alu-header">
        <Calculator class="w-8 h-8 text-blue-500" />
        <div class="alu-title">
          <h3>算术逻辑单元 (ALU)</h3>
          <p>执行算术和逻辑运算</p>
        </div>
      </div>

      <!-- 操作数区域：展示参与运算的两个原始值 -->
      <div class="operands-section">
        <h4>操作数</h4>
        <div class="operand-list">
          <div class="operand-item">
            <span class="operand-label">操作数 1</span>
            <span class="operand-value mono">{{ aluData.operand1 }}</span>
          </div>
          <div class="operand-item">
            <span class="operand-label">操作数 2</span>
            <span class="operand-value mono">{{ aluData.operand2 }}</span>
          </div>
        </div>
      </div>

      <!-- 运算类型区域：显示助记符与中文语义 -->
      <div class="operation-section">
        <h4>运算类型</h4>
        <div class="operation-badge">
          {{ aluData.operation }} - {{ operationType }}
        </div>
      </div>

      <!-- 运算结果区域：突出显示 ALU 输出的最终值 -->
      <div class="result-section">
        <h4>运算结果</h4>
        <div class="result-value mono">
          {{ aluData.result }}
        </div>
      </div>

      <!-- 二进制表示区域：方便从比特层面观察运算细节 -->
      <div class="binary-section">
        <h4>二进制表示</h4>
        <div class="binary-grid">
          <div class="binary-item">
            <span class="binary-label">Operand1</span>
            <span class="binary-value mono">{{ hexToBinary(aluData.operand1) }}</span>
          </div>
          <div class="binary-item">
            <span class="binary-label">Operand2</span>
            <span class="binary-value mono">{{ hexToBinary(aluData.operand2) }}</span>
          </div>
          <div class="binary-item result">
            <span class="binary-label">Result</span>
            <span class="binary-value mono">{{ hexToBinary(aluData.result) }}</span>
          </div>
        </div>
      </div>
    </div>
  </DraggableModal>
</template>

<style scoped>
.alu-modal {
  @apply space-y-4;
}

.alu-header {
  @apply flex items-center gap-3 p-3 bg-blue-50 rounded-lg;
}

.alu-title h3 {
  @apply text-lg font-semibold text-gray-800;
}

.alu-title p {
  @apply text-sm text-gray-600;
}

.section-title {
  @apply text-sm font-medium text-gray-700 mb-2;
}

.operands-section,
.operation-section,
.result-section,
.binary-section {
  @apply border border-gray-200 rounded-lg p-3;
}

.operand-list {
  @apply flex items-center justify-center gap-4;
}

.operand-item {
  @apply flex flex-col items-center;
}

.operand-label {
  @apply text-xs text-gray-500 mb-1;
}

.operand-value {
  @apply text-lg font-mono bg-gray-100 px-3 py-1 rounded;
}

.operand-arrow {
  @apply text-gray-400;
}

.operation-badge {
  @apply inline-block px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium;
}

.result-value {
  @apply text-2xl font-mono text-center bg-gray-100 px-4 py-2 rounded-lg;
}

.binary-grid {
  @apply space-y-2;
}

.binary-item {
  @apply flex justify-between items-center;
}

.binary-item.result {
  @apply bg-yellow-50 px-2 py-1 rounded;
}

.binary-label {
  @apply text-xs text-gray-500;
}

.binary-value {
  @apply text-xs font-mono text-gray-700;
}
</style>
