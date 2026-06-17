<script setup lang="ts">
import { computed } from 'vue';
import { usePipelineStore } from '../stores/pipeline';
import DraggableModal from './DraggableModal.vue';

/**
 * 组件属性定义
 * @property {string} [registerId] - 当前展示的流水线寄存器 ID（如 if_id、id_ex、ex_mem、mem_wb）
 */
const props = defineProps<{
  registerId?: string;
}>();

/**
 * 组件事件定义
 * @event close - 用户请求关闭弹窗时触发
 */
const emit = defineEmits<{
  (e: 'close'): void;
}>();

/** 全局流水线状态实例 */
const pipelineStore = usePipelineStore();

/**
 * 信号值类型分类
 * - data: 数据类信号
 * - addr: 地址类信号
 * - control: 控制类信号
 */
type ValueType = 'data' | 'addr' | 'control';

/**
 * 判断给定的信号值是否处于"激活"状态
 * 用于在弹窗中高亮显示有意义的信号
 *
 * @param {any} value - 待判断的信号值
 * @param {ValueType} type - 信号类型，用于不同类型采用不同的判断策略
 * @returns {boolean} 若信号处于激活态则返回 true
 */
const isActiveValue = (value: any, type: ValueType): boolean => {
  // 空值视为未激活
  if (value === undefined || value === null) return false;
  // 布尔值仅当为 true 时算激活
  if (typeof value === 'boolean') return value === true;
  if (typeof value === 'string') {
    const lower = value.toLowerCase();
    // 字符串形式的布尔值识别
    if (lower === 'true' || lower === '1') return true;
    if (lower === 'false' || lower === '0' || lower === '-') return false;
    // 地址类型：非 0x0 即视为有效
    if (type === 'addr') {
      return lower !== '0x0';
    }
    // 无操作指令视为未激活
    if (lower === 'none' || lower === 'nop') return false;
    return value.length > 0;
  }
  // 数字：非 0 即激活
  if (typeof value === 'number') return value !== 0;
  return false;
};

/**
 * 将任意类型的值格式化为统一的十六进制字符串显示
 *
 * @param {any} val - 待格式化的值
 * @returns {string} 形如 "0x..." 的十六进制字符串，空值返回 "-"
 */
const parseHex = (val: any): string => {
  // 空值显示为占位符
  if (!val && val !== 0) return '-';
  // 字符串值：若已是 0x 开头则仅转大写，否则按数字转换
  if (typeof val === 'string') return val.startsWith('0x') ? val.toUpperCase() : '0x' + Number(val).toString(16).toUpperCase();
  return '0x' + Number(val).toString(16).toUpperCase();
};

/**
 * 计算属性：根据 props.registerId 从全局状态中聚合当前流水线寄存器的展示信息
 * @returns {{ name: string, items: Item[] } | null} 寄存器名及字段项集合，未指定时返回 null
 */
const registerInfo = computed(() => {
  const regId = props.registerId;
  // 未指定寄存器 ID 时不展示
  if (!regId) return null;

  const signals = pipelineStore.signals as Record<string, any> | null;
  const data = signals?.[regId];
  // 对应寄存器暂无数据
  if (!data) return null;

  /**
   * 单个字段定义
   * @property {string} key - 字段在 data 对象中的键名
   * @property {string} label - 弹窗中显示的中文/英文标签
   * @property {ValueType} [type] - 字段类型，决定显示样式
   * @property {(v: any) => string} [format] - 自定义格式化函数
   * @property {boolean} [forward] - 是否从其他阶段转发获取（而非直接读取当前寄存器）
   */
  interface FieldDef {
    key: string;
    label: string;
    type?: ValueType;
    format?: (v: any) => string;
    forward?: boolean;
  }

  /**
   * 各流水线寄存器需要展示的字段配置表
   * 键为寄存器 ID，值为字段定义数组
   */
  const fieldsByType: Record<string, FieldDef[]> = {
    // IF/ID 段：取指与译码之间的寄存器
    'if_id': [
      { key: 'pc', label: 'PC', type: 'addr' },
      { key: 'valid', label: 'Valid', type: 'data', format: (v) => v ? '1' : '0' },
      { key: 'inst', label: 'Instruction', type: 'addr', format: (v) => v ? `0x${v.toString(16).toUpperCase().padStart(8, '0')}` : '0x0' },
      { key: 'taken', label: 'Branch Taken', type: 'control', format: (v) => v ? '1' : '0', forward: true },
      { key: 'target', label: 'Redirect Target', type: 'addr', forward: true },
      { key: 'PC_next', label: 'Next PC', type: 'addr', forward: true },
      { key: 'allow_to_go', label: 'Allow to Go', type: 'control', format: (v) => v ? '1' : '0', forward: true }
    ],
    // ID/EX 段：译码与执行之间的寄存器
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
    // EX/MEM 段：执行与访存之间的寄存器
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
    // MEM/WB 段：访存与写回之间的寄存器
    'mem_wb': [
      { key: 'pc', label: 'PC', type: 'addr' },
      { key: 'valid', label: 'Valid', type: 'data', format: (v) => typeof v === 'boolean' ? (v ? '1' : '0') : String(v) },
      { key: 'wb_value', label: 'WriteBack Value', type: 'addr' },
      { key: 'rf_wen', label: 'RegFile Write Enable', type: 'control', format: (v) => v ? '1' : '0' },
      { key: 'rf_waddr', label: 'RegFile Write Addr', type: 'addr' },
      { key: 'info', label: 'Info', type: 'data' }
    ]
  };

  /**
   * 获取需要从其他流水线阶段"转发"得到的字段值
   * 主要服务于 IF/ID 中的 taken/target/PC_next/allow_to_go 等前瞻信号
   *
   * @param {string} key - 字段键名
   * @returns {{ value: any; type: ValueType } | null} 字段值与类型，未匹配则返回 null
   */
  const getForwardValue = (key: string): { value: any; type: ValueType } | null => {
    // 分支跳转标志：来自 EX/MEM 阶段
    if (key === 'taken') {
      return { value: pipelineStore.signals?.ex_mem?.branch_taken, type: 'control' };
    }
    // 分支目标地址：来自 EX/MEM 阶段
    if (key === 'target') {
      return { value: pipelineStore.signals?.ex_mem?.branch_target, type: 'addr' };
    }
    // 下一条 PC：根据分支是否发生选择不同的转发源
    if (key === 'PC_next') {
      const ifIdValid = pipelineStore.signals?.if_id?.valid;
      // 当 IF/ID 段无效时，PC 视为 0
      if (!ifIdValid) {
        return { value: 0x0, type: 'addr' };
      }
      const branchTaken = pipelineStore.signals?.ex_mem?.branch_taken;
      const branchTarget = pipelineStore.signals?.ex_mem?.branch_target;
      // 分支成立则跳转到分支目标，否则使用 IF/ID 段计算好的下一条 PC
      if (branchTaken) {
        return { value: branchTarget, type: 'addr' };
      }
      return { value: pipelineStore.signals?.if_id?.PC_next, type: 'addr' };
    }
    // 允许向下流转标志：来源于 IF/ID 段
    if (key === 'allow_to_go') {
      const ifIdValid = pipelineStore.signals?.if_id?.valid;
      // 当 IF/ID 段无效时，该信号为 0
      if (!ifIdValid) {
        return { value: 0, type: 'control' };
      }
      return { value: pipelineStore.signals?.if_id?.allow_to_go, type: 'control' };
    }
    return null;
  };

  const fields = fieldsByType[regId] || [];
  /**
   * 弹窗中单条展示项
   * @property {string} label - 字段标签
   * @property {string} value - 字段显示值（已格式化）
   * @property {ValueType} type - 字段类型
   * @property {boolean} isActive - 是否处于激活态
   * @property {boolean} [isForward] - 是否为转发而来的值
   */
  interface Item {
    label: string;
    value: string;
    type: ValueType;
    isActive: boolean;
    isForward?: boolean;
  }
  /** 最终用于渲染的字段项集合 */
  const items: Item[] = [];

  for (const field of fields) {
    // 转发字段：从其他阶段取值
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
      // 普通字段：直接从当前寄存器数据中读取
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

/**
 * 根据字段类型与激活状态返回对应的 CSS 类名
 * 用于在模板中按类型/激活状态着色
 *
 * @param {any} item - 弹窗中的展示项
 * @returns {string} 对应的样式类名
 */
const getItemClass = (item: any) => {
  // 未激活的信号统一置灰
  if (!item.isActive) return 'signal-inactive';
  if (item.type === 'data') return 'signal-data';
  if (item.type === 'addr') return 'signal-addr';
  if (item.type === 'control') return 'signal-control';
  return '';
};

/**
 * 流水线寄存器 ID 与显示名称的映射表
 * 用于弹窗标题的友好展示
 */
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
    <!-- 流水线寄存器详情内容区：有数据时按字段项渲染，否则显示空状态 -->
    <div class="pipeline-register-modal" v-if="registerInfo">
      <div class="register-content">
        <!-- 单个信号字段：左侧标签 + 右侧值，按类型/激活态着色 -->
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
    <!-- 无可用数据时的占位提示 -->
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
