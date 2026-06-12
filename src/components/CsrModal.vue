<script setup lang="ts">
import { computed } from 'vue';
import { usePipelineStore } from '../stores/pipeline';
import DraggableModal from './DraggableModal.vue';
import { Settings } from 'lucide-vue-next';

const pipelineStore = usePipelineStore();

const csrState = computed(() => pipelineStore.csrState);

const formatValue = (value: string | number | undefined): string => {
  if (value === undefined || value === null || value === '' || value === '0x' || value === '0X') return '0x0';
  const strVal = typeof value === 'string' ? value : value.toString();
  const hexVal = strVal.startsWith('0x') || strVal.startsWith('0X') ? strVal.slice(2) : strVal;
  try {
    const bigIntVal = BigInt('0x' + hexVal);
    if (bigIntVal === BigInt(0)) return '0x0';
    return '0x' + bigIntVal.toString(16).toUpperCase().padStart(1, '0');
  } catch {
    return strVal;
  }
};

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

const hexToBinary = (hex: string | undefined, width = 64): string => {
  if (!hex || hex === '0x0' || hex === '0X0') return '0'.padStart(width, '0');
  const hexVal = hex.startsWith('0x') || hex.startsWith('0X') ? hex.slice(2) : hex;
  try {
    return BigInt('0x' + hexVal).toString(2).padStart(width, '0');
  } catch {
    return '0'.padStart(width, '0');
  }
};

interface CsrField {
  bit: number;
  name: string;
  desc: string;
}

// mstatus 关键字段
const mstatusFields: CsrField[] = [
  { bit: 3,  name: 'MIE',  desc: 'Machine Interrupt Enable' },
  { bit: 7,  name: 'MPIE', desc: 'Previous MIE (saved on trap)' },
  { bit: 12, name: 'MPP',  desc: 'Previous Privilege (2 bits)' },
];

// mie / mip 关键位（教学演示用）
const interruptBits: CsrField[] = [
  { bit: 3,  name: 'MSIP',  desc: 'Machine Software Interrupt Pending' },
  { bit: 7,  name: 'MTIP',  desc: 'Machine Timer Interrupt Pending' },
  { bit: 11, name: 'MEIP',  desc: 'Machine External Interrupt Pending' },
];

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

const mstatusBreakdown = computed(() => {
  const bin = hexToBinary(csrState.value?.mstatus, 64);
  return mstatusFields.map(f => ({
    ...f,
    bitValue: bin[64 - 1 - f.bit] || '0',
  }));
});

const mieBreakdown = computed(() => {
  const bin = hexToBinary(csrState.value?.mie, 64);
  return interruptBits.map(f => ({
    ...f,
    bitValue: bin[64 - 1 - f.bit] || '0',
  }));
});

const mipBreakdown = computed(() => {
  const bin = hexToBinary(csrState.value?.mip, 64);
  return interruptBits.map(f => ({
    ...f,
    bitValue: bin[64 - 1 - f.bit] || '0',
  }));
});

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
      <!-- 顶部状态条 -->
      <div class="csr-header">
        <Settings class="w-6 h-6 text-emerald-500" />
        <div class="csr-title">
          <h3>RISC-V Machine-mode CSR</h3>
          <p>当前 Trap 状态：<strong>{{ trapTypeLabel }}</strong></p>
        </div>
      </div>

      <!-- CSR 寄存器值表 -->
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

      <!-- mstatus 字段分解 -->
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

      <!-- mie / mip 中断位分解 -->
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
  @apply text-[10px] font-mono text-gray-400;
}

.csr-desc {
  @apply text-[10px] text-gray-500 leading-tight;
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
