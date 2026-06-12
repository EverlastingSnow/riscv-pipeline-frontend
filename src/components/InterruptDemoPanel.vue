<script setup lang="ts">
import { computed } from 'vue';
import { usePipelineStore } from '../stores/pipeline';
import { Zap, Cpu, BookOpen, FileCode} from 'lucide-vue-next';

const pipelineStore = usePipelineStore();

const DEMO_PROGRAM = `# ===== 中断与异常演示程序 =====
# 注意：程序从 0x80000000 开始（链接器脚本设置）。
# 这里的 8 条指令 = 32 字节，所以 trap_handler 入口为 0x80000028。
.text
.globl _start
_start:
    # 1) 设置 trap vector base = 0x80000028（handler 在 _start 之后 10 条指令 = 40 字节）
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
    ecall

    # 5) 异常返回后继续
    addi  x10, x10, 1    # x10 = 101

    # 6) 终止程序
    ebreak

trap_handler:
    csrr  t0, mcause     # 读 mcause 区分中断/异常
    addi  x11, x11, 1    # 计数 trap 次数
    # 中断必须在 handler 中清 mip，否则 mret 后会立即再次进入
    li    t0, 0
    csrw  mip, t0        # 清 MSIP (handler 责任)
    mret
`;

const trapTypeLabel = computed(() => {
  switch (pipelineStore.lastTrapType) {
    case 'interrupt': return '中断 (Interrupt)';
    case 'exception': return '异常 (Exception)';
    default: return '空闲 (Idle)';
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
      <div class="text-xs text-gray-500 mb-1">当前状态</div>
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
      <ol class="text-xs text-gray-700 space-y-2 list-decimal list-inside">
        <li>
          <span class="text-blue-600 font-medium">加载示例程序</span> →
          在代码编辑器中点击"编译运行"加载程序，等待 mtvec ≈ 0x80000028
        </li>
        <li>
          <span class="text-amber-600 font-medium">异常演示</span> →
          单步至 <code class="text-red-600">ecall</code> 之后那个 cycle（"当前状态"应显示"异常"），观察：
          <ul class="list-disc list-inside ml-4 mt-1 text-gray-500">
            <li>PC 已跳转至 trap_handler（0x80000028）</li>
            <li>mcause = <code class="text-red-600">0xb</code>（ECALL from M-mode）</li>
            <li>mepc = 0x80000020（ecall 下一条指令的地址）</li>
            <li>mstatus.MPIE=1, MIE=0（中断被屏蔽）</li>
          </ul>
        </li>
        <li>
          <span class="text-emerald-600 font-medium">返回</span> →
          单步 4 次进入 trap_handler，再单步至 <code class="text-red-600">mret</code> 后：
          PC 跳回 0x80000020（ecall 的下一条），mstatus.MIE 重新使能
        </li>
        <li>
          <span class="text-amber-600 font-medium">中断演示</span> →
          <span class="text-amber-600">重置 CPU 后</span>重新加载程序，单步至 mtvec 已配置且 mstatus.MIE=1，然后：
          <ol class="list-decimal list-inside ml-4 mt-1 text-gray-500">
            <li>点击"触发软件中断"按钮 → mip 从 0x0 变为 <code class="text-amber-600">0x8</code>（bit 3）</li>
            <li>再单步 1 次 → "当前状态"显示"中断"，mcause = <code class="text-amber-600">0x8000000000000003</code>（最高位置 1）</li>
            <li>单步至 mret 后 → mip 被 handler 清 0x0，PC 恢复</li>
          </ol>
        </li>
      </ol>
    </div>
  </div>
</template>
