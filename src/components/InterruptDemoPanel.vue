<script setup lang="ts">
import { computed } from 'vue';
import { usePipelineStore } from '../stores/pipeline';
import { Zap, Cpu, BookOpen, FileCode} from 'lucide-vue-next';

const pipelineStore = usePipelineStore();

const DEMO_PROGRAM = `# ===== 中断与异常演示程序 =====
# 内存布局（每条 4 字节）：
#   0x80000000: _start (10 条 = 40 字节)
#   0x80000028: trap_handler (10 条 = 40 字节)
#
# 标准 RISC-V 软件约定：
#   硬件 trap 时把 mepc 设为被中断指令的 PC（如 0x8000001c = ecall）。
#   如果希望 mret 后跳过 ecall/ebreak，handler 必须自己把 mepc += 4。
#   下面 handler 的第 1~3 条指令就是做这件事。
.option rvc, no
.text
.globl _start
_start:
    # 1) 设置 trap vector base = 0x80000028
    auipc t0, 0          # t0 = 0x80000000
    addi  t0, t0, 40     # t0 = 0x80000028
    csrw  mtvec, t0      # mtvec = 0x80000028

    # 2) 打开 MSIE (mie bit 3) 和全局 MIE
    #    体现"中断使能"是程序主动配置的，不是外设自动开启
    li    t1, 8
    csrw  mie, t1        # mie  = 0x8
    csrw  mstatus, t1    # mstatus.MIE = 1 (bit 3)

    # 3) 正常工作
    addi  x10, x0, 100   # x10 = 100

    # 4) 触发一次异常（ECALL → mcause = 0xb）
    ecall                # mepc 自动被硬件设为 0x8000001c

    # 5) 异常返回后继续
    addi  x10, x10, 1    # x10 = 101 （mret 后会跳到这里）

    # 6) 终止程序
    ebreak

trap_handler:            # 0x80000028
    # 读 mcause 决定下一步
    csrr  t0, mcause     # t0 = mcause
    bltz  t0, handle_int # bit63=1 → 中断，跳到 handle_int

    # 异常分支：判断 mcause 类型
    #   mcause = 3 (breakpoint/ebreak) → 直接 halt（不能 mepc+=4, 否则跳进 handler 自己）
    #   mcause = 11 (ecall from M)      → 推进 mepc 后 mret
    #   其他异常                         → 直接 halt
    li    t1, 3          # t1 = 3
    beq   t0, t1, halt_loop
    li    t1, 11         # t1 = 11
    bne   t0, t1, halt_loop  # 不是 ecall/ebreak 也 halt

    # ecall 处理：把 mepc += 4 跳过 ecall 指令
    csrr  t0, mepc
    addi  t0, t0, 4
    csrw  mepc, t0
    addi  x11, x11, 1    # trap 计数 + 1
    j     ret_from_trap

handle_int:              # 中断分支：清 mip，不推进 mepc
    li    t0, 0
    csrw  mip, t0        # 清 MSIP（否则 mret 后会立即再次进入）
    j     ret_from_trap

halt_loop:               # 异常终止：写 tohost 触发模拟器停机
    # 模拟器约定：向 tohost (0x80001000) 写非零值即停机 (riscv-tests 标准)
    li    t0, 0x80001000
    addi  t1, x0, 1       # t1 = 1
    sw    t1, 0(t0)       # *(0x80001000) = 1 → 模拟器停机
    j     halt_loop       # 万一没停机，进入自循环

ret_from_trap:
    mret                  # PC ← mepc
`;

const trapTypeLabel = computed(() => {
  switch (pipelineStore.lastTrapType) {
    case 'interrupt': return 'CPU中断 (Interrupt)';
    case 'exception': return 'CPU异常 (Exception)';
    default: return '正常运行 (Idle)';
  }
});

const trapTypeColor = computed(() => {
  switch (pipelineStore.lastTrapType) {
    case 'interrupt': return 'text-amber-600';
    case 'exception': return 'text-red-600';
    default: return 'text-emerald-600';
  }
});

function loadDemoProgram() {
  pipelineStore.setEditorCode(DEMO_PROGRAM);
}

function triggerInterrupt() {
  pipelineStore.triggerInterrupt(3);
}


function parseHexValue(val: string | undefined): string {
  if (!val) return '0x0';
  if (val.startsWith('0x') || val.startsWith('0X')) return val.toUpperCase();
  try {
    return '0x' + BigInt(val).toString(16).toUpperCase();
  } catch {
    return val;
  }
}

function mstatusBreakdown(val: string | undefined): { MIE: string; MPIE: string; MPP: string } {
  const hex = val || '0x0';
  try {
    const n = BigInt(hex);
    const mie = (n >> 3n) & 1n;
    const mpie = (n >> 7n) & 1n;
    const mpp = (n >> 11n) & 0x3n;
    return { MIE: mie.toString(), MPIE: mpie.toString(), MPP: mpp.toString() };
  } catch {
    return { MIE: '0', MPIE: '0', MPP: '0' };
  }
}

const csrRows = computed(() => {
  const csr = pipelineStore.csrState;
  const mstatusParts = mstatusBreakdown(csr?.mstatus);
  return [
    { name: 'mtvec',  desc: 'Trap vector base (handler 入口)', value: parseHexValue(csr?.mtvec) },
    { name: 'mepc',   desc: 'Trap 时保存的 PC (mret 目标)',  value: parseHexValue(csr?.mepc) },
    { name: 'mcause', desc: 'Trap 原因 (高位置 1 = 中断)',   value: parseHexValue(csr?.mcause) },
    { name: 'mtval',  desc: 'Trap 附加信息',                  value: parseHexValue(csr?.mtval) },
    { name: 'mstatus', desc: `MIE=${mstatusParts.MIE} MPIE=${mstatusParts.MPIE} MPP=${mstatusParts.MPP}`,
      value: parseHexValue(csr?.mstatus) },
    { name: 'mie',    desc: 'Interrupt Enable (bit 3 = MSIE)', value: parseHexValue(csr?.mie) },
    { name: 'mip',    desc: 'Interrupt Pending (bit 3 = MSIP)', value: parseHexValue(csr?.mip) },
  ];
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

    <!-- 当前 Trap 状态 -->
    <div class="px-4 py-3 border-b border-gray-200">
      <div class="text-xs text-gray-500 mb-1">CPU 当前状态</div>
      <div :class="['text-lg font-semibold', trapTypeColor]">{{ trapTypeLabel }}</div>
      <div v-if="pipelineStore.lastTrapType !== 'none'" class="text-xs text-gray-700 mt-1">
        mcause = {{ csrRows.find(r => r.name === 'mcause')?.value }}
        <span class="text-gray-400">
          ({{ pipelineStore.lastTrapType === 'interrupt' ? 'bit 63 = 1 表示中断' : 'ECALL/EBREAK 触发的异常' }})
        </span>
      </div>
    </div>

    <!-- 操作按钮区 -->
    <div class="px-4 py-3 border-b border-gray-200 space-y-2">
      <button
        @click="loadDemoProgram"
        class="w-full flex items-center justify-center gap-2 px-3 py-2 bg-blue-200 hover:bg-blue-500 rounded text-sm font-medium transition"
      >
        <FileCode class="w-4 h-4" />
        加载示例程序
      </button>
      <button
        @click="triggerInterrupt"
        class="w-full flex items-center justify-center gap-2 px-3 py-2 bg-amber-200 hover:bg-amber-500 rounded text-sm font-medium transition"
      >
        <Zap class="w-4 h-4" />
        触发软件中断 (bit 3)
      </button>
    </div>

    <!-- CSR 状态表 -->
    <div class="px-4 py-3 border-b border-gray-200">
      <div class="flex items-center gap-2 mb-2">
        <Cpu class="w-4 h-4 text-emerald-600" />
        <h3 class="text-sm font-semibold text-gray-900">CSR 寄存器 (实时)</h3>
      </div>
      <table class="w-full text-xs">
        <tbody>
          <tr v-for="row in csrRows" :key="row.name" class="border-b border-gray-100">
            <td class="py-1.5 pr-2 font-mono text-cyan-700 w-20">{{ row.name }}</td>
            <td class="py-1.5 pr-2 text-gray-500 text-[10px] leading-tight">{{ row.desc }}</td>
            <td class="py-1.5 text-right font-mono text-emerald-700">{{ row.value }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- 教学说明 -->
    <div class="px-4 py-3">
      <div class="flex items-center gap-2 mb-2">
        <BookOpen class="w-4 h-4 text-purple-600" />
        <h3 class="text-sm font-semibold text-gray-900">观察步骤</h3>
      </div>
      <p class="text-xs text-gray-500 mb-2">
        说明：每个 <code>step</code> 是仿真器推进一个 cycle。
        5 级流水线下，mret 真正生效（PC 跳回 mepc）需要 ~5 个 cycle。
      </p>
      <ol class="text-xs text-gray-700 space-y-3 list-decimal list-inside">
        <li>
          <span class="text-blue-600 font-medium">加载示例程序</span> →
          在代码编辑器中点击"加载示例程序"按钮，再点"编译运行"加载，
          等待 <code class="text-emerald-700">mtvec ≈ 0x80000028</code>
        </li>
        <li>
          <span class="text-amber-600 font-medium">异常 trap 入口</span> →
          单步至 <code class="text-red-600">ecall</code> 触发 trap 之后那个 cycle
          （"CPU 当前状态"显示"CPU异常"），观察：
          <ul class="list-disc list-inside ml-4 mt-1 text-gray-500">
            <li>PC 已跳转至 trap_handler（<code>0x80000028</code>）</li>
            <li>mcause = <code class="text-red-600">0xb</code>（ECALL from M-mode）</li>
            <li>mepc = <code>0x8000001c</code>（硬件自动保存"被中断指令的 PC"）</li>
            <li>mstatus: MPP=3, MPIE=1, MIE=0（中断被屏蔽，旧特权级保存）</li>
          </ul>
        </li>
        <li>
          <span class="text-amber-600 font-medium">handler 分类处理（mcause 路由）</span> →
          继续单步 <b>5 次</b>，handler 前 5 条指令完成 mcause 路由：
          <ul class="list-disc list-inside ml-4 mt-1 text-gray-500">
            <li><code>csrr t0, mcause</code> → t0 = 0xb</li>
            <li><code>bltz t0, handle_int</code> → bit63=0 不跳转</li>
            <li><code>li t1, 3 / beq t0, t1, halt_loop</code> → 0xb ≠ 3，不 halt</li>
            <li><code>li t1, 11 / bne t0, t1, halt_loop</code> → 0xb == 11，<b>确认是 ecall</b></li>
          </ul>
        </li>
        <li>
          <span class="text-amber-600 font-medium">ecall 处理：推进 mepc</span> →
          再单步 <b>4 次</b>，handler 完成 mepc 推进与计数：
          <ul class="list-disc list-inside ml-4 mt-1 text-gray-500">
            <li><code>csrr t0, mepc</code> → t0 = 0x8000001c</li>
            <li><code>addi t0, t0, 4</code> → t0 = 0x80000020</li>
            <li><code>csrw mepc, t0</code> → mepc 变为 <code class="text-emerald-600">0x80000020</code></li>
            <li><code>addi x11, x11, 1</code> → x11 计数 + 1（trap 次数）</li>
          </ul>
        </li>
        <li>
          <span class="text-emerald-600 font-medium">mret 返回 + 后续 trap</span> →
          单步 <code>j ret_from_trap</code> 和 <code>mret</code>，PC 跳回 mepc=<code class="text-emerald-600">0x80000020</code>（addi）：
          <ul class="list-disc list-inside ml-4 mt-1 text-gray-500">
            <li>mstatus 恢复：MIE=MPIE=1, MPP=0（中断重新使能）</li>
            <li>继续执行得到 x10 = 101</li>
            <li>下一条 <code>ebreak</code> 触发 breakpoint trap，mcause=<code>0x3</code></li>
            <li>handler 检测到 mcause=3 → <b>跳到 halt_loop</b>（wfi + j 自循环），稳定停机</li>
          </ul>
          <div class="mt-1 text-gray-500 text-[10px]">
            教学要点：如果 handler 不检查 mcause 而统一 <code>mepc += 4</code>，ebreak 的 mepc 推进后会落在 handler 自身入口（<code>0x80000028</code>），导致 handler 被当作普通代码执行，PC 单调递增最终越界触发 illegal instruction 死循环。
          </div>
        </li>
        <li>
          <span class="text-amber-600 font-medium">中断演示</span> →
          <span class="text-amber-600">重置 CPU</span>重新加载程序，单步至 mtvec 已配置且 mstatus.MIE=1，然后：
          <ol class="list-decimal list-inside ml-4 mt-1 text-gray-500">
            <li>点击"触发软件中断 (bit 3)"按钮 → mip 从 0x0 变为 <code class="text-amber-600">0x8</code></li>
            <li>再单步 1 次 → "CPU 当前状态"显示"CPU中断"，mcause = <code class="text-amber-600">0x8000000000000003</code>（最高位置 1 表示中断）</li>
            <li>handler 读 mcause 后 <code>bltz</code> 检测到 bit63=1，<b>跳到 handle_int</b>，清 mip=0（<b>不</b>推进 mepc）</li>
            <li>执行 mret → PC 跳回被中断的指令地址（addi），mip=0，mstatus.MIE 重新使能</li>
          </ol>
        </li>
      </ol>
    </div>
  </div>
</template>
