<script setup lang="ts">
import { ref } from 'vue';
import { usePipelineStore } from '../stores/pipeline';
import {
  Cpu,
  Database,
  Activity,
  ChevronDown,
  ChevronRight
} from 'lucide-vue-next';

const pipelineStore = usePipelineStore();

/**
 * 基本信息分区是否展开。
 */
const isBasicInfoExpanded = ref(true);
/**
 * 活跃信号分区是否展开。
 */
const isAllSignalsExpanded = ref(false);
/**
 * 通用寄存器堆分区是否展开。
 */
const isRegisterExpanded = ref(true);

/**
 * 根据信号的 active 状态与类型返回对应的 CSS 类名。
 *
 * 用于在 UI 上根据信号类型（数据 / 地址 / 控制）使用不同颜色高亮。
 *
 * @param {any} signal 信号对象，包含 active 与 type 字段
 * @returns {string} 对应的样式类名
 */
const getSignalClass = (signal: any) => {
  // 未激活的信号使用灰色样式
  if (!signal.active) return 'signal-inactive';
  // 根据信号类型返回不同的颜色类
  if (signal.type === 'data') return 'signal-data';
  if (signal.type === 'addr') return 'signal-addr';
  if (signal.type === 'control') return 'signal-control';
  return '';
};

/**
 * 判断一个十六进制字符串表示的寄存器值是否为非零值。
 *
 * 支持处理空值、不完整的 '0x' / '0X' 形式以及非法的十六进制串。
 *
 * @param {string} value 十六进制字符串值
 * @returns {boolean} 非零时返回 true
 */
const hasValue = (value: string): boolean => {
  // 空值或不完整前缀视为无值
  if (!value || value === '0x' || value === '0X') return false;
  // 去掉 0x / 0X 前缀
  const hexVal = value.startsWith('0x') || value.startsWith('0X') ? value.slice(2) : value;
  try {
    // 使用 BigInt 解析，避免超出 JS Number 安全范围
    return BigInt('0x' + hexVal) !== BigInt(0);
  } catch {
    // 解析失败视为无值
    return false;
  }
};

/**
 * RISC-V 通用寄存器别名映射（x0..x31 → ABI 别名）。
 */
const registerAliases: Record<string, string> = {
  'x0': 'zero', 'x1': 'ra', 'x2': 'sp', 'x3': 'gp', 'x4': 'tp',
  'x5': 't0', 'x6': 't1', 'x7': 't2',
  'x8': 's0', 'x9': 's1',
  'x10': 'a0', 'x11': 'a1', 'x12': 'a2', 'x13': 'a3', 'x14': 'a4', 'x15': 'a5', 'x16': 'a6', 'x17': 'a7',
  'x18': 's2', 'x19': 's3', 'x20': 's4', 'x21': 's5', 'x22': 's6', 'x23': 's7',
  'x24': 's8', 'x25': 's9', 'x26': 's10', 'x27': 's11',
  'x28': 't3', 'x29': 't4', 'x30': 't5', 'x31': 't6'
};

/**
 * 将十六进制字符串值格式化为统一的 0x 开头大写形式。
 *
 * - 空值或 0 输出 '0x0'
 * - 解析失败时回退为原始字符串
 *
 * @param {string} value 原始十六进制字符串
 * @returns {string} 格式化后的十六进制字符串
 */
const formatValue = (value: string): string => {
  // 空值或不完整前缀统一为 0x0
  if (!value || value === '0x' || value === '0X') return '0x0';
  // 去掉 0x / 0X 前缀
  const hexVal = value.startsWith('0x') || value.startsWith('0X') ? value.slice(2) : value;
  try {
    // 使用 BigInt 安全处理大整数
    const bigIntVal = BigInt('0x' + hexVal);
    // 0 值统一为 0x0
    if (bigIntVal === BigInt(0)) return '0x0';
    // 输出大写十六进制字符串
    return '0x' + bigIntVal.toString(16).toUpperCase().padStart(1, '0');
  } catch {
    // 解析失败保留原始字符串
    return value;
  }
};
</script>

<template>
  <div class="info-panel">
    <!-- 面板头部：标题区 -->
    <div class="panel-header">
      <Activity class="w-5 h-5 text-primary-500" />
      <h2>CPU 状态信息</h2>
    </div>

    <!-- 基本信息：周期与 PC -->
    <div class="info-section">
      <h3 class="section-title" @click="isBasicInfoExpanded = !isBasicInfoExpanded">
        <ChevronDown v-if="isBasicInfoExpanded" class="w-4 h-4 chevron-icon" />
        <ChevronRight v-else class="w-4 h-4 chevron-icon" />
        <Cpu class="w-4 h-4" />
        基本信息
      </h3>
      <div v-show="isBasicInfoExpanded" class="basic-info-grid">
        <div class="info-item">
          <span class="label">周期</span>
          <span class="value mono">{{ pipelineStore.cycle }}</span>
        </div>
        <div class="info-item">
          <span class="label">当前PC</span>
          <!--
            PC 显示逻辑：
            - 下一周期 PC 无效（'0x0' 或不存在）显示 '/'
            - 当前 PC 为 0x0 时使用启动地址 0x7ffffffc
            - 否则显示当前 PC
          -->
          <span class="value mono">{{ !pipelineStore.signals?.if_id?.PC_next || pipelineStore.signals?.if_id?.PC_next === '0x0' ? '/' : (pipelineStore.signals?.if_id?.pc === '0x0' ? '0x7ffffffc' : pipelineStore.signals?.if_id?.pc || '0x7ffffffc') }}</span>
        </div>
      </div>
    </div>

    <!-- 活跃控制信号和数据流 -->
    <div class="info-section">
      <h3 class="section-title" @click="isAllSignalsExpanded = !isAllSignalsExpanded">
        <ChevronDown v-if="isAllSignalsExpanded" class="w-4 h-4 chevron-icon" />
        <ChevronRight v-else class="w-4 h-4 chevron-icon" />
        <Activity class="w-4 h-4" />
        活跃信号
      </h3>
      <div v-show="isAllSignalsExpanded" class="signal-list">
        <!-- 信号列表，根据类型高亮 -->
        <div
          v-for="signal in pipelineStore.allSignals"
          :key="signal.id"
          class="signal-item"
          :class="getSignalClass(signal)"
        >
          <span class="signal-name">{{ signal.label }}</span>
          <span class="signal-value mono">{{ signal.value }}</span>
        </div>
        <!-- 空状态占位 -->
        <div v-if="pipelineStore.allSignals.length === 0" class="signal-item empty">
          <span>暂无活跃信号</span>
        </div>
      </div>
    </div>

    <!-- 通用寄存器堆 -->
    <div class="info-section">
      <h3 class="section-title" @click="isRegisterExpanded = !isRegisterExpanded">
        <ChevronDown v-if="isRegisterExpanded" class="w-4 h-4 chevron-icon" />
        <ChevronRight v-else class="w-4 h-4 chevron-icon" />
        <Database class="w-4 h-4" />
        通用寄存器堆
      </h3>
      <div v-show="isRegisterExpanded" class="register-list">
        <!-- 寄存器行：根据是否非零高亮 -->
        <div
          v-for="reg in pipelineStore.registers"
          :key="reg.name"
          class="register-row"
          :class="{ 'has-value': hasValue(reg.value) }"
        >
          <span class="reg-name mono">{{ reg.name }}</span>
          <span class="reg-alias">({{ registerAliases[reg.name] || '' }})</span>
          <span class="reg-value mono">{{ formatValue(reg.value) }}</span>
        </div>
      </div>
    </div>

    <!-- 快速操作 -->
    <!-- <div class="info-section">
      <h3 class="section-title" @click="isQuickActionsExpanded = !isQuickActionsExpanded">
        <ChevronDown v-if="isQuickActionsExpanded" class="w-4 h-4 chevron-icon" />
        <ChevronRight v-else class="w-4 h-4 chevron-icon" />
        <Database class="w-4 h-4" />
        <span>快速操作</span>
      </h3>
      <div v-show="isQuickActionsExpanded" class="quick-actions">
        <button
          @click="pipelineStore.openModal('register')"
          class="action-btn"
        >
          <Database class="w-4 h-4" />
          <span>通用寄存器堆</span>
        </button>
        <button
          @click="pipelineStore.openModal('control')"
          class="action-btn"
        >
          <Info class="w-4 h-4" />
          <span>ControlUnit信号详情</span>
        </button>
      </div>
    </div> -->

    <!-- 运行状态指示 -->
    <div class="runtime-status" :class="{ 'running': pipelineStore.isRunning }">
      <div class="status-indicator">
        <span class="dot"></span>
        <span>{{ pipelineStore.isRunning ? '流水线运行中' : '流水线已暂停' }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.info-panel {
  background-color: #fafafa;
  border-left: 1px solid #e5e7eb;
  padding: 1rem;
  overflow-y: auto;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.panel-header {
  padding-top: 0.9rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 1rem;
  padding-bottom: 1.4rem;
  border-bottom: 1px solid #e5e7eb;
}

.panel-header h2 {
  font-size: 1.125rem;
  font-weight: 600;
  color: #1f2937;
}

.info-section {
  margin-bottom: 1rem;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
  font-weight: 500;
  color: #4b5563;
  margin-bottom: 0.5rem;
  cursor: pointer;
}

.section-title:hover {
  color: #2563eb;
}

.section-title {
  transition: color 0.2s;
}

.chevron-icon {
  flex-shrink: 0;
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(1, minmax(0, 1fr));
  gap: 0.5rem;
}

.basic-info-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.5rem;
}

.basic-info-grid .info-item {
  background-color: #c0e4ff;
}

.basic-info-grid .info-item .label {
  color: #6c6e6e;
}

.basic-info-grid .info-item .value {
  color: #6c6e6e;
}

.info-item {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.5rem;
  background-color: #f3f4f6;
  border-radius: 0.375rem;
  text-align: center;
}

.info-item .label {
  font-size: 0.9rem;
  color: #6b7280;
}

.info-item .value {
  font-size: 1.0rem;
  font-weight: 600;
  color: #1f2d3d;
}

.info-item .value.mono {
  font-family: "Microsoft Yahei", monospace;
  background: transparent;
  padding: 0;
}

.stage-table {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.cycle-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.5rem;
  background-color: #eff6ff;
  border-radius: 0.25rem;
}

.cycle-label {
  font-size: 0.875rem;
  font-weight: 600;
  color: #1d4ed8;
}

.cycle-value {
  font-size: 1.125rem;
  font-weight: 700;
  color: #1d4ed8;
}

.stage-header {
  display: flex;
  font-size: 0.75rem;
  font-weight: 600;
  color: #4b5563;
  background-color: #f3f4f6;
  padding: 0.25rem 0.5rem;
  border-radius: 0.25rem;
}

.stage-header span {
  flex: 1;
  text-align: center;
}

.stage-row {
  display: flex;
  font-size: 0.75rem;
  padding: 0.25rem 0.5rem;
  background-color: #f9fafb;
  border-radius: 0.25rem;
}

.stage-row span {
  flex: 1;
  text-align: center;
}

.stage-name {
  font-weight: 600;
  color: #2563eb;
}

.stage-pc {
  color: #374151;
}

.stage-inst {
  color: #16a34a;
}

.stage-item {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.5rem;
  background-color: #f9fafb;
  border-radius: 0.5rem;
  border: 1px solid #e5e7eb;
}

.info-item {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.info-item.full-width {
  grid-column: span 2;
}

.label {
  font-size: 0.75rem;
  color: #6b7280;
}

.value {
  font-size: 0.875rem;
  font-weight: 500;
  color: #1f2937;
}

.value.mono {
  font-family: "Microsoft Yahei", monospace;
  font-size: 0.75rem;
  background-color: #f3f4f6;
  padding: 0.25rem 0.5rem;
  border-radius: 0.25rem;
}

.flow-list,
.signal-list {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.flow-item,
.signal-item {
  padding: 0.25rem 0.5rem;
  border-radius: 0.25rem;
  font-size: 0.75rem;
  background-color: #f3f4f6;
  color: #9ca3af;
  transition: all 0.4s ease-out;
  position: relative;
  overflow: hidden;
}

.flow-item::before,
.signal-item::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent);
  transform: translateX(-100%);
  transition: transform 0.6s ease-out;
}

.flow-item.active::before,
.signal-item.signal-data::before,
.signal-item.signal-addr::before,
.signal-item.signal-control::before {
  transform: translateX(100%);
}

@keyframes signalFlash {
  0% {
    opacity: 0.5;
    transform: scale(0.98);
  }
  50% {
    opacity: 1;
    transform: scale(1.02);
  }
  100% {
    opacity: 1;
    transform: scale(1);
  }
}

.signal-item.signal-data {
  background-color: #c0e4ff;
  color: #95a8a6;
  font-weight: 600;
  animation: signalFlash 0.5s ease-out;
}

.signal-item.signal-addr {
  background-color: #e0f7cc;
  color: #95a8a6;
  font-weight: 600;
  animation: signalFlash 0.5s ease-out;
}

.signal-item.signal-control {
  background-color: #fad0d1;
  color: #95a8a6;
  font-weight: 600;
  animation: signalFlash 0.5s ease-out;
}

.signal-item.signal-inactive {
  background-color: #e5e7eb;
  color: #6b7280;
  font-weight: 400;
}

.signal-value {
  font-size: 0.75rem;
  margin-left: 0.5rem;
}

.flow-item.empty,
.signal-item.empty {
  color: #6b7280;
  font-style: italic;
}

.quick-actions {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid #e5e7eb;
}

.action-btn {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  background-color: #f3f4f6;
  border-radius: 0.5rem;
  font-size: 0.875rem;
  color: #374151;
}

.action-btn:hover {
  background-color: #e5e7eb;
}

.action-btn {
  transition: background-color 0.2s;
}

.register-list {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.25rem;
  font-size: 0.75rem;
  max-height: 25rem;
  overflow-y: auto;
}

.register-row {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.25rem 0.5rem;
  background-color: #f9fafb;
  border-radius: 0.25rem;
}

.register-row .reg-name {
  color: #374151;
  font-weight: 500;
}

.register-row .reg-alias {
  color: #9ca3af;
  font-size: 0.7rem;
}

.register-row .reg-value {
  margin-left: auto;
  color: #069def;
}

.register-row.has-value {
  background-color: #dbeafe;
}

.runtime-status {
  margin-top: auto;
  padding-top: 1rem;
  border-top: 1px solid #e5e7eb;
}

.status-indicator {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  font-size: 0.875rem;
  background-color: #f3f4f6;
  color: #4b5563;
  padding: 0.5rem 0.75rem;
  border-radius: 9999px;
}

.status-indicator.running {
  background-color: #dcfce7;
  color: #15803d;
}

.dot {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 9999px;
  background-color: #9ca3af;
}

.status-indicator.running .dot {
  background-color: #22c55e;
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

@media (max-width: 992px) {
  .info-panel {
    min-height: auto;
    height: auto;
    max-height: none;
    display: flex;
    flex-direction: column;
  }

  .panel-header {
    padding: 0.5rem 0.75rem;
    flex-shrink: 0;
  }

  .panel-content {
    flex: none;
    overflow-y: visible;
    padding: 0.5rem;
  }

  .register-list {
    max-height: none;
  }

  .basic-info,
  .pipeline-flow,
  .control-signals,
  .register-section,
  .runtime-status {
    font-size: 0.75rem;
  }

  .quick-actions {
    padding: 0.75rem 0;
  }
}
</style>
