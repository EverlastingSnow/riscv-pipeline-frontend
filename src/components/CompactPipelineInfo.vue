<script setup lang="ts">
import { computed } from 'vue';
import { usePipelineStore } from '../stores/pipeline';

const pipelineStore = usePipelineStore();

const formatInst = (inst: any): string => {
  if (inst === undefined || inst === null || inst === 0) return 'NOP';
  return '0x' + Number(inst).toString(16).toUpperCase().padStart(8, '0');
};

// 统一把后端信号（可能是 0x 字符串 / 大整数字符串 / 普通数字）规范成 hex 字符串
const formatHex = (val: any): string => {
  if (val === undefined || val === null) return '0x0';
  const strVal = String(val);
  if (strVal.startsWith('0x') || strVal.startsWith('0X')) {
    return strVal.toUpperCase();
  }
  // 超过 16 位的整数用 BigInt 解析，避免 JS Number 精度丢失
  if (/^-?\d{16,}$/.test(strVal)) {
    try {
      return '0x' + BigInt(strVal).toString(16).toUpperCase();
    } catch {
      return '0x0';
    }
  }
  const n = Number(strVal);
  if (isNaN(n)) return strVal || '0x0';
  return '0x' + n.toString(16).toUpperCase();
};

// 控制信号（valid/wen/ren/branch_taken 等）转成 0/1 文本
const formatBit = (val: any): string => {
  if (val === undefined || val === null) return '-';
  if (typeof val === 'boolean') return val ? '1' : '0';
  const s = String(val).toLowerCase();
  if (s === 'true') return '1';
  if (s === 'false') return '0';
  return s;
};

const pcNextValue = computed(() => {
  const branchTaken = pipelineStore.signals?.ex_mem?.branch_taken;
  const branchTarget = pipelineStore.signals?.ex_mem?.branch_target;
  if (branchTaken) {
    return branchTarget || pipelineStore.signals?.if_id?.PC_next || '0x0';
  }
  return pipelineStore.signals?.if_id?.PC_next || '0x0';
});

// IF/ID 寄存器当前值 → Fetch Unit
const fetchUnit = computed(() => {
  const s = pipelineStore.signals?.if_id || {};
  return [
    { label: 'PC',           value: s.pc || '0x0' },
    { label: 'PC_next',      value: s.PC_next || '0x0' },
    { label: '指令',         value: formatInst(s.inst) },
    { label: '汇编码',       value: s.asm || '-' },
    { label: 'valid',        value: formatBit(s.valid) },
    { label: 'allow_to_go',  value: formatBit(s.allow_to_go) },
  ];
});

// ID/EX 寄存器当前值 → Decode Unit
const decodeUnit = computed(() => {
  const s = pipelineStore.signals?.id_ex || {};
  return [
    { label: 'PC',          value: s.pc || '0x0' },
    { label: '指令',        value: formatInst(s.inst) },
    { label: '汇编码',      value: s.asm || '-' },
    { label: 'rs1',         value: s.src1_raddr !== undefined ? `x${s.src1_raddr}` : '-' },
    { label: 'rs1_data',    value: formatHex(s.src1_rdata) },
    { label: 'rs2',         value: s.src2_raddr !== undefined ? `x${s.src2_raddr}` : '-' },
    { label: 'rs2_data',    value: formatHex(s.src2_rdata) },
    { label: 'imm',         value: formatHex(s.imm) },
    { label: 'valid',       value: formatBit(s.valid) },
  ];
});

// EX 阶段执行结果 → Execute Unit（优先用 execute.*，缺字段时退回 id_ex 转发值）
const executeUnit = computed(() => {
  const ex = pipelineStore.signals?.execute || {};
  const idEx = pipelineStore.signals?.id_ex || {};
  const exMem = pipelineStore.signals?.ex_mem || {};
  return [
    { label: 'ALU src1',     value: formatHex(ex.alu_src1 ?? idEx.src1_rdata) },
    { label: 'ALU src2',     value: formatHex(ex.alu_src2 ?? idEx.src2_rdata) },
    { label: 'ALU result',   value: formatHex(ex.alu_result ?? exMem.alu_result) },
    { label: 'branch_taken', value: formatBit(exMem.branch_taken) },
    { label: 'branch_target', value: formatHex(exMem.branch_target) },
  ];
});

// MEM 阶段访存结果 → Memory Unit
const memoryUnit = computed(() => {
  const dm = pipelineStore.signals?.datamem || {};
  const exMem = pipelineStore.signals?.ex_mem || {};
  return [
    { label: 'addr',  value: formatHex(dm.DataMEM_addr ?? exMem.mem_addr) },
    { label: 'wen',   value: formatBit(dm.DataMEM_wen ?? exMem.mem_wen) },
    { label: 'ren',   value: formatBit(dm.DataMEM_en) },
    { label: 'wdata', value: formatHex(dm.DataMEM_wdata ?? exMem.mem_wdata) },
    { label: 'rdata', value: formatHex(dm.DataMEM_rdata) },
  ];
});

// WB 阶段回写结果 → WriteBack Unit
const writebackUnit = computed(() => {
  const wb = pipelineStore.signals?.writeback || {};
  return [
    { label: 'wb_wen',   value: formatBit(wb.debug_wb_rf_wen) },
    { label: 'wb_waddr', value: wb.debug_wb_rf_waddr !== undefined ? `x${wb.debug_wb_rf_waddr}` : '-' },
    { label: 'wb_wdata', value: formatHex(wb.debug_wb_rf_wdata) },
  ];
});
</script>

<template>
  <div class="compact-info">
    <div class="compact-header">
      <span class="title">流水线寄存器</span>
    </div>
    <div class="content-area">
      <div class="register-table">
        <div class="table-header">
          <span>寄存器</span>
          <span>地址</span>
          <span>指令</span>
          <span class="asm-col">汇编码</span>
        </div>
        <div class="table-row pc-next">
          <span class="reg-name">PC_next</span>
          <span class="reg-pc mono">{{ pcNextValue }}</span>
          <span class="reg-inst mono">-</span>
          <span class="reg-asm mono asm-col">-</span>
        </div>
        <div class="table-row">
          <span class="reg-name">IF/ID</span>
          <span class="reg-pc mono">{{ pipelineStore.signals?.if_id?.pc || '0x0' }}</span>
          <span class="reg-inst mono">{{ formatInst(pipelineStore.signals?.if_id?.inst) }}</span>
          <span class="reg-asm mono asm-col">{{ pipelineStore.signals?.if_id?.asm || '-' }}</span>
        </div>
        <div class="table-row">
          <span class="reg-name">ID/EX</span>
          <span class="reg-pc mono">{{ pipelineStore.signals?.id_ex?.pc || '0x0' }}</span>
          <span class="reg-inst mono">{{ formatInst(pipelineStore.signals?.id_ex?.inst) }}</span>
          <span class="reg-asm mono asm-col">{{ pipelineStore.signals?.id_ex?.asm || '-' }}</span>
        </div>
        <div class="table-row">
          <span class="reg-name">EX/MEM</span>
          <span class="reg-pc mono">{{ pipelineStore.signals?.ex_mem?.pc || '0x0' }}</span>
          <span class="reg-inst mono">{{ formatInst(pipelineStore.signals?.ex_mem?.inst) }}</span>
          <span class="reg-asm mono asm-col">{{ pipelineStore.signals?.ex_mem?.asm || '-' }}</span>
        </div>
        <div class="table-row">
          <span class="reg-name">MEM/WB</span>
          <span class="reg-pc mono">{{ pipelineStore.signals?.mem_wb?.pc || '0x0' }}</span>
          <span class="reg-inst mono">{{ formatInst(pipelineStore.signals?.mem_wb?.inst) }}</span>
          <span class="reg-asm mono asm-col">{{ pipelineStore.signals?.mem_wb?.asm || '-' }}</span>
        </div>
      </div>

      <!-- 按阶段（IF/ID/EXE/MEM/WB）信号一览 -->
      <div class="stages-section">
        <div class="stages-header">按阶段信号</div>

        <div class="stage-group stage-fetch">
          <div class="stage-title">IF · Fetch Unit</div>
          <div class="stage-row" v-for="row in fetchUnit" :key="row.label">
            <span class="stage-label">{{ row.label }}</span>
            <span class="stage-value mono">{{ row.value }}</span>
          </div>
        </div>

        <div class="stage-group stage-decode">
          <div class="stage-title">ID · Decode Unit</div>
          <div class="stage-row" v-for="row in decodeUnit" :key="row.label">
            <span class="stage-label">{{ row.label }}</span>
            <span class="stage-value mono">{{ row.value }}</span>
          </div>
        </div>

        <div class="stage-group stage-execute">
          <div class="stage-title">EXE · Execute Unit</div>
          <div class="stage-row" v-for="row in executeUnit" :key="row.label">
            <span class="stage-label">{{ row.label }}</span>
            <span class="stage-value mono">{{ row.value }}</span>
          </div>
        </div>

        <div class="stage-group stage-memory">
          <div class="stage-title">MEM · Memory Unit</div>
          <div class="stage-row" v-for="row in memoryUnit" :key="row.label">
            <span class="stage-label">{{ row.label }}</span>
            <span class="stage-value mono">{{ row.value }}</span>
          </div>
        </div>

        <div class="stage-group stage-writeback">
          <div class="stage-title">WB · WriteBack Unit</div>
          <div class="stage-row" v-for="row in writebackUnit" :key="row.label">
            <span class="stage-label">{{ row.label }}</span>
            <span class="stage-value mono">{{ row.value }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.compact-info {
  background: white;
  border-radius: 0.5rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  border: 1px solid #e5e7eb;
  width: 100%;
  font-size: 0.75rem;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.compact-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 0.75rem;
  background: #f8fafc;
  border-bottom: 1px solid #e5e7eb;
  min-height: 2.25rem;
  flex-shrink: 0;
}

.title {
  font-weight: 600;
  color: #1e293b;
  font-size: 0.8125rem;
}

.register-table {
  display: block;
  flex-shrink: 0;
}

.content-area {
  flex: 1;
  overflow: auto;
  min-height: 0;
}

.stages-section {
  border-top: 1px solid #e5e7eb;
}

.stages-header {
  background: #f8fafc;
  padding: 0.4rem 0.5rem;
  font-weight: 600;
  color: #1e293b;
  font-size: 0.75rem;
  border-bottom: 1px solid #e5e7eb;
  position: sticky;
  top: 0;
  z-index: 1;
}

.stage-group {
  border-bottom: 1px solid #e5e7eb;
}

.stage-title {
  padding: 0.25rem 0.5rem;
  font-weight: 600;
  font-size: 0.6875rem;
  color: white;
  letter-spacing: 0.02em;
}

.stage-fetch    .stage-title { background: #3b82f6; }
.stage-decode   .stage-title { background: #10b981; }
.stage-execute  .stage-title { background: #f59e0b; }
.stage-memory   .stage-title { background: #a855f7; }
.stage-writeback .stage-title { background: #14b8a6; }

.stage-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.15rem 0.5rem;
  font-size: 0.6875rem;
  border-top: 1px solid #f1f5f9;
  gap: 0.5rem;
}

.stage-row:first-of-type {
  border-top: none;
}

.stage-label {
  color: #64748b;
  flex-shrink: 0;
}

.stage-value {
  color: #1e293b;
  text-align: right;
  word-break: break-all;
  min-width: 0;
}

.table-header {
  display: flex;
  background: #f1f5f9;
  padding: 0.15rem 0.3rem;
  font-weight: 600;
  color: #64748b;
  font-size: 0.625rem;
  min-width: max-content;
  position: sticky;
  top: 0;
  z-index: 1;
}

.table-header span {
  flex: 1;
  text-align: center;
  min-width: 4rem;
}

.table-header span.asm-col {
  flex: 1.5;
  min-width: 6rem;
}

.table-header span:first-child {
  flex: 0.8;
  min-width: 4rem;
}

.table-row {
  display: flex;
  padding: 0.15rem 0.3rem;
  border-bottom: 1px solid #f1f5f9;
  min-width: max-content;
}

.table-row:last-child {
  border-bottom: none;
}

.table-row span {
  flex: 1;
  text-align: center;
  white-space: nowrap;
  font-size: 0.6875rem;
  min-width: 4rem;
  padding: 0 0.25rem;
}

.table-row span.asm-col {
  flex: 1.5;
  min-width: 6rem;
}

.table-row span:first-child {
  flex: 0.8;
  min-width: 4rem;
}

.table-row.pc-next {
  background: #eff6ff;
}

.reg-name {
  font-weight: 600;
  color: #3b82f6;
}

.pc-next .reg-name {
  color: #1d4ed8;
}

.reg-pc {
  color: #374151;
  font-size: 0.625rem;
}

.pc-next .reg-pc {
  color: #2563eb;
}

.reg-inst {
  color: #16a34a;
  font-size: 0.625rem;
}

.reg-asm {
  color: #7c3aed;
  font-size: 0.5625rem;
}

.mono {
  font-family: 'Courier New', monospace;
}

@media (max-width: 1200px) {
  .compact-info {
    font-size: 0.6875rem;
  }

  .table-header,
  .table-row {
    padding: 0.2rem 0.4rem;
  }

  .reg-pc,
  .reg-inst {
    font-size: 0.625rem;
  }

  .reg-asm {
    font-size: 0.5625rem;
  }
}

@media (max-width: 992px) {
  .compact-info {
    min-height: 100%;
    height: auto;
    max-height: 100%;
    display: flex;
    flex-direction: column;
  }

  .compact-header {
    padding: 0.4rem 0.5rem;
    flex-shrink: 0;
  }

  .title {
    font-size: 0.75rem;
  }

  .register-table {
    flex: 1;
    overflow: auto;
  }

  .table-header,
  .table-row {
    padding: 0.15rem 0.3rem;
  }
}
</style>
