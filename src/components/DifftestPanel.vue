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
  X,
  ListChecks
} from 'lucide-vue-next';

/** 引入全局流水线状态仓库，用于读写差分测试配置与执行加载操作 */
const pipelineStore = usePipelineStore();

/** 当前选中的教学场景编号；0 表示"自由模式"，>0 对应 store 中具体教学场景 */
const selectedScenario = ref(0);
/** 自由模式下用户手动勾选的信号 ID 列表，作为差分测试的参考答案 */
const customSignals = ref<string[]>([]);
/** 是否已应用差分测试配置（绑定到 store 中的 difftestConfig.enabled） */
const isApplied = computed(() => pipelineStore.difftestConfig.enabled);
/** 当前已选中的测试用例名称（教学测试或 ELF 测试） */
const selectedTestName = ref('');
/** 已选中的测试是否为 ELF 格式（riscv-tests 编译产物） */
const isElfTest = ref(false);
/** 是否正在异步加载测试用例列表（用于显示"加载中"提示） */
const isLoadingTests = ref(false);
/** 是否使用外部自定义 ELF 文件路径进行加载 */
const isExternalElf = ref(false);
/** 外部 ELF 文件的路径，仅在 isExternalElf 为 true 时有效 */
const externalElfPath = ref('');

/**
 * 场景编号到 store 内部 key 的映射表。
 * 0（自由模式）不在此映射内，会走"不过滤"分支。
 */
const scenarioIdToKey: Record<number, string> = {
  1: 'scenario1',
  2: 'scenario2',
  3: 'scenario3',
  4: 'scenario4',
};

/**
 * 根据 selectedScenario 查找当前激活的教学场景对象。
 * @returns 当前场景对象，未匹配到时返回 undefined
 */
const currentScenario = computed(() => {
  return pipelineStore.teachingScenarios.find(s => s.id === selectedScenario.value);
});

/**
 * 计算实际用于差分测试的信号集合：
 * - 自由模式下使用用户自定义勾选的信号
 * - 其他场景下使用该场景内置的信号列表
 */
const selectedSignals = computed(() => {
  if (selectedScenario.value === 0) {
    // 自由模式：使用用户手动勾选的自定义信号
    return customSignals.value;
  }
  // 教学场景：使用场景自带的参考答案信号集
  return currentScenario.value?.signals || [];
});

/**
 * 按当前场景过滤后的"教学测试"列表（不含 ELF 测试）。
 * 自由模式或无映射时返回全部；否则只保留与当前场景匹配或标记为 all 的测试。
 */
const filteredTests = computed(() => {
  const key = scenarioIdToKey[selectedScenario.value];
  if (!key) return pipelineStore.teachingTests;
  return pipelineStore.teachingTests.filter(t => t.scenario === key || t.scenario === 'all');
});

/**
 * 按当前场景过滤后的"ELF 测试"列表（来自 riscv-tests 编译产物）。
 * 过滤策略与 filteredTests 一致。
 */
const filteredElfTests = computed(() => {
  const key = scenarioIdToKey[selectedScenario.value];
  if (!key) return pipelineStore.elfTests;
  return pipelineStore.elfTests.filter(t => t.scenario === key || t.scenario === 'all');
});

/**
 * 监听 store 中差分测试配置的深变化，用于把"已应用"的配置同步回本地 UI 状态。
 * 仅在 enabled 为 true 时回填，避免禁用态下覆盖用户当前编辑。
 */
watch(() => pipelineStore.difftestConfig, (newConfig) => {
  if (newConfig.enabled) {
    // 同步选中的场景编号
    selectedScenario.value = newConfig.scenario?.id ?? 0;
    // 同步已启用的信号集合（拷贝以避免与 store 共享引用）
    customSignals.value = [...newConfig.enabledSignals];
    // 同步已选测试名称
    selectedTestName.value = newConfig.scenario?.name || '';
  }
}, { immediate: true, deep: true });

/**
 * 监听场景切换：触发测试列表的异步加载，并重置测试选择相关状态。
 * @param newId 切换后的场景编号
 */
watch(selectedScenario, async (newId) => {
  if (newId > 0) {
    // 教学场景变化时拉取对应的测试列表（当前为占位逻辑）
    await loadTestsForScenario(newId);
  }
  // 切换场景后清空之前选中的测试，避免跨场景串台
  selectedTestName.value = '';
  isElfTest.value = false;
  isExternalElf.value = false;
  externalElfPath.value = '';
});

/**
 * 用户点击场景项时调用：仅更新场景编号并重置与测试选择相关的状态。
 * @param id 选中的场景编号
 */
function selectScenario(id: number) {
  // 切场景时清空已选测试，避免显示陈旧选中态
  selectedScenario.value = id;
  selectedTestName.value = '';
  isExternalElf.value = false;
  externalElfPath.value = '';
}

/**
 * 切换自由模式下某个信号的勾选状态（已勾选则取消，未勾选则加入）。
 * @param signalId 信号 ID（如 'RegWrite'、'ALUSrc' 等）
 */
function toggleCustomSignal(signalId: string) {
  // 通过 indexOf 判断当前是否已勾选，便于支持取消操作
  const idx = customSignals.value.indexOf(signalId);
  if (idx >= 0) {
    // 已勾选：从集合中移除
    customSignals.value.splice(idx, 1);
  } else {
    // 未勾选：加入参考答案信号集合
    customSignals.value.push(signalId);
  }
}

/**
 * 用户点击测试用例项时调用，支持"再点一次取消选择"的交互。
 * 选中时会同时记录是教学测试还是 ELF 测试。
 * @param testName 测试名称
 * @param isElf 是否为 ELF 测试，默认 false（教学测试）
 */
function selectTest(testName: string, isElf: boolean = false) {
  if (selectedTestName.value === testName && isElfTest.value === isElf && !isExternalElf.value) {
    // 再次点击同一项：取消选中，恢复"未选测试"状态
    selectedTestName.value = '';
    isElfTest.value = false;
  } else {
    // 选中新的测试：记录名称与类型，并清空外部 ELF 相关状态
    selectedTestName.value = testName;
    isElfTest.value = isElf;
    isExternalElf.value = false;
    externalElfPath.value = '';
  }
}

/**
 * 切换场景时触发的"加载测试"占位逻辑：开启 loading 标志并延时关闭，
 * 用以驱动 UI 上的"加载中…"提示。后续可在此接入真实接口。
 * @param _scenarioId 场景编号（当前未使用，保留以备扩展）
 */
async function loadTestsForScenario(_scenarioId: number) {
  // 显示加载中提示
  isLoadingTests.value = true;
  // 100ms 后自动关闭，避免长时间闪烁（占位延时）
  setTimeout(() => {
    isLoadingTests.value = false;
  }, 100);
}

/**
 * 一站式流程：按当前选择加载对应测试程序（外部 ELF / 教学 ELF / 教学测试），
 * 并在加载完成后启用差分测试。优先级：外部 ELF > 教学 ELF 测试 > 教学测试。
 */
async function loadAndStartTest() {
  // 根据场景类型决定使用哪一组信号作为参考答案
  const signals = selectedScenario.value === 0
    ? customSignals.value
    : currentScenario.value?.signals || [];

  if (isExternalElf.value && externalElfPath.value) {
    // 路径 1：加载用户提供的外部 ELF 文件
    await pipelineStore.loadElf(externalElfPath.value);
  } else if (isElfTest.value && selectedTestName.value) {
    // 路径 2：加载预置的 ELF 测试（来自 riscv-tests）
    await pipelineStore.loadElfTest(selectedTestName.value);
  } else if (selectedTestName.value) {
    // 路径 3：加载教学测试（内置参考答案信号）
    await pipelineStore.loadTeachingTest(selectedTestName.value);
  } else {
    // 没有可加载的目标：直接返回
    return;
  }

  // 加载成功后启用差分测试；currentScenario 在非自由模式下一定存在
  pipelineStore.enableDifftest(currentScenario.value!, signals);
}

/**
 * 仅"确认配置"按钮调用：不加载任何测试程序，直接以当前场景/信号启用差分。
 * 适合用户已经在编辑器中写好代码、希望直接跑差分比对的场景。
 */
function confirmConfig() {
  // 自由模式用自定义信号，教学场景用场景内置信号
  const signals = selectedScenario.value === 0
    ? customSignals.value
    : currentScenario.value?.signals || [];

  // 自由模式没有现成场景对象，构造一个虚拟场景以满足 store 的入参结构
  const scenario = selectedScenario.value === 0
    ? { id: 0, name: '自由模式', description: '自定义所有信号', signals: customSignals.value }
    : currentScenario.value!;

  // 将当前 UI 配置写入 store，触发差分测试开启
  pipelineStore.enableDifftest(scenario, signals);
}

/**
 * 禁用差分测试并清空当前已选测试，恢复普通运行模式。
 */
function disableConfig() {
  // 通知 store 关闭差分测试
  pipelineStore.disableDifftest();
  // 同步清空本地选中的测试名，UI 上不再高亮
  selectedTestName.value = '';
}
</script>

<template>
  <!-- 差分测试面板根容器 -->
  <div class="difftest-panel">
    <!-- 面板顶部：标题 + 启用状态徽标 -->
    <div class="panel-header">
      <div class="header-left">
        <FlaskConical class="header-icon" />
        <span class="header-title">差分测试</span>
      </div>
      <!-- 启用状态：根据 isApplied 切换文案与配色 -->
      <div class="header-status" :class="{ active: isApplied }">
        {{ isApplied ? '已启用' : '未启用' }}
      </div>
    </div>

    <!-- 面板正文：纵向排列各功能区块 -->
    <div class="panel-content">
      <!-- 教学场景选择区（必选） -->
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

      <!-- 测试用例选择区（仅在选中教学场景时展示） -->
      <div class="tests-section" v-if="selectedScenario > 0">
        <div class="section-label">
          <FileCode class="section-icon" />
          <span>测试用例（非必选）</span>
          <!-- 异步加载测试时的提示文案 -->
          <span v-if="isLoadingTests" class="loading-text">加载中...</span>
        </div>

        <!-- ELF 测试列表（来自 riscv-tests，绿色高亮） -->
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

        <!-- 教学测试列表（内置参考答案信号） -->
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

        <!-- 当前场景下无任何配套测试时的占位提示 -->
        <div class="no-tests" v-if="!isLoadingTests && filteredTests.length === 0 && filteredElfTests.length === 0">
          暂无配套测试用例
        </div>
      </div>

      <!-- 自定义信号勾选区（仅在自由模式下展示） -->
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

      <!-- 当前配置预览区：展示已选测试、信号集合及必要的提示 -->
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

      <!-- 操作按钮区：根据当前状态显示"禁用 / 加载并运行 / 确认配置" -->
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

      <!-- 使用步骤说明（教学引导文档：6 步走通差分测试流程） -->
      <div class="usage-section">
        <div class="section-label">
          <ListChecks class="section-icon" />
          <span>使用步骤</span>
        </div>
        <p class="usage-intro">
          差分测试：把"用户填入的信号"当作参考答案，运行时每个 step 都会和模拟器实
          际生成的信号比对，不一致就弹窗告警。
        </p>
        <ol class="usage-list">
          <li>
            <span class="step-tag">1</span>
            <span class="step-text">
              <b>选教学场景</b>：4 个递进场景分别覆盖
              <code>RegWrite</code> / <code>ALUSrc</code> / <code>MemRead+MemWrite</code> /
              <code>Branch</code>，或选"自由模式"自定义。
            </span>
          </li>
          <li>
            <span class="step-tag">2</span>
            <span class="step-text">
              <b>选测试用例</b>：下方列表按场景过滤，每个教学测试内置了一组正确信号；
              绿色高亮的 ELF 测试是从 riscv-tests 编译的真实用例（更严格）。
            </span>
          </li>
          <li>
            <span class="step-tag">3</span>
            <span class="step-text">
              <b>加载并运行</b>：自动加载测试程序并启用差分，状态条变为"已启用"。
              未选测试时也可手动点"确认配置"以当前编辑器代码运行。
            </span>
          </li>
          <li>
            <span class="step-tag">4</span>
            <span class="step-text">
              <b>单步 / 连续执行</b>：每条指令的"信号预测"会和模拟器实
              际生成的信号比对。控制信号栏里，被勾选的信号会高亮显示参考答案。
            </span>
          </li>
          <li>
            <span class="step-tag">5</span>
            <span class="step-text">
              <b>查看不匹配</b>：若预测 ≠ 实际，自动弹出
              <code>Diff 结果</code>对话框，列出 PC、参考信号、实际信号。
              点"跳到该指令"可在流水线视图定位。
            </span>
          </li>
          <li>
            <span class="step-tag">6</span>
            <span class="step-text">
              <b>完成后禁用</b>：点红色"禁用"按钮恢复普通运行模式。
            </span>
          </li>
        </ol>
        <div class="usage-tip">
          <b>教学要点</b>：从场景 1 开始，逐步打开更多信号，可以观察 5 级流水线
          中信号 valid 的"逐拍推进"——同一拍下不同信号可能属于不同指令，靠
          参考答案 vs 实际生成的对比，能直观看到数据冒险和控制冒险如何被处理。
        </div>
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
  transform: translateY(-0.125rem);
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
  transform: translateY(-0.0625rem);
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
  padding: 0.75rem 0.5rem;
  border-radius: 0.5rem;
  border: 0.125rem  solid #fde68a;
  background: white;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

.signal-item:hover {
  border-color: #f59e0b;
  background: #fef3c7;
  transform: translateY(-0.125rem);
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
  transform: translateY(-0.0625rem);
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
  transform: translateY(-0.0625rem);
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
  transform: translateY(-0.0625rem);
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

/* 使用步骤区块样式 */
.usage-section {
  background: linear-gradient(135deg, #f5f3ff 0%, #f8fafc 100%);
  border-radius: 0.5rem;
  padding: 0.875rem;
  border: 1px solid #ddd6fe;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
}

.usage-section .section-label {
  margin-bottom: 0.25rem;
  color: #5b21b6;
}

.usage-section .section-icon {
  color: #7c3aed;
}

.usage-intro {
  font-size: 0.75rem;
  color: #475569;
  line-height: 1.6;
  background: white;
  padding: 0.5rem 0.75rem;
  border-radius: 0.375rem;
  border: 1px solid #e2e8f0;
}

.usage-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  counter-reset: none;
}

.usage-list li {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  padding: 0.5rem 0.625rem;
  background: white;
  border-radius: 0.375rem;
  border: 1px solid #e2e8f0;
  font-size: 0.75rem;
  color: #334155;
  line-height: 1.55;
}

.usage-list li:hover {
  border-color: #a78bfa;
  background: #faf5ff;
}

.step-tag {
  flex-shrink: 0;
  width: 1.125rem;
  height: 1.125rem;
  border-radius: 50%;
  background: linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%);
  color: white;
  font-size: 0.6875rem;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-top: 0.0625rem;
  box-shadow: 0 1px 2px rgba(124, 58, 237, 0.3);
}

.step-text {
  flex: 1;
}

.step-text b {
  color: #5b21b6;
  font-weight: 700;
}

.step-text code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.6875rem;
  padding: 0.0625rem 0.3125rem;
  background: #ede9fe;
  color: #6d28d9;
  border-radius: 0.25rem;
  border: 1px solid #ddd6fe;
  margin: 0 0.125rem;
}

.usage-tip {
  font-size: 0.6875rem;
  color: #64748b;
  line-height: 1.6;
  padding: 0.5rem 0.75rem;
  background: #fefce8;
  border-left: 3px solid #eab308;
  border-radius: 0.25rem;
}

.usage-tip b {
  color: #854d0e;
  font-weight: 700;
}
</style>
