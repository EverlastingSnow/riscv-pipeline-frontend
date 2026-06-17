/**
 * 差分测试信号输入弹窗组件
 * 作用：当流水线运行到差分测试断点时，引导用户为每条待测控制信号选择 0/1 并提交，
 *      用于教学/训练场景下的人机交互式差分测试
 */
<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { usePipelineStore } from '../stores/pipeline';
import DraggableModal from './DraggableModal.vue';
import {
  Lightbulb,
  Send,
  Eye
} from 'lucide-vue-next';

/** 全局流水线状态存储，用于读取待输入信号列表并提交用户答案 */
const pipelineStore = usePipelineStore();

/** 当前待输入的差分测试信号包（指令名 / PC / 待填写信号列表等） */
const pendingInput = computed(() => pipelineStore.pendingSignalInput);

/** 用户对每个信号的作答，键为信号名，值为 '0' 或 '1' */
const userInputs = ref<Record<string, string>>({});
/** 是否所有信号都已作答，控制提交按钮的可用状态 */
const inputComplete = ref(false);
/** 是否展开参考答案区域 */
const showAnswer = ref(false);

/**
 * 指令类型 → 汇编格式模板映射表
 * 用于在弹窗中向用户展示该指令的汇编书写格式与简要说明
 */
const instructionFormatMap: Record<string, { format: string; description: string }> = {
  'R-type': { format: 'rd, rs1, rs2', description: '寄存器-寄存器指令' },
  'I-type': { format: 'rd, rs1, imm', description: '立即数指令' },
  'LOAD': { format: 'rd, offset(rs1)', description: '加载指令' },
  'STORE': { format: 'offset(rs1), rs2', description: '存储指令' },
  'BRANCH': { format: 'rs1, rs2, offset', description: '分支指令' },
  'JAL': { format: 'rd, offset', description: '跳转并链接' },
  'JALR': { format: 'rd, offset(rs1)', description: '间接跳转并链接' },
  'LUI': { format: 'rd, imm', description: '加载高位立即数' },
  'AUIPC': { format: 'rd, offset', description: 'PC加立即数' },
};

/** R 型指令集合（寄存器-寄存器 ALU 运算） */
const rTypeInstructions = ['ADD', 'SUB', 'SLL', 'SLT', 'SLTU', 'XOR', 'SRL', 'SRA', 'OR', 'AND'];
/** I 型立即数指令集合（寄存器-立即数 ALU 运算） */
const iTypeInstructions = ['ADDI', 'SLTI', 'SLTIU', 'XORI', 'ORI', 'ANDI', 'SLLI', 'SRLI', 'SRAI'];
/** 加载指令集合 */
const loadInstructions = ['LB', 'LH', 'LW', 'LD', 'LBU', 'LHU', 'LWU'];
/** 存储指令集合 */
const storeInstructions = ['SB', 'SH', 'SW', 'SD'];
/** 条件分支指令集合 */
const branchInstructions = ['BEQ', 'BNE', 'BLT', 'BGE', 'BLTU', 'BGEU'];

/**
 * 根据待测指令名推导其指令类型（R-type / I-type / LOAD / ...）
 * 顺序与集合定义对应：优先匹配 R 型，再到 I 型、LOAD、STORE、BRANCH，
 * 最后单独匹配 JAL / JALR / LUI / AUIPC 等非标准类型
 */
const instructionType = computed(() => {
  const name = pendingInput.value?.instruction || '';
  if (!name) return '';
  if (rTypeInstructions.includes(name)) return 'R-type';
  if (iTypeInstructions.includes(name)) return 'I-type';
  if (loadInstructions.includes(name)) return 'LOAD';
  if (storeInstructions.includes(name)) return 'STORE';
  if (branchInstructions.includes(name)) return 'BRANCH';
  if (name === 'JAL') return 'JAL';
  if (name === 'JALR') return 'JALR';
  if (name === 'LUI') return 'LUI';
  if (name === 'AUIPC') return 'AUIPC';
  return '';
});

/** 当前指令类型对应的汇编格式模板（含 format 与 description） */
const instructionFormat = computed(() => {
  return instructionFormatMap[instructionType.value] || null;
});

/** 切换参考答案区域的展开/收起状态 */
function toggleAnswer() {
  showAnswer.value = !showAnswer.value;
}

/**
 * 记录用户对某条信号的选择（'0' 或 '1'）
 * @param signalName 信号名
 * @param value 用户选择的值（字符串 '0' 或 '1'）
 */
function selectSignalValue(signalName: string, value: string) {
  userInputs.value[signalName] = value;
  // 每次选择后重新校验是否所有信号都已作答
  checkInputComplete();
}

/**
 * 校验所有待填信号是否都已作答
 * 规则：pendingInput.value.signals 中每个 signal 都必须在 userInputs 中存在对应条目
 */
function checkInputComplete() {
  if (!pendingInput.value?.signals) {
    inputComplete.value = false;
    return;
  }

  const allSelected = pendingInput.value.signals.every(
    // 仅判断是否已作答（值已定义即可，'0' 也是有效作答）
    signal => userInputs.value[signal.name] !== undefined
  );
  inputComplete.value = allSelected;
}

/**
 * 提交用户填写的所有控制信号
 * 将 '0'/'1' 字符串转换为 boolean 后写入 store，
 * 并关闭弹窗、清空本地作答状态
 */
function submitSignals() {
  if (!inputComplete.value || !pendingInput.value?.signals) return;

  for (const signal of pendingInput.value.signals) {
    // '1' 视为 true，其余（非 '1'）一律视为 false
    const value = userInputs.value[signal.name] === '1';
    pipelineStore.setUserSignal(signal.name, value);
  }

  // 关闭待输入弹窗
  pipelineStore.clearPendingSignalInput();

  // 重置本地状态，便于下一道题使用
  userInputs.value = {};
  inputComplete.value = false;
  showAnswer.value = false;
}

/**
 * 监听待输入信号包变化
 * 一旦弹窗内容变化（开始新题/关闭重开），立即重置所有本地状态
 */
watch(() => pendingInput.value, () => {
  userInputs.value = {};
  inputComplete.value = false;
  showAnswer.value = false;
});
</script>

<template>
  <DraggableModal
    :show="!!pendingInput"
    title="差分测试 - 请选择控制信号并提交"
    :no-overlay="true"
    :no-close="true"
  >
    <div class="difftest-input-modal">
      <div v-if="pendingInput" class="input-content">
        <!-- 顶部：待测指令基本信息（指令名 / PC / 格式说明） -->
        <div class="instr-info">
          <div class="instr-header">
            <Lightbulb class="w-5 h-5 text-yellow-500" />
            <span class="instr-name">{{ pendingInput.instruction }}</span>
            <span v-if="pendingInput.pc" class="instr-pc">PC: {{ pendingInput.pc }}</span>
          </div>
          <div class="instr-details" v-if="instructionFormat">
            <span class="instr-type">{{ instructionType }}</span>
            <span class="instr-format">{{ instructionFormat.format }}</span>
          </div>
        </div>

        <!-- 中部：每条待填控制信号的 0/1 单选按钮列表 -->
        <div v-if="pendingInput.signals" class="signals-list">
          <div v-for="signal in pendingInput.signals" :key="signal.name" class="signal-item">
            <div class="signal-row">
              <span class="question-text"><strong>{{ signal.name }}</strong></span>
              <div class="signal-toggle">
                <button
                  class="toggle-btn"
                  :class="{ active: userInputs[signal.name] === '0' }"
                  @click="selectSignalValue(signal.name, '0')"
                >
                  0
                </button>
                <button
                  class="toggle-btn"
                  :class="{ active: userInputs[signal.name] === '1' }"
                  @click="selectSignalValue(signal.name, '1')"
                >
                  1
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- 提示折叠面板：根据当前信号动态给出 RegWrite/ALUSrc/MemRead 等提示文本 -->
        <div class="hint-toggle">
          <details>
            <summary class="hint-summary">查看提示</summary>
            <div class="hint-content">
              <p v-if="pendingInput.signals?.some(s => s.name === 'RegWrite')">
                RegWrite=1 表示指令会写回寄存器（如 ADD, ADDI, LW）
                RegWrite=0 表示指令不写回寄存器（如 SW, BEQ）
              </p>
              <p v-if="pendingInput.signals?.some(s => s.name === 'ALUSrc')">
                ALUSrc=1 表示第二个ALU操作数来自立即数（如 ADDI, LUI）
                ALUSrc=0 表示第二个ALU操作数来自寄存器（如 ADD, SUB）
              </p>
              <p v-if="pendingInput.signals?.some(s => s.name === 'MemRead')">
                MemRead=1 表示是加载指令（LB, LH, LW, LD）
                MemRead=0 表示不是加载指令
              </p>
              <p v-if="pendingInput.signals?.some(s => s.name === 'MemWrite')">
                MemWrite=1 表示是存储指令（SB, SH, SW, SD）
                MemWrite=0 表示不是存储指令
              </p>
              <p v-if="pendingInput.signals?.some(s => s.name === 'Branch')">
                Branch=1 表示是分支指令（BEQ, BNE, BLT, BGE）
                Branch=0 表示不是分支指令
              </p>
            </div>
          </details>
        </div>

        <!-- 参考答案区域：可展开/收起，用于学员自测时核对答案 -->
        <div class="answer-section">
          <button class="answer-toggle" @click="toggleAnswer">
            <Eye class="w-4 h-4" />
            {{ showAnswer ? '隐藏答案' : '查看答案' }}
          </button>
          <div v-if="showAnswer" class="answer-content">
            <div v-for="signal in pendingInput.signals" :key="signal.name" class="answer-item">
              <span class="answer-signal-name">{{ signal.name }}:</span>
              <span class="answer-value">{{ signal.expectedValue }}</span>
            </div>
          </div>
        </div>

        <!-- 底部：提交按钮，仅在所有信号都已作答时可点击 -->
        <button
          class="submit-btn"
          :class="{ ready: inputComplete }"
          :disabled="!inputComplete"
          @click="submitSignals"
        >
          <Send class="w-4 h-4" />
          提交信号
        </button>
      </div>
    </div>
  </DraggableModal>
</template>

<style scoped>
.difftest-input-modal {
  width: 100%;
  max-width: 20rem;
  font-size: 0.875rem;
}

.input-content {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.instr-info {
  padding: 0.75rem;
  background-color: #eff6ff;
  border-radius: 0.5rem;
  border: 1px solid #bfdbfe;
}

.instr-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
  flex-wrap: wrap;
}

.instr-name {
  font-size: 1.125rem;
  font-weight: 700;
  color: #1d4ed8;
}

.instr-pc {
  margin-left: auto;
  font-size: 0.75rem;
  font-weight: 600;
  color: #6b7280;
  background-color: #f3f4f6;
  padding: 0.25rem 0.5rem;
  border-radius: 0.25rem;
  font-family: monospace;
}

.instr-details {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.75rem;
  color: #4b5563;
}

.instr-type {
  padding: 0.125rem 0.5rem;
  background-color: #bfdbfe;
  color: #1e40af;
  border-radius: 0.25rem;
  font-size: 0.625rem;
  font-weight: 500;
}

.instr-format {
  color: #6b7280;
  font-family: monospace;
}

.signals-list {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.signal-item {
  padding: 0.375rem;
  background-color: white;
  border-radius: 0.375rem;
  border: 1px solid #e5e7eb;
}

.signal-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.375rem;
}

.question-text {
  font-size: 0.75rem;
  font-weight: 500;
  color: #1f2937;
}

.signal-toggle {
  display: flex;
  gap: 0.125rem;
}

.toggle-btn {
  flex: 1;
  padding: 0.125rem 0.375rem;
  font-size: 0.75rem;
  font-weight: 700;
  border-radius: 0.125rem;
  border: 1px solid #d1d5db;
  color: #4b5563;
  transition: all;
  background-color: white;
  min-width: 1.5rem;
}

.toggle-btn:hover {
  border-color: #60a5fa;
  background-color: #eff6ff;
}

.toggle-btn.active {
  border-color: #3b82f6;
  background-color: #3b82f6;
  color: white;
}

.hint-toggle {
  font-size: 0.75rem;
}

.hint-summary {
  cursor: pointer;
  color: #2563eb;
}

.hint-summary:hover {
  color: #1d4ed8;
}

.hint-content {
  margin-top: 0.5rem;
  padding: 0.5rem;
  background-color: #f9fafb;
  border-radius: 0.25rem;
  color: #4b5563;
}

.hint-content p {
  font-size: 0.75rem;
  line-height: 1.5;
}

.submit-btn {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  color: white;
  border-radius: 0.375rem;
  transition: background-color;
  background-color: #9ca3af;
  cursor: not-allowed;
  font-size: 0.875rem;
}

.submit-btn.ready {
  background-color: #10b981;
  cursor: pointer;
}

.submit-btn.ready:hover {
  background-color: #059669;
}

.submit-btn:disabled:not(.ready) {
  background-color: #d1d5db;
  cursor: not-allowed;
}

.answer-section {
  margin-top: 0.75rem;
  padding: 0.5rem;
  background-color: #fef3c7;
  border-radius: 0.5rem;
  border: 1px solid #fcd34d;
}

.answer-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  width: 100%;
  padding: 0.375rem;
  background-color: #fbbf24;
  color: #78350f;
  border-radius: 0.25rem;
  font-weight: 600;
  cursor: pointer;
  transition: all;
  font-size: 0.75rem;
}

.answer-toggle:hover {
  background-color: #f59e0b;
}

.answer-content {
  margin-top: 0.5rem;
  padding: 0.5rem;
  background-color: white;
  border-radius: 0.25rem;
  border: 1px solid #fcd34d;
}

.answer-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.375rem;
  margin-bottom: 0.25rem;
  background-color: #fffbeb;
  border-radius: 0.25rem;
  font-size: 0.75rem;
}

.answer-item:last-child {
  margin-bottom: 0;
}

.answer-signal-name {
  font-weight: 600;
  color: #92400e;
}

.answer-value {
  font-weight: 700;
  font-size: 0.875rem;
  color: #059669;
  background-color: #d1fae5;
  padding: 0.125rem 0.5rem;
  border-radius: 0.25rem;
}
</style>
