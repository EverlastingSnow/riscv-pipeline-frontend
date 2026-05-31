<script setup lang="ts">
import { computed } from 'vue';
import { usePipelineStore } from '../stores/pipeline';
import DraggableModal from './DraggableModal.vue';

const props = defineProps<{
  registerId?: string;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const pipelineStore = usePipelineStore();

type ValueType = 'data' | 'addr' | 'control';

const isActiveValue = (value: any, type: ValueType): boolean => {
  if (value === undefined || value === null) return false;
  if (typeof value === 'boolean') return value === true;
  if (typeof value === 'string') {
    const lower = value.toLowerCase();
    if (lower === 'true' || lower === '1') return true;
    if (lower === 'false' || lower === '0' || lower === '-') return false;
    if (type === 'addr') {
      return lower !== '0x0';
    }
    if (lower === 'none' || lower === 'nop') return false;
    return value.length > 0;
  }
  if (typeof value === 'number') return value !== 0;
  return false;
};

const parseHex = (val: any): string => {
  if (!val && val !== 0) return '-';
  if (typeof val === 'string') return val.startsWith('0x') ? val.toUpperCase() : '0x' + Number(val).toString(16).toUpperCase();
  return '0x' + Number(val).toString(16).toUpperCase();
};

const registerInfo = computed(() => {
  const regId = props.registerId;
  if (!regId) return null;

  const signals = pipelineStore.signals as Record<string, any> | null;
  const data = signals?.[regId];
  if (!data) return null;

  interface FieldDef {
    key: string;
    label: string;
    type?: ValueType;
    format?: (v: any) => string;
    forward?: boolean;
  }

  const fieldsByType: Record<string, FieldDef[]> = {
    'if_id': [
      { key: 'pc', label: 'PC', type: 'addr' },
      { key: 'valid', label: 'Valid', type: 'data', format: (v) => v ? '1' : '0' },
      { key: 'inst', label: 'Instruction', type: 'addr', format: (v) => v ? `0x${v.toString(16).toUpperCase().padStart(8, '0')}` : '0x0' },
      { key: 'taken', label: 'Branch Taken', type: 'control', format: (v) => v ? '1' : '0', forward: true },
      { key: 'target', label: 'Redirect Target', type: 'addr', forward: true },
      { key: 'PC_next', label: 'Next PC', type: 'addr', forward: true },
      { key: 'allow_to_go', label: 'Allow to Go', type: 'control', format: (v) => v ? '1' : '0', forward: true }
    ],
    'id_ex': [
      { key: 'pc', label: 'PC', type: 'addr' },
      { key: 'valid', label: 'Valid', type: 'data', format: (v) => typeof v === 'boolean' ? (v ? '1' : '0') : String(v) },
      { key: 'inst', label: 'Instruction', type: 'addr', format: (v) => v ? `0x${Number(v).toString(16).toUpperCase().padStart(8, '0')}` : '0x0' },
      { key: 'src1_raddr', label: 'RS1 Addr', type: 'addr' },
      { key: 'src1_rdata', label: 'RS1 Data', type: 'addr' },
      { key: 'src2_raddr', label: 'RS2 Addr', type: 'addr' },
      { key: 'src2_rdata', label: 'RS2 Data', type: 'addr' },
      { key: 'rd_addr', label: 'RD Addr', type: 'addr' },
      { key: 'imm', label: 'Immediate', type: 'addr' }
    ],
    'ex_mem': [
      { key: 'pc', label: 'PC', type: 'addr' },
      { key: 'valid', label: 'Valid', type: 'data', format: (v) => typeof v === 'boolean' ? (v ? '1' : '0') : String(v) },
      { key: 'alu_result', label: 'ALU Result', type: 'addr' },
      { key: 'branch_taken', label: 'Branch Taken', type: 'control', format: (v) => v ? '1' : '0' },
      { key: 'branch_target', label: 'Branch Target', type: 'addr' },
      { key: 'mem_addr', label: 'Mem Addr', type: 'addr' },
      { key: 'mem_wen', label: 'Mem Write Enable', type: 'control', format: (v) => v ? '1' : '0' },
      { key: 'mem_ren', label: 'Mem Read Enable', type: 'control', format: (v) => v ? '1' : '0' },
      { key: 'mem_wdata', label: 'Mem Write Data', type: 'addr' },
      { key: 'info', label: 'Info', type: 'data' }
    ],
    'mem_wb': [
      { key: 'pc', label: 'PC', type: 'addr' },
      { key: 'valid', label: 'Valid', type: 'data', format: (v) => typeof v === 'boolean' ? (v ? '1' : '0') : String(v) },
      { key: 'wb_value', label: 'WriteBack Value', type: 'addr' },
      { key: 'rf_wen', label: 'RegFile Write Enable', type: 'control', format: (v) => v ? '1' : '0' },
      { key: 'rf_waddr', label: 'RegFile Write Addr', type: 'addr' },
      { key: 'info', label: 'Info', type: 'data' }
    ]
  };

  const getForwardValue = (key: string): { value: any; type: ValueType } | null => {
    if (key === 'taken') {
      return { value: pipelineStore.signals?.ex_mem?.branch_taken, type: 'control' };
    }
    if (key === 'target') {
      return { value: pipelineStore.signals?.ex_mem?.branch_target, type: 'addr' };
    }
    if (key === 'PC_next') {
      const ifIdValid = pipelineStore.signals?.if_id?.valid;
      if (!ifIdValid) {
        return { value: 0x0, type: 'addr' };
      }
      const branchTaken = pipelineStore.signals?.ex_mem?.branch_taken;
      const branchTarget = pipelineStore.signals?.ex_mem?.branch_target;
      if (branchTaken) {
        return { value: branchTarget, type: 'addr' };
      }
      return { value: pipelineStore.signals?.if_id?.PC_next, type: 'addr' };
    }
    if (key === 'allow_to_go') {
      const ifIdValid = pipelineStore.signals?.if_id?.valid;
      if (!ifIdValid) {
        return { value: 0, type: 'control' };
      }
      return { value: pipelineStore.signals?.if_id?.allow_to_go, type: 'control' };
    }
    return null;
  };

  const fields = fieldsByType[regId] || [];
  interface Item {
    label: string;
    value: string;
    type: ValueType;
    isActive: boolean;
    isForward?: boolean;
  }
  const items: Item[] = [];

  for (const field of fields) {
    if (field.forward) {
      const forwardData = getForwardValue(field.key);
      if (forwardData) {
        const active = isActiveValue(forwardData.value, forwardData.type);
        items.push({
          label: field.label,
          value: field.format ? field.format(forwardData.value) : parseHex(forwardData.value),
          type: forwardData.type,
          isActive: active,
          isForward: true
        });
      }
    } else {
      const value = (data as any)[field.key];
      if (value !== undefined && value !== null) {
        const type = field.type || 'data';
        const active = isActiveValue(value, type);
        items.push({
          label: field.label,
          value: field.format ? field.format(value) : (type === 'addr' ? parseHex(value) : String(value)),
          type,
          isActive: active
        });
      }
    }
  }

  Object.keys(data).forEach(key => {
    if (fields.some(f => f.key === key)) return;
    // const value = (data as any)[key];
    // if (value !== undefined && value !== null && typeof value !== 'object') {
    //   const active = isActiveValue(value, 'data');
    //   items.push({
    //     label: key,
    //     value: typeof value === 'boolean' ? (value ? '1' : '0') : parseHex(value),
    //     type: 'data',
    //     isActive: active
    //   });
    // }
  });

  return {
    name: displayNames[regId] || regId,
    items
  };
});

const getItemClass = (item: any) => {
  if (!item.isActive) return 'signal-inactive';
  if (item.type === 'data') return 'signal-data';
  if (item.type === 'addr') return 'signal-addr';
  if (item.type === 'control') return 'signal-control';
  return '';
};

const displayNames: Record<string, string> = {
  'if_id': 'IF/ID Pipeline Register',
  'id_ex': 'ID/EX Pipeline Register',
  'ex_mem': 'EX/MEM Pipeline Register',
  'mem_wb': 'MEM/WB Pipeline Register'
};
</script>

<template>
  <DraggableModal
    :show="true"
    :title="displayNames[props.registerId || ''] || 'Pipeline Register'"
    :no-overlay="true"
    @close="emit('close')"
  >
    <div class="pipeline-register-modal" v-if="registerInfo">
      <div class="register-content">
        <div
          v-for="item in registerInfo.items"
          :key="item.label"
          class="register-item"
          :class="getItemClass(item)"
        >
          <span class="item-label">{{ item.label }}</span>
          <span class="item-value">{{ item.value }}</span>
        </div>
      </div>
    </div>
    <div v-else class="empty-state">
      No Data
    </div>
  </DraggableModal>
</template>

<style scoped>
.pipeline-register-modal {
  min-width: 20rem;
  max-width: 30rem;
}

.register-content {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.register-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem 0.625rem;
  border-radius: 0.25rem;
  font-size: 0.8125rem;
  transition: all 0.3s ease;
}

.item-label {
  font-weight: 500;
  color: #4b5563;
}

.item-value {
  font-family: 'Courier New', monospace;
  font-weight: 600;
  font-size: 0.875rem;
}

.register-item.signal-data {
  background-color: #c0e4ff;
  color: #95a8a6;
}

.register-item.signal-data .item-label {
  color: #95a8a6;
}

.register-item.signal-addr {
  background-color: #e0f7cc;
  color: #95a8a6;
}

.register-item.signal-addr .item-label {
  color: #95a8a6;
}

.register-item.signal-control {
  background-color: #fad0d1;
  color: #95a8a6;
}

.register-item.signal-control .item-label {
  color: #95a8a6;
}

.register-item.signal-inactive {
  background-color: #e5e7eb;
  color: #9ca3af;
}

.register-item.signal-inactive .item-label {
  color: #6b7280;
}

.empty-state {
  text-align: center;
  color: #9ca3af;
  padding: 1rem;
}
</style>
