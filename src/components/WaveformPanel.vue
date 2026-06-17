<script setup lang="ts">
import { computed, nextTick, ref, watch, onMounted } from 'vue';
import { usePipelineStore } from '../stores/pipeline';
import { Pause, Play, Trash2, ChevronsRight, Eraser, CheckSquare, Square } from 'lucide-vue-next';

const pipelineStore = usePipelineStore();

// 几何常量
/**
 * 单拍（一个 cycle）在画布中的横向像素宽度，决定波形密度。
 */
const COLUMN_WIDTH = 32;        // 每一拍在画布中的宽度（px）
/**
 * 波形图中每个信号占用的纵向行高（px）。
 */
const ROW_HEIGHT = 28;          // 每一行（每个信号）高度（px）
/**
 * 画布最左侧用于显示信号名称的固定宽度（px），不随横向滚动而动。
 */
const LEFT_GUTTER = 160;        // 左侧行标签宽度（px）
/**
 * 画布顶部 cycle 标尺所占高度（px），用于绘制 cycle 数字与刻度。
 */
const RULER_HEIGHT = 28;        // 顶部 cycle 标尺高度（px）
/**
 * 1-bit 信号的方波"半高"（px）。实际方波高度为 `AMPLITUDE * 2`。
 */
const AMPLITUDE = 9;            // 1-bit 信号的方波半高（px）

// 画布滚动容器 ref
/**
 * 包裹 SVG 画布的可滚动容器 DOM 引用。
 * 用于：① 跳转到最新一拍（自动跟随）；
 *       ② 监听 `@scroll` 事件判断用户是否手动滚回，从而关闭自动跟随。
 */
const canvasScrollRef = ref<HTMLElement | null>(null);
// 鼠标 hover 显示 tooltip
/**
 * 鼠标悬停在波形上时显示的小提示信息。`null` 表示当前没有 hover。
 * - signal: 信号显示名
 * - cycle:  所在拍编号
 * - value:  该拍该信号的取值
 * - x/y:    tooltip 在容器内的像素坐标（基于 `offsetX/Y + 12` 偏移）
 */
const hoverInfo = ref<{ signal: string; cycle: number; value: string; x: number; y: number } | null>(null);

/**
 * 波形图显示用的"信号卡片"数据结构。
 * 来自后端推送（store.allSignals），但额外补充了模板/渲染需要的 `active` 字段。
 *
 * @property {string} id     信号唯一 id（用于 store 选中集合 `selectedSignalIds`）
 * @property {string} label  在左侧行标签中显示给用户看的名称
 * @property {string} value  当前拍该信号的取值字符串（多 bit 时为 hex）
 * @property {string} type   信号类型；`'control'` 表示控制类（多为 1-bit）
 * @property {string} stage  所属流水线阶段，用于在工具条分组展示
 * @property {boolean} active 预留字段，是否处于活跃高亮态
 */
interface DisplayedSignal {
  id: string;
  label: string;
  value: string;
  type: string;
  stage: string;
  active: boolean;
}

// 当前拍的全部信号（来自 store，刷新于后端推送）
/**
 * 当前后端已推送过来的全部信号列表。
 * 直接代理 `pipelineStore.allSignals`，类型转换为 `DisplayedSignal[]`，
 * 给模板/计算属性提供一个稳定的强类型视图。
 */
const allAvailableSignals = computed<DisplayedSignal[]>(() => {
  return pipelineStore.allSignals as DisplayedSignal[];
});

// 按 stage 分组（保持 stage 出现顺序稳定）
/**
 * 将 `allAvailableSignals` 按 `stage` 字段分组。
 * 保持 stage 在原始数组中首次出现的顺序（不按字母排序），保证工具条 chip 顺序稳定。
 *
 * @returns {Array<{stage: string, signals: DisplayedSignal[]}>} 阶段分组后的信号列表
 */
const groupedSignals = computed(() => {
  // groups: 分组结果；idx: stage → 在 groups 中下标的快速查找表
  const groups: { stage: string; signals: DisplayedSignal[] }[] = [];
  const idx = new Map<string, number>();
  for (const s of allAvailableSignals.value) {
    // 首次出现该 stage：新建一个分组并记录下标
    let i = idx.get(s.stage);
    if (i === undefined) {
      i = groups.length;
      idx.set(s.stage, i);
      groups.push({ stage: s.stage, signals: [] });
    }
    // 把当前信号塞到对应分组末尾
    const group = groups[i];
    if (group) group.signals.push(s);
  }
  return groups;
});

// 已选信号（按 stage 顺序），仅用于画布渲染
/**
 * 用户已勾选、需要在画布上绘制波形的信号集合。
 * 顺序与 `groupedSignals` 一致（即按 stage 出现顺序，再按 stage 内顺序）。
 * 注意：结果只用于画布渲染，工具条 chip 排序仍走 `groupedSignals`。
 *
 * @returns {DisplayedSignal[]} 已选信号的有序列表；一个都没勾选时返回 `[]`
 */
const displayedSignals = computed<DisplayedSignal[]>(() => {
  const sel = pipelineStore.selectedSignalIds;
  // 快速短路：没有任何勾选时直接返回空，画布会显示"请勾选信号"的占位
  if (sel.size === 0) return [];
  const list: DisplayedSignal[] = [];
  // 保持 stage 分组顺序遍历，依次挑出已选信号
  for (const g of groupedSignals.value) {
    for (const s of g.signals) {
      if (sel.has(s.id)) list.push(s);
    }
  }
  return list;
});

// 当前组的"是否全部已选" — 用于 group checkbox
/**
 * 判断指定 stage 分组下的信号是否**全部**已被用户勾选。
 * 用于工具条 chip 的"全选"图标显示与 active 状态。
 *
 * @param {string} stage 流水线阶段名
 * @returns {boolean} 该组内每个信号都在 `selectedSignalIds` 中；空组返回 `false`
 */
const isStageAllSelected = (stage: string) => {
  const sel = pipelineStore.selectedSignalIds;
  // 在分组结果中按 stage 查找；找不到时退化为空数组
  const list = groupedSignals.value.find(g => g.stage === stage)?.signals ?? [];
  // 空组直接判 false，避免 `every` 在空数组上返回 true 造成误判
  if (list.length === 0) return false;
  return list.every(s => sel.has(s.id));
};
/**
 * 判断指定 stage 分组是否处于"半选"状态：勾选了一部分但不是全部。
 * 用于工具条 chip 渲染"对勾方块"中间态图标。
 *
 * @param {string} stage 流水线阶段名
 * @returns {boolean} 0 < 已选数量 < 该组总数
 */
const isStagePartial = (stage: string) => {
  const sel = pipelineStore.selectedSignalIds;
  const list = groupedSignals.value.find(g => g.stage === stage)?.signals ?? [];
  // 统计已选数量；只有"部分选"才返回 true（排除全空和全选）
  const cnt = list.filter(s => sel.has(s.id)).length;
  return cnt > 0 && cnt < list.length;
};
/**
 * 切换某个 stage 分组的勾选状态。
 * 语义：已全选 → 全部取消；否则（含半选/全空） → 整组勾选。
 * 实际写入逻辑由 `pipelineStore.setSignalGroupSelected` 承担。
 *
 * @param {string} stage 流水线阶段名
 * @returns {void}
 */
const onGroupToggle = (stage: string) => {
  // 已全选则反向操作（取消整组），否则一律视为"勾选整组"
  if (isStageAllSelected(stage)) {
    pipelineStore.setSignalGroupSelected(stage, false);
  } else {
    pipelineStore.setSignalGroupSelected(stage, true);
  }
};

// 1-bit vs 多 bit 判定（type === 'control' 且 value 为 '0'/'1'/'true'/'false' 视作 1-bit）
/**
 * 判断某个信号是否按"1-bit 方波"渲染。
 * 判定规则：type 为 `'control'` 且其取值为 `0/1/true/false`（忽略大小写、忽略前后空格）。
 *
 * @param {string} signalType 信号类型（一般取 `DisplayedSignal.type`）
 * @param {string} value      信号当前取值字符串
 * @returns {boolean} 是否按 1-bit 方波绘制；多 bit 信号返回 `false`
 */
function isOneBit(signalType: string, value: string): boolean {
  // 非 control 类型一律按多 bit 处理（数值可能是地址、立即数等）
  if (signalType !== 'control') return false;
  // 统一归一化到小写字符串，避免后端大小写/空格不一致
  const v = String(value).trim().toLowerCase();
  return v === '0' || v === '1' || v === 'true' || v === 'false';
}

// 画布几何
/**
 * SVG 画布的总宽度（px）：
 * `左侧行标签宽度 + 信号历史拍数 × 单拍宽度`。
 * 至少保留 1 拍宽度，避免空历史时画布宽度过窄。
 */
const canvasWidth = computed(() => {
  // Math.max(1, ...) 保证历史为空时画布仍有 1 列宽，方便显示空状态
  return LEFT_GUTTER + Math.max(1, pipelineStore.signalHistory.length) * COLUMN_WIDTH;
});
/**
 * SVG 画布的总高度（px）：
 * `顶部标尺高度 + 已选信号数 × 单行高度`。
 * 仅基于"已显示"的信号计算，与 `displayedSignals` 数量保持同步。
 */
const canvasHeight = computed(() => {
  // Math.max(1, ...) 同样保证空选时画布有最小高度
  return RULER_HEIGHT + Math.max(1, displayedSignals.value.length) * ROW_HEIGHT;
});

// 当前 cycle 列索引（用于高亮）
/**
 * 标记"当前活跃 cycle"在历史数组中的下标。
 * 约定：最后一列即为最新一拍。空历史时返回 `-1`（让模板跳过高亮列渲染）。
 *
 * @returns {number} 当前 cycle 在 `signalHistory` 中的下标；空历史返回 `-1`
 */
const currentColumnIndex = computed(() => {
  const list = pipelineStore.signalHistory;
  if (list.length === 0) return -1;
  // 通常最后一列就是当前 cycle；但若 CPU 发生过 reset/history 被清空则不一定
  return list.length - 1;
});

// 标尺刻度文字（每 5 拍）
/**
 * 顶部 cycle 标尺上需要绘制的刻度列表。
 * 规则：每 5 拍打一个刻度，并且最后一拍强制打一个（让用户看到"现在"）。
 *
 * @returns {Array<{cycle: number, x: number}>} 刻度对应的 cycle 编号与 SVG 像素 x 坐标
 */
const rulerTicks = computed(() => {
  const list = pipelineStore.signalHistory;
  const out: { cycle: number; x: number }[] = [];
  for (let i = 0; i < list.length; i++) {
    const snap = list[i];
    if (!snap) continue;
    // 每 5 拍一个刻度 + 最后一拍强制一个，避免长历史末尾没有刻度
    if (i % 5 === 0 || i === list.length - 1) {
      // 像素 x = 左侧标签宽度 + 列索引 × 单拍宽度
      out.push({ cycle: snap.cycle, x: LEFT_GUTTER + i * COLUMN_WIDTH });
    }
  }
  return out;
});

// 给定一个信号行 + 快照列 → 构造 SVG 路径或矩形
/**
 * 描述波形中**一个**绘制单元（rect 或 line）的数据结构。
 * `buildRowPieces` 产出这些 piece 后，由模板直接渲染为 SVG 元素。
 *
 * @property {'rect'|'line'} kind    渲染类型：rect 方块 / line 水平线
 * @property {number} x              起始 x 坐标（px）
 * @property {number} y              起始 y 坐标（px）
 * @property {number} [width]        宽度（px）；line 类型时表示水平线长度
 * @property {number} [height]       高度（px）；line 类型时为 0
 * @property {{text:string,x:number,y:number}} [label] 变化点处显示的 hex 标签（仅多 bit 变化点用）
 * @property {boolean} [high]        1-bit 信号当前台阶是否处于"高电平"
 * @property {boolean} [active]      本段是否对应"该拍活跃"的信号，用于着色
 */
interface RowPiece {
  kind: 'rect' | 'line';
  x: number;
  y: number;
  width?: number;
  height?: number;
  // 变化点的 hex 标签
  label?: { text: string; x: number; y: number };
  // 1-bit 高/低值
  high?: boolean;
  // 是否活跃
  active?: boolean;
}

/**
 * 根据行号计算该信号行的顶部 y 坐标（px）。
 * 行的纵向布局：`RULER_HEIGHT` 之下，每行 `ROW_HEIGHT` 高。
 *
 * @param {number} rowIndex 信号在已选列表中的下标（0-based）
 * @returns {number} 该行在画布上的 y 坐标
 */
function rowY(rowIndex: number): number {
  return RULER_HEIGHT + rowIndex * ROW_HEIGHT;
}

/**
 * 为指定信号行构造整行的 `RowPiece[]` 序列。
 * 内部按 1-bit / 多 bit 走两套不同策略：
 *  - 1-bit：方波台阶 + 跳变竖线
 *  - 多 bit：水平基线 + 变化点处的 hex 标签
 *
 * @param {DisplayedSignal} signal   当前要绘制的信号
 * @param {number}          rowIndex 信号在已选列表中的下标（用于纵向定位）
 * @returns {RowPiece[]}            该行所有需要绘制的图元列表
 */
function buildRowPieces(signal: DisplayedSignal, rowIndex: number): RowPiece[] {
  const list = pipelineStore.signalHistory;
  if (list.length === 0) return [];
  const pieces: RowPiece[] = [];
  // 判断按 1-bit 方波还是多 bit 标签线渲染
  const oneBit = isOneBit(signal.type, signal.value);
  // 行内坐标：yMid 是行的中线（多 bit 基线），yHigh/yLow 是 1-bit 高低电平的台阶
  const yMid = rowY(rowIndex) + ROW_HEIGHT / 2;
  const yHigh = rowY(rowIndex) + (ROW_HEIGHT - AMPLITUDE * 2) / 2;
  const yLow = rowY(rowIndex) + (ROW_HEIGHT - AMPLITUDE * 2) / 2 + AMPLITUDE * 2;

  if (oneBit) {
    // 1-bit：方波台阶；遍历每一列判断 active + 与上一拍是否相同
    let prevActive: boolean | null = null;
    for (let i = 0; i < list.length; i++) {
      const snap = list[i];
      if (!snap) continue;
      // 当前拍该信号是否处于"活跃"（即被后端标记为这一拍在变）
      const cur = snap.activeIds.has(signal.id);
      // 该拍在画布上的起始 x 坐标
      const x = LEFT_GUTTER + i * COLUMN_WIDTH;
      if (prevActive === null) {
        // 起点：根据当前 active 画一个台阶
        pieces.push({
          kind: 'rect',
          x,
          y: cur ? yHigh : yLow,
          width: COLUMN_WIDTH,
          height: AMPLITUDE * 2,
          high: cur,
          active: cur,
        });
      } else {
        const last = pieces[pieces.length - 1];
        const targetY = cur ? yHigh : yLow;
        if (last && last.y !== targetY) {
          // 切换：关闭上一段、画一个竖直跳变（rect 占满整行高度）
          // 1) 把上一段"封口"：宽度收窄到当前 x 之前，避免覆盖到跳变竖线
          pieces[pieces.length - 1] = {
            kind: last.kind,
            x: last.x,
            y: last.y,
            width: x - last.x,
            height: last.height,
            high: last.high,
            active: last.active,
          };
          // 2) 画一根从 last.y 到 targetY 的 2px 宽竖直跳变线
          pieces.push({
            kind: 'rect',
            x: x - 1,
            y: Math.min(last.y, targetY),
            width: 2,
            height: Math.abs(targetY - last.y) + AMPLITUDE * 2,
            high: cur,
            active: cur,
          });
        }
        // 新台阶（高亮色填充）
        pieces.push({
          kind: 'rect',
          x,
          y: targetY,
          width: COLUMN_WIDTH,
          height: AMPLITUDE * 2,
          high: cur,
          active: cur,
        });
      }
      prevActive = cur;
    }
    // 修正最后一段宽度（最后一个台阶只画到画布右边界）
    const lastIdx = pieces.length - 1;
    const lastPiece = pieces[lastIdx];
    // 仅当最后一段仍然是"满一列宽"的台阶时才裁剪，避免误改已经被封口的短段
    if (lastPiece && lastPiece.kind === 'rect' && (lastPiece.width ?? 0) >= COLUMN_WIDTH) {
      // 画布右边界 = (最后一拍下标 × COLUMN_WIDTH) + LEFT_GUTTER + COLUMN_WIDTH
      const lastCol = (list.length - 1) * COLUMN_WIDTH + LEFT_GUTTER + COLUMN_WIDTH;
      pieces[lastIdx] = {
        kind: 'rect',
        x: lastPiece.x,
        y: lastPiece.y,
        width: Math.max(0, lastCol - lastPiece.x),
        height: lastPiece.height ?? AMPLITUDE * 2,
        high: lastPiece.high,
        active: lastPiece.active,
      };
    }
  } else {
    // 多 bit：水平线 + 变化点处写 hex 标签
    // 先画一条贯穿整行的水平基线
    pieces.push({
      kind: 'line',
      x: LEFT_GUTTER,
      y: yMid,
      width: list.length * COLUMN_WIDTH,
      height: 0,
      active: true,
    });
    // 仅在"值发生变化"的拍处画一个短竖线 + hex 标签
    let prevVal: string | null = null;
    for (let i = 0; i < list.length; i++) {
      const snap = list[i];
      if (!snap) continue;
      // 当前拍该信号的取值（无值时显示 '-'）
      const val = snap.values[signal.id] ?? '-';
      const x = LEFT_GUTTER + i * COLUMN_WIDTH;
      const active = snap.activeIds.has(signal.id);
      // 仅在值发生变化时画标记，避免重复打扰用户
      if (val !== prevVal) {
        // 1) 一根 2px 短竖线标示变化点
        pieces.push({
          kind: 'rect',
          x: x + 1,
          y: yMid - AMPLITUDE,
          width: 2,
          height: AMPLITUDE * 2,
          active,
        });
        // 2) 紧随其后的水平线 + 短 hex 标签
        pieces.push({
          kind: 'line',
          x,
          y: yMid,
          width: COLUMN_WIDTH,
          height: 0,
          label: { text: shortenValue(val), x: x + 3, y: yMid - 4 },
          active,
        });
        prevVal = val;
      }
    }
  }
  return pieces;
}

/**
 * 缩短信号取值字符串，便于在波形图上的小标签中显示。
 * 规则：
 *  - 空值返回 `'-'`
 *  - `0x` 前缀：保留前 6 位 hex（去除 0x）；超过 6 位追加省略号
 *  - 其他字符串：超过 6 字符截断并加 `…`
 *
 * @param {string} v 原始取值字符串
 * @returns {string} 缩短后用于 UI 显示的字符串
 */
function shortenValue(v: string): string {
  if (!v) return '-';
  // 0x0 / 0x1 / 0x12abc... 保留前 6 位 hex（去掉 0x）
  const s = String(v);
  if (s.startsWith('0x') || s.startsWith('0X')) {
    const hex = s.slice(2);
    if (hex.length <= 6) return s.toUpperCase();
    return '0x' + hex.slice(0, 6).toUpperCase() + '…';
  }
  // 非 hex：按字符长度截断到 6
  return s.length > 6 ? s.slice(0, 6) + '…' : s;
}

/**
 * 鼠标在某个信号的某一拍上移动时的处理：填充 `hoverInfo` 让模板显示 tooltip。
 * 仅在合法拍下标范围内更新；越界或快照缺失则直接忽略。
 *
 * @param {DisplayedSignal} signal    当前悬停的信号
 * @param {number}          snapIndex 信号历史中的下标
 * @param {MouseEvent}      ev        原生鼠标事件（用于 tooltip 定位）
 * @returns {void}
 */
function onCellHover(signal: DisplayedSignal, snapIndex: number, ev: MouseEvent) {
  const list = pipelineStore.signalHistory;
  // 边界检查：snapIndex 必须落在历史数组范围内
  if (snapIndex < 0 || snapIndex >= list.length) return;
  const snap = list[snapIndex];
  if (!snap) return;
  // 填充 tooltip 数据：x/y 偏移 +12px 避免压住光标
  hoverInfo.value = {
    signal: signal.label,
    cycle: snap.cycle,
    value: snap.values[signal.id] ?? '-',
    x: ev.offsetX + 12,
    y: ev.offsetY + 12,
  };
}
/**
 * 鼠标离开所有 hit-area 时清除 tooltip。
 * @returns {void}
 */
function onCellLeave() {
  hoverInfo.value = null;
}

// 自动跳到最新列
/**
 * 将滚动容器横向滚到最右端，使最新一拍（当前 cycle）始终可见。
 * 由"自动跟随"开关和 watch 共同触发。
 *
 * @returns {void}
 */
function scrollToLatest() {
  const el = canvasScrollRef.value;
  if (!el) return;
  // 直接置 scrollLeft = scrollWidth 即可贴右；无需关心 clientWidth
  el.scrollLeft = el.scrollWidth;
}
/**
 * 监听 `signalHistory.length` 变化：每新增一拍时若开启了自动跟随，则
 * 在下一个 tick（DOM 更新后）滚到最右，避免 scrollWidth 还未刷新就被读取。
 */
watch(
  () => pipelineStore.signalHistory.length,
  () => {
    if (pipelineStore.autoFollowLatest) {
      // nextTick 等待 SVG 容器宽度更新后再滚动，确保 scrollWidth 是最新值
      nextTick(scrollToLatest);
    }
  }
);
// 用户手动滚动时关闭自动跟随
/**
 * 用户手动滚动时同步 `autoFollowLatest` 状态：
 *  - 已滚到末尾附近 → 重新开启自动跟随
 *  - 滚回中间或左侧 → 关闭自动跟随
 * 用 -4 容差避免 sub-pixel 误差导致状态抖动。
 *
 * @returns {void}
 */
function onUserScroll() {
  if (!canvasScrollRef.value) return;
  const el = canvasScrollRef.value;
  // 4px 容差：scrollWidth - (scrollLeft + clientWidth) 在 4 以内视为"已到末尾"
  const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 4;
  if (!atEnd && pipelineStore.autoFollowLatest) {
    // 用户主动回看 → 关闭自动跟随，避免覆盖他的视口
    pipelineStore.setAutoFollowLatest(false);
  } else if (atEnd && !pipelineStore.autoFollowLatest) {
    // 滚回末尾 → 重新开启自动跟随
    pipelineStore.setAutoFollowLatest(true);
  }
}

/**
 * 组件挂载后，若当前已开启自动跟随则立即滚到最新列。
 * 包裹在 nextTick 里，确保滚动容器与 SVG 已完成首次布局。
 *
 * @returns {void}
 */
onMounted(() => {
  nextTick(() => {
    if (pipelineStore.autoFollowLatest) scrollToLatest();
  });
});

// 周期高亮列的 x 坐标
/**
 * 当前 cycle 高亮列在画布上的 x 坐标（px）。空历史时返回 `null`，模板据此跳过该 rect 渲染。
 *
 * @returns {number | null} 高亮列的 x 坐标；空历史时为 `null`
 */
const currentColumnX = computed(() => {
  if (currentColumnIndex.value < 0) return null;
  // x = LEFT_GUTTER + 当前列下标 × COLUMN_WIDTH
  return LEFT_GUTTER + currentColumnIndex.value * COLUMN_WIDTH;
});

// 给每行生成 piece 列表（仅在画布区渲染时用）
/**
 * 一次性为所有"已选信号"生成对应行的 piece 列表。
 * 给模板一个稳定的数据源（数组下标即行号），避免在模板中再次内联调用 `buildRowPieces`。
 *
 * @returns {Array<{signal: DisplayedSignal, rowIndex: number, pieces: RowPiece[]}>} 每行一组 piece
 */
const rowsPieces = computed(() => {
  const sigs = displayedSignals.value;
  return sigs.map((s, i) => ({ signal: s, rowIndex: i, pieces: buildRowPieces(s, i) }));
});

// 空状态：尚未记录任何拍
/**
 * 是否处于"空历史"状态：用于工具条按钮的 disabled 与画布空状态占位。
 *
 * @returns {boolean} `signalHistory` 为空时为 `true`
 */
const isEmpty = computed(() => pipelineStore.signalHistory.length === 0);
</script>

<template>
  <div class="waveform-panel">
    <!-- 顶部工具条：标题 + 分组 chip + 控制按钮 -->
    <div class="wf-toolbar">
      <!-- 工具条左侧：标题与录制计数器 -->
      <div class="wf-toolbar-left">
        <span class="wf-title">波形图</span>
        <!-- 录制计数：当前记录拍数 / 最大拍数 + 录制/暂停状态 -->
        <span class="wf-counter">
          已记录 <strong>{{ pipelineStore.signalHistory.length }}</strong> /
          {{ pipelineStore.MAX_HISTORY }} 拍
          <span class="wf-sep">·</span>
          <!-- 录制状态指示：通过 class 切换颜色，文本随状态变化 -->
          <span :class="['wf-rec-state', pipelineStore.historyRecording ? 'on' : 'off']">
            {{ pipelineStore.historyRecording ? '录制中' : '已暂停' }}
          </span>
        </span>
      </div>

      <!-- 工具条中部：按 stage 分组的勾选 chip（支持全选/半选/取消） -->
      <div class="wf-toolbar-mid">
        <!-- 单个 stage 分组的复选框 chip -->
        <label
          v-for="g in groupedSignals"
          :key="g.stage"
          class="wf-chip"
          :class="{
            active: isStageAllSelected(g.stage),
            partial: isStagePartial(g.stage),
          }"
        >
          <input
            type="checkbox"
            :checked="isStageAllSelected(g.stage)"
            @change="onGroupToggle(g.stage)"
          />
          <!-- 三态图标：全选=实心方块、未选=空心方块、半选=蓝色对勾方块 -->
          <CheckSquare v-if="isStageAllSelected(g.stage)" class="wf-chip-icon" />
          <Square v-else-if="!isStagePartial(g.stage)" class="wf-chip-icon" />
          <CheckSquare v-else class="wf-chip-icon partial-icon" />
          <span class="wf-chip-label">{{ g.stage }}</span>
          <!-- 已选/总数 计数角标 -->
          <span class="wf-chip-count">
            {{ g.signals.filter(s => pipelineStore.selectedSignalIds.has(s.id)).length }}/{{ g.signals.length }}
          </span>
        </label>
      </div>

      <!-- 工具条右侧：录制控制、跟随、清空、全选/清勾等动作按钮 -->
      <div class="wf-toolbar-right">
        <!-- 录制开关：暂停/继续录制新的信号快照 -->
        <button
          class="wf-btn"
          :title="pipelineStore.historyRecording ? '暂停录制' : '继续录制'"
          @click="pipelineStore.toggleHistoryRecording()"
        >
          <Pause v-if="pipelineStore.historyRecording" class="wf-btn-icon" />
          <Play v-else class="wf-btn-icon" />
          <span>{{ pipelineStore.historyRecording ? '暂停' : '继续' }}</span>
        </button>
        <!-- 清空历史：清空 signalHistory 数组 -->
        <button
          class="wf-btn danger"
          title="清空历史"
          :disabled="isEmpty"
          @click="pipelineStore.clearHistory()"
        >
          <Eraser class="wf-btn-icon" />
          <span>清空</span>
        </button>
        <!-- 自动跟随开关：开启后新一拍会自动滚到可视区右端 -->
        <button
          class="wf-btn"
          :class="{ active: pipelineStore.autoFollowLatest }"
          title="跳转最新 / 自动跟随"
          @click="pipelineStore.setAutoFollowLatest(!pipelineStore.autoFollowLatest); nextTick(scrollToLatest);"
        >
          <ChevronsRight class="wf-btn-icon" />
          <span>{{ pipelineStore.autoFollowLatest ? '跟随中' : '跳转最新' }}</span>
        </button>
        <!-- 全选所有信号 -->
        <button
          class="wf-btn ghost"
          title="全选所有信号"
          @click="pipelineStore.selectAllSignals()"
        >
          <span>全选</span>
        </button>
        <!-- 取消所有勾选 -->
        <button
          class="wf-btn ghost"
          title="取消全选"
          @click="pipelineStore.deselectAllSignals()"
        >
          <Trash2 class="wf-btn-icon" />
          <span>清勾</span>
        </button>
      </div>
    </div>

    <!-- 主画布：可横向滚动的容器，内部用 SVG 绘制波形 -->
    <div
      ref="canvasScrollRef"
      class="wf-canvas-scroll"
      @scroll="onUserScroll"
    >
      <!-- 空状态 1：还没有记录任何一拍 -->
      <div v-if="isEmpty" class="wf-empty">
        <p>暂无波形数据。请点击"下一 clk"或"运行"开始记录。</p>
      </div>
      <!-- 空状态 2：有历史但用户一个信号都没勾选 -->
      <div v-else-if="displayedSignals.length === 0" class="wf-empty">
        <p>请在工具条勾选至少一个信号分组。</p>
      </div>
      <!-- 主 SVG 画布 -->
      <svg
        v-else
        class="wf-svg"
        :width="canvasWidth"
        :height="canvasHeight"
        :viewBox="`0 0 ${canvasWidth} ${canvasHeight}`"
      >
        <!-- 行标签背景：左侧固定列（不随横向滚动），用于放信号名 -->
        <rect
          x="0" y="0"
          :width="LEFT_GUTTER"
          :height="canvasHeight"
          fill="#f8fafc"
        />
        <!-- 行分隔线：每行底部的水平细线，辅助阅读 -->
        <g class="wf-grid">
          <line
            v-for="(_, i) in displayedSignals"
            :key="`h-${i}`"
            :x1="0"
            :y1="RULER_HEIGHT + (i + 1) * ROW_HEIGHT"
            :x2="canvasWidth"
            :y2="RULER_HEIGHT + (i + 1) * ROW_HEIGHT"
            stroke="#e2e8f0"
            stroke-width="1"
          />
        </g>
        <!-- 标尺：顶部 cycle 数字与刻度线 -->
        <g class="wf-ruler">
          <!-- 标尺背景 -->
          <rect
            x="0" y="0"
            :width="canvasWidth"
            :height="RULER_HEIGHT"
            fill="#f1f5f9"
          />
          <!-- 刻度竖线 -->
          <line
            v-for="t in rulerTicks"
            :key="`tick-${t.cycle}`"
            :x1="t.x + 0.5"
            :y1="0"
            :x2="t.x + 0.5"
            :y2="RULER_HEIGHT"
            stroke="#cbd5e1"
            stroke-width="1"
          />
          <!-- 刻度文字（cycle 编号） -->
          <text
            v-for="t in rulerTicks"
            :key="`tick-text-${t.cycle}`"
            :x="t.x + 4"
            :y="RULER_HEIGHT - 8"
            class="wf-ruler-text"
          >
            {{ t.cycle }}
          </text>
        </g>
        <!-- 行标签：每行最左侧显示信号名 -->
        <g class="wf-row-labels">
          <text
            v-for="(rp, i) in rowsPieces"
            :key="`label-${rp.signal.id}`"
            :x="8"
            :y="RULER_HEIGHT + i * ROW_HEIGHT + ROW_HEIGHT / 2 + 4"
            class="wf-row-label"
          >
            {{ rp.signal.label }}
          </text>
        </g>
        <!-- 当前 cycle 高亮列：覆盖在所有波形之上的半透明蓝色矩形 -->
        <rect
          v-if="currentColumnX !== null"
          :x="currentColumnX"
          y="0"
          :width="COLUMN_WIDTH"
          :height="canvasHeight"
          fill="rgba(59,130,246,0.10)"
        />
        <!-- 波形主体：遍历每行 piece 渲染为 SVG 元素（rect/line/text） -->
        <g class="wf-bodies">
          <template v-for="rp in rowsPieces" :key="`row-${rp.signal.id}`">
            <template v-for="(p, pi) in rp.pieces" :key="`piece-${rp.signal.id}-${pi}`">
              <!-- 方波台阶（1-bit）或变化点竖线（多 bit） -->
              <rect
                v-if="p.kind === 'rect'"
                :x="p.x"
                :y="p.y"
                :width="p.width"
                :height="p.height"
                :fill="p.high === undefined ? (p.active ? 'var(--color-data-flow)' : '#cbd5e1') : (p.high ? 'var(--color-data-flow)' : '#94a3b8')"
              />
              <!-- 多 bit 水平基线/标签引出线 -->
              <line
                v-else-if="p.kind === 'line'"
                :x1="p.x"
                :y1="p.y"
                :x2="p.x + (p.width ?? 0)"
                :y2="p.y"
                stroke="#94a3b8"
                stroke-width="1.5"
              />
              <!-- 多 bit 变化点处的 hex 标签 -->
              <text
                v-if="p.label"
                :x="p.label.x"
                :y="p.label.y"
                class="wf-value-label"
                :class="{ active: p.active }"
              >
                {{ p.label.text }}
              </text>
            </template>
            <!-- hover hit area: 一格一格的透明 rect，用于触发 tooltip -->
            <g
              v-for="(_, hi) in pipelineStore.signalHistory"
              :key="`hit-${rp.signal.id}-${hi}`"
            >
              <rect
                :x="LEFT_GUTTER + hi * COLUMN_WIDTH"
                :y="RULER_HEIGHT + rp.rowIndex * ROW_HEIGHT"
                :width="COLUMN_WIDTH"
                :height="ROW_HEIGHT"
                fill="transparent"
                @mousemove="(ev) => onCellHover(rp.signal, hi, ev)"
                @mouseleave="onCellLeave"
              />
            </g>
          </template>
        </g>
      </svg>
    </div>

    <!-- tooltip：悬停时显示信号名、cycle、value -->
    <div
      v-if="hoverInfo"
      class="wf-tooltip"
      :style="{ left: hoverInfo.x + 'px', top: hoverInfo.y + 'px' }"
    >
      <div class="wf-tooltip-signal">{{ hoverInfo.signal }}</div>
      <div class="wf-tooltip-row">
        <span>cycle</span><span>{{ hoverInfo.cycle }}</span>
      </div>
      <div class="wf-tooltip-row">
        <span>value</span><span class="mono">{{ hoverInfo.value }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.waveform-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  background: #ffffff;
  border-radius: 0.5rem;
  overflow: hidden;
}

.wf-toolbar {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid #e2e8f0;
  background: #f8fafc;
  flex-shrink: 0;
  flex-wrap: wrap;
  min-height: 3rem;
}

.wf-toolbar-left {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-shrink: 0;
}
.wf-title {
  font-weight: 700;
  color: #0f172a;
  font-size: 0.95rem;
}
.wf-counter {
  font-size: 0.75rem;
  color: #475569;
}
.wf-counter strong {
  color: #0f172a;
  margin: 0 0.125rem;
}
.wf-sep {
  margin: 0 0.375rem;
  color: #cbd5e1;
}
.wf-rec-state.on {
  color: #16a34a;
  font-weight: 600;
}
.wf-rec-state.off {
  color: #b91c1c;
  font-weight: 600;
}

.wf-toolbar-mid {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  flex-wrap: wrap;
  flex: 1;
  min-width: 12rem;
}
.wf-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.25rem 0.5rem;
  border-radius: 9999px;
  background: #ffffff;
  border: 1px solid #cbd5e1;
  font-size: 0.75rem;
  cursor: pointer;
  user-select: none;
  color: #334155;
  transition: all 0.15s ease;
}
.wf-chip:hover {
  background: #f1f5f9;
}
.wf-chip input {
  display: none;
}
.wf-chip.active {
  background: #dbeafe;
  border-color: #3b82f6;
  color: #1d4ed8;
}
.wf-chip.partial {
  background: #eff6ff;
  border-color: #93c5fd;
  color: #1d4ed8;
}
.wf-chip-icon {
  width: 0.85rem;
  height: 0.85rem;
}
.wf-chip.partial .wf-chip-icon.partial-icon {
  color: #3b82f6;
}
.wf-chip-label {
  font-weight: 500;
}
.wf-chip-count {
  color: #94a3b8;
  font-size: 0.7rem;
}
.wf-chip.active .wf-chip-count {
  color: #1d4ed8;
}

.wf-toolbar-right {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  flex-shrink: 0;
}
.wf-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.25rem 0.625rem;
  border-radius: 0.5rem;
  background: #ffffff;
  border: 1px solid #cbd5e1;
  font-size: 0.75rem;
  color: #334155;
  cursor: pointer;
  transition: all 0.15s ease;
}
.wf-btn:hover:not(:disabled) {
  background: #f1f5f9;
  border-color: #94a3b8;
}
.wf-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.wf-btn.active {
  background: #dbeafe;
  border-color: #3b82f6;
  color: #1d4ed8;
}
.wf-btn.danger:hover:not(:disabled) {
  background: #fef2f2;
  border-color: #fca5a5;
  color: #b91c1c;
}
.wf-btn.ghost {
  background: transparent;
  border-color: transparent;
}
.wf-btn.ghost:hover {
  background: #f1f5f9;
}
.wf-btn-icon {
  width: 0.85rem;
  height: 0.85rem;
}

.wf-canvas-scroll {
  flex: 1;
  min-height: 0;
  overflow: auto;
  position: relative;
  background: #ffffff;
}
.wf-svg {
  display: block;
}

.wf-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #94a3b8;
  font-size: 0.875rem;
}

.wf-ruler-text {
  font-size: 10px;
  fill: #475569;
  font-family: "Microsoft YaHei", monospace;
}
.wf-row-label {
  font-size: 11px;
  fill: #1e293b;
  font-family: "Microsoft YaHei", monospace;
  font-weight: 500;
}
.wf-value-label {
  font-size: 9px;
  fill: #94a3b8;
  font-family: "Microsoft YaHei", monospace;
}
.wf-value-label.active {
  fill: var(--color-data-flow);
  font-weight: 600;
}

.wf-tooltip {
  position: absolute;
  pointer-events: none;
  background: rgba(15, 23, 42, 0.95);
  color: #f8fafc;
  padding: 0.375rem 0.5rem;
  border-radius: 0.375rem;
  font-size: 0.7rem;
  z-index: 50;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
  min-width: 8rem;
}
.wf-tooltip-signal {
  font-weight: 600;
  margin-bottom: 0.25rem;
  color: #fbbf24;
}
.wf-tooltip-row {
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
}
.wf-tooltip-row > span:first-child {
  color: #94a3b8;
}
.wf-tooltip-row .mono {
  font-family: "Microsoft YaHei", monospace;
}

@media (max-width: 992px) {
  .wf-toolbar {
    flex-direction: column;
    align-items: flex-start;
  }
  .wf-toolbar-mid,
  .wf-toolbar-right {
    width: 100%;
    justify-content: flex-start;
  }
}
</style>
