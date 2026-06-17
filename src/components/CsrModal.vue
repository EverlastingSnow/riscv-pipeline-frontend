/**
 * CSR 寄存器弹窗组件
 * 作用：以表格 + 位分解的形式，集中展示 RISC-V Machine-mode 下
 *      mtvec / mepc / mcause / mtval / mstatus / mie / mip 等关键 CSR 寄存器的当前值
 */
<script setup lang="ts">
import { computed } from 'vue';
import { usePipelineStore } from '../stores/pipeline';
import DraggableModal from './DraggableModal.vue';
import { Settings } from 'lucide-vue-next';

/** 全局流水线状态存储：从中读取 CSR 寄存器快照与最近一次 Trap 类型 */
const pipelineStore = usePipelineStore();

/** 当前 CSR 寄存器快照（含 mtvec/mepc/mcause/mtval/mstatus/mie/mip 等字段） */
const csrState = computed(() => pipelineStore.csrState);

/**
 * 将任意形式（数字 / 字符串 / 0x 开头）的 CSR 值规范成统一大写 0x 十六进制字符串
 * 空值与 0 统一展示为 '0x0'，避免前端出现 '0x' / '0' 等不一致显示
 * @param value CSR 原始值
 * @returns 规范化后的十六进制字符串
 */
const formatValue = (value: string | number | undefined): string => {
  if (value === undefined || value === null || value === '' || value === '0x' || value === '0X') return '0x0';
  const strVal = typeof value === 'string' ? value : value.toString();
  // 去掉可能存在的 0x 前缀，统一走 BigInt 解析避免 JS Number 精度丢失
  const hexVal = strVal.startsWith('0x') || strVal.startsWith('0X') ? strVal.slice(2) : strVal;
  try {
    const bigIntVal = BigInt('0x' + hexVal);
    if (bigIntVal === BigInt(0)) return '0x0';
    return '0x' + bigIntVal.toString(16).toUpperCase().padStart(1, '0');
  } catch {
    return strVal;
  }
};

/**
 * 判断 CSR 值是否非零（用于给非零寄存器加高亮样式）
 * @param value CSR 原始值
 * @returns 是否存在非零有效数据
 */
const hasValue = (value: string | number | undefined): boolean => {
  if (value === undefined || value === null || value === '' || value === '0x' || value === '0X') return false;
  const strVal = typeof value === 'string' ? value : value.toString();
  const hexVal = strVal.startsWith('0x') || strVal.startsWith('0X') ? strVal.slice(2) : strVal;
  try {
    return BigInt('0x' + hexVal) !== BigInt(0);
  } catch {
    return false;
  }
};

/**
 * 将十六进制字符串转换为固定宽度的二进制字符串
 * 用于 mstatus / mie / mip 的按位分解展示
 * @param hex 待转换的 hex 字符串
 * @param width 目标位数（默认 64 位）
 * @returns 左侧补 0 的二进制字符串
 */
const hexToBinary = (hex: string | undefined, width = 64): string => {
  if (!hex || hex === '0x0' || hex === '0X0') return '0'.padStart(width, '0');
  const hexVal = hex.startsWith('0x') || hex.startsWith('0X') ? hex.slice(2) : hex;
  try {
    return BigInt('0x' + hexVal).toString(2).padStart(width, '0');
  } catch {
    return '0'.padStart(width, '0');
  }
};

/**
 * CSR 字段描述结构
 * @property bit   位索引（0 表示最低位）
 * @property name  字段/位名（如 MIE、MSIP）
 * @property desc  字段含义说明
 */
interface CsrField {
  bit: number;
  name: string;
  desc: string;
}

/** mstatus 中重点关注的状态位：MIE / MPIE / MPP */
const mstatusFields: CsrField[] = [
  { bit: 3,  name: 'MIE',  desc: 'Machine Interrupt Enable' },
  { bit: 7,  name: 'MPIE', desc: 'Previous MIE (saved on trap)' },
  { bit: 12, name: 'MPP',  desc: 'Previous Privilege (2 bits)' },
];

/** mie / mip 共用的关键中断位定义（MSIP 软件中断 / MTIP 定时器中断 / MEIP 外部中断） */
const interruptBits: CsrField[] = [
  { bit: 3,  name: 'MSIP',  desc: 'Machine Software Interrupt Pending' },
  { bit: 7,  name: 'MTIP',  desc: 'Machine Timer Interrupt Pending' },
  { bit: 11, name: 'MEIP',  desc: 'Machine External Interrupt Pending' },
];

/**
 * CSR 寄存器列表（含名称 / 地址 / 说明 / 当前值），供表格区域 v-for 渲染
 * 地址取自 RISC-V Machine-mode 标准 CSR 地址空间
 */
const csrRows = computed(() => {
  const csr = csrState.value;
  return [
    { name: 'mtvec',  addr: '0x305', desc: 'Trap 向量基址 (handler 入口)',         value: csr?.mtvec },
    { name: 'mepc',   addr: '0x341', desc: 'Trap 时保存的 PC (mret 目标)',         value: csr?.mepc },
    { name: 'mcause', addr: '0x342', desc: 'Trap 原因 (高位置 1 = 中断)',          value: csr?.mcause },
    { name: 'mtval',  addr: '0x343', desc: 'Trap 附加信息 (如非法指令编码)',       value: csr?.mtval },
    { name: 'mstatus', addr: '0x300', desc: '机器状态 (MIE/MPIE/MPP 等)',          value: csr?.mstatus },
    { name: 'mie',    addr: '0x304', desc: '机器中断使能 (bit3=MSIE 等)',          value: csr?.mie },
    { name: 'mip',    addr: '0x344', desc: '机器中断 pending (bit3=MSIP 等)',      value: csr?.mip },
  ];
});

/**
 * mstatus 各关注位的当前值
 * 关键：bin[64-1-bit] 用大端序索引从二进制串中取出对应位的 '0'/'1'
 */
const mstatusBreakdown = computed(() => {
  const bin = hexToBinary(csrState.value?.mstatus, 64);
  return mstatusFields.map(f => ({
    ...f,
    bitValue: bin[64 - 1 - f.bit] || '0',
  }));
});

/**
 * mie 中断使能位的当前值
 */
const mieBreakdown = computed(() => {
  const bin = hexToBinary(csrState.value?.mie, 64);
  return interruptBits.map(f => ({
    ...f,
    bitValue: bin[64 - 1 - f.bit] || '0',
  }));
});

/**
 * mip 中断 pending 位的当前值
 */
const mipBreakdown = computed(() => {
  const bin = hexToBinary(csrState.value?.mip, 64);
  return interruptBits.map(f => ({
    ...f,
    bitValue: bin[64 - 1 - f.bit] || '0',
  }));
});

/**
 * 当前 Trap 类型的中文标签
 * - 'interrupt' → 中断
 * - 'exception' → 异常
 * - 其他（默认）→ 空闲
 */
const trapTypeLabel = computed(() => {
  switch (pipelineStore.lastTrapType) {
    case 'interrupt': return '中断 (Interrupt)';
    case 'exception': return '异常 (Exception)';
    default: return '空闲 (Idle)';
  }
});
</script>

<template>
  <DraggableModal
    :show="pipelineStore.activeModals.includes('csr')"
    title="CSR 寄存器堆 (Control/Status Registers)"
    :no-overlay="true"
    @close="pipelineStore.closeModal('csr')"
  >
    <div class="csr-modal">
      <!-- 顶部：当前 Trap 状态条（Machine-mode CSR 标题 + 空闲/中断/异常标签） -->
      <div class="csr-header">
        <Settings class="w-6 h-6 text-emerald-500" />
        <div class="csr-title">
          <h3>RISC-V Machine-mode CSR</h3>
          <p>当前 Trap 状态：<strong>{{ trapTypeLabel }}</strong></p>
        </div>
      </div>

      <!-- CSR 当前值卡片网格：mtvec / mepc / mcause / mtval / mstatus / mie / mip -->
      <div class="csr-section">
        <div class="section-header">
          <h4>CSR 当前值</h4>
        </div>
        <div class="csr-grid">
          <div
            v-for="row in csrRows"
            :key="row.name"
            class="csr-item"
            :class="{ 'has-value': hasValue(row.value) }"
          >
            <div class="csr-name-row">
              <span class="csr-name">{{ row.name }}</span>
              <span class="csr-addr">{{ row.addr }}</span>
            </div>
            <div class="csr-desc">{{ row.desc }}</div>
            <div class="csr-value mono">{{ formatValue(row.value) }}</div>
          </div>
        </div>
      </div>

      <!-- mstatus 关键位（MIE / MPIE / MPP）的逐位取值与含义 -->
      <div class="csr-section">
        <div class="section-header">
          <h4>mstatus 字段分解</h4>
        </div>
        <div class="bit-table">
          <div
            v-for="f in mstatusBreakdown"
            :key="f.name"
            class="bit-row"
            :class="{ 'bit-set': f.bitValue === '1' }"
          >
            <span class="bit-name">{{ f.name }}</span>
            <span class="bit-idx">bit [{{ f.bit }}]</span>
            <span class="bit-val mono">{{ f.bitValue }}</span>
            <span class="bit-desc">{{ f.desc }}</span>
          </div>
        </div>
      </div>

      <!-- mie / mip 中断位对照表：MSIP / MTIP / MEIP 三类中断源的使能与 pending 状态 -->
      <div class="csr-section">
        <div class="section-header">
          <h4>mie / mip 中断位分解</h4>
        </div>
        <table class="interrupt-table">
          <thead>
            <tr>
              <th>中断源</th>
              <th>bit</th>
              <th>mie (Enable)</th>
              <th>mip (Pending)</th>
              <th>说明</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(f, idx) in interruptBits"
              :key="f.name"
              :class="{ 'row-active': mieBreakdown[idx]?.bitValue === '1' || mipBreakdown[idx]?.bitValue === '1' }"
            >
              <td class="mono">{{ f.name }}</td>
              <td class="mono">[{{ f.bit }}]</td>
              <td class="mono bit-cell" :class="{ 'bit-set': mieBreakdown[idx]?.bitValue === '1' }">
                {{ mieBreakdown[idx]?.bitValue }}
              </td>
              <td class="mono bit-cell" :class="{ 'bit-set': mipBreakdown[idx]?.bitValue === '1' }">
                {{ mipBreakdown[idx]?.bitValue }}
              </td>
              <td>{{ f.desc }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- 底部：Trap 处理与中断清除的教学提示（保留原 ★ 注释） -->
      <div class="info-note">
        ★ Trap 入口 (mepc/mcause/mtval) 与中断/异常使能 (MIE/MPIE) 的变化可对照上方表格。<br />
        点击流水线中的"触发软件中断"按钮 → mip.MSIP 由 0 → 1；handler 必须显式 csrw mip 清 pending。
      </div>
    </div>
  </DraggableModal>
</template>

<style scoped>
.csr-modal {
  @apply space-y-4;
  min-width: 36rem;
  max-width: 44rem;
}

.csr-header {
  @apply flex items-center gap-3 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded;
}

.csr-title h3 {
  @apply text-sm font-semibold text-emerald-800;
}

.csr-title p {
  @apply text-xs text-emerald-700;
}

.csr-section {
  @apply border border-gray-200 rounded-lg overflow-hidden;
}

.section-header {
  @apply flex items-center gap-2 px-3 py-2 bg-gray-100 border-b border-gray-200;
}

.section-header h4 {
  @apply text-sm font-medium text-gray-700;
}

.csr-grid {
  @apply grid grid-cols-2 gap-1 p-2;
}

.csr-item {
  @apply flex flex-col gap-1 px-2 py-1.5 rounded cursor-default transition-colors;
  @apply hover:bg-gray-50;
}

.csr-name-row {
  @apply flex items-baseline gap-2;
}

.csr-name {
  @apply text-sm font-mono font-semibold text-emerald-700;
}

.csr-addr {
  @apply text-[0.625rem] font-mono text-gray-400;
}

.csr-desc {
  @apply text-[0.625rem] text-gray-500 leading-tight;
}

.csr-value {
  @apply text-xs text-gray-800 font-mono bg-gray-100 px-1.5 py-0.5 rounded self-start;
}

.csr-item.has-value {
  background-color: #d1fae5;
}

.csr-item.has-value .csr-value {
  background-color: #10b981;
  color: #ffffff;
}

.bit-table {
  @apply flex flex-col;
}

.bit-row {
  @apply grid grid-cols-[5rem_4rem_2rem_1fr] items-center gap-2 px-3 py-1.5 text-xs;
  @apply border-b border-gray-100;
}

.bit-row:last-child {
  @apply border-b-0;
}

.bit-name {
  @apply font-mono font-semibold text-gray-700;
}

.bit-idx {
  @apply font-mono text-gray-500;
}

.bit-val {
  @apply text-center font-semibold text-gray-400;
}

.bit-row.bit-set {
  background-color: #fef3c7;
}

.bit-row.bit-set .bit-val {
  color: #d97706;
  font-weight: 700;
}

.bit-desc {
  @apply text-gray-500;
}

.interrupt-table {
  @apply w-full text-xs;
}

.interrupt-table thead {
  @apply bg-gray-50;
}

.interrupt-table th {
  @apply px-3 py-2 text-left font-medium text-gray-600 border-b border-gray-200;
}

.interrupt-table td {
  @apply px-3 py-2 border-b border-gray-100;
}

.interrupt-table tr.row-active {
  background-color: #fef3c7;
}

.bit-cell {
  @apply text-center font-semibold;
}

.bit-cell.bit-set {
  color: #d97706;
}

.info-note {
  @apply text-xs text-gray-500 leading-relaxed px-3 py-2 bg-gray-50 rounded;
}
</style>
