<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { usePipelineStore } from '../stores/pipeline';
import DraggableModal from './DraggableModal.vue';
import {
  Settings,
  CheckCircle,
  BookOpen,
  Target,
  FileCode,
  Play,
  // FolderOpen
} from 'lucide-vue-next';

const pipelineStore = usePipelineStore();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const selectedScenario = ref(0);
const customSignals = ref<string[]>([]);
const isApplied = ref(false);
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
    isApplied.value = true;
  } else {
    isApplied.value = false;
  }
}, { immediate: true });

watch(selectedScenario, async (newId) => {
  if (newId > 0) {
    await loadTestsForScenario(newId);
  }
  selectedTestName.value = '';
  isElfTest.value = false;
  isExternalElf.value = false;
  externalElfPath.value = '';
});

watch(isExternalElf, (isExternal) => {
  if (isExternal) {
    selectedTestName.value = '';
  }
});

async function loadTestsForScenario(_scenarioId: number) {
  isLoadingTests.value = true;
  setTimeout(() => {
    isLoadingTests.value = false;
  }, 100);
}

onMounted(async () => {
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

// function selectExternalElf() {
//   isExternalElf.value = true;
//   isElfTest.value = false;
//   selectedTestName.value = '';
// }

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
  emit('close');
}

function confirmConfig() {
  const signals = selectedScenario.value === 0
    ? customSignals.value
    : currentScenario.value?.signals || [];

  const scenario = selectedScenario.value === 0
    ? { id: 0, name: '自由模式', description: '自定义所有信号', signals: customSignals.value }
    : currentScenario.value!;

  pipelineStore.enableDifftest(scenario, signals);
  emit('close');
}

function cancel() {
  emit('close');
}

function disableConfig() {
  pipelineStore.disableDifftest();
  emit('close');
}
</script>

<template>
  <DraggableModal
    :show="true"
    title="差分测试配置"
    @close="cancel"
  >
    <div class="diff-config-modal">
      <div class="config-header">
        <Settings class="w-8 h-8 text-blue-500" />
        <div class="config-title">
          <h3>教学场景配置</h3>
          <p>选择学习场景和配套测试用例</p>
        </div>
        <div class="config-status" :class="{ active: isApplied }">
          <span v-if="isApplied">已启用</span>
          <span v-else>未启用</span>
        </div>
      </div>

      <div class="scenarios-section">
        <div class="section-header">
          <BookOpen class="w-4 h-4 text-green-500" />
          <h4>教学场景(必选)：选择场景来学习指令执行时，该信号的取值</h4>
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
            <div class="scenario-signals" v-if="scenario.signals.length > 0">
              <span
                v-for="sig in scenario.signals"
                :key="sig"
                class="signal-tag"
              >
                {{ sig }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div class="tests-section" v-if="selectedScenario > 0">
        <div class="section-header">
          <FileCode class="w-4 h-4 text-blue-500" />
          <h4>测试用例(非必选)：选择并点击下方“加载ELF并运行”来加载已有测试用例</h4>
          <span v-if="isLoadingTests" class="loading-text">加载中...</span>
        </div>

        <div class="test-list" v-if="filteredElfTests.length > 0">
          <div
            v-for="test in filteredElfTests"
            :key="test.name"
            class="test-item elf-test-item"
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
            <Play class="w-4 h-4 play-icon" v-if="selectedTestName === test.name && isElfTest && !isExternalElf" />
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
              <span class="test-desc">{{ test.description }}</span>
            </div>
            <Play class="w-4 h-4 play-icon" v-if="selectedTestName === test.name && !isElfTest && !isExternalElf" />
          </div>
        </div>

        <!-- <div class="external-elf-section" v-if="selectedScenario > 0">
          <div
            class="test-item"
            :class="{ selected: isExternalElf }"
            @click="selectExternalElf"
          >
            <div class="test-radio">
              <div class="radio-inner" v-if="isExternalElf"></div>
            </div>
            <div class="test-info">
              <span class="test-name">
                <FolderOpen class="w-4 h-4 inline-block mr-1" />
                加载外部ELF文件
              </span>
              <span class="test-desc">从外部选择ELF文件作为测试用例</span>
            </div>
          </div>

          <div v-if="isExternalElf" class="external-path-input">
            <input
              type="text"
              v-model="externalElfPath"
              placeholder="输入ELF文件路径,例如: E:\tests\my_test.elf"
              class="path-input"
            />
          </div>
        </div> -->

        <div class="no-tests" v-if="!isLoadingTests && filteredTests.length === 0 && filteredElfTests.length === 0">
          <p>该场景暂无配套测试用例</p>
        </div>
      </div>

      <div class="custom-section" v-if="selectedScenario === 0">
        <div class="section-header">
          <List class="w-4 h-4 text-purple-500" />
          <h4>自定义信号</h4>
        </div>

        <div class="signal-checkboxes">
          <label
            v-for="signal in [
              { id: 'RegWrite', name: 'RegWrite', description: '寄存器写使能' },
              { id: 'ALUSrc', name: 'ALUSrc', description: 'ALU第二个操作数选择' },
              { id: 'MemRead', name: 'MemRead', description: '内存读使能' },
              { id: 'MemWrite', name: 'MemWrite', description: '内存写使能' },
              { id: 'Branch', name: 'Branch', description: '分支使能' },
            ]"
            :key="signal.id"
            class="signal-checkbox"
            :class="{ checked: customSignals.includes(signal.id) }"
          >
            <input
              type="checkbox"
              :checked="customSignals.includes(signal.id)"
              @change="toggleCustomSignal(signal.id)"
            />
            <CheckCircle class="w-4 h-4 check-icon" />
            <div class="signal-info">
              <span class="signal-name">{{ signal.name }}</span>
              <span class="signal-desc">{{ signal.description }}</span>
            </div>
          </label>
        </div>
      </div>

      <div class="preview-section">
        <div class="section-header">
          <Target class="w-4 h-4 text-orange-500" />
          <h4>当前配置预览</h4>
        </div>
        <div class="preview-content">
          <div v-if="selectedTestName && isElfTest && !isExternalElf" class="preview-test">
            <span class="preview-label">已选ELF测试:</span>
            <span class="preview-test-name">{{ selectedTestName }}</span>
          </div>
          <div v-else-if="selectedTestName && !isExternalElf" class="preview-test">
            <span class="preview-label">已选测试:</span>
            <span class="preview-test-name">{{ selectedTestName }}</span>
          </div>
          <div v-if="isExternalElf && externalElfPath" class="preview-test">
            <span class="preview-label">外部文件:</span>
            <span class="preview-test-name">{{ externalElfPath }}</span>
          </div>
          <div v-if="selectedScenario > 0 && !selectedTestName && !(isExternalElf && externalElfPath)" class="preview-hint">
            <span>请在代码编辑器中加载代码，或选择上方的固定测试用例</span>
          </div>
          <div v-if="selectedScenario === 0 && customSignals.length > 0 && !pipelineStore.editorCodeLoaded" class="preview-hint">
            <span>请先在代码编辑器中加载代码</span>
          </div>
          <p v-if="selectedSignals.length === 0" class="no-signals">
            请选择一个场景或至少选择一个信号
          </p>
          <div v-else class="preview-signals">
            <span
              v-for="sig in selectedSignals"
              :key="sig"
              class="preview-tag"
            >
              {{ sig }}
            </span>
          </div>
        </div>
      </div>

      <div class="actions">
        <button
          v-if="isApplied"
          class="btn-disable"
          @click="disableConfig"
        >
          禁用差分测试
        </button>
        <button class="btn-cancel" @click="cancel">取消</button>
        <button
          v-if="selectedScenario > 0 && (selectedTestName || (isExternalElf && externalElfPath))"
          class="btn-load-test"
          @click="loadAndStartTest"
        >
          {{ isExternalElf ? '加载外部ELF并运行' : (isElfTest ? '加载ELF并运行' : '加载并运行测试') }}
        </button>
        <button
          class="btn-confirm"
          @click="confirmConfig"
          v-if="((selectedScenario > 0 && !selectedTestName && !(isExternalElf && externalElfPath)) || (selectedScenario === 0 && customSignals.length > 0)) && pipelineStore.editorCodeLoaded"
          :disabled="selectedSignals.length === 0"
        >
          {{ selectedScenario === 0 ? '确认配置' : (isApplied ? '保存修改' : '确认配置') }}
        </button>
      </div>
    </div>
  </DraggableModal>
</template>

<style scoped>
.diff-config-modal {
  @apply space-y-4;
}

.config-header {
  @apply flex items-center gap-3 p-3 bg-blue-50 rounded-lg;
}

.config-title h3 {
  @apply text-lg font-semibold text-gray-800;
}

.config-title p {
  @apply text-sm text-gray-600;
}

.config-status {
  @apply ml-auto px-3 py-1 text-xs font-medium rounded-full;
  @apply bg-gray-200 text-gray-600;
}

.config-status.active {
  @apply bg-green-100 text-green-700;
}

.scenarios-section,
.tests-section,
.custom-section,
.preview-section {
  @apply border border-gray-200 rounded-lg overflow-hidden;
}

.section-header {
  @apply flex items-center gap-2 px-3 py-2 bg-gray-100 border-b border-gray-200;
}

.section-header h4 {
  @apply text-sm font-medium text-gray-700;
}

.loading-text {
  @apply ml-auto text-xs text-gray-500;
}

.scenario-list,
.test-list {
  @apply space-y-1 p-2;
  max-height: 11.25rem;
  overflow-y: auto;
}

.scenario-item,
.test-item {
  @apply flex items-center gap-3 px-3 py-2 rounded cursor-pointer;
  @apply hover:bg-gray-50 transition-colors;
}

.scenario-item.selected,
.test-item.selected {
  @apply bg-blue-50 border border-blue-200;
}

.scenario-radio,
.test-radio {
  @apply w-5 h-5 rounded-full border-2 flex items-center justify-center;
  @apply border-gray-300;
}

.scenario-item.selected .scenario-radio,
.test-item.selected .test-radio {
  @apply border-blue-500;
}

.radio-inner {
  @apply w-3 h-3 rounded-full bg-blue-500;
}

.scenario-info,
.test-info {
  @apply flex flex-col flex-1;
}

.scenario-name,
.test-name {
  @apply text-sm font-medium text-gray-800;
}

.scenario-desc,
.test-desc {
  @apply text-xs text-gray-500 line-clamp-2;
}

.scenario-signals {
  @apply flex gap-1 flex-wrap;
}

.signal-tag {
  @apply px-2 py-0.5 bg-gray-100 text-xs rounded;
}

.play-icon {
  @apply text-blue-500;
}

.elf-test-item {
  @apply bg-green-50;
}

.elf-test-item.selected {
  @apply bg-green-100 border-green-300;
}

.external-elf-section {
  @apply border-t border-gray-100 mt-2 pt-2;
}

.external-path-input {
  @apply px-3 pb-2;
}

.path-input {
  @apply w-full px-3 py-2 border border-gray-300 rounded text-sm;
  @apply focus:outline-none focus:ring-2 focus:ring-blue-500;
}

.no-tests {
  @apply p-4 text-center text-gray-400 text-sm;
}

.signal-checkboxes {
  @apply p-2 space-y-2;
}

.signal-checkbox {
  @apply flex items-center gap-3 px-3 py-2 rounded cursor-pointer;
  @apply hover:bg-gray-50 border border-gray-200;
}

.signal-checkbox.checked {
  @apply bg-green-50 border-green-200;
}

.signal-checkbox input {
  @apply hidden;
}

.check-icon {
  @apply text-gray-300;
}

.signal-checkbox.checked .check-icon {
  @apply text-green-500;
}

.signal-info {
  @apply flex flex-col;
}

.signal-info .signal-name {
  @apply text-sm font-medium text-gray-800;
}

.signal-info .signal-desc {
  @apply text-xs text-gray-500;
}

.preview-content {
  @apply p-3;
}

.preview-test {
  @apply flex items-center gap-2 mb-2;
}

.preview-label {
  @apply text-xs text-gray-500;
}

.preview-test-name {
  @apply text-sm font-medium text-blue-600;
}

.no-signals {
  @apply text-sm text-gray-400 text-center py-2;
}

.preview-hint {
  @apply text-sm text-orange-600 text-center py-2 bg-orange-50 rounded;
}

.preview-signals {
  @apply flex gap-2 flex-wrap;
}

.preview-tag {
  @apply px-3 py-1 bg-blue-100 text-blue-700 text-sm rounded-full;
}

.actions {
  @apply flex justify-end gap-2 pt-2;
}

.btn-cancel {
  @apply px-4 py-2 text-gray-600 bg-gray-100 rounded hover:bg-gray-200 transition-colors;
}

.btn-disable {
  @apply px-4 py-2 text-white bg-red-500 rounded hover:bg-red-600 transition-colors;
}

.btn-confirm {
  @apply px-4 py-2 text-white bg-blue-500 rounded hover:bg-blue-600 transition-colors;
}

.btn-confirm:disabled {
  @apply bg-gray-300 cursor-not-allowed;
}

.btn-load-test {
  @apply px-4 py-2 text-white bg-green-500 rounded hover:bg-green-600 transition-colors;
}
</style>
