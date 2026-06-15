# 改造方案：中断与异常演示支持 si / ti / ei 三种外部中断源

## 一、后端能力确认（基于 /opt/RISC-V_Platform/src 实测）

| 关键点 | 实测结论 | 证据 |
|--------|----------|------|
| `trigger_interrupt` 接受任意 bit | ✅ 是，0-63 任意位 | [simulator.cpp:1747-1754](file:///opt/RISC-V_Platform/src/simulator.cpp#L1747-L1754) `if (bit >= 64) return;` |
| WebSocket handler 透传 bit | ✅ 是 | [riscv_sim_server.cpp:1042-1051](file:///opt/RISC-V_Platform/src/riscv_sim_server.cpp#L1042-L1051) `iss >> bit; sim->trigger_pending_interrupt(bit);` |
| `mip`/`mie`/`mcause` 已通过 WS 推回前端 | ✅ 是 | [riscv_sim_server.cpp:591-599](file:///opt/RISC-V_Platform/src/riscv_sim_server.cpp#L591-L599) |
| `mcause` 编码 | ✅ bit63=1（中断） \| 低位=cause（3/7/11） | [simulator.cpp:233](file:///opt/RISC-V_Platform/src/simulator.cpp#L233) `csr_.write(CSR_MCAUSE, cause \| (1ULL << 63));` |
| 中断优先级（多源同时 pending 时） | ⚠️ MEI(11) > MSI(3) > MTI(7) | [csr.cpp:313](file:///opt/RISC-V_Platform/src/csr.cpp#L313) `static constexpr int order[] = {11, 3, 7, 9, 1, 5};` |

**结论：本次改造纯前端即可完成，后端零修改**。前端可以根据 `mcause & 0xF` 推导出 `si(3)/ti(7)/ei(11)`，并需要在 UI 上提示优先级顺序。

---

## 二、当前前端的"interrupt 显示问题"清单

逐行扫了 [InterruptDemoPanel.vue](file:///var/www/riscv-pipeline-frontend/src/components/InterruptDemoPanel.vue) 后，发现 **5 处影响教学的显示缺陷**：

1. **mip/mie 只显示十六进制，没有位级展开** — 学生看到 `mip=0x8` 不知道为什么是 8、对应哪个源。`mstatus` 有 `mstatusBreakdown()` 拆 MIE/MPIE/MPP，但 mie/mip 没有。
2. **desc 文案误导** — `desc: 'Interrupt Enable (bit 3 = MSIE)'` 暗示只有 bit 3 一个源，ti(7) / ei(11) 完全没提。
3. **CPU 当前状态卡死成"CPU中断"** — `lastTrapType` 字符串不区分 si/ti/ei，学生看不出"是哪种中断在打 CPU"。
4. **`mcause` 解释不直观** — 现在只显示原始 hex，没有把 `0x800000000000000B` 翻译成"MEIP"这种语义。
5. **演示程序 handler 无条件 `mip = 0`** — 即便将来有 ti/ei 进来，handler 也会把所有中断 pending 位一次性清零，无法体现"按源清 pending"的标准做法，也无法统计各源次数。

---

## 三、改造方案（按 B 方案 + 修复显示）

### 3.1 Pinia Store — `src/stores/pipeline.ts`

#### 改动 1：新增"按源触发"API

```ts
// 三种中断源 → 对应 mip bit（RISC-V 规范）
const INT_SRC_BITS = { si: 3, ti: 7, ei: 11 } as const;
type IntSrc = keyof typeof INT_SRC_BITS;

// 保留旧 API 兼容（默认 si）
function triggerInterrupt(bit: number = 3) {
  sendCommand('trigger_interrupt', { bit });
}

// 新增：按源触发（推荐上层调用）
function triggerInterruptSrc(src: IntSrc) {
  triggerInterrupt(INT_SRC_BITS[src]);
}
```

并在 `setup` return 里导出 `INT_SRC_BITS`、`triggerInterruptSrc`、`csrState`（已有）、`lastTrapType`（已有）。

#### 改动 2：让 `csrState` 默认值更稳健

当前 `csrState` 初始为 `null`，组件里 `csr?.mstatus` 全程可选链，体验差。改为：

```ts
const csrState = ref<NonNullable<PipelineSignals['csr']>>({
  mtvec: '0x0', mepc: '0x0', mcause: '0x0', mtval: '0x0',
  mstatus: '0x0', mie: '0x0', mip: '0x0',
});
```

这样组件可以直接读 `csrState.value.mip` 不再判空。

#### 改动 3：派生 `lastInterruptSrc`（不依赖后端加字段）

`lastTrapType` 是单 cycle 闪烁的，**改用它显示源类型会闪烁得用户看不清**。正确做法：在 store 里加一个**滞回字段**，把 trap 后第一个非 `none` cycle 的 mcause 锁住，直到用户主动重置或下一个 trap 出现：

```ts
const lastInterruptSrc = ref<'si' | 'ti' | 'ei' | null>(null);
// 解析逻辑：在 handleSignal 里
if (sigs.interrupt_taken && sigs.csr?.mcause) {
  const cause = Number(BigInt(sigs.csr.mcause) & 0xFn);
  if (cause === 3) lastInterruptSrc.value = 'si';
  else if (cause === 7) lastInterruptSrc.value = 'ti';
  else if (cause === 11) lastInterruptSrc.value = 'ei';
}
```

并在 store 里再加一个 `clearInterruptSrc()`（重置 CPU 时调用）：

```ts
function clearInterruptSrc() {
  lastInterruptSrc.value = null;
}
```

接入 `reset()` 调用链。

### 3.2 演示程序 — `src/components/InterruptDemoPanel.vue` 的 `DEMO_PROGRAM`（**B 方案完整版**）

```asm
# ===== 中断与异常演示程序（B 方案：si/ti/ei 完整路由） =====
# 内存布局：
#   0x80000000: _start
#   0x80000050: trap_handler   (因为分支更多，handler 推到 0x50)
#
.option rvc, no
.text
.globl _start
_start:
    # 1) mtvec = 0x80000050
    auipc t0, 0          # t0 = 0x80000000
    addi  t0, t0, 0x50   # t0 = 0x80000050
    csrw  mtvec, t0

    # 2) 打开 MSIE + MTIE + MEIE (bit 3, 7, 11)，并开全局 MIE
    li    t1, 0x888      # 0b1000_1000_1000
    csrw  mie, t1
    csrw  mstatus, t1    # MIE=1

    # 3) 三个独立的"中断发生次数"计数器
    addi  x12, x0, 0     # x12 = si count
    addi  x13, x0, 0     # x13 = ti count
    addi  x14, x0, 0     # x14 = ei count
    addi  x15, x0, 0     # x15 = exception count

    # 4) 正常工作循环（被中断打断后从断点继续）
loop:
    addi  x10, x10, 1
    j     loop

    # 中间留点 NOP 缓冲（0x80000044 ~ 0x8000004f），防止 mtvec 跳转错位
    .align 4

trap_handler:            # 0x80000050
    csrr  t0, mcause
    bltz  t0, handle_int # bit63=1 → 中断

    # ---- 异常分支 ----
    addi  x15, x15, 1
    li    t1, 3
    beq   t0, t1, halt_loop         # ebreak → halt
    li    t1, 11
    bne   t0, t1, halt_loop         # 其他异常 → halt
    csrr  t0, mepc
    addi  t0, t0, 4
    csrw  mepc, t0
    j     ret_from_trap

handle_int:
    # ---- 中断分支：按 mcause 低 4 位路由 ----
    andi  t0, t0, 0xF     # t0 = mcause & 0xF
    li    t1, 3
    beq   t0, t1, on_si
    li    t1, 7
    beq   t0, t1, on_ti
    li    t1, 11
    beq   t0, t1, on_ei
    j     ret_from_trap    # 未知源，保守不清 mip

on_si:
    addi  x12, x12, 1
    li    t0, -9           # ~8
    csrrc zero, mip, t0    # 清 MSIP
    j     ret_from_trap

on_ti:
    addi  x13, x13, 1
    li    t0, -129         # ~0x80
    csrrc zero, mip, t0
    j     ret_from_trap

on_ei:
    addi  x14, x14, 1
    li    t0, -2049        # ~0x800
    csrrc zero, mip, t0
    j     ret_from_trap

halt_loop:
    li    t0, 0x80001000
    addi  t1, x0, 1
    sw    t1, 0(t0)
    j     halt_loop

ret_from_trap:
    mret
```

**关键点**：
- `csrrc zero, mip, t0` 等价 `mip = mip & ~t0`，按位清 pending
- 三个独立计数寄存器 `x12/x13/x14`，汇编窗口里可以肉眼对比
- `x15` 记录异常次数（兼容原 ebreak/ecall 行为）

### 3.3 组件 UI — `src/components/InterruptDemoPanel.vue`

#### A. 按钮区：拆成三栏并排（颜色区分 si/ti/ei）

```vue
<!-- 操作按钮区 -->
<div class="px-4 py-3 border-b border-gray-200 space-y-2">
  <button @click="loadDemoProgram"
          class="w-full flex items-center justify-center gap-2 px-3 py-2
                 bg-blue-200 hover:bg-blue-500 rounded text-sm font-medium transition">
    <FileCode class="w-4 h-4" /> 加载示例程序
  </button>

  <!-- 三栏中断触发按钮 -->
  <div class="grid grid-cols-3 gap-2">
    <button @click="triggerSi"
            :disabled="!pipelineStore.csrState.mie || ...(可选)"
            class="flex flex-col items-center px-2 py-2
                   bg-amber-200 hover:bg-amber-500 rounded text-xs font-medium transition">
      <Zap class="w-4 h-4 mb-0.5" />
      <span>si</span>
      <span class="text-[10px] opacity-70">bit 3</span>
    </button>
    <button @click="triggerTi"
            class="flex flex-col items-center px-2 py-2
                   bg-emerald-200 hover:bg-emerald-500 rounded text-xs font-medium transition">
      <Clock class="w-4 h-4 mb-0.5" />
      <span>ti</span>
      <span class="text-[10px] opacity-70">bit 7</span>
    </button>
    <button @click="triggerEi"
            class="flex flex-col items-center px-2 py-2
                   bg-violet-200 hover:bg-violet-500 rounded text-xs font-medium transition">
      <Radio class="w-4 h-4 mb-0.5" />
      <span>ei</span>
      <span class="text-[10px] opacity-70">bit 11</span>
    </button>
  </div>

  <button @click="clearAllPending"
          class="w-full flex items-center justify-center gap-2 px-3 py-2
                 bg-gray-200 hover:bg-gray-400 rounded text-xs font-medium transition">
    <Eraser class="w-4 h-4" /> 清空 mip（兜底）
  </button>
</div>
```

新增 script 函数：

```ts
import { Zap, Clock, Radio, Eraser, Cpu, BookOpen, FileCode } from 'lucide-vue-next';

function triggerSi() { pipelineStore.triggerInterruptSrc('si'); }
function triggerTi() { pipelineStore.triggerInterruptSrc('ti'); }
function triggerEi() { pipelineStore.triggerInterruptSrc('ei'); }
function clearAllPending() { pipelineStore.writeMip(0n); }   // 见 3.4
```

#### B. 当前 Trap 状态区：显示"是哪种中断"

```vue
<!-- 当前 Trap 状态 -->
<div class="px-4 py-3 border-b border-gray-200">
  <div class="text-xs text-gray-500 mb-1">CPU 当前状态</div>
  <div :class="['text-lg font-semibold', trapTypeColor]">{{ trapTypeLabel }}</div>
  <div v-if="pipelineStore.lastTrapType !== 'none'" class="text-xs mt-1 space-y-0.5">
    <div>mcause = <span class="font-mono">{{ parseHexValue(pipelineStore.csrState.mcause) }}</span>
      <span v-if="pipelineStore.lastTrapType === 'interrupt'" class="text-amber-600 ml-1">
        → {{ interruptSrcLabel }}  ({{ interruptSrcAbbr }})
      </span>
    </div>
  </div>
</div>
```

新增 computed：

```ts
const interruptSrcLabel = computed(() => {
  switch (pipelineStore.lastInterruptSrc) {
    case 'si': return '软件中断 (Software Interrupt)';
    case 'ti': return '定时器中断 (Timer Interrupt)';
    case 'ei': return '外部中断 (External Interrupt)';
    default:   return '未知中断源';
  }
});
const interruptSrcAbbr = computed(() => {
  const map = { si: 'MSIP/3', ti: 'MTIP/7', ei: 'MEIP/11' };
  return map[pipelineStore.lastInterruptSrc ?? 'si'] ?? '?';
});
```

#### C. CSR 表格：mie / mip 展开为位级

把 `csrRows` 改成可分组的结构，并新增 `mipBreakdown` / `mieBreakdown`：

```ts
function mipBreakdown(val: string | undefined) {
  const n = (() => { try { return BigInt(val || '0x0'); } catch { return 0n; } })();
  return {
    MSIP:  ((n >> 3n)  & 1n).toString(),
    MTIP:  ((n >> 7n)  & 1n).toString(),
    MEIP:  ((n >> 11n) & 1n).toString(),
  };
}
function mieBreakdown(val: string | undefined) {
  // 同 mipBreakdown，字段命名为 MSIE / MTIE / MEIE
}
```

模板里把 mie/mip 行替换为带子格的样式：

```vue
<tr v-for="row in csrRows" :key="row.name" class="border-b border-gray-100 align-top">
  <td class="py-1.5 pr-2 font-mono text-cyan-700 w-20">{{ row.name }}</td>
  <td class="py-1.5 pr-2 text-gray-500 text-[10px] leading-tight">
    <template v-if="row.name === 'mie'">
      MSIE(3)=<b :class="row.parts.MSIE==='1'?'text-emerald-600':'text-gray-400'">{{ row.parts.MSIE }}</b>
      · MTIE(7)=<b :class="row.parts.MTIE==='1'?'text-emerald-600':'text-gray-400'">{{ row.parts.MTIE }}</b>
      · MEIE(11)=<b :class="row.parts.MEIE==='1'?'text-emerald-600':'text-gray-400'">{{ row.parts.MEIE }}</b>
    </template>
    <template v-else-if="row.name === 'mip'">
      MSIP(3)=<b :class="row.parts.MSIP==='1'?'text-amber-600':'text-gray-400'">{{ row.parts.MSIP }}</b>
      · MTIP(7)=<b :class="row.parts.MTIP==='1'?'text-amber-600':'text-gray-400'">{{ row.parts.MTIP }}</b>
      · MEIP(11)=<b :class="row.parts.MEIP==='1'?'text-amber-600':'text-gray-400'">{{ row.parts.MEIP }}</b>
    </template>
    <template v-else>{{ row.desc }}</template>
  </td>
  <td class="py-1.5 text-right font-mono text-emerald-700">{{ row.value }}</td>
</tr>
```

`csrRows` 生成逻辑（关键）：

```ts
const csrRows = computed(() => {
  const csr = pipelineStore.csrState;
  const mstatusParts = mstatusBreakdown(csr.mstatus);
  const mieParts = mieBreakdown(csr.mie);
  const mipParts  = mipBreakdown(csr.mip);
  return [
    { name: 'mtvec',  desc: 'Trap vector base (handler 入口)',           value: parseHexValue(csr.mtvec) },
    { name: 'mepc',   desc: 'Trap 时保存的 PC (mret 目标)',               value: parseHexValue(csr.mepc) },
    { name: 'mcause', desc: 'Trap 原因 (高位置 1 = 中断)',                value: parseHexValue(csr.mcause) },
    { name: 'mtval',  desc: 'Trap 附加信息',                                value: parseHexValue(csr.mtval) },
    { name: 'mstatus', desc: `MIE=${mstatusParts.MIE} MPIE=${mstatusParts.MPIE} MPP=${mstatusParts.MPP}`,
      value: parseHexValue(csr.mstatus) },
    { name: 'mie',    desc: '机器中断使能位',  parts: mieParts, value: parseHexValue(csr.mie) },
    { name: 'mip',    desc: '机器中断 pending 位', parts: mipParts,  value: parseHexValue(csr.mip) },
  ];
});
```

#### D. 教学步骤：追加"三类中断对比"

在 `<ol>` 末尾加一节：

```html
<li>
  <span class="text-amber-600 font-medium">三类中断对比观察</span> →
  <span class="text-amber-600">重置 CPU</span> 重新加载 B 方案演示程序，单步至
  <code class="text-emerald-700">mie = 0x888</code> 且 <code class="text-emerald-700">mstatus.MIE=1</code>，然后依次点击：
  <ol class="list-decimal list-inside ml-4 mt-1 text-gray-500 space-y-1">
    <li>点 <b class="text-amber-600">si</b> → mip=0x8 → 下 1 cycle mcause=0x8000...03 → handler 跳 on_si → x12+1，mip 清回 0x0</li>
    <li>点 <b class="text-emerald-600">ti</b> → mip=0x80 → mcause=0x8000...07 → x13+1，mip 清回 0x0</li>
    <li>点 <b class="text-violet-600">ei</b> → mip=0x800 → mcause=0x8000...0B → x14+1，mip 清回 0x0</li>
  </ol>
  <div class="mt-1 text-gray-500 text-[10px]">
    ⚠️ 中断优先级：MEI(11) > MSI(3) > MTI(7)。如果同时点 si 和 ei，CPU 先响应 ei。
  </div>
</li>
```

### 3.4 配套 Store 能力：`writeMip`

为了"清空 mip 兜底"按钮工作，store 加一个直写 mip 的能力：

```ts
function writeMip(value: bigint) {
  // 通过 csrrw 风格的命令写 CSR；这里复用 set_user_signal 模式扩展
  sendCommand('write_csr', { name: 'mip', value: '0x' + value.toString(16) });
}
```

**后端需要确认/补一个 `write_csr` 命令**。如果后端没有该命令，临时降级方案：发送 N 个 `trigger_interrupt` 不可行（只能置位不能清位），那就**改用后端 reset 把 mip 清零**——此时"清空 mip 按钮"绑定为 `pipelineStore.reset()`。

> 这条要在实现阶段先和后端沟通。最稳妥的做法：实现前查 [riscv_sim_server.cpp 命令处理表](file:///opt/RISC-V_Platform/src/riscv_sim_server.cpp)，看现有命令是否已经能写 CSR。

### 3.5 修改的源文件总览

| 文件 | 改动点 |
|------|--------|
| `src/stores/pipeline.ts` | `+INT_SRC_BITS`、`+triggerInterruptSrc`、`+lastInterruptSrc`、`+clearInterruptSrc`、csrState 默认非空、`+writeMip`(或复用 reset) |
| `src/components/InterruptDemoPanel.vue` | 替换 `DEMO_PROGRAM`、拆三按钮 + 清空按钮、新增 4 个 trigger 函数、新增 `mipBreakdown/mieBreakdown`、csrRows 模板分支、新增 `interruptSrcLabel/Abbr` computed、教学步骤追加 |

---

## 四、风险与决策

### 决策记录

1. **三源优先级提示** — 必须显式标"MEI > MSI > MTI"，否则学生会以为 si/ti/ei 是平等排队。
2. **handler 是否支持未知源** — 设计上"未识别 mcause 不清 mip"保守处理，避免把"自己还没接上的源"误清。
3. **按钮是否要 disabled** — 课程演示建议**始终可点**（哪怕 mip 还没清也能再触发，体现"pending 累计"概念），不绑 disabled。
4. **写 mip 命令** — 实现前先查后端命令表，缺则降级为 reset。
5. **`csrState` 默认值** — 改成全 0 字符串，组件里不再到处 `csr?.x`，代码可读性↑。

### 已知 trade-off

- 三按钮并排 + mip 位级展开会让面板变长，建议加 `max-h` 滚动（原 panel 已经有 `overflow-y-auto`）。
- 演示程序从 10+10=20 条扩到 25+ 条，mtvec 改成 `0x80000050`，handler 移到 0x50 之外——保证 `_start` 段不会被踩到。
- 后端没有"清 mip"的标准命令时，需要临时方案（reset 或后端补一个 `write_csr`）。

---

## 五、验证步骤

1. **编译检查**：`npm run build`（或 `pnpm build`）无类型错误。
2. **加载程序**：点击"加载示例程序"→ 编译运行 → 单步到 `mtvec=0x80000050`、`mie=0x888`。
3. **si 测试**：点 si → mip=0x8 → step → mcause=0x8000000000000003 → 面板显示"软件中断 (MSIP/3)"，x12+1。
4. **ti 测试**：点 ti → mip=0x80 → mcause=0x8000000000000007 → "定时器中断 (MTIP/7)"，x13+1。
5. **ei 测试**：点 ei → mip=0x800 → mcause=0x800000000000000B → "外部中断 (MEIP/11)"，x14+1。
6. **优先级测试**：连续点 si 再点 ei（中间不 step）→ step 后 mcause=0x800000000000000B（ei 优先）。
7. **位级显示**：mip/mie 行应展示 3 个位的 0/1，颜色高亮当前=1 的位。
8. **回归**：ecall 仍能正确推进 mepc；ebreak 仍能 halt。

---

## 六、执行顺序

1. Phase A：先 `grep` 确认后端是否能"清 mip" / "写 csr" → 决定 `clearAllPending` 走 reset 还是新命令
2. Phase B：改 `pipeline.ts`（store）
3. Phase C：改 `InterruptDemoPanel.vue`（演示程序 + 模板 + 脚本）
4. Phase D：build 验证 + 人工点 7 个验证用例
