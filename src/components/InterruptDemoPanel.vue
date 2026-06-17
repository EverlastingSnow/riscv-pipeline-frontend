<script setup lang="ts">
import { computed, ref } from 'vue';
import { usePipelineStore } from '../stores/pipeline';
import { Zap, Clock, Radio, Eraser, Cpu, BookOpen, FileCode, AlertTriangle } from 'lucide-vue-next';

const pipelineStore = usePipelineStore();

/**
 * ★ 当前激活的演示模式：异常 / 中断
 */
const activeDemo = ref<'exception' | 'interrupt'>('interrupt');

/**
 * 异常演示汇编程序源码。
 *
 * 流程：_start → ecall (异常) → trap_handler (mtvec) → 推进 mepc + x11++ → mret → 继续执行 → ebreak 兜底停机。
 */
const EXCEPTION_DEMO_PROGRAM = `# ===== 异常演示程序（ecall → handler → mret → 继续执行） =====
# 流程：
#   _start → ecall (异常)
#            ↓
#         trap_handler (mtvec) → 推进 mepc + x11++ → mret
#            ↓
#         addi x10 (handler 后的第一条)
#            ↓
#         ebreak (走 on_ebreak：清 mtvec + mret 自循环 trap → PC=0 越界停机)
#
.option rvc, no
.text
.globl _start
_start:
    # 1) 设置 trap vector
    la    t0, trap_handler
    csrw  mtvec, t0

    # 2) 关中断（异常演示不涉及中断）
    li    t0, 0
    csrw  mie, t0
    csrw  mstatus, t0    # MIE=0

    # 3) 正常工作（设置一个可观察的初值）
    addi  x10, x0, 100   # x10 = 100

    # 4) 触发一次异常（ECALL from M-mode → mcause = 0xb）
    ecall                # trap → mtvec（trap_handler）

    # 5) handler 返回后继续执行
    addi  x10, x10, 1    # x10 = 101（验证 mret 真的回到 ecall 之后）

    # 6) 正常结束：EBREAK → handler 走 on_ebreak 自毁
    ebreak               # 第二次 trap 时 mtvec=0 → PC=0 越界停机

trap_handler:
    # 读 mcause，分发到对应处理路径
    csrr  t0, mcause
    li    t1, 3
    beq   t0, t1, on_ebreak     # mcause=3 (ebreak) → 走自毁
    li    t1, 11
    bne   t0, t1, halt_loop     # 未知 mcause → 兜底自循环

    # --- ecall 处理路径：推进 mepc，计数 +1 ---
    csrr  t0, mepc              # 读硬件保存的 mepc（=ecall 的 PC）
    addi  t0, t0, 4             # 推进 mepc 跳过 ecall 指令
    csrw  mepc, t0              # 写回（mret 时用新值）
    addi  x11, x11, 1           # x11 累计 ecall 次数
    j     ret_from_trap

on_ebreak:
    # ★ 异常演示"正常结束"机制：清掉 mtvec 后 mret 回到 ebreak 自身。
    #   ebreak 再次 trap 时 PC=mtvec=0 → 越界 → 模拟器 halted_=true。
    #   这与简单 ebreak 程序的停机原理完全一致（mtvec=0 时的默认行为）。
    csrw  mtvec, x0
    j     ret_from_trap

halt_loop:
    # 防御性兜底：未知 mcause 走到这里。wfi 在本模拟器是 nop，
    # 因此等于 j . 自循环，前端用"停止"按钮结束。
    wfi
    j     halt_loop

ret_from_trap:
    mret
`;

/**
 * 中断演示汇编程序源码。
 *
 * 演示 si / ti / ei 三种中断源路由以及按源清 pending 的完整流程。
 */
const INTERRUPT_DEMO_PROGRAM = `# ===== 中断演示程序（si / ti / ei 三源完整路由） =====
# 内存布局：
#   0x80000000: _start
#   0x80000030: trap_handler   (la 指令由汇编器自动算偏移)
#
.option rvc, no
.text
.globl _start
_start:
    # 1) mtvec = trap_handler（用 la 让汇编器自动算偏移，避免硬编码错误）
    la    t0, trap_handler
    csrw  mtvec, t0

    # 2) 清空 mip（防止上一个 demo 残留的 pending），打开三源中断使能
    csrw  mip, x0        # mip = 0
    li    t1, 0x888      # 0b1000_1000_1000
    csrw  mie, t1        # mie = 0x888（MSIE + MTIE + MEIE 全开）
    csrw  mstatus, t1    # MIE=1

    # 3) 三个独立的"中断发生次数"计数器
    addi  x12, x0, 0     # x12 = si count
    addi  x13, x0, 0     # x13 = ti count
    addi  x14, x0, 0     # x14 = ei count

    # 4) 正常工作循环（被中断打断后从断点继续）
loop:
    addi  x10, x10, 1
    j     loop

    .align 4

trap_handler:            # 0x80000050
    csrr  t0, mcause
    bltz  t0, handle_int # bit63=1 → 中断

    # 异常分支：异常演示里基本走不到，保守 halt
    li    t1, 3
    beq   t0, t1, halt_loop
    li    t1, 11
    bne   t0, t1, halt_loop
    csrr  t0, mepc
    addi  t0, t0, 4
    csrw  mepc, t0
    j     ret_from_trap

handle_int:
    # 按 mcause 低 4 位路由
    andi  t0, t0, 0xF
    li    t1, 3
    beq   t0, t1, on_si
    li    t1, 7
    beq   t0, t1, on_ti
    li    t1, 11
    beq   t0, t1, on_ei
    j     ret_from_trap    # 未知源，保守不清 mip

on_si:
    addi  x12, x12, 1
    li    t0, 8            # bit 3 = MSIP（csrrc 用 t0 中为 1 的位去清 mip）
    csrrc zero, mip, t0    # mip = mip & ~8 (清 MSIP)
    j     ret_from_trap

on_ti:
    addi  x13, x13, 1
    li    t0, 0x80         # bit 7 = MTIP
    csrrc zero, mip, t0
    j     ret_from_trap

on_ei:
    addi  x14, x14, 1
    li    t0, 0x800        # bit 11 = MEIP
    csrrc zero, mip, t0
    j     ret_from_trap

halt_loop:
    # 防御性：异常分支兜底（异常演示里不会到这里；中断演示也不会到）。
    wfi
    j     halt_loop

ret_from_trap:
    mret
`;

/**
 * 当前 Trap 类型对应的中文显示文本。
 */
const trapTypeLabel = computed(() => {
  switch (pipelineStore.lastTrapType) {
    case 'interrupt': return 'CPU中断 (Interrupt)';
    case 'exception': return 'CPU异常 (Exception)';
    default: return '正常运行 (Idle)';
  }
});

/**
 * 当前 Trap 类型对应的高亮颜色类。
 */
const trapTypeColor = computed(() => {
  switch (pipelineStore.lastTrapType) {
    case 'interrupt': return 'text-amber-600';
    case 'exception': return 'text-red-600';
    default: return 'text-emerald-600';
  }
});

/**
 * ★ 切换演示模式（仅切标签，不自动加载程序）
 *
 * @param {'exception' | 'interrupt'} demo 目标演示模式
 */
function switchDemo(demo: 'exception' | 'interrupt') {
  activeDemo.value = demo;
}

/**
 * ★ 加载异常演示程序到代码编辑器。
 */
function loadExceptionDemo() {
  activeDemo.value = 'exception';
  pipelineStore.setEditorCode(EXCEPTION_DEMO_PROGRAM);
}

/**
 * ★ 加载中断演示程序到代码编辑器。
 */
function loadInterruptDemo() {
  activeDemo.value = 'interrupt';
  pipelineStore.setEditorCode(INTERRUPT_DEMO_PROGRAM);
}

/**
 * ★ 触发软件中断 SI（Software Interrupt，对应 mip bit3）。
 */
function triggerSi() { pipelineStore.triggerInterruptSrc('si'); }

/**
 * ★ 触发定时器中断 TI（Timer Interrupt，对应 mip bit7）。
 */
function triggerTi() { pipelineStore.triggerInterruptSrc('ti'); }

/**
 * ★ 触发外部中断 EI（External Interrupt，对应 mip bit11）。
 */
function triggerEi() { pipelineStore.triggerInterruptSrc('ei'); }

/**
 * ★ 兜底：清空 mip（后端无 write_csr，降级为 reset 整个 CPU）。
 */
function resetMipFallback() { pipelineStore.resetMip(); }

/**
 * 将任意进制的字符串值格式化为统一的 0x 开头大写十六进制。
 *
 * @param {string | undefined} val 原始字符串
 * @returns {string} 格式化后的十六进制字符串
 */
function parseHexValue(val: string | undefined): string {
  // 空值直接输出 0x0
  if (!val) return '0x0';
  // 已是 0x 形式则只做大小写转换
  if (val.startsWith('0x') || val.startsWith('0X')) return val.toUpperCase();
  try {
    // 使用 BigInt 转换任意进制字符串
    return '0x' + BigInt(val).toString(16).toUpperCase();
  } catch {
    // 解析失败回退为原始字符串
    return val;
  }
}

/**
 * 解析 mstatus 寄存器的 MIE / MPIE / MPP 三个关键字段。
 *
 * - MIE 在 bit3
 * - MPIE 在 bit7
 * - MPP 在 bit[12:11]
 *
 * @param {string | undefined} val mstatus 的十六进制字符串
 * @returns {{ MIE: string; MPIE: string; MPP: string }} 各字段的 0/1 字符串
 */
function mstatusBreakdown(val: string | undefined): { MIE: string; MPIE: string; MPP: string } {
  const hex = val || '0x0';
  try {
    // 使用 BigInt 安全处理大整数
    const n = BigInt(hex);
    // 提取 MIE（bit3）、MPIE（bit7）、MPP（bit[12:11]）
    const mie = (n >> 3n) & 1n;
    const mpie = (n >> 7n) & 1n;
    const mpp = (n >> 11n) & 0x3n;
    return { MIE: mie.toString(), MPIE: mpie.toString(), MPP: mpp.toString() };
  } catch {
    // 解析失败时回退到全 0
    return { MIE: '0', MPIE: '0', MPP: '0' };
  }
}

/**
 * 安全地将字符串解析为 BigInt，解析失败时返回 0n。
 *
 * @param {string | undefined} val 任意进制的字符串
 * @returns {bigint} 解析后的 BigInt
 */
function safeBigInt(val: string | undefined): bigint {
  try { return BigInt(val || '0x0'); } catch { return 0n; }
}

/**
 * 解析 mip 寄存器的 MSIP / MTIP / MEIP 三位。
 *
 * - MSIP 在 bit3
 * - MTIP 在 bit7
 * - MEIP 在 bit11
 *
 * @param {string | undefined} val mip 的十六进制字符串
 * @returns {{ MSIP: string; MTIP: string; MEIP: string }} 各位的 0/1 字符串
 */
function mipBreakdown(val: string | undefined): { MSIP: string; MTIP: string; MEIP: string } {
  const n = safeBigInt(val);
  return {
    // 按位提取对应的 pending 标志
    MSIP: ((n >> 3n)  & 1n).toString(),
    MTIP: ((n >> 7n)  & 1n).toString(),
    MEIP: ((n >> 11n) & 1n).toString(),
  };
}

/**
 * 解析 mie 寄存器的 MSIE / MTIE / MEIE 三位。
 *
 * - MSIE 在 bit3
 * - MTIE 在 bit7
 * - MEIE 在 bit11
 *
 * @param {string | undefined} val mie 的十六进制字符串
 * @returns {{ MSIE: string; MTIE: string; MEIE: string }} 各位的 0/1 字符串
 */
function mieBreakdown(val: string | undefined): { MSIE: string; MTIE: string; MEIE: string } {
  const n = safeBigInt(val);
  return {
    // 按位提取对应的中断使能标志
    MSIE: ((n >> 3n)  & 1n).toString(),
    MTIE: ((n >> 7n)  & 1n).toString(),
    MEIE: ((n >> 11n) & 1n).toString(),
  };
}

/**
 * ★ CSR 行中可分解的子字段集合。
 */
type CsrParts = Record<string, string>;

/**
 * CSR 表格中每一行的数据结构。
 */
interface CsrRow {
  /** CSR 寄存器名称 */
  name: string;
  /** 描述文本 */
  desc: string;
  /** 当前值（十六进制字符串） */
  value: string;
  /** 分解后的位级字段（仅 mie/mip 行有） */
  parts?: CsrParts;
}

/**
 * 根据 store 中的 CSR 状态组装表格行。
 */
const csrRows = computed<CsrRow[]>(() => {
  const csr = pipelineStore.csrState;
  // 预解析各 CSR 的位级展开
  const mstatusParts = mstatusBreakdown(csr.mstatus);
  const mipParts  = mipBreakdown(csr.mip);
  const mieParts  = mieBreakdown(csr.mie);
  return [
    { name: 'mtvec',  desc: 'Trap vector base (handler 入口)', value: parseHexValue(csr.mtvec) },
    { name: 'mepc',   desc: 'Trap 时保存的 PC (mret 目标)',  value: parseHexValue(csr.mepc) },
    { name: 'mcause', desc: 'Trap 原因 (高位置 1 = 中断)',   value: parseHexValue(csr.mcause) },
    { name: 'mtval',  desc: 'Trap 附加信息',                  value: parseHexValue(csr.mtval) },
    { name: 'mstatus', desc: `MIE=${mstatusParts.MIE} MPIE=${mstatusParts.MPIE} MPP=${mstatusParts.MPP}`,
      value: parseHexValue(csr.mstatus) },
    { name: 'mie', desc: 'MSIE(3) / MTIE(7) / MEIE(11)', parts: mieParts, value: parseHexValue(csr.mie) },
    { name: 'mip', desc: 'MSIP(3) / MTIP(7) / MEIP(11)', parts: mipParts,  value: parseHexValue(csr.mip) },
  ];
});

/**
 * ★ 中断源中文标签（带滞回，从 store 读 lastInterruptSrc）。
 */
const interruptSrcLabel = computed(() => {
  switch (pipelineStore.lastInterruptSrc) {
    case 'si': return '软件中断 (Software Interrupt)';
    case 'ti': return '定时器中断 (Timer Interrupt)';
    case 'ei': return '外部中断 (External Interrupt)';
    default:   return '未知中断源';
  }
});

/**
 * 中断源缩写（用于显示 mcause 低位编号）。
 */
const interruptSrcAbbr = computed(() => {
  // 中断源到 mip 位编号的映射
  const map: Record<string, string> = { si: 'MSIP/3', ti: 'MTIP/7', ei: 'MEIP/11' };
  const k = pipelineStore.lastInterruptSrc ?? '';
  // 未知源显示 '?'
  return map[k] ?? '?';
});
</script>

<template>
  <div class="interrupt-demo-panel h-full flex flex-col bg-white text-gray-900 overflow-y-auto">
    <!-- 顶部标题 -->
    <div class="px-4 py-3 border-b border-gray-200 bg-gray-50">
      <div class="flex items-center gap-2">
        <Zap class="w-5 h-5 text-amber-500" />
        <h2 class="text-base font-semibold text-gray-900">中断与异常演示</h2>
      </div>
      <p class="text-xs text-gray-500 mt-1">观察 trap entry → 写 mepc/mcause/mstatus → 跳 MTVEC → mret 返回</p>
    </div>

    <!-- 演示模式 Tab：异常 / 中断 -->
    <div class="px-4 pt-3 border-b border-gray-200 bg-gray-50">
      <div class="flex gap-1">
        <button
          @click="switchDemo('exception')"
          :class="activeDemo === 'exception'
            ? 'bg-white border-red-300 text-red-600'
            : 'bg-gray-100 border-transparent text-gray-500 hover:text-gray-700'"
          class="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-t border-b-2 text-sm font-medium transition"
        >
          <AlertTriangle class="w-4 h-4" />
          异常演示
        </button>
        <button
          @click="switchDemo('interrupt')"
          :class="activeDemo === 'interrupt'
            ? 'bg-white border-amber-300 text-amber-600'
            : 'bg-gray-100 border-transparent text-gray-500 hover:text-gray-700'"
          class="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-t border-b-2 text-sm font-medium transition"
        >
          <Zap class="w-4 h-4" />
          中断演示
        </button>
      </div>
    </div>

    <!-- 当前 Trap 状态（共享） -->
    <div class="px-4 py-3 border-b border-gray-200">
      <div class="text-xs text-gray-500 mb-1">CPU 当前状态</div>
      <div :class="['text-lg font-semibold', trapTypeColor]">{{ trapTypeLabel }}</div>
      <div v-if="pipelineStore.lastTrapType !== 'none'" class="text-xs text-gray-700 mt-1 space-y-0.5">
        <div>
          mcause =
          <span class="font-mono">{{ parseHexValue(pipelineStore.csrState.mcause) }}</span>
          <!-- 中断：附带显示中断源 -->
          <span v-if="pipelineStore.lastTrapType === 'interrupt'" class="text-amber-600 ml-1">
            → {{ interruptSrcLabel }}（{{ interruptSrcAbbr }}）
          </span>
          <!-- 异常：附带说明 ECALL/EBREAK -->
          <span v-else class="text-gray-400 ml-1">
            （ECALL/EBREAK 触发的异常）
          </span>
        </div>
      </div>
    </div>

    <!-- 操作按钮区：根据 activeDemo 切换 -->
    <div class="px-4 py-3 border-b border-gray-200 space-y-2">
      <!-- ★ 异常演示：只暴露"加载"和"重置"两个按钮 -->
      <template v-if="activeDemo === 'exception'">
        <button
          @click="loadExceptionDemo"
          class="w-full flex items-center justify-center gap-2 px-3 py-2 bg-blue-200 hover:bg-blue-500 rounded text-sm font-medium transition"
        >
          <FileCode class="w-4 h-4" />
          加载异常示例程序
        </button>
        <button
          @click="resetMipFallback"
          class="w-full flex items-center justify-center gap-2 px-3 py-2 bg-gray-200 hover:bg-gray-400 rounded text-xs font-medium transition"
        >
          <Eraser class="w-4 h-4" />
          重置 CPU
        </button>
      </template>

      <!-- ★ 中断演示：加载 + 三源触发 + 兜底重置 -->
      <template v-else>
        <button
          @click="loadInterruptDemo"
          class="w-full flex items-center justify-center gap-2 px-3 py-2 bg-blue-200 hover:bg-blue-500 rounded text-sm font-medium transition"
        >
          <FileCode class="w-4 h-4" />
          加载中断示例程序
        </button>
        <!-- 三源触发按钮，按位编号标注 -->
        <div class="grid grid-cols-3 gap-2">
          <button
            @click="triggerSi"
            class="flex flex-col items-center px-2 py-2 bg-amber-200 hover:bg-amber-500 rounded text-xs font-medium transition"
          >
            <Zap class="w-4 h-4 mb-0.5" />
            <span>si</span>
            <span class="text-[0.625rem] opacity-70">bit 3</span>
          </button>
          <button
            @click="triggerTi"
            class="flex flex-col items-center px-2 py-2 bg-emerald-200 hover:bg-emerald-500 rounded text-xs font-medium transition"
          >
            <Clock class="w-4 h-4 mb-0.5" />
            <span>ti</span>
            <span class="text-[0.625rem] opacity-70">bit 7</span>
          </button>
          <button
            @click="triggerEi"
            class="flex flex-col items-center px-2 py-2 bg-violet-200 hover:bg-violet-500 rounded text-xs font-medium transition"
          >
            <Radio class="w-4 h-4 mb-0.5" />
            <span>ei</span>
            <span class="text-[0.625rem] opacity-70">bit 11</span>
          </button>
        </div>
        <button
          @click="resetMipFallback"
          class="w-full flex items-center justify-center gap-2 px-3 py-2 bg-gray-200 hover:bg-gray-400 rounded text-xs font-medium transition"
        >
          <Eraser class="w-4 h-4" />
          重置 CPU（顺带清 mip）
        </button>
      </template>
    </div>

    <!-- CSR 状态表 -->
    <div class="px-4 py-3 border-b border-gray-200">
      <div class="flex items-center gap-2 mb-2">
        <Cpu class="w-4 h-4 text-emerald-600" />
        <h3 class="text-sm font-semibold text-gray-900">CSR 寄存器 (实时)</h3>
      </div>
      <table class="w-full text-xs">
        <tbody>
          <tr v-for="row in csrRows" :key="row.name" class="border-b border-gray-100 align-top">
            <td class="py-1.5 pr-2 font-mono text-cyan-700 w-20">{{ row.name }}</td>
            <td class="py-1.5 pr-2 text-gray-500 text-[0.625rem] leading-tight">
              <!-- mie 行展开三位使能 -->
              <template v-if="row.name === 'mie'">
                MSIE(3)=<b :class="row.parts!['MSIE']==='1'?'text-emerald-600':'text-gray-400'">{{ row.parts!['MSIE'] }}</b>
                · MTIE(7)=<b :class="row.parts!['MTIE']==='1'?'text-emerald-600':'text-gray-400'">{{ row.parts!['MTIE'] }}</b>
                · MEIE(11)=<b :class="row.parts!['MEIE']==='1'?'text-emerald-600':'text-gray-400'">{{ row.parts!['MEIE'] }}</b>
              </template>
              <!-- mip 行展开三位 pending -->
              <template v-else-if="row.name === 'mip'">
                MSIP(3)=<b :class="row.parts!['MSIP']==='1'?'text-amber-600':'text-gray-400'">{{ row.parts!['MSIP'] }}</b>
                · MTIP(7)=<b :class="row.parts!['MTIP']==='1'?'text-amber-600':'text-gray-400'">{{ row.parts!['MTIP'] }}</b>
                · MEIP(11)=<b :class="row.parts!['MEIP']==='1'?'text-amber-600':'text-gray-400'">{{ row.parts!['MEIP'] }}</b>
              </template>
              <!-- 其他 CSR 行只显示描述 -->
              <template v-else>{{ row.desc }}</template>
            </td>
            <td class="py-1.5 text-right font-mono text-emerald-700">{{ row.value }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- 教学说明：异常 / 中断 两套独立步骤 -->
    <div class="px-4 py-3">
      <div class="flex items-center gap-2 mb-2">
        <BookOpen class="w-4 h-4 text-purple-600" />
        <h3 class="text-sm font-semibold text-gray-900">观察步骤</h3>
      </div>
      <p class="text-xs text-gray-500 mb-2">
        说明：每个 <code>step</code> 是仿真器推进一个 cycle。
        5 级流水线下，mret 真正生效（PC 跳回 mepc）需要 ~5 个 cycle。
      </p>

      <!-- ★ 异常演示步骤 -->
      <ol v-if="activeDemo === 'exception'" class="text-xs text-gray-700 space-y-3 list-decimal list-inside">
        <li>
          <span class="text-blue-600 font-medium">加载异常示例程序</span> →
          在代码编辑器中点击"加载异常示例程序"按钮，再点"编译运行"加载，
          等待 <code class="text-emerald-700">mtvec</code> 配置完成（用 <code>la</code> 指令自动算偏移），
          且 mstatus 的 MIE=0、mie=0（关闭所有中断使能，本演示不涉及中断）。
        </li>
        <li>
          <span class="text-red-600 font-medium">ECALL 触发异常（识别 + 跳转）</span> →
          单步至 <code class="text-red-600">ecall</code> 触发的那个 cycle
          （"CPU 当前状态"显示"<b>CPU异常</b>"），观察：
          <ul class="list-disc list-inside ml-4 mt-1 text-gray-500">
            <li><b>识别</b>：mcause = <code class="text-red-600">0xb</code>（ECALL from M-mode，bit 63=0 表示是异常而非中断）</li>
            <li><b>跳转</b>：PC 已跳到 trap_handler 入口（用 <code>la</code> 算出的 mtvec）</li>
            <li>硬件自动保存：mepc = ecall 指令的 PC</li>
            <li>mstatus: MIE=0, MPIE=0, MPP=3（保存旧特权级）</li>
          </ul>
        </li>
        <li>
          <span class="text-red-600 font-medium">handler 处理异常</span> →
          handler 走 mcause=11（ecall）分支，<b>5</b> 条指令完成处理：
          <ul class="list-disc list-inside ml-4 mt-1 text-gray-500">
            <li><code>csrr t0, mcause</code> → t0 = 0xb</li>
            <li><code>li t1, 3 / beq t0, t1, on_ebreak</code> → 0xb ≠ 3，不走 ebreak 分支</li>
            <li><code>li t1, 11 / bne t0, t1, halt_loop</code> → 0xb == 11，<b>确认是 ecall</b></li>
            <li><code>csrr t0, mepc</code> → 读硬件保存的 mepc</li>
            <li><code>addi t0, t0, 4</code> → 推进 mepc 跳过 ecall（否则会无限循环 ecall）</li>
          </ul>
        </li>
        <li>
          <span class="text-emerald-600 font-medium">mret 返回 + 继续执行</span> →
          handler 把新 mepc 写回、x11 计数 +1 后 mret，PC 跳回 ecall 之后的 <code>addi x10, x10, 1</code>：
          <ul class="list-disc list-inside ml-4 mt-1 text-gray-500">
            <li>x10 = 100 + 1 = <b class="text-emerald-600">101</b>（验证异常已"消化"，程序流继续）</li>
            <li>x11 = 1（ecall 计数）</li>
          </ul>
          <div class="mt-1 text-gray-500 text-[0.625rem]">
            教学要点：如果 handler 不推进 mepc 而直接 mret，CPU 会回到 ecall 自身 → 再次 trap → 再次 ecall → <b>无限循环异常</b>，前端会看到 PC 一直停在 ecall 指令、mcause 反复变 0xb。
          </div>
        </li>
        <li>
          <span class="text-emerald-600 font-medium">正常结束</span> →
          继续单步到 <code>ebreak</code>，触发 mcause=3 的 trap：
          <ul class="list-disc list-inside ml-4 mt-1 text-gray-500">
            <li>handler 走 <code>on_ebreak</code>：<code>csrw mtvec, x0</code> 清空 mtvec</li>
            <li>mret 回到 ebreak 自身，第二次 trap 时 PC=mtvec=0 → 越界</li>
            <li>模拟器 <b>halted_=true</b>，前端"CPU 当前状态"显示"已停机"</li>
          </ul>
          <div class="mt-1 text-gray-500 text-[0.625rem]">
            教学要点：本模拟器没有 halt 指令，停机依赖 <b>PC 越界</b>机制。这与简单 ebreak 程序的停机原理完全一致（默认 mtvec=0 时 trap 到 PC=0 越界）。
          </div>
        </li>
      </ol>

      <!-- ★ 中断演示步骤 -->
      <ol v-else class="text-xs text-gray-700 space-y-3 list-decimal list-inside">
        <li>
          <span class="text-blue-600 font-medium">加载中断示例程序</span> →
          在代码编辑器中点击"加载中断示例程序"按钮，再点"编译运行"加载，
          等待 <code class="text-emerald-700">mtvec</code> 配置完成（用 <code>la</code> 指令自动算偏移），
          且 mie 行三位全为 1（MSIE=MTIE=MEIE=1，mie=0x888）。
        </li>
        <li>
          <span class="text-emerald-600 font-medium">查看 mie/mip 位级展开</span> →
          CSR 表的 mie 和 mip 两行显示 <b>MSIE/MTIE/MEIE</b> 和 <b>MSIP/MTIP/MEIP</b> 三位的 0/1。
          当前 mie 应为 <code class="text-emerald-700">MSIE=1 MTIE=1 MEIE=1</code>，mip 全 0。
        </li>
        <li>
          <span class="text-amber-600 font-medium">软件中断 si（bit 3）</span> →
          单步至循环 <code>loop</code> 后，点击
          <b class="text-amber-600">si</b> 按钮 → mip 行 MSIP(3) 立即变 1（mip=0x8）→
          再单步 1 次 → mcause 变为 <code class="text-amber-600">0x8000000000000003</code>，
          "CPU 当前状态"显示"软件中断（MSIP/3）" → handler 跳 <code>on_si</code>，x12 + 1，mip 清回 0x0 → mret。
        </li>
        <li>
          <span class="text-emerald-600 font-medium">定时器中断 ti（bit 7）</span> →
          点击 <b class="text-emerald-600">ti</b> 按钮 → mip 行 MTIP(7) 变 1（mip=0x80）→
          单步 1 次 → mcause = <code class="text-emerald-600">0x8000000000000007</code> →
          handler 跳 <code>on_ti</code>，x13 + 1，mip 清回 0x0 → mret。
        </li>
        <li>
          <span class="text-violet-600 font-medium">外部中断 ei（bit 11）</span> →
          点击 <b class="text-violet-600">ei</b> 按钮 → mip 行 MEIP(11) 变 1（mip=0x800）→
          单步 1 次 → mcause = <code class="text-violet-600">0x800000000000000B</code> →
          handler 跳 <code>on_ei</code>，x14 + 1，mip 清回 0x0 → mret。
        </li>
        <li>
          <span class="text-amber-600 font-medium">中断优先级验证（MEI > MSI > MTI）</span> →
          连续点 <b class="text-amber-600">si</b> 再点 <b class="text-violet-600">ei</b>（中间不 step）→
          mip 暂时为 <code>0x808</code>。单步 1 次后观察：
          <ul class="list-disc list-inside ml-4 mt-1 text-gray-500">
            <li>mcause = <code class="text-violet-600">0x800000000000000B</code>（<b>不是 0x3</b>）</li>
            <li>"CPU 当前状态"显示"<b>外部中断（MEIP/11）</b>"，x14+1</li>
            <li>si 那个 mip 位仍为 1（handler 只清 MSIP/MTIP/MEIP 之一），下一轮 trap 会处理它</li>
          </ul>
          <div class="mt-1 text-gray-500 text-[0.625rem]">
            教学要点：后端 <code>get_interrupt_cause</code> 按优先级 <code>{11, 3, 7, 9, 1, 5}</code> 顺序查找第一个 pending 位，
            所以 MEI(11) 始终优先于 MSI(3) 和 MTI(7)。这与 RISC-V Privileged Spec 一致。
          </div>
        </li>
        <li>
          <span class="text-emerald-600 font-medium">handler 按位清 mip</span> →
          观察 x12/x13/x14 在寄存器窗口的累加。
          关键点：handler 用 <code>csrrc zero, mip, t0</code>（等价 <code>mip = mip &amp; ~t0</code>）
          只清当前源对应的位，<b>不</b>像旧版那样 <code>mip = 0</code> 一刀切。
        </li>
        <li>
          <span class="text-gray-600 font-medium">兜底重置</span> →
          如果演示过程中卡死在 trap 循环（比如忘了 handler 清 mip），可点
          <b>"重置 CPU（顺带清 mip）"</b> 按钮恢复初始状态。
        </li>
      </ol>
    </div>
  </div>
</template>
