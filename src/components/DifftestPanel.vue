<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { usePipelineStore } from '../stores/pipeline';
import {
  FlaskConical,
  CheckCircle,
  BookOpen,
  Target,
  FileCode,
  Play,
  X
} from 'lucide-vue-next';

const pipelineStore = usePipelineStore();

const selectedScenario = ref(0);
const customSignals = ref<string[]>([]);
const isApplied = computed(() => pipelineStore.difftestConfig.enabled);
const selectedTestName = ref('');
const isElfTest = ref(false);
const isLoadingTests = ref(false);
const isExternalElf = ref(false);
const externalElfPath = ref('');

const scenarioIdToKey: Record<number, string> = {
  1: 'scenario1',
  2: 'scenario2',
  3: 'scenario3',
  4: 'scenario4',
};

const currentScenario = computed(() => {
  return pipelineStore.teachingScenarios.find(s => s.id === selectedScenario.value);
});

const selectedSignals = computed(() => {
  if (selectedScenario.value === 0) {
    return customSignals.value;
  }
  return currentScenario.value?.signals || [];
});

const filteredTests = computed(() => {
  const key = scenarioIdToKey[selectedScenario.value];
  if (!key) return pipelineStore.teachingTests;
  return pipelineStore.teachingTests.filter(t => t.scenario === key || t.scenario === 'all');
});

const filteredElfTests = computed(() => {
  const key = scenarioIdToKey[selectedScenario.value];
  if (!key) return pipelineStore.elfTests;
  return pipelineStore.elfTests.filter(t => t.scenario === key || t.scenario === 'all');
});

watch(() => pipelineStore.difftestConfig, (newConfig) => {
  if (newConfig.enabled) {
    selectedScenario.value = newConfig.scenario?.id ?? 0;
    customSignals.value = [...newConfig.enabledSignals];
    selectedTestName.value = newConfig.scenario?.name || '';
  }
}, { immediate: true, deep: true });

watch(selectedScenario, async (newId) => {
  if (newId > 0) {
    await loadTestsForScenario(newId);
  }
  selectedTestName.value = '';
  isElfTest.value = false;
  isExternalElf.value = false;
  externalElfPath.value = '';
});

function selectScenario(id: number) {
  selectedScenario.value = id;
  selectedTestName.value = '';
  isExternalElf.value = false;
  externalElfPath.value = '';
}

function toggleCustomSignal(signalId: string) {
  const idx = customSignals.value.indexOf(signalId);
  if (idx >= 0) {
    customSignals.value.splice(idx, 1);
  } else {
    customSignals.value.push(signalId);
  }
}

function selectTest(testName: string, isElf: boolean = false) {
  if (selectedTestName.value === testName && isElfTest.value === isElf && !isExternalElf.value) {
    selectedTestName.value = '';
    isElfTest.value = false;
  } else {
    selectedTestName.value = testName;
    isElfTest.value = isElf;
    isExternalElf.value = false;
    externalElfPath.value = '';
  }
}

async function loadTestsForScenario(_scenarioId: number) {
  isLoadingTests.value = true;
  setTimeout(() => {
    isLoadingTests.value = false;
  }, 100);
}

async function loadAndStartTest() {
  const signals = selectedScenario.value === 0
    ? customSignals.value
    : currentScenario.value?.signals || [];

  if (isExternalElf.value && externalElfPath.value) {
    await pipelineStore.loadElf(externalElfPath.value);
  } else if (isElfTest.value && selectedTestName.value) {
    await pipelineStore.loadElfTest(selectedTestName.value);
  } else if (selectedTestName.value) {
    await pipelineStore.loadTeachingTest(selectedTestName.value);
  } else {
    return;
  }

  pipelineStore.enableDifftest(currentScenario.value!, signals);
}

function confirmConfig() {
  const signals = selectedScenario.value === 0
    ? customSignals.value
    : currentScenario.value?.signals || [];

  const scenario = selectedScenario.value === 0
    ? { id: 0, name: '自由模式', description: '自定义所有信号', signals: customSignals.value }
    : currentScenario.value!;

  pipelineStore.enableDifftest(scenario, signals);
}

function disableConfig() {
  pipelineStore.disableDifftest();
  selectedTestName.value = '';
}
</script>

<template>
  <div class="difftest-panel">
    <div class="panel-header">
      <div class="header-left">
        <FlaskConical class="header-icon" />
        <span class="header-title">差分测试</span>
      </div>
      <div class="header-status" :class="{ active: isApplied }">
        {{ isApplied ? '已启用' : '未启用' }}
      </div>
    </div>

    <div class="panel-content">
      <div class="scenarios-section">
        <div class="section-label">
          <BookOpen class="section-icon" />
          <span>教学场景（必选）</span>
        </div>

        <div class="scenario-list">
          <div
            v-for="scenario in pipelineStore.teachingScenarios"
            :key="scenario.id"
            class="scenario-item"
            :class="{ selected: selectedScenario === scenario.id }"
            @click="selectScenario(scenario.id)"
          >
            <div class="scenario-radio">
              <div class="radio-inner" v-if="selectedScenario === scenario.id"></div>
            </div>
            <div class="scenario-info">
              <span class="scenario-name">{{ scenario.name }}</span>
              <span class="scenario-desc">{{ scenario.description }}</span>
            </div>
          </div>
        </div>
      </div>

      <div class="tests-section" v-if="selectedScenario > 0">
        <div class="section-label">
          <FileCode class="section-icon" />
          <span>测试用例（非必选）</span>
          <span v-if="isLoadingTests" class="loading-text">加载中...</span>
        </div>

        <div class="test-list" v-if="filteredElfTests.length > 0">
          <div
            v-for="test in filteredElfTests"
            :key="test.name"
            class="test-item elf-test"
            :class="{ selected: selectedTestName === test.name && isElfTest && !isExternalElf }"
            @click="selectTest(test.name, true)"
          >
            <div class="test-radio">
              <div class="radio-inner" v-if="selectedTestName === test.name && isElfTest && !isExternalElf"></div>
            </div>
            <div class="test-info">
              <span class="test-name">{{ test.displayName || test.name }}</span>
              <span class="test-desc">{{ test.description }}</span>
            </div>
            <Play class="play-icon" v-if="selectedTestName === test.name && isElfTest && !isExternalElf" />
          </div>
        </div>

        <div class="test-list" v-if="filteredTests.length > 0">
          <div
            v-for="test in filteredTests"
            :key="test.name"
            class="test-item"
            :class="{ selected: selectedTestName === test.name && !isElfTest && !isExternalElf }"
            @click="selectTest(test.name, false)"
          >
            <div class="test-radio">
              <div class="radio-inner" v-if="selectedTestName === test.name && !isElfTest && !isExternalElf"></div>
            </div>
            <div class="test-info">
              <span class="test-name">{{ test.name }}</span>
            </div>
            <Play class="play-icon" v-if="selectedTestName === test.name && !isElfTest && !isExternalElf" />
          </div>
        </div>

        <div class="no-tests" v-if="!isLoadingTests && filteredTests.length === 0 && filteredElfTests.length === 0">
          暂无配套测试用例
        </div>
      </div>

      <div class="custom-section" v-if="selectedScenario === 0">
        <div class="section-label">
          <CheckCircle class="section-icon" />
          <span>自定义信号</span>
        </div>

        <div class="signal-grid">
          <label
            v-for="signal in [
              { id: 'RegWrite', name: 'RegWrite' },
              { id: 'ALUSrc', name: 'ALUSrc' },
              { id: 'MemRead', name: 'MemRead' },
              { id: 'MemWrite', name: 'MemWrite' },
              { id: 'Branch', name: 'Branch' },
            ]"
            :key="signal.id"
            class="signal-item"
            :class="{ checked: customSignals.includes(signal.id) }"
          >
            <input
              type="checkbox"
              :checked="customSignals.includes(signal.id)"
              @change="toggleCustomSignal(signal.id)"
            />
            <span class="signal-name">{{ signal.name }}</span>
          </label>
        </div>
      </div>

      <div class="preview-section">
        <div class="section-label">
          <Target class="section-icon" />
          <span>当前配置</span>
        </div>
        <div class="preview-content">
          <div v-if="selectedTestName && isElfTest && !isExternalElf" class="preview-item">
            <span class="preview-label">已选测试：</span>
            <span class="preview-value">{{ selectedTestName }}</span>
          </div>
          <div v-else-if="selectedTestName && !isExternalElf" class="preview-item">
            <span class="preview-label">已选测试：</span>
            <span class="preview-value">{{ selectedTestName }}</span>
          </div>
          <div v-if="selectedScenario === 0 && customSignals.length > 0 && !pipelineStore.editorCodeLoaded" class="load-hint">
            请先在代码编辑器中加载代码
          </div>
          <div v-if="selectedSignals.length > 0" class="signals-preview">
            <span
              v-for="sig in selectedSignals"
              :key="sig"
              class="signal-tag"
            >
              {{ sig }}
            </span>
          </div>
          <div v-else-if="!pipelineStore.editorCodeLoaded" class="no-signals">
            请先加载程序
          </div>
          <div v-else class="no-signals">
            请选择一个场景或至少选择一个信号
          </div>
        </div>
      </div>

      <div class="actions">
        <button
          v-if="isApplied"
          class="btn-disable"
          @click="disableConfig"
        >
          <X class="btn-icon" />
          禁用
        </button>
        <button
          v-if="selectedScenario > 0 && (selectedTestName || (isExternalElf && externalElfPath))"
          class="btn-load"
          @click="loadAndStartTest"
        >
          <Play class="btn-icon" />
          加载并运行
        </button>
        <button
          class="btn-confirm"
          @click="confirmConfig"
          v-if="((selectedScenario > 0 && !selectedTestName && !(isExternalElf && externalElfPath)) || (selectedScenario === 0 && customSignals.length > 0)) && pipelineStore.editorCodeLoaded"
          :disabled="selectedSignals.length === 0"
        >
          确认配置
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.difftest-panel {
  background: white;
  border-radius: 0.5rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  border: 1px solid #e5e7eb;
  width: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1rem;
  background: linear-gradient(135deg, #fff7ed 0%, #fef2f2 100%);
  border-bottom: 1px solid #fed7aa;
  flex-shrink: 0;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 0.625rem;
}

.header-icon {
  width: 1.25rem;
  height: 1.25rem;
  color: #f97316;
}

.header-title {
  font-size: 0.875rem;
  font-weight: 700;
  color: #1e293b;
  letter-spacing: -0.01em;
}

.header-status {
  font-size: 0.6875rem;
  padding: 0.25rem 0.75rem;
  border-radius: 9999px;
  background: #e5e7eb;
  color: #64748b;
  font-weight: 600;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
}

.header-status.active {
  background: linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%);
  color: #15803d;
  box-shadow: 0 1px 2px rgba(34, 197, 94, 0.2);
}

.panel-content {
  flex: 1;
  overflow-y: auto;
  padding: 0.875rem;
  display: flex;
  flex-direction: column;
  gap: 0.875rem;
}

.scenarios-section {
  background: linear-gradient(135deg, #eff6ff 0%, #f8fafc 100%);
  border-radius: 0.5rem;
  padding: 1rem;
  border: 1px solid #bfdbfe;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

.tests-section {
  background: linear-gradient(135deg, #f0fdf4 0%, #f8fafc 100%);
  border-radius: 0.5rem;
  padding: 1rem;
  border: 1px solid #bbf7d0;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

.custom-section {
  background: linear-gradient(135deg, #fef3c7 0%, #f8fafc 100%);
  border-radius: 0.5rem;
  padding: 1rem;
  border: 1px solid #fde68a;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

.preview-section {
  background: linear-gradient(135deg, #fef2f2 0%, #f8fafc 100%);
  border-radius: 0.5rem;
  padding: 1rem;
  border: 1px solid #fecaca;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

.section-label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
  font-weight: 700;
  color: #374151;
  margin-bottom: 0.75rem;
}

.section-icon {
  width: 1.25rem;
  height: 1.25rem;
  color: #6b7280;
}

.loading-text {
  margin-left: auto;
  font-size: 0.6875rem;
  color: #9ca3af;
  font-weight: 400;
}

.scenarios-section,
.tests-section,
.custom-section,
.preview-section {
  background: #f9fafb;
  border-radius: 0.375rem;
  padding: 0.625rem;
}

.scenario-list,
.test-list {
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
  max-height: 14rem;
  overflow-y: auto;
  padding-right: 0.375rem;
}

.scenario-list::-webkit-scrollbar,
.test-list::-webkit-scrollbar {
  width: 0.375rem;
}

.scenario-list::-webkit-scrollbar-track,
.test-list::-webkit-scrollbar-track {
  background: #f1f5f9;
  border-radius: 0.25rem;
}

.scenario-list::-webkit-scrollbar-thumb,
.test-list::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 0.25rem;
}

.scenario-list::-webkit-scrollbar-thumb:hover,
.test-list::-webkit-scrollbar-thumb:hover {
  background: #94a3b8;
}

.scenario-item,
.test-item {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 0.75rem;
  border-radius: 0.5rem;
  cursor: pointer;
  transition: all 0.2s ease;
  background: white;
  border: 2px solid #e2e8f0;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

.scenario-item:hover,
.test-item:hover {
  border-color: #3b82f6;
  background: #eff6ff;
  transform: translateY(-2px);
  box-shadow: 0 4px 8px rgba(59, 130, 246, 0.2);
}

.scenario-item.selected,
.test-item.selected {
  border-color: #3b82f6;
  background: #dbeafe;
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
}

.scenario-radio,
.test-radio {
  width: 1.25rem;
  height: 1.25rem;
  border-radius: 50%;
  border: 2px solid #cbd5e1;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  margin-top: 0.125rem;
  transition: all 0.2s ease;
}

.scenario-item.selected .scenario-radio,
.test-item.selected .test-radio {
  border-color: #3b82f6;
  background: #3b82f6;
}

.radio-inner {
  width: 0.625rem;
  height: 0.625rem;
  border-radius: 50%;
  background: white;
}

.scenario-info,
.test-info {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}

.scenario-name,
.test-name {
  font-size: 0.875rem;
  font-weight: 700;
  color: #1e293b;
  margin-bottom: 0.375rem;
}

.scenario-desc {
  font-size: 0.75rem;
  color: #64748b;
  line-height: 1.5;
}

.elf-test {
  background: #f0fdf4;
  border-color: #bbf7d0;
}

.elf-test:hover {
  border-color: #22c55e;
  background: #dcfce7;
  transform: translateY(-1px);
  box-shadow: 0 2px 4px rgba(34, 197, 94, 0.15);
}

.elf-test.selected {
  border-color: #22c55e;
  background: #bbf7d0;
  box-shadow: 0 2px 8px rgba(34, 197, 94, 0.2);
}

.elf-test .test-radio {
  border-color: #22c55e !important;
}

.elf-test .test-radio .radio-inner {
  background: #22c55e;
}

.play-icon {
  width: 1.125rem;
  height: 1.125rem;
  color: #22c55e;
  flex-shrink: 0;
}

.no-tests {
  font-size: 0.6875rem;
  color: #9ca3af;
  text-align: center;
  padding: 0.5rem;
}

.signal-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.625rem;
}

.signal-item {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  border-radius: 0.5rem;
  border: 2px solid #fde68a;
  background: white;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

.signal-item:hover {
  border-color: #f59e0b;
  background: #fef3c7;
  transform: translateY(-2px);
  box-shadow: 0 4px 8px rgba(245, 158, 11, 0.2);
}

.signal-item.checked {
  border-color: #22c55e;
  background: #dcfce7;
  box-shadow: 0 4px 12px rgba(34, 197, 94, 0.3);
}

.signal-item input {
  display: none;
}

.signal-name {
  font-size: 0.875rem;
  font-weight: 700;
  color: #374151;
}

.preview-content {
  margin-top: 0.625rem;
}

.preview-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
  padding: 0.5rem;
  background: white;
  border-radius: 0.375rem;
  border: 1px solid #fecaca;
}

.preview-label {
  font-size: 0.75rem;
  color: #6b7280;
}

.preview-value {
  font-size: 0.8125rem;
  font-weight: 600;
  color: #dc2626;
}

.load-hint {
  padding: 0.5rem 0.75rem;
  background: #fef2f2;
  color: #dc2626;
  font-size: 0.75rem;
  font-weight: 500;
  border-radius: 0.375rem;
  border: 1px solid #fecaca;
  margin-bottom: 0.5rem;
}

.signals-preview {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
  padding: 0.5rem;
  background: white;
  border-radius: 0.375rem;
  border: 1px solid #fecaca;
}

.signal-tag {
  padding: 0.25rem 0.625rem;
  background: linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%);
  color: #2563eb;
  border-radius: 9999px;
  font-size: 0.6875rem;
  font-weight: 600;
  box-shadow: 0 1px 2px rgba(37, 99, 235, 0.1);
}

.no-signals {
  font-size: 0.75rem;
  color: #9ca3af;
  text-align: center;
  padding: 0.625rem;
  background: white;
  border-radius: 0.375rem;
  border: 1px dashed #e5e7eb;
}

.actions {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  padding-top: 0.875rem;
  border-top: 1px solid #f1f5f9;
}

.btn-confirm,
.btn-load,
.btn-disable {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.375rem;
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 0.5rem;
  font-size: 0.8125rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  flex: 1;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
}

.btn-icon {
  width: 1rem;
  height: 1rem;
}

.btn-confirm {
  background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
  color: white;
  box-shadow: 0 2px 4px rgba(59, 130, 246, 0.3);
}

.btn-confirm:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 8px rgba(59, 130, 246, 0.4);
}

.btn-confirm:active:not(:disabled) {
  transform: translateY(0);
}

.btn-confirm:disabled {
  background: #d1d5db;
  cursor: not-allowed;
  box-shadow: none;
}

.btn-load {
  background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
  color: white;
  box-shadow: 0 2px 4px rgba(34, 197, 94, 0.3);
}

.btn-load:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 8px rgba(34, 197, 94, 0.4);
}

.btn-load:active {
  transform: translateY(0);
}

.btn-disable {
  background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
  color: white;
  box-shadow: 0 2px 4px rgba(239, 68, 68, 0.3);
}

.btn-disable:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 8px rgba(239, 68, 68, 0.4);
}

.btn-disable:active {
  transform: translateY(0);
}

@media (max-width: 992px) {
  .difftest-panel {
    min-height: auto;
    height: auto;
    max-height: none;
    display: flex;
    flex-direction: column;
  }

  .panel-header {
    padding: 0.625rem 0.75rem;
    flex-shrink: 0;
  }

  .panel-content {
    flex: none;
    overflow-y: visible;
    padding: 0.875rem;
    gap: 0.875rem;
  }

  .scenario-list,
  .test-list {
    max-height: none;
    overflow-y: visible;
  }

  .section-label {
    font-size: 0.8125rem;
    margin-bottom: 0.625rem;
  }

  .section-icon {
    width: 1.125rem;
    height: 1.125rem;
  }

  .scenario-item,
  .test-item {
    padding: 0.625rem;
    gap: 0.625rem;
  }

  .scenario-name,
  .test-name {
    font-size: 0.8125rem;
  }

  .scenario-desc {
    font-size: 0.6875rem;
  }

  .signal-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .signal-item {
    padding: 0.625rem 0.75rem;
  }

  .signal-name {
    font-size: 0.8125rem;
  }

  .actions {
    flex-direction: column;
  }

  .btn-confirm,
  .btn-load,
  .btn-disable {
    width: 100%;
  }
}
</style>
