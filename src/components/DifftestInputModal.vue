<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { usePipelineStore } from '../stores/pipeline';
import DraggableModal from './DraggableModal.vue';
import { 
  Lightbulb,
  Send,
  Eye
} from 'lucide-vue-next';

const pipelineStore = usePipelineStore();

const pendingInput = computed(() => pipelineStore.pendingSignalInput);

const userInputs = ref<Record<string, string>>({});
const inputComplete = ref(false);
const showAnswer = ref(false);

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

const rTypeInstructions = ['ADD', 'SUB', 'SLL', 'SLT', 'SLTU', 'XOR', 'SRL', 'SRA', 'OR', 'AND'];
const iTypeInstructions = ['ADDI', 'SLTI', 'SLTIU', 'XORI', 'ORI', 'ANDI', 'SLLI', 'SRLI', 'SRAI'];
const loadInstructions = ['LB', 'LH', 'LW', 'LD', 'LBU', 'LHU', 'LWU'];
const storeInstructions = ['SB', 'SH', 'SW', 'SD'];
const branchInstructions = ['BEQ', 'BNE', 'BLT', 'BGE', 'BLTU', 'BGEU'];

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

const instructionFormat = computed(() => {
  return instructionFormatMap[instructionType.value] || null;
});

function toggleAnswer() {
  showAnswer.value = !showAnswer.value;
}

function selectSignalValue(signalName: string, value: string) {
  userInputs.value[signalName] = value;
  checkInputComplete();
}

function checkInputComplete() {
  if (!pendingInput.value?.signals) {
    inputComplete.value = false;
    return;
  }
  
  const allSelected = pendingInput.value.signals.every(
    signal => userInputs.value[signal.name] !== undefined
  );
  inputComplete.value = allSelected;
}

function submitSignals() {
  if (!inputComplete.value || !pendingInput.value?.signals) return;
  
  for (const signal of pendingInput.value.signals) {
    const value = userInputs.value[signal.name] === '1';
    pipelineStore.setUserSignal(signal.name, value);
  }
  
  pipelineStore.clearPendingSignalInput();
  
  userInputs.value = {};
  inputComplete.value = false;
  showAnswer.value = false;
}

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
