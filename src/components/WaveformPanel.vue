<script setup lang="ts">
import { computed, nextTick, ref, watch, onMounted } from 'vue';
import { usePipelineStore } from '../stores/pipeline';
import { Pause, Play, Trash2, ChevronsRight, Eraser, CheckSquare, Square } from 'lucide-vue-next';

const pipelineStore = usePipelineStore();

// 几何常量
const COLUMN_WIDTH = 32;        // 每一拍在画布中的宽度（px）
const ROW_HEIGHT = 28;          // 每一行（每个信号）高度（px）
const LEFT_GUTTER = 160;        // 左侧行标签宽度（px）
const RULER_HEIGHT = 28;        // 顶部 cycle 标尺高度（px）
const AMPLITUDE = 9;            // 1-bit 信号的方波半高（px）

// 画布滚动容器 ref
const canvasScrollRef = ref<HTMLElement | null>(null);
// 鼠标 hover 显示 tooltip
const hoverInfo = ref<{ signal: string; cycle: number; value: string; x: number; y: number } | null>(null);

interface DisplayedSignal {
  id: string;
  label: string;
  value: string;
  type: string;
  stage: string;
  active: boolean;
}

// 当前拍的全部信号（来自 store，刷新于后端推送）
const allAvailableSignals = computed<DisplayedSignal[]>(() => {
  return pipelineStore.allSignals as DisplayedSignal[];
});

// 按 stage 分组（保持 stage 出现顺序稳定）
const groupedSignals = computed(() => {
  const groups: { stage: string; signals: DisplayedSignal[] }[] = [];
  const idx = new Map<string, number>();
  for (const s of allAvailableSignals.value) {
    let i = idx.get(s.stage);
    if (i === undefined) {
      i = groups.length;
      idx.set(s.stage, i);
      groups.push({ stage: s.stage, signals: [] });
    }
    const group = groups[i];
    if (group) group.signals.push(s);
  }
  return groups;
});

// 已选信号（按 stage 顺序），仅用于画布渲染
const displayedSignals = computed<DisplayedSignal[]>(() => {
  const sel = pipelineStore.selectedSignalIds;
  if (sel.size === 0) return [];
  const list: DisplayedSignal[] = [];
  for (const g of groupedSignals.value) {
    for (const s of g.signals) {
      if (sel.has(s.id)) list.push(s);
    }
  }
  return list;
});

// 当前组的"是否全部已选" — 用于 group checkbox
const isStageAllSelected = (stage: string) => {
  const sel = pipelineStore.selectedSignalIds;
  const list = groupedSignals.value.find(g => g.stage === stage)?.signals ?? [];
  if (list.length === 0) return false;
  return list.every(s => sel.has(s.id));
};
const isStagePartial = (stage: string) => {
  const sel = pipelineStore.selectedSignalIds;
  const list = groupedSignals.value.find(g => g.stage === stage)?.signals ?? [];
  const cnt = list.filter(s => sel.has(s.id)).length;
  return cnt > 0 && cnt < list.length;
};
const onGroupToggle = (stage: string) => {
  if (isStageAllSelected(stage)) {
    pipelineStore.setSignalGroupSelected(stage, false);
  } else {
    pipelineStore.setSignalGroupSelected(stage, true);
  }
};

// 1-bit vs 多 bit 判定（type === 'control' 且 value 为 '0'/'1'/'true'/'false' 视作 1-bit）
function isOneBit(signalType: string, value: string): boolean {
  if (signalType !== 'control') return false;
  const v = String(value).trim().toLowerCase();
  return v === '0' || v === '1' || v === 'true' || v === 'false';
}

// 画布几何
const canvasWidth = computed(() => {
  return LEFT_GUTTER + Math.max(1, pipelineStore.signalHistory.length) * COLUMN_WIDTH;
});
const canvasHeight = computed(() => {
  return RULER_HEIGHT + Math.max(1, displayedSignals.value.length) * ROW_HEIGHT;
});

// 当前 cycle 列索引（用于高亮）
const currentColumnIndex = computed(() => {
  const list = pipelineStore.signalHistory;
  if (list.length === 0) return -1;
  // 通常最后一列就是当前 cycle；但若 CPU 发生过 reset/history 被清空则不一定
  return list.length - 1;
});

// 标尺刻度文字（每 5 拍）
const rulerTicks = computed(() => {
  const list = pipelineStore.signalHistory;
  const out: { cycle: number; x: number }[] = [];
  for (let i = 0; i < list.length; i++) {
    const snap = list[i];
    if (!snap) continue;
    if (i % 5 === 0 || i === list.length - 1) {
      out.push({ cycle: snap.cycle, x: LEFT_GUTTER + i * COLUMN_WIDTH });
    }
  }
  return out;
});

// 给定一个信号行 + 快照列 → 构造 SVG 路径或矩形
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

function rowY(rowIndex: number): number {
  return RULER_HEIGHT + rowIndex * ROW_HEIGHT;
}

function buildRowPieces(signal: DisplayedSignal, rowIndex: number): RowPiece[] {
  const list = pipelineStore.signalHistory;
  if (list.length === 0) return [];
  const pieces: RowPiece[] = [];
  const oneBit = isOneBit(signal.type, signal.value);
  const yMid = rowY(rowIndex) + ROW_HEIGHT / 2;
  const yHigh = rowY(rowIndex) + (ROW_HEIGHT - AMPLITUDE * 2) / 2;
  const yLow = rowY(rowIndex) + (ROW_HEIGHT - AMPLITUDE * 2) / 2 + AMPLITUDE * 2;

  if (oneBit) {
    // 1-bit：方波台阶；遍历每一列判断 active + 与上一拍是否相同
    let prevActive: boolean | null = null;
    for (let i = 0; i < list.length; i++) {
      const snap = list[i];
      if (!snap) continue;
      const cur = snap.activeIds.has(signal.id);
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
          pieces[pieces.length - 1] = {
            kind: last.kind,
            x: last.x,
            y: last.y,
            width: x - last.x,
            height: last.height,
            high: last.high,
            active: last.active,
          };
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
    if (lastPiece && lastPiece.kind === 'rect' && (lastPiece.width ?? 0) >= COLUMN_WIDTH) {
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
    pieces.push({
      kind: 'line',
      x: LEFT_GUTTER,
      y: yMid,
      width: list.length * COLUMN_WIDTH,
      height: 0,
      active: true,
    });
    let prevVal: string | null = null;
    for (let i = 0; i < list.length; i++) {
      const snap = list[i];
      if (!snap) continue;
      const val = snap.values[signal.id] ?? '-';
      const x = LEFT_GUTTER + i * COLUMN_WIDTH;
      const active = snap.activeIds.has(signal.id);
      if (val !== prevVal) {
        pieces.push({
          kind: 'rect',
          x: x + 1,
          y: yMid - AMPLITUDE,
          width: 2,
          height: AMPLITUDE * 2,
          active,
        });
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

function shortenValue(v: string): string {
  if (!v) return '-';
  // 0x0 / 0x1 / 0x12abc... 保留前 6 位 hex（去掉 0x）
  const s = String(v);
  if (s.startsWith('0x') || s.startsWith('0X')) {
    const hex = s.slice(2);
    if (hex.length <= 6) return s.toUpperCase();
    return '0x' + hex.slice(0, 6).toUpperCase() + '…';
  }
  return s.length > 6 ? s.slice(0, 6) + '…' : s;
}

function onCellHover(signal: DisplayedSignal, snapIndex: number, ev: MouseEvent) {
  const list = pipelineStore.signalHistory;
  if (snapIndex < 0 || snapIndex >= list.length) return;
  const snap = list[snapIndex];
  if (!snap) return;
  hoverInfo.value = {
    signal: signal.label,
    cycle: snap.cycle,
    value: snap.values[signal.id] ?? '-',
    x: ev.offsetX + 12,
    y: ev.offsetY + 12,
  };
}
function onCellLeave() {
  hoverInfo.value = null;
}

// 自动跳到最新列
function scrollToLatest() {
  const el = canvasScrollRef.value;
  if (!el) return;
  el.scrollLeft = el.scrollWidth;
}
watch(
  () => pipelineStore.signalHistory.length,
  () => {
    if (pipelineStore.autoFollowLatest) {
      nextTick(scrollToLatest);
    }
  }
);
// 用户手动滚动时关闭自动跟随
function onUserScroll() {
  if (!canvasScrollRef.value) return;
  const el = canvasScrollRef.value;
  const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 4;
  if (!atEnd && pipelineStore.autoFollowLatest) {
    pipelineStore.setAutoFollowLatest(false);
  } else if (atEnd && !pipelineStore.autoFollowLatest) {
    pipelineStore.setAutoFollowLatest(true);
  }
}

onMounted(() => {
  nextTick(() => {
    if (pipelineStore.autoFollowLatest) scrollToLatest();
  });
});

// 周期高亮列的 x 坐标
const currentColumnX = computed(() => {
  if (currentColumnIndex.value < 0) return null;
  return LEFT_GUTTER + currentColumnIndex.value * COLUMN_WIDTH;
});

// 给每行生成 piece 列表（仅在画布区渲染时用）
const rowsPieces = computed(() => {
  const sigs = displayedSignals.value;
  return sigs.map((s, i) => ({ signal: s, rowIndex: i, pieces: buildRowPieces(s, i) }));
});

// 空状态：尚未记录任何拍
const isEmpty = computed(() => pipelineStore.signalHistory.length === 0);
</script>

<template>
  <div class="waveform-panel">
    <!-- 顶部工具条 -->
    <div class="wf-toolbar">
      <div class="wf-toolbar-left">
        <span class="wf-title">波形图</span>
        <span class="wf-counter">
          已记录 <strong>{{ pipelineStore.signalHistory.length }}</strong> /
          {{ pipelineStore.MAX_HISTORY }} 拍
          <span class="wf-sep">·</span>
          <span :class="['wf-rec-state', pipelineStore.historyRecording ? 'on' : 'off']">
            {{ pipelineStore.historyRecording ? '录制中' : '已暂停' }}
          </span>
        </span>
      </div>

      <div class="wf-toolbar-mid">
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
          <CheckSquare v-if="isStageAllSelected(g.stage)" class="wf-chip-icon" />
          <Square v-else-if="!isStagePartial(g.stage)" class="wf-chip-icon" />
          <CheckSquare v-else class="wf-chip-icon partial-icon" />
          <span class="wf-chip-label">{{ g.stage }}</span>
          <span class="wf-chip-count">
            {{ g.signals.filter(s => pipelineStore.selectedSignalIds.has(s.id)).length }}/{{ g.signals.length }}
          </span>
        </label>
      </div>

      <div class="wf-toolbar-right">
        <button
          class="wf-btn"
          :title="pipelineStore.historyRecording ? '暂停录制' : '继续录制'"
          @click="pipelineStore.toggleHistoryRecording()"
        >
          <Pause v-if="pipelineStore.historyRecording" class="wf-btn-icon" />
          <Play v-else class="wf-btn-icon" />
          <span>{{ pipelineStore.historyRecording ? '暂停' : '继续' }}</span>
        </button>
        <button
          class="wf-btn danger"
          title="清空历史"
          :disabled="isEmpty"
          @click="pipelineStore.clearHistory()"
        >
          <Eraser class="wf-btn-icon" />
          <span>清空</span>
        </button>
        <button
          class="wf-btn"
          :class="{ active: pipelineStore.autoFollowLatest }"
          title="跳转最新 / 自动跟随"
          @click="pipelineStore.setAutoFollowLatest(!pipelineStore.autoFollowLatest); nextTick(scrollToLatest);"
        >
          <ChevronsRight class="wf-btn-icon" />
          <span>{{ pipelineStore.autoFollowLatest ? '跟随中' : '跳转最新' }}</span>
        </button>
        <button
          class="wf-btn ghost"
          title="全选所有信号"
          @click="pipelineStore.selectAllSignals()"
        >
          <span>全选</span>
        </button>
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

    <!-- 主画布 -->
    <div
      ref="canvasScrollRef"
      class="wf-canvas-scroll"
      @scroll="onUserScroll"
    >
      <div v-if="isEmpty" class="wf-empty">
        <p>暂无波形数据。请点击"下一 clk"或"运行"开始记录。</p>
      </div>
      <div v-else-if="displayedSignals.length === 0" class="wf-empty">
        <p>请在工具条勾选至少一个信号分组。</p>
      </div>
      <svg
        v-else
        class="wf-svg"
        :width="canvasWidth"
        :height="canvasHeight"
        :viewBox="`0 0 ${canvasWidth} ${canvasHeight}`"
      >
        <!-- 行标签背景 -->
        <rect
          x="0" y="0"
          :width="LEFT_GUTTER"
          :height="canvasHeight"
          fill="#f8fafc"
        />
        <!-- 行分隔线 -->
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
        <!-- 标尺 -->
        <g class="wf-ruler">
          <rect
            x="0" y="0"
            :width="canvasWidth"
            :height="RULER_HEIGHT"
            fill="#f1f5f9"
          />
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
        <!-- 行标签 -->
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
        <!-- 当前 cycle 高亮列 -->
        <rect
          v-if="currentColumnX !== null"
          :x="currentColumnX"
          y="0"
          :width="COLUMN_WIDTH"
          :height="canvasHeight"
          fill="rgba(59,130,246,0.10)"
        />
        <!-- 波形主体 -->
        <g class="wf-bodies">
          <template v-for="rp in rowsPieces" :key="`row-${rp.signal.id}`">
            <template v-for="(p, pi) in rp.pieces" :key="`piece-${rp.signal.id}-${pi}`">
              <rect
                v-if="p.kind === 'rect'"
                :x="p.x"
                :y="p.y"
                :width="p.width"
                :height="p.height"
                :fill="p.high === undefined ? (p.active ? 'var(--color-data-flow)' : '#cbd5e1') : (p.high ? 'var(--color-data-flow)' : '#94a3b8')"
              />
              <line
                v-else-if="p.kind === 'line'"
                :x1="p.x"
                :y1="p.y"
                :x2="p.x + (p.width ?? 0)"
                :y2="p.y"
                stroke="#94a3b8"
                stroke-width="1.5"
              />
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
            <!-- hover hit area: 一格一格的透明 rect -->
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

    <!-- tooltip -->
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
