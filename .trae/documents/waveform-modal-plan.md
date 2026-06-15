# 流水线波形图区域实现计划

## Summary

在 RISC-V 五级流水线虚拟仿真软件中，新增一个**与"流水线细节"互斥占位的波形图区域**——两者共享中央 `pipeline-section` 这一大块空间，**通过 ControlPanel 顶栏新增的"波形/流水线"切换按钮**在两种视图之间互切。

- **位置**：[src/App.vue](file:///var/www/riscv-pipeline-frontend/src/App.vue) 的 `<div class="pipeline-section">`（占满中央可视区的高 × 宽）— 原本只渲染 `<PipelineEditor />`，现在用 `v-if` 二选一渲染 `<PipelineEditor />` 或 `<WaveformPanel />`。
- **数据来源**：[src/stores/pipeline.ts](file:///var/www/riscv-pipeline-frontend/src/stores/pipeline.ts) 新增 `signalHistory` 数组，每个 cycle 推入一份全量信号快照；**采用 FIFO 滑窗**，到达 `MAX_HISTORY = 256` 拍后**自动丢弃最早的记录**。
- **展示方式**：波形区域使用原生 SVG 渲染，提供**信号分组（按 stage/类型）+ 用户勾选**的工具条；选中的信号按 cycle 从左到右绘制为方波（1-bit）或带数值标注的位变化（多 bit）。
- **排版调整**：按用户要求对 ControlPanel 现有按钮做一次尺寸微调，让"流水线/波形"切换按钮与"下一 clk / 运行 / 暂停 / 重置"排版一致。

---

## Current State Analysis

### 关键现状
- 中央区域：当前 [src/App.vue](file:///var/www/riscv-pipeline-frontend/src/App.vue) 的 `center-column` 由 `ControlPanel`（顶）+ `pipeline-section`（中，flex:1 占据大部分空间）构成；`pipeline-section` 内只放 `<PipelineEditor />`（[App.vue#L60-L64](file:///var/www/riscv-pipeline-frontend/src/App.vue#L60-L64)）。这块空间宽 ~视口 - 左/右侧面板，且高度剩余 ≥ 25rem（[style.css 响应式](file:///var/www/riscv-pipeline-frontend/src/App.vue#L190-L203)），天然适合做宽幅时间序列图。
- 状态管理：[src/stores/pipeline.ts](file:///var/www/riscv-pipeline-frontend/src/stores/pipeline.ts) 的 `usePipelineStore` 暴露了：
  - `signals`：当前 cycle 的全量信号（来自后端 WebSocket 推送）；
  - `cycle`：当前时钟周期；
  - `allSignals = computed(() => signals.value ? calculateAllSignals(signals.value) : [])`：扁平化后的 ~30 个信号，每个含 `id / label / value / type / stage / active` — 天然适合做分组（[pipeline.ts#L562-L640](file:///var/www/riscv-pipeline-frontend/src/stores/pipeline.ts#L562-L640)）；
  - `activeModals: ref<string[]>([])` + `openModal(type)` / `closeModal(key?)` — 弹窗注册机制，本期**不再使用**；
  - WebSocket 每拍推送完整 `signals` 快照（[pipeline.ts#L138-L201](file:///var/www/riscv-pipeline-frontend/src/stores/pipeline.ts#L138-L201)），**前端无需后端配合即可累加历史**。
- 顶部控制：[src/components/ControlPanel.vue](file:///var/www/riscv-pipeline-frontend/src/components/ControlPanel.vue) 已有"下一 clk / 运行 / 暂停 / 重置"4 个按钮 + 1 个时间间隔下拉 + 1 个运行状态指示器；现有 `.control-btn` 样式（[ControlPanel.vue#L142-L207](file:///var/www/riscv-pipeline-frontend/src/components/ControlPanel.vue#L142-L207)）可作为新增切换按钮的视觉参考。
- 已有图标库：`lucide-vue-next`（[package.json#L14](file:///var/www/riscv-pipeline-frontend/package.json#L14)），可选 `Activity / BarChart3 / Waves / LineChart / Cpu`。
- 流水线编辑器：本身可拖拽、可缩放、可点击模块打开弹窗，**完全不动**。

### 不需要改的部分
- 后端、WebSocket 协议、`vite.config.ts`、`tsconfig.*`、`style.css`（除非需补 1-2 个波形用色）。
- [src/components/PipelineEditor.vue](file:///var/www/riscv-pipeline-frontend/src/components/PipelineEditor.vue) 本体。
- 弹窗系统（[src/stores/pipeline.ts#activeModals](file:///var/www/riscv-pipeline-frontend/src/stores/pipeline.ts#L49)）与 `DraggableModal.vue` — 本期不创建新弹窗。
- 停靠面板系统（[src/stores/panel.ts](file:///var/www/riscv-pipeline-frontend/src/stores/panel.ts)）。

---

## Proposed Changes

### 1. 扩展类型（[src/types/index.ts](file:///var/www/riscv-pipeline-frontend/src/types/index.ts)）

不扩展 `ModalType`（不再走弹窗机制）。在文件末尾新增：

```ts
// 视图模式：中央 pipeline-section 区域显示哪种视图
export type CenterView = 'pipeline' | 'waveform';

// 单拍波形快照（用于 FIFO 滑窗历史累加）
export interface WaveformSnapshot {
  cycle: number;
  timestamp: number;
  // key = signal.id (from calculateAllSignals), value 为该 cycle 的显示值
  values: Record<string, string>;
  // 该 cycle 活跃的信号 id 集合（用于方波着色）
  activeIds: Set<string>;
}
```

### 2. Store 改造（[src/stores/pipeline.ts](file:///var/www/riscv-pipeline-frontend/src/stores/pipeline.ts)）

1. 顶部 import 增加 `type { CenterView, WaveformSnapshot } from '../types'`。
2. 在 store 内新增：
   - `centerView = ref<CenterView>('pipeline')` — 当前中央区域显示哪种视图（默认流水线细节）；
   - `signalHistory = ref<WaveformSnapshot[]>([])` — 累加的波形快照；
   - `MAX_HISTORY = 256` 常量 — 防止长时间运行撑爆内存；
   - `historyRecording = ref(true)` — 录制开关（默认开，提供按钮可暂停/继续）；
   - `selectedSignalIds = ref<Set<string>>(new Set())` — 用户在波形区域内勾选要展示的信号 id 集合。
3. **`updateStateFromSignals` 末尾调用 `appendHistorySnapshot(sigs)`**（**FIFO 滑窗，丢弃最早的记录**）：
   - 若 `!historyRecording.value` 则直接 return；
   - 用 `calculateAllSignals(sigs)` 得到当拍所有信号，转成 `{id → value}` 映射 + `activeIds` 集合；
   - **若 `signalHistory.value.length >= MAX_HISTORY`（默认 256 拍），先 `shift()` 队首丢弃最旧的一条，再 `push()` 当前快照** —— 即滚动窗口，最早的记录被自动挤出；
   - 入参若 cycle 与队尾 cycle 相同则覆盖（防止重复步进写入两次）；
   - 整体容量恒定 ≤ `MAX_HISTORY`，内存可控。
4. **切换方法**（在 `return` 块）：
   - `setCenterView(view: CenterView): void` — 设置当前中央区域视图；
   - `toggleCenterView(): void` — 在 `'pipeline'` ↔ `'waveform'` 之间切换；
5. **历史与勾选方法**：
   - `clearHistory(): void` — 清空 `signalHistory`；
   - `toggleHistoryRecording(): void` — 切换 `historyRecording`；
   - `toggleSignalSelected(id: string): void` — 勾选/取消勾选；
   - `selectAllSignals(): void` / `deselectAllSignals(): void`；
   - `setSignalGroupSelected(stage: string, selected: boolean): void` — 按 stage 批量勾选。
6. **不动 `openModal` / `activeModals` 现有逻辑**。

### 3. 新增波形组件（[src/components/WaveformPanel.vue](file:///var/www/riscv-pipeline-frontend/src/components/WaveformPanel.vue)，新建）

**不是 modal**，直接渲染到 `pipeline-section` 占满区域。不依赖 `DraggableModal`。

#### 整体布局
```
┌─ pipeline-section（v-if="centerView==='waveform'"）────────────┐
│  顶栏工具条（h ≈ 3rem）                                         │
│  [录制中/暂停] [清空历史] [跳转最新▸] | IF/ID ☐ ID/EX ☐ ...   │
│  ─────────────────────────────────────────────────────────────  │
│  主画布（flex:1，overflow:auto）                                 │
│  ┌─左侧行标签─┐ ┌─顶部 cycle 标尺─┐                              │
│  │IF_valid   │ │  10  11  12 ... │                              │
│  │IF_PC      │ │                  │                              │
│  │ID_rs1_data│ │  方波/数值波形   │                              │
│  │...        │ │                  │                              │
│  └───────────┘ └──────────────────┘                              │
└────────────────────────────────────────────────────────────────┘
```

#### 关键实现
- **顶栏（信号分组勾选条）**：
  - 一行横向 chip 列表，每个 chip 是 `<label><input type="checkbox"> {stage} (N)</label>`；
  - chip 内联计数：当前已勾选/总信号数；点击 → `setSignalGroupSelected(stage, bool)`；
  - 右侧操作按钮组：暂停/继续录制（`Pause`/`Play`）、清空历史（`Trash2`）、跳转最新（`ChevronsRight`，让画布横向滚动到最右 — 持续运行时跟随新数据）；
  - 状态文本：`已记录 N 拍 / 上限 256 拍 · 录制中/已暂停`。
- **主画布（SVG）**：
  - 横向：每个 cycle 占 `COLUMN_WIDTH = 32px`，整体 `overflow-x: auto`；
  - 纵向：每个被选信号占 `ROW_HEIGHT = 26px`；行标签贴在左侧 `8rem` 区域（信号名 + 当前 value 缩写）；
  - 1-bit 信号（`type === 'control'` 且 value 为 '0'/'1'）：绘制低/高台阶（`<rect>` 或 `<path>`），active 用 `--color-data-flow`（[style.css#L21-L26](file:///var/www/riscv-pipeline-frontend/src/style.css#L21-L26)），否则 `slate-400`；
  - 多 bit 信号（`type === 'addr'`/`data`）：每个 cycle 一段水平线 + 变化点上方写 hex 值；
  - 当前 cycle 整列高亮（半透明蓝 `rgba(59,130,246,0.1)`）；
  - 鼠标 hover 单格 → tooltip 显示 `{signal} @ cycle N: 0x...`；
  - 顶部标尺每 5/10 cycle 标数字。
- **关键 computed**：
  - `displayedSignals`：从 `selectedSignalIds` 过滤 `calculateAllSignals(signals.value)`，按 stage 排序输出；
  - `signalRows = computed(() => signalHistory.value.map(snap => snap.values))`；
  - `currentCycle = computed(() => pipelineStore.cycle)` 用于高亮。
- **性能**：`signalHistory` ≤ 256、`displayedSignals` ≤ 30，最多 ~7680 单元，原生 SVG 足够；无需 canvas 或图表库；不引入新依赖。
- **自动滚动**：当 `centerView === 'waveform'` 且 `signalHistory.length` 变化时，如"跳转最新"已开启（默认），让 SVG 容器的 `scrollLeft` 跟随到末尾；用户手动横向滚动则暂停自动跟随，再次点击"跳转最新"恢复。

### 4. 切换按钮（[src/components/ControlPanel.vue](file:///var/www/riscv-pipeline-frontend/src/components/ControlPanel.vue)）

1. `<script setup>` 顶部追加 `import { Activity, Cpu } from 'lucide-vue-next'`（或其他两个对照图标，按视觉选）。
2. 在"重置"按钮之后、状态指示器之前插入**切换按钮**（在 `button-section` 区域内）：

   ```html
   <button
     @click="pipelineStore.toggleCenterView()"
     class="control-btn view-toggle-btn"
     :class="{ active: pipelineStore.centerView === 'waveform' }"
     :title="pipelineStore.centerView === 'waveform' ? '切换到流水线细节' : '切换到波形图'"
   >
     <Activity v-if="pipelineStore.centerView !== 'waveform'" class="w-4 h-4" />
     <Cpu v-else class="w-4 h-4" />
     <span>{{ pipelineStore.centerView === 'waveform' ? '流水线' : '波形' }}</span>
   </button>
   ```
   - 含义：当前显示的是波形 → 按钮文案显示"流水线"（点击切回去）；当前是流水线 → 按钮文案显示"波形"（点击切过去）。图标对应"切到什么视图"。
3. **按钮尺寸微调**（用户要求）：
   - `.button-section` 的 `gap` 由 `clamp(0.25rem, 1vw, 0.5rem)` → `clamp(0.375rem, 1.2vw, 0.625rem)`，给新增按钮预留空隙；
   - `.control-btn` 字号上限从 `0.75rem` → `0.8125rem`（下限不变，避免窄屏溢出）；
   - `.control-btn` padding 横向从 `0.5rem–0.75rem` → `0.625rem–0.875rem`；
   - `.control-panel` 横向 padding 视情况从 `1rem 1.5rem` → `0.875rem 1.5rem` 维持视觉密度；
   - 新增 `.view-toggle-btn` 单独配色（如蓝/紫切换以提示"视图模式"） + `.view-toggle-btn.active` 强调态（如反色或高亮描边）。
4. 不加全局快捷键（避免与浏览器 `Ctrl+W` 等冲突）。

### 5. 中央区域互切（[src/App.vue](file:///var/www/riscv-pipeline-frontend/src/App.vue)）

1. `<script setup>` 顶部追加 `import WaveformPanel from './components/WaveformPanel.vue';`。
2. 把 `pipeline-section` 内的 `<PipelineEditor />` 替换为 v-if/v-else：

   ```html
   <div class="pipeline-section">
     <PipelineEditor v-if="pipelineStore.centerView === 'pipeline'" />
     <WaveformPanel v-else />
   </div>
   ```
3. 复用现有的 `.pipeline-section` flex 容器样式（[App.vue#L190-L203](file:///var/www/riscv-pipeline-frontend/src/App.vue#L190-L203)）；`WaveformPanel` 内部使用 `display: flex; flex-direction: column; height: 100%` 自适应。
4. 不要移除 `<PipelineEditor />` 任何样式 / 行为。

---

## Assumptions & Decisions

1. **数据来源完全前端累加** — 不动后端协议；store 内累加并在 256 拍滑动窗口裁剪，长时间运行不爆内存。
2. **FIFO 滑窗（用户确认行为）** — 到达 `MAX_HISTORY` 上限（默认 256 拍）后，**新一拍进入时先 `shift()` 队首丢弃最旧的记录再 `push()`**，实现"滚动窗口"语义。容量恒定 ≤ 256，单条快照只存 `cycle` + `values` 字典 + `activeIds` 集合（每条约 30 个字符串 key），约 ~10–20 KB 上限。
3. **视图模式互斥（用户提出方案）** — 中央 `pipeline-section` 在 `PipelineEditor` 与 `WaveformPanel` 之间二选一显示，**通过 ControlPanel 顶栏"波形/流水线"按钮互切**。这样：
   - 波形能拿到 pipeline-section 整块宽幅空间，横向可滚动足够长；
   - 流水线细节视图原貌保留，按钮一键切回；
   - 不引入新的停靠面板或弹窗，UI 简洁。
4. **不引入新依赖** — 复用 `lucide-vue-next`、`tailwindcss`、原生 SVG；新增 `WaveformSnapshot`/`CenterView` 类型与 `signalHistory`/`centerView` ref。
5. **不在 ControlPanel 按钮上加快捷键** — 避免与浏览器 `Ctrl+W` 等冲突；如确需可后续加 `Alt+W`。
6. **信号分组复用 `calculateAllSignals` 的 `stage` 字段** — 不重新归类；与 [InfoPanel](file:///var/www/riscv-pipeline-frontend/src/components/InfoPanel.vue) 的"活跃信号"显示口径一致。
7. **录制/勾选状态走 store** — 关闭/切换视图不清空 `signalHistory` 与 `selectedSignalIds`，方便"波形 → 流水线 → 波形"来回切时数据连续。
8. **不做 v1 导出** — PNG/SVG 导出留作后续迭代；本期不在工具条暴露占位按钮以减少视觉噪音。
9. **"跳转最新"默认开启** — 持续运行时让画布跟随新数据，否则用户会看不到更新的列。

---

## Verification Steps

1. **类型检查 + 构建**
   - 执行 `cd /var/www/riscv-pipeline-frontend && npm run build`；要求 `vue-tsc -b && vite build` 全部通过，无 TS 错误。
2. **视图互切**
   - `npm run dev` 打开浏览器，默认中央区域显示 `<PipelineEditor />`；
   - 点 ControlPanel "波形"按钮 → 中央区域**整块替换**为 `<WaveformPanel />`；按钮文案变为"流水线"，图标也对应切换；
   - 再点一次"流水线"按钮 → 中央区域回到 `<PipelineEditor />`，无重载感。
3. **FIFO 累加 + 滑窗**
   - 多次点击"下一 clk"（至少 10 次），切到波形视图，**主画布出现 10 列**；
   - 关闭并重开浏览器 tab → `signalHistory` 重置为空（store 默认无持久化）；
   - **FIFO 滑窗验证**：连续 step 1000 次（>256 拍）后，断言 `signalHistory.length === 256`，且 `signalHistory[0].cycle === startCycle + 1000 - 256`（最早一条被正确挤出）；新进的 cycle 等于当前 `pipelineStore.cycle`。
4. **勾选交互**
   - 取消勾选某 stage → 该组行从画布消失；勾回 → 出现；
   - 切换"流水线 ↔ 波形"视图后，勾选状态保持（store 持久）；
   - 关闭/重开浏览器 tab 后勾选状态不保留（接受此行为）。
5. **录制开关 + 清空**
   - "清空历史"按钮 → 画布清空、按钮在 `signalHistory.length === 0` 时禁用（如果有此禁用态）；
   - "暂停录制" → 之后 step 不再追加历史，松开 → 恢复。
6. **自动滚动**
   - 进入波形视图、点击"运行"自动跑 → 画布应**自动横向滚动到最右**跟随新数据；
   - 用户手动向左滚动后停止自动跟随；点击"跳转最新"恢复。
7. **排版回归**
   - 浏览器缩放至 992px、768px、576px 三档响应式断点，ControlPanel 5 个按钮（含新增"波形/流水线"切换）不溢出、不换行；按钮高度保持一致。
8. **可访问性 / 健壮性**
   - ESC 键不再关闭波形区域（它不是弹窗了）；
   - 切到流水线视图后，原有 PipelineEditor 的所有交互（缩放、点击模块、弹窗）完全不受影响。

---

## Files Touched (汇总)

| 操作 | 路径 | 用途 |
|------|------|------|
| 修改 | [src/types/index.ts](file:///var/www/riscv-pipeline-frontend/src/types/index.ts) | 新增 `CenterView` / `WaveformSnapshot` 类型 |
| 修改 | [src/stores/pipeline.ts](file:///var/www/riscv-pipeline-frontend/src/stores/pipeline.ts) | 新增 `centerView` / `signalHistory` / `selectedSignalIds` / 录制开关 + 配套方法（`setCenterView` / `toggleCenterView` / `clearHistory` / `toggleHistoryRecording` / `toggleSignalSelected` / `selectAllSignals` / `deselectAllSignals` / `setSignalGroupSelected`） |
| 新建 | [src/components/WaveformPanel.vue](file:///var/www/riscv-pipeline-frontend/src/components/WaveformPanel.vue) | 波形区域组件（占满 `pipeline-section`） |
| 修改 | [src/components/ControlPanel.vue](file:///var/www/riscv-pipeline-frontend/src/components/ControlPanel.vue) | 新增"波形/流水线"切换按钮 + 整体按钮排版微调 |
| 修改 | [src/App.vue](file:///var/www/riscv-pipeline-frontend/src/App.vue) | `pipeline-section` 用 `v-if/v-else` 在 `<PipelineEditor />` 与 `<WaveformPanel />` 之间互切 |
