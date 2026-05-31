<script setup lang="ts">
import { ref, computed } from 'vue';
import { usePipelineStore } from '../stores/pipeline';
import { Minus, Plus } from 'lucide-vue-next';

const pipelineStore = usePipelineStore();
const isExpanded = ref(true);

const formatInst = (inst: any): string => {
  if (inst === undefined || inst === null || inst === 0) return 'NOP';
  return '0x' + Number(inst).toString(16).toUpperCase().padStart(8, '0');
};

const toggleExpanded = () => {
  isExpanded.value = !isExpanded.value;
};

const pcNextValue = computed(() => {
  const branchTaken = pipelineStore.signals?.ex_mem?.branch_taken;
  const branchTarget = pipelineStore.signals?.ex_mem?.branch_target;
  if (branchTaken) {
    return branchTarget || pipelineStore.signals?.if_id?.PC_next || '0x0';
  }
  return pipelineStore.signals?.if_id?.PC_next || '0x0';
});
</script>

<template>
  <div class="compact-info" :class="{ collapsed: !isExpanded }">
    <div class="compact-header">
      <span class="title">流水线寄存器</span>
      <button class="toggle-btn" @click="toggleExpanded" :title="isExpanded ? '收起' : '展开'">
        <Minus v-if="isExpanded" class="icon" />
        <Plus v-else class="icon" />
      </button>
    </div>
    <div class="register-table" v-show="isExpanded">
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
  </div>
</template>

<style scoped>
.compact-info {
  background: white;
  border-radius: 0.5rem;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
  border: 1px solid #e5e7eb;
  width: 100%;
  font-size: 0.75rem;
  transition: all 0.3s ease;
}

.compact-info.collapsed {
  width: auto;
  height: 3.25rem;
}

.compact-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 0.75rem;
  background: #f8fafc;
  border-bottom: 1px solid #e5e7eb;
  border-radius: 0.5rem 0.5rem 0 0;
  min-height: 2.25rem;
}

.title {
  font-weight: 600;
  color: #1e293b;
  font-size: 0.8125rem;
}

.toggle-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.25rem;
  height: 1.25rem;
  padding: 0;
  background: #e2e8f0;
  border: none;
  border-radius: 0.25rem;
  cursor: pointer;
  color: #64748b;
  transition: all 0.2s ease;
}

.toggle-btn:hover {
  background: #3b82f6;
  color: white;
}

.toggle-btn .icon {
  width: 0.875rem;
  height: 0.875rem;
}

.register-table {
  display: flex;
  flex-direction: column;
}

.table-header {
  display: flex;
  background: #f1f5f9;
  padding: 0.15rem 0.3rem;
  font-weight: 600;
  color: #64748b;
  font-size: 0.625rem;
}

.table-header span {
  flex: 1;
  text-align: center;
}

.table-header span.asm-col {
  flex: 1.5;
}

.table-header span:first-child {
  flex: 0.8;
}

.table-row {
  display: flex;
  padding: 0.15rem 0.3rem;
  border-bottom: 1px solid #f1f5f9;
}

.table-row:last-child {
  border-bottom: none;
}

.table-row span {
  flex: 1;
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.6875rem;
}

.table-row span.asm-col {
  flex: 1.5;
}

.table-row span:first-child {
  flex: 0.8;
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
    font-size: 0.625rem;
  }

  .compact-header {
    padding: 0.4rem 0.5rem;
  }

  .title {
    font-size: 0.75rem;
  }

  .table-header,
  .table-row {
    padding: 0.15rem 0.3rem;
  }
}
</style>
