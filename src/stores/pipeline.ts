import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { CPUState, RegisterData, ALUData, ControlSignalsData, ModalType, DifftestConfig, TeachingScenario, CompareResult, TeachingTest, CenterView, WaveformSnapshot } from '../types';
import { mockCPUState, mockRegisters, mockALUData, mockControlSignals } from '../data/mockData';

/**
 * 波形历史快照的最大长度（FIFO 滑窗容量上限）。
 * 超出此长度时,最早的快照会被丢弃,保持内存占用稳定。
 */
const MAX_HISTORY = 256;

/**
 * 安全地解析后端推送的 JSON 字符串。
 * 后端会将超过 JavaScript 安全整数范围的 64 位数值以"裸数字"形式输出,
 * 直接 JSON.parse 会丢失精度,因此先用正则把这些 16 位以上的数字
 * 包成字符串再解析,避免后续 BigInt 转换时出错。
 *
 * @param raw 后端 WebSocket 推送的原始 JSON 字符串
 * @returns 解析后的 JavaScript 对象
 */
function safeJsonParse(raw: string): any {
  const processed = raw.replace(/:\s*(-?\d{16,})/g, (_match, numStr) => {
    return ': "' + numStr + '"';
  });
  return JSON.parse(processed);
}

/**
 * WebSocket 接入地址。
 * 根据当前页面的协议(http/https)自动选择 ws/wss,并使用同一 host,
 * 便于开发与生产环境共用同一套前端。
 */
const WS_URL = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`;

/**
 * 后端推送的整条流水线信号集合。
 * 包含 IF/ID、ID/EX、EX/MEM、MEM/WB 四个流水线寄存器,
 * 以及 EX 阶段、RegFile、DataMem、异常控制器、转发逻辑等模块的内部信号。
 * 用于渲染流水线可视化与波形视图。
 */
interface PipelineSignals {
  /** 当前时钟周期数 */
  cycle?: number;
  /** 当前 PC 值(十六进制字符串) */
  pc?: string;
  /** IF/ID 流水线寄存器内容 */
  if_id: any;
  /** ID/EX 流水线寄存器内容 */
  id_ex: any;
  /** EX 阶段执行单元瞬时信号 */
  execute: any;
  /** EX/MEM 流水线寄存器内容 */
  ex_mem: any;
  /** MEM/WB 流水线寄存器内容 */
  mem_wb: any;
  /** 写回阶段信号 */
  writeback: any;
  /** 寄存器堆状态 */
  regfile: any;
  /** 数据存储器状态 */
  datamem: any;
  /** 异常/中断控制器状态 */
  exc_ctrl: any;
  /** 数据转发信号 */
  forward: any;
  // ★ 中断与异常教学演示新增字段
  /**
   * CSR 寄存器组快照(mtvec/mepc/mcause/mtval/mstatus/mie/mip),
   * 用于教学演示页面展示中断与异常现场。
   */
  csr?: {
    mtvec: string;
    mepc: string;
    mcause: string;
    mtval: string;
    mstatus: string;
    mie: string;
    mip: string;
  };
  /** 当拍是否发生了异常 trap */
  trap_taken?: boolean;
  /** 当拍是否发生了中断 trap */
  interrupt_taken?: boolean;
}

/**
 * Pinia 顶层 store —— 流水线状态中枢。
 *
 * 职责:
 *  1. 维护前端展示用的 CPU/寄存器/ALU/控制信号快照;
 *  2. 与后端建立 WebSocket 通道,接收每拍流水线信号并同步更新 store;
 *  3. 暴露 start/pause/reset/nextClock 等控制命令,驱动模拟器运行;
 *  4. 维护 difftest 配置、教学场景/测试列表、波形历史等扩展功能;
 *  5. 处理中断与异常教学演示所需的 CSR / trap 类型 / 中断源滞回等状态。
 */
export const usePipelineStore = defineStore('pipeline', () => {
  // === 基础展示数据 ===
  const cpuState = ref<CPUState>(mockCPUState);
  const registers = ref<RegisterData[]>(mockRegisters);
  const aluData = ref<ALUData>(mockALUData);
  const controlSignals = ref<ControlSignalsData>(mockControlSignals);
  /** 是否处于自动连续运行状态(start/pause 控制) */
  const isRunning = ref(false);
  /** 当前打开的模态框类型(由各组件 openModal 调用) */
  const selectedModal = ref<ModalType | null>(null);
  /** 已打开的模态框 key 列表,支持多个模态框叠加显示 */
  const activeModals = ref<string[]>([]);
  /** 最近一次从后端拉取的流水线信号全集,供组件按需取用 */
  const signals = ref<PipelineSignals | null>(null);
  // === 模式与运行参数 ===
  /** 是否连接真实后端(false 时走前端 mock 数据) */
  const useBackend = ref(true);
  /** 自动运行时的步进间隔(毫秒) */
  const runInterval = ref(1000);
  /** 高亮刷新中的乐观锁,避免快速两次 setTimeout 互相覆盖 */
  const isUpdating = ref(false);
  /** 是否处于 load ELF/测试的等待响应状态 */
  const pendingLoad = ref(false);
  /** 用户是否已加载过编辑器代码(用于按钮态切换) */
  const editorCodeLoaded = ref(false);

  // === difftest & 教学演示相关状态 ===
  /** difftest 配置:是否启用、影子模式、当前教学场景、已选信号列表 */
  const difftestConfig = ref<DifftestConfig>({
    enabled: false,
    shadowMode: false,
    scenario: { id: 0, name: '自由模式', description: '自定义所有信号', signals: [] },
    enabledSignals: []
  });

  /** 后端要求用户输入信号时挂起的提示(中断教学 + difftest 共同使用) */
  const pendingSignalInput = ref<{ signalName?: string; signals?: Array<{ name: string; expectedValue: string }>; expectedValue?: string; instruction?: string; pc?: string } | null>(null);
  /** difftest 检测到不一致时保存的比对结果(用于弹窗) */
  const compareResult = ref<CompareResult | null>(null);
  /** CPU 停机状态(EBREAK/异常退出等) */
  const haltedState = ref<{ reason: string; pc: string } | null>(null);
  /** 用户在 difftest 教学场景中手动给定的信号值映射 */
  const userInputSignals = ref<Map<string, boolean | number>>(new Map());
  /** 当前选中的流水线寄存器(供 PipelineRegisterModal 展示细节) */
  const selectedPipelineRegister = ref<{ id: string; data: any } | null>(null);
  // === 流水线滞后一拍的 valid 标志 ===
  // 用于"数据从上游流向下游"动画判断(若本拍 if_id.valid 上一拍才有效,代表数据正穿越流水线寄存器)
  const prev_if_id_valid = ref(false);
  const prev_id_ex_valid = ref(false);
  const prev_ex_mem_valid = ref(false);
  const prev_mem_wb_valid = ref(false);

  // ★ 中断与异常演示：CSR 状态、Trap 类型、编辑器代码
  // 给予全 0 字符串默认值，组件里可直接 csrState.value.mip 访问而不必判空
  /**
   * CSR 寄存器组快照,默认值为全 0 十六进制字符串,
   * 保证组件中可以直接 `csrState.value.mip` 访问而无需判空。
   */
  const csrState = ref<NonNullable<PipelineSignals['csr']>>({
    mtvec: '0x0',
    mepc: '0x0',
    mcause: '0x0',
    mtval: '0x0',
    mstatus: '0x0',
    mie: '0x0',
    mip: '0x0',
  });
  /**
   * 最近一次 trap 的类型:
   *   - 'none'      无 trap
   *   - 'interrupt' 中断
   *   - 'exception' 异常
   * 用于演示页面高亮"中断/异常"分类提示。
   */
  const lastTrapType = ref<'none' | 'interrupt' | 'exception'>('none');
  // ★ 中断源滞回字段：trap 发生后锁定为 si/ti/ei，reset 或下个 trap 才更新
  /**
   * 最近一次中断的来源(si=软件、ti=定时器、ei=外部)。
   * 采用"滞回"策略:trap 发生时锁定,直到 reset 或下一次 trap 才更新,
   * 以保证 UI 提示不会在 trap 撤销后立刻消失。
   */
  const lastInterruptSrc = ref<'si' | 'ti' | 'ei' | null>(null);
  /** 编辑器中当前的 RISC-V 汇编源码(由 setEditorCode 注入) */
  const editorCode = ref<string>('');

  // ★ 波形视图相关状态（centerView 决定中央 pipeline-section 渲染 PipelineEditor 还是 WaveformPanel）
  /**
   * 中央视图模式:'pipeline' 渲染流水线编辑器,'waveform' 渲染波形面板。
   * 切换由 setCenterView / toggleCenterView 完成。
   */
  const centerView = ref<CenterView>('pipeline');
  // FIFO 滑窗历史快照，到达 MAX_HISTORY 时丢弃最早的记录
  /**
   * 波形历史快照队列(FIFO 滑窗),
   * 由 appendHistorySnapshot 每拍写入,容量上限 MAX_HISTORY。
   */
  const signalHistory = ref<WaveformSnapshot[]>([]);
  // 录制开关（默认开）
  /** 是否正在录制波形(暂停后 appendHistorySnapshot 早返回) */
  const historyRecording = ref(true);
  // 用户在波形区域内勾选要展示的信号 id 集合
  /** 用户在波形面板中勾选展示的信号 id 集合(响应式需整体替换) */
  const selectedSignalIds = ref<Set<string>>(new Set());
  // "跳转最新"自动跟随开关
  /** 波形面板是否自动滚动到最新一拍 */
  const autoFollowLatest = ref(true);

  /**
   * 教学场景预设列表。
   * 每个场景描述一个学习目标(RegWrite/ALUSrc/内存/分支),
   * 包含对应的演示信号集合;id=0 表示"自由模式"。
   */
  const teachingScenarios: TeachingScenario[] = [
    { id: 1, name: '场景1: 寄存器写', description: '学习 RegWrite 信号', signals: ['RegWrite'] },
    { id: 2, name: '场景2: 操作数选择', description: '学习 RegWrite + ALUSrc', signals: ['RegWrite', 'ALUSrc'] },
    { id: 3, name: '场景3: 内存访问', description: '学习 RegWrite + ALUSrc + MemRead + MemWrite', signals: ['RegWrite', 'ALUSrc', 'MemRead', 'MemWrite'] },
    { id: 4, name: '场景4: 分支控制', description: '学习 RegWrite + ALUSrc + MemRead + MemWrite + Branch', signals: ['RegWrite', 'ALUSrc', 'MemRead', 'MemWrite', 'Branch'] },
    { id: 0, name: '自由模式', description: '自定义所有信号', signals: [] },
  ];

  /**
   * 教学测试列表(由后端 list_tests 动态填充),
   * 用于演示页面中按场景加载对应测试程序。
   */
  const teachingTests = ref<TeachingTest[]>([]);
  /**
   * ELF 教学测试列表(由后端 list_elf_tests 填充,或使用下方默认值)。
   * 每项包含测试名、显示名、说明、关联场景,用于 ELF 演示模块。
   */
  const elfTests = ref<TeachingTest[]>([
    { name: 'teaching_regwrite', displayName: 'RegWrite基础测试', description: 'RegWrite信号基础：区分哪些指令写寄存器，哪些不写', scenario: 'scenario1' },
    { name: 'teaching_regwrite_v2', displayName: 'RegWrite进阶测试', description: 'RegWrite信号进阶：涵盖算术、逻辑、移位、比较、加载、存储、分支、跳转、LUI/AUIPC等指令类型', scenario: 'scenario1' },
    { name: 'teaching_alusrc', displayName: 'ALUSrc操作数选择', description: 'ALUSrc信号：理解ALU操作数选择（立即数vs寄存器）', scenario: 'scenario2' },
    { name: 'teaching_alusrc_v2', displayName: 'ALUSrc进阶测试', description: 'ALUSrc信号进阶：混合ADD/SUB/AND/OR/XOR/SLT/SLL与ADDI/ANDI/ORI/XORI/SLTI/SLLI/SRLI等指令', scenario: 'scenario2' },
    { name: 'teaching_mem', displayName: '内存访问控制', description: 'MemRead/MemWrite信号：理解内存读写操作', scenario: 'scenario3' },
    { name: 'teaching_mem_v2', displayName: '内存访问进阶测试', description: 'MemRead/MemWrite信号进阶：混合SB/SH/SW与LB/LBU/LH/LHU/LW等指令', scenario: 'scenario3' },
    { name: 'teaching_branch', displayName: '分支控制', description: 'Branch信号：理解分支跳转对流水线的影响', scenario: 'scenario4' },
    { name: 'teaching_branch_v2', displayName: '分支控制进阶测试', description: 'Branch信号进阶：混合BEQ/BNE/BLT/BGE/BLTU/BGEU等条件分支指令', scenario: 'scenario4' },
    { name: 'teaching_pipeline', displayName: '流水线综合', description: '流水线综合：展示典型流水线执行序列', scenario: 'all' },
  ]);
  /** 当前已选中的测试名称(loadTeachingTest / loadElfTest 时更新) */
  const selectedTest = ref<string>('');

  /**
   * 教学场景 id → 后端约定的 scenario 字符串映射。
   * 前端组件按数字 id 选中场景,实际与后端通信时转换为 'scenario1' 等字符串。
   */
  const scenarioIdToKey: Record<number, string> = {
    1: 'scenario1',
    2: 'scenario2',
    3: 'scenario3',
    4: 'scenario4',
  };

  // 当前 WebSocket 实例与自动重连定时器(模块级闭包变量)
  let ws: WebSocket | null = null;
  /** 自动重连定时器句柄,断线 3s 后重试 connect() */
  let reconnectTimer: number | null = null;

  // === 计算属性:暴露给组件的便捷访问器 ===
  /** 当前 cycle(cpuState.cycle 的别名) */
  const cycle = computed(() => cpuState.value.cycle);
  /** 当前 PC 值 */
  const pc = computed(() => cpuState.value.pc);
  /** 当前正在执行的指令字符串 */
  const currentInstruction = computed(() => cpuState.value.currentInstruction);
  /** 当前活动的数据流集合(供 PipelineDiagram 高亮) */
  const activeDataFlows = computed(() => cpuState.value.activeDataFlows);
  /** 当前活动的控制信号集合(供 ControlPanel 高亮) */
  const activeControlSignals = computed(() => cpuState.value.activeControlSignals);

  /**
   * 与后端建立 WebSocket 连接(若已连接则直接返回)。
   * - onopen:连接成功后立即拉取一次信号;
   * - onmessage:解析后端推送的 JSON,分发到对应分支(need_signal_input / diff_detected / 正常 update);
   * - onclose:断开时若 useBackend 仍开启,3 秒后自动重连;
   * - onerror:打印错误。
   */
  function connect() {
    // 已处于 OPEN 状态则不重复连接
    if (ws?.readyState === WebSocket.OPEN) return;

    ws = new WebSocket(WS_URL);

    ws.onopen = () => {
      console.log('WebSocket connected');
      // 连接成功后立即拉取一次全量信号
      fetchFromBackend();
    };

    ws.onmessage = (event) => {
      try {
        const data = safeJsonParse(event.data);
        // console.log('Backend data received:', JSON.stringify(data, null, 2));

        // 1) 后端请求用户输入信号(difftest 教学场景)
        if (data.type === 'need_signal_input') {
          pendingSignalInput.value = data.needInput || null;
          isRunning.value = false;
          return;
        }

        // 2) difftest 检测到不一致,弹出对比结果模态框
        if (data.type === 'diff_detected') {
          compareResult.value = data.diffResult || null;
          isRunning.value = false;
          fetchRegisters();
          selectedModal.value = 'diffResult';
          return;
        }

        // 3) 正常状态回复或信号更新
        if (data.status === 'ok' || data.status === 'update') {
          pendingLoad.value = false;
          if (data.message === 'Reset' && data.difftest) {
            if (data.difftest.enabled) {
              difftestConfig.value = {
                ...difftestConfig.value,
                enabled: true,
                shadowMode: data.difftest.shadow_mode || false,
                enabledSignals: data.difftest.signals || []
              };
            }
          }
          // Handle load response which has cycle/pc at top level
          if (data.cycle !== undefined) {
            pendingSignalInput.value = null;
            updateStateFromSignals(data);
            fetchRegisters();
          } else if (data.signals && Object.keys(data.signals).length > 0) {
            pendingSignalInput.value = null;
            updateStateFromSignals(data.signals);
            fetchRegisters();
          }
          if (data.registers) {
            // 64 位寄存器值:超长字符串或 BigInt 用 BigInt,避免 Number 精度损失
            const regList: RegisterData[] = data.registers.registers.map((r: any) => ({
              name: `x${r.addr}`,
              value: typeof r.value === 'bigint' || (typeof r.value === 'string' && r.value.length > 15)
                ? '0x' + BigInt(r.value).toString(16).toUpperCase().padStart(16, '0')
                : '0x' + Number(r.value).toString(16).toUpperCase().padStart(16, '0'),
              type: 'general' as const
            }));
            registers.value = regList;
          }
          if (data.tests && Array.isArray(data.tests)) {
            teachingTests.value = data.tests;
          }
          if (data.elfTests && Array.isArray(data.elfTests)) {
            elfTests.value = data.elfTests;
          }
        }

        // 顶层 cycle 字段:每拍步进响应
        if (data.cycle !== undefined) {
          updateStateFromSignals(data);
          fetchRegisters();
          pendingLoad.value = false;
        }
      } catch (e) {
        console.error('Failed to parse message:', e);
      }
    };

    ws.onclose = () => {
      console.log('WebSocket disconnected');
      // 仅在 useBackend 仍开启时尝试自动重连
      if (useBackend.value) {
        // 3 秒后重连,避免后端短暂重启时疯狂重试
        reconnectTimer = window.setTimeout(connect, 3000);
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
  }

  /**
   * 将后端推送的一拍信号合并到 store 中。
   * 主要步骤:
   *  1. 写入原始 sigs 引用、刷新 CSR 快照、判定 trap 类型(中断/异常/无);
   *  2. 立即用"空白高亮"覆盖 cpuState,产生闪烁效果(200ms 后再写入真实高亮);
   *  3. 同步刷新 RegFile、ALU 数据、波形历史等。
   *
   * @param sigs 后端推送的整拍信号对象
   */
  function updateStateFromSignals(sigs: any) {
    // 保存原始信号对象,供 getModuleData 等按需读取
    signals.value = sigs;

    // ★ 中断与异常演示：解析 CSR 状态与 trap 类型
    if (sigs.csr) {
      csrState.value = sigs.csr;
    }
    if (sigs.interrupt_taken) {
      // 本拍为中断 trap
      lastTrapType.value = 'interrupt';
      // ★ 滞回：interrupt_taken 那个 cycle 锁定源（基于后端推回的 mcause）
      // mcause 高位 RISC-V 规范中代表 interrupt,低几位是原因码:
      //   3=MSI(软件)、7=MTI(定时器)、11=MEI(外部)
      try {
        const cause = Number(BigInt(sigs.csr?.mcause ?? '0x0') & 0xFn);
        if (cause === 3) lastInterruptSrc.value = 'si';
        else if (cause === 7) lastInterruptSrc.value = 'ti';
        else if (cause === 11) lastInterruptSrc.value = 'ei';
      } catch {
        /* 解析失败时保留旧值,避免 UI 闪烁 */
      }
    } else if (sigs.trap_taken) {
      // 本拍为异常 trap
      lastTrapType.value = 'exception';
    } else {
      // 本拍无 trap,清除类型标记
      lastTrapType.value = 'none';
    }

    // 先清空高亮，产生闪烁效果
    const emptyFlows: { id: string, value: string }[] = [];
    const emptySignals: { id: string, value: string }[] = [];
    const prevCycle = cpuState.value.cycle;
    cpuState.value = {
      ...mockCPUState,
      cycle: prevCycle,
      pc: '0x0',
      currentInstruction: '0x00000000 (NOP)',
      activeDataFlows: emptyFlows,
      activeControlSignals: emptySignals,
      modules: {}
    };

    // 延迟更新高亮
    isUpdating.value = true;
    // 用 200ms 的"灭→亮"切换实现数据通路闪烁高亮效果
    setTimeout(() => {
      cpuState.value = {
        ...mockCPUState,
        // cycle 可能是数字也可能是字符串,统一容错解析
        cycle: typeof sigs.cycle === 'number' ? sigs.cycle : parseInt(sigs.cycle) || 0,
        pc: sigs.pc || '0x0',
        currentInstruction: sigs.id_ex?.inst ? `0x${Number(sigs.id_ex.inst).toString(16).toUpperCase().padStart(8, '0')} (${decodeInstruction(Number(sigs.id_ex.inst))})` : '0x00000000 (NOP)',
        activeDataFlows: calculateActiveDataFlows(sigs),
        activeControlSignals: calculateActiveControlSignals(sigs),
        modules: {
          fetchUnit: {
            pc: sigs.if_id?.pc || '0x0',
            nextPc: sigs.if_id?.PC_next || '0x0',
          },
          decodeUnit: {
            instruction: sigs.id_ex?.inst ? '0x' + Number(sigs.id_ex.inst).toString(16).toUpperCase() : '0x0',
            // & 0x7F 提取 RISC-V 指令的最低 7 位 opcode
            opcode: sigs.id_ex?.inst ? (Number(sigs.id_ex.inst) & 0x7F).toString(2).padStart(7, '0') : '0000000',
          },
          executeUnit: {
            aluResult: sigs.execute?.alu_result || '0x0',
            zero: sigs.execute?.alu_result === 0,
          },
          memoryUnit: {
            // 仅当 mem_ren(读使能)为真时,回填读到的数据,否则置 null
            memReadData: sigs.ex_mem?.mem_ren ? sigs.datamem?.DataMEM_rdata || null : null,
          },
          writeBackUnit: {
            writeData: sigs.writeback?.debug_wb_rf_wdata || '0x0',
          },
        }
      };
      // 滑动窗口:把上一拍的 valid 标志向后挪一格,供下一拍"数据穿越"动画判定
      prev_mem_wb_valid.value = prev_ex_mem_valid.value;
      prev_ex_mem_valid.value = prev_id_ex_valid.value;
      prev_id_ex_valid.value = prev_if_id_valid.value;
      prev_if_id_valid.value = sigs.if_id?.valid;
      isUpdating.value = false;
    }, 200);

    if (sigs.regfile) {
      // 收到 regfile 信号后,先把 32 个通用寄存器清零,等待 fetchRegisters 拉取真实值
      const regList: RegisterData[] = [];
      for (let i = 0; i < 32; i++) {
        regList.push({
          name: `x${i}`,
          value: '0x0'
        });
      }
      registers.value = regList;
    }

    if (sigs.ex_mem) {
      // 把 ALU 输入/输出/指令类型从 EX/MEM 寄存器解析成十六进制字符串
      const parseHexValue = (val: any): string => {
        if (val === undefined || val === null) return '0x0';
        const strVal = String(val);
        // 已经是 0x 前缀:直接大写
        if (strVal.startsWith('0x') || strVal.startsWith('0X')) {
          return strVal.toUpperCase();
        }
        // 16+ 位长数字(超过 Number 安全范围):用 BigInt 精确转换
        if (/^-?\d{16,}$/.test(strVal)) {
          try {
            return '0x' + BigInt(strVal).toString(16).toUpperCase().padStart(1, '0');
          } catch { return '0x0'; }
        }
        // 普通数字:用 Number 转换即可
        const num = Number(strVal);
        if (isNaN(num)) return '0x0';
        return '0x' + num.toString(16).toUpperCase().padStart(1, '0');
      };

      const aluSrc1 = sigs.ex_mem?.alu_src1;
      const aluSrc2 = sigs.ex_mem?.alu_src2;
      const aluRes = sigs.ex_mem?.alu_result;
      const instrKind = sigs.ex_mem?.instruction || 'NONE';

      aluData.value = {
        operand1: parseHexValue(aluSrc1),
        operand2: parseHexValue(aluSrc2),
        operation: instrKind,
        result: parseHexValue(aluRes)
      };
    }

    // ★ 波形视图：把当拍全量信号快照推入 history（FIFO 滑窗，丢弃最早记录）
    appendHistorySnapshot(sigs);
  }

  // ★ 波形 FIFO 累加：若 cycle 与队尾相同则覆盖；满则 shift 队首
  /**
   * 将当拍全量信号快照推入 history 队列。
   * FIFO 策略:
   *  - 录制关闭时早返回;
   *  - 若队尾 cycle 与当拍 cycle 相同,则覆盖队尾(防止重复步进写入两次);
   *  - 队列长度达 MAX_HISTORY 时,丢弃最早的快照(shift 队首)再 push。
   *
   * @param sigs 后端推送的当拍信号对象
   */
  function appendHistorySnapshot(sigs: any) {
    if (!historyRecording.value) return;
    const items = calculateAllSignals(sigs);
    const values: Record<string, string> = {};
    const activeIds = new Set<string>();
    for (const it of items) {
      values[it.id] = it.value;
      if (it.active) activeIds.add(it.id);
    }
    const cycle = typeof sigs.cycle === 'number' ? sigs.cycle : parseInt(sigs.cycle) || 0;
    const snap: WaveformSnapshot = {
      cycle,
      timestamp: Date.now(),
      values,
      activeIds,
    };
    const list = signalHistory.value;
    const tail = list[list.length - 1];
    if (list.length > 0 && tail && tail.cycle === cycle) {
      // 覆盖队尾(防止重复步进写入两次,例如 step 响应 + signal update 各来一次)
      list[list.length - 1] = snap;
    } else {
      // 容量已满则 shift 队首,保持滑窗长度恒定
      if (list.length >= MAX_HISTORY) {
        list.shift();
      }
      list.push(snap);
    }
  }

  /**
   * 根据当拍信号计算需要高亮的数据流节点。
   * 输出格式: `{ id, value }[]`,供 PipelineDiagram 渲染箭头与数据值。
   * 高亮规则基于"上一拍 valid"——数据穿越流水线寄存器的瞬间才会闪烁。
   *
   * @param sigs 后端推送的当拍信号
   * @returns 当前活动的数据流列表
   */
  function calculateActiveDataFlows(sigs: any): { id: string, value: string }[] {
    const activeFlows: { id: string, value: string }[] = [];

    const parseHex = (val: any): string => {
      if (!val) return '0x0';
      if (typeof val === 'string') return val.startsWith('0x') ? val.toUpperCase() : '0x' + Number(val).toString(16).toUpperCase();
      return '0x' + Number(val).toString(16).toUpperCase();
    };

    // 解析 ID/EX 当前指令(EX 阶段正在执行时:id_ex.valid 且上一拍 id_ex 也 valid)
    // 注:实际本实现中 isExu* 系列判断未直接使用 prev_id_ex_valid,
    //    而是基于 id_ex.inst 是否非 0 来推断 EX 阶段在执行
    const idExInst = Number(sigs.id_ex?.inst) || 0;
    const exuInstrKind = (idExInst !== 0) ? decodeInstruction(idExInst) : 'NOP';
    // CSR 读写族指令(以 CSRxxx 结尾):在 EX 阶段需要额外显示读旧值 / 写新值路径
    const isExuCsr = /CSR(RW|RS|RC|RWI|RSI|RCI)$/.test(exuInstrKind);
    const isExuMret = exuInstrKind === 'MRET';

    // InstMEM - 取指内存
    if (sigs.if_id?.allow_to_go) {
      activeFlows.push({ id: 'instMEM_en', value: '1' });
      activeFlows.push({ id: 'instMEM_addr', value: sigs.if_id.pc || '0x0' });
      activeFlows.push({ id: 'instMEM_inst', value: '0x' + Number(sigs.if_id.inst).toString(16).toUpperCase().padStart(8, '0') });
    }

    // Fetch -> IF/ID寄存器 (流水线寄存器)
    if (sigs.if_id?.valid) {
      activeFlows.push({ id: 'fetchUnit_PC', value: sigs.if_id.pc || '0x0' });
      activeFlows.push({ id: 'fetchUnit_inst', value: '0x' + Number(sigs.if_id.inst).toString(16).toUpperCase().padStart(8, '0') });
      activeFlows.push({ id: 'fetchUnit_valid', value: sigs.if_id.valid ? '1' : '0' });
    }

    // IF/ID寄存器 -> Decode Unit (数据从IF/ID寄存器输出到译码单元)
    // 仅当上一周期IF/ID有效时才亮(表示数据正在传递到Decode Unit)
    if (prev_if_id_valid.value) {
      activeFlows.push({ id: 'decodeStage_PC', value: sigs.if_id.pc || '0x0' });
      activeFlows.push({ id: 'decodeStage_inst', value: '0x' + Number(sigs.if_id.inst).toString(16).toUpperCase().padStart(8, '0') });
      activeFlows.push({ id: 'decodeStage_valid', value: sigs.if_id.valid ? '1' : '0' });
    }

    // Decode Unit -> RegFile 读取
    if (prev_if_id_valid.value) {
      activeFlows.push({ id: 'src1_raddr', value: String(sigs.id_ex.src1_raddr || 0) });
      activeFlows.push({ id: 'src2_raddr', value: String(sigs.id_ex.src2_raddr || 0) });
      activeFlows.push({ id: 'src1_rdata', value: parseHex(sigs.id_ex.src1_rdata) });
      activeFlows.push({ id: 'src2_rdata', value: parseHex(sigs.id_ex.src2_rdata) });
    }

    // Decode Unit -> Execute Stage
    if (prev_if_id_valid.value) {
      activeFlows.push({ id: 'ID_EX_info', value: sigs.id_ex.inst ? 'valid' : 'N/A' });
    }

    // Execute Stage -> Execute Unit
    if (prev_id_ex_valid.value) {
      activeFlows.push({ id: 'EX_info', value: 'valid' });
      activeFlows.push({ id: 'ALU_op1', value: parseHex(sigs.id_ex?.src1_rdata) });
      activeFlows.push({ id: 'ALU_op2', value: parseHex(sigs.id_ex?.src2_rdata) });
      activeFlows.push({ id: 'ALU_result', value: parseHex(sigs.ex_mem?.alu_result) });
    }

    // ★ CSR 指令:EX 阶段 Execute Unit 读 CSR(旧值,作为 wb_value 回写寄存器),
    //            同时写 CSR(addr / wdata / wen)
    if (prev_id_ex_valid.value && isExuCsr) {
      // id_ex.imm 是 hex 字符串(如 "0x305"),需要先 parseInt 解析
      // & 0xFFF 仅保留 CSR 地址低 12 位(RISC-V CSR 寻址规范)
      const immRaw = sigs.id_ex?.imm;
      const csrAddr = immRaw ? (parseInt(String(immRaw), 16) & 0xFFF) : 0;
      activeFlows.push({ id: 'csr_read',  value: '0x' + Number(sigs.ex_mem?.alu_result || 0).toString(16).toUpperCase() });
      activeFlows.push({ id: 'csr_addr',  value: '0x' + csrAddr.toString(16).toUpperCase().padStart(3, '0') });
      activeFlows.push({ id: 'csr_wdata', value: parseHex(sigs.id_ex?.src1_rdata) });
      activeFlows.push({ id: 'csr_wen',   value: '1' });
    }

    // ★ MRET:EX 阶段读 mepc 作为跳转目标,PC ← mepc(最终由 IF 阶段 PC 寄存器接收)
    if (prev_id_ex_valid.value && isExuMret) {
      activeFlows.push({ id: 'mepc_to_pc', value: sigs.csr?.mepc || '0x0' });
    }

    // ★ Trap entry(IF 阶段 trap_taken / interrupt_taken):读 mtvec 作为跳转目标
    if (sigs.trap_taken || sigs.interrupt_taken) {
      activeFlows.push({ id: 'mtvec_to_pc', value: sigs.csr?.mtvec || '0x0' });
    }

    // Execute Unit -> DataMEM
    if (sigs.datamem?.DataMEM_en) {
      activeFlows.push({ id: 'DataMem_wen', value: sigs.datamem.DataMEM_wen ? '1' : '0' });
      activeFlows.push({ id: 'DataMem_addr', value: sigs.datamem.DataMEM_addr || '0x0' });
      activeFlows.push({ id: 'DataMem_wdata', value: sigs.datamem.DataMEM_wdata || '0x0' });
    }

    // DataMEM -> Memory Unit
    if (sigs.datamem?.DataMEM_en && sigs.datamem?.DataMEM_rdata !== undefined) {
      activeFlows.push({ id: 'DataMem_rdata', value: String(sigs.datamem.DataMEM_rdata || 0) });
    }

    // Execute Unit -> Memory Stage
    if (prev_id_ex_valid.value) {
      activeFlows.push({ id: 'EX_MEM_info', value: 'valid' });
    }

    // Memory Stage -> Memory Unit
    if (prev_ex_mem_valid.value) {
      activeFlows.push({ id: 'MEM_info', value: 'valid' });
    }

    // Memory Unit -> WriteBack Stage
    if (prev_ex_mem_valid.value) {
      activeFlows.push({ id: 'MEM_WB_info', value: 'valid' });
    }

    // WriteBack Stage -> WriteBack Unit
    if (prev_mem_wb_valid.value) {
      activeFlows.push({ id: 'WB_info', value: 'valid' });
    }

    // WriteBack Unit -> RegFile 写入
    if (sigs.writeback?.debug_wb_rf_wen && sigs.writeback?.debug_wb_rf_waddr !== 0) {
      activeFlows.push({ id: 'wb_en', value: '1' });
      activeFlows.push({ id: 'wb_raddr', value: String(sigs.writeback.debug_wb_rf_waddr) });
      activeFlows.push({ id: 'wb_rdata', value: sigs.writeback.debug_wb_rf_wdata || '0x0' });
    }

    // Decode Unit -> Ctrl
    if (sigs.id_ex?.inst) {
      activeFlows.push({ id: 'decodeInfo', value: 'valid' });
    }

    // Execute Unit -> Ctrl
    if (prev_id_ex_valid.value) {
      activeFlows.push({ id: 'executeInfo', value: 'valid' });
    }

    // Memory Unit -> Ctrl
    if (prev_ex_mem_valid.value) {
      activeFlows.push({ id: 'memoryInfo', value: 'valid' });
    }

    // WriteBack Unit -> Ctrl
    if (prev_mem_wb_valid.value) {
      activeFlows.push({ id: 'writeBackInfo', value: 'valid' });
    }

    return activeFlows;
  }

  /**
   * 根据当拍信号计算需要高亮的控制信号。
   * 输出格式: `{ id, value }[]`,供 ControlPanel 渲染控制线高亮。
   * 涵盖阶段握手(allow_to_go)、flush、branch_taken、trap 路径等。
   *
   * @param sigs 后端推送的当拍信号
   * @returns 当前活动的控制信号列表
   */
  function calculateActiveControlSignals(sigs: any): { id: string, value: string }[] {
    const activeSignals: { id: string, value: string }[] = [];

    // Fetch阶段控制
    if (sigs.if_id?.allow_to_go) {
      activeSignals.push({ id: 'fetchUnit_allow_to_go', value: sigs.if_id.allow_to_go ? '1' : '0' });
    }
    if (sigs.if_id?.allow_to_go === false) {
      activeSignals.push({ id: 'decodeStage_allow_to_fetch', value: '0' });
    }

    if (sigs.if_id?.valid) {
      activeSignals.push({ id: 'fetchStage_allow_to_go', value: '1'});
    }
    // Decode到Execute的控制
    if (prev_if_id_valid.value) {
      activeSignals.push({ id: 'decodeStage_allow_to_go', value: '1' });
    }

    // Execute到Memory的控制
    if (prev_id_ex_valid.value) {
      activeSignals.push({ id: 'executeStage_allow_to_go', value: '1' });
    }

    // Memory到WriteBack的控制
    if (prev_ex_mem_valid.value) {
      activeSignals.push({ id: 'memoryStage_allow_to_go', value: '1' });
    }

    // 刷新信号(branch_taken + trap/interrupt 都会 flush IF/ID、ID/EX)
    // 四种情形任一发生,都需冲刷流水线前端三段
    if (sigs.if_id?.taken || sigs.ex_mem?.branch_taken || sigs.trap_taken || sigs.interrupt_taken) {
      activeSignals.push({ id: 'fetchUnit_do_flush', value: '1' });
      activeSignals.push({ id: 'decodeUnit_do_flush', value: '1' });
      activeSignals.push({ id: 'executeUnit_do_flush', value: '1' });
    }

    // 分支跳转信号
    if (sigs.if_id?.taken) {
      activeSignals.push({ id: 'branch_taken', value: '1' });
      activeSignals.push({ id: 'branch_target', value: sigs.if_id.target || '0x0' });
    }

    // ★ 中断与异常演示:trap 跳转路径高亮
    if (sigs.trap_taken || sigs.interrupt_taken) {
      activeSignals.push({ id: 'fetchUnit_do_flush', value: '1' });
      activeSignals.push({ id: 'decodeUnit_do_flush', value: '1' });
      activeSignals.push({ id: 'executeUnit_do_flush', value: '1' });
      activeSignals.push({ id: 'trap_taken_signal', value: '1' });
      activeSignals.push({ id: 'trap_mcause', value: sigs.csr?.mcause || '0x0' });
      activeSignals.push({ id: 'trap_mepc', value: sigs.csr?.mepc || '0x0' });
    }

    return activeSignals;
  }

  /** 信号类型(data=数据,addr=地址,control=控制位) */
  type SignalType = 'data' | 'addr' | 'control';

  /** 单条信号在波形面板中的渲染描述 */
  interface SignalItem {
    /** 唯一 id,供 selectedSignalIds 引用 */
    id: string;
    /** 界面显示名 */
    label: string;
    /** 当前值(已格式化为字符串) */
    value: string;
    /** 信号类型,影响高亮判定 */
    type: SignalType;
    /** 所属流水线阶段标签 */
    stage: string;
    /** 是否"有效"(用于高亮与曲线绘制) */
    active: boolean;
  }

  /**
   * 判定一个信号值是否视为"有效/激活"。
   * - 布尔:仅 true 算激活;
   * - 字符串:支持 'true'/'1' / 'false'/'0'/'-' / 'none'/'nop' 关键字,
   *   以及 addr 类型下任何非 '0x0' 字符串;
   * - 数字:非 0 即激活。
   *
   * @param value 任意形式的信号原始值
   * @param type 信号类型(addr 时非 '0x0' 视为激活)
   * @returns 是否激活
   */
  function isActiveValue(value: any, type: SignalType): boolean {
    if (value === undefined || value === null) return false;
    if (typeof value === 'boolean') return value === true;
    if (typeof value === 'string') {
      const lower = value.toLowerCase();
      if (lower === 'true' || lower === '1') return true;
      if (lower === 'false' || lower === '0' || lower === '-') return false;
      if (type === 'addr') {
        return lower !== '0x0';
      }
      if (lower === 'none' || lower === 'nop') return false;
      return value.length > 0;
    }
    if (typeof value === 'number') return value !== 0;
    return false;
  }

  /**
   * 收集当拍所有可展示的信号,转换成 SignalItem 列表。
   * 涵盖 IF/ID、ID/EX、EX/MEM、MEM/WB 四个流水线寄存器,
   * 以及 RegFile、DataMem 的关键信号。
   *
   * @param sigs 后端推送的当拍信号
   * @returns SignalItem 数组,供波形面板渲染
   */
  function calculateAllSignals(sigs: any): SignalItem[] {
    const signals: SignalItem[] = [];
    const parseHex = (val: any): string => {
      if (!val && val !== 0) return '-';
      if (typeof val === 'string') return val.startsWith('0x') ? val.toUpperCase() : '0x' + Number(val).toString(16).toUpperCase();
      return '0x' + Number(val).toString(16).toUpperCase();
    };

    const addSignal = (id: string, label: string, value: any, type: SignalType, stage: string) => {
      const rawValue = value;
      const displayValue = typeof value === 'boolean' ? (value ? '1' : '0') : (typeof value === 'number' ? (type === 'addr' ? parseHex(value) : String(value)) : (value || '-'));
      const active = isActiveValue(rawValue, type);
      signals.push({ id, label: label, value: displayValue, type, stage, active });
    };

    // IF/ID Pipeline Register
    if (sigs.if_id) {
      addSignal('IF_valid', 'IF_valid', sigs.if_id.valid, 'data', 'IF/ID');
      addSignal('IF_PC', 'IF_PC', sigs.if_id.pc, 'addr', 'IF/ID');
      addSignal('IF_inst', 'IF_inst', sigs.if_id.inst, 'addr', 'IF/ID');
      addSignal('IF_taken', 'IF_taken', sigs.if_id.taken, 'control', 'IF/ID');
      addSignal('IF_target', 'IF_target', sigs.if_id.target, 'addr', 'IF/ID');
      addSignal('IF_PC_next', 'IF_PC_next', sigs.if_id.PC_next, 'addr', 'IF/ID');
      addSignal('IF_allow', 'IF_allow_to_go', sigs.if_id.allow_to_go, 'control', 'IF/ID');
    }

    // ID/EX Pipeline Register
    if (sigs.id_ex) {
      addSignal('ID_PC', 'ID_PC', sigs.id_ex.pc, 'addr', 'ID/EX');
      addSignal('ID_valid', 'ID_valid', sigs.id_ex.valid, 'data', 'ID/EX');
      addSignal('ID_inst', 'ID_inst', sigs.id_ex.inst, 'addr', 'ID/EX');
      addSignal('ID_rs1_addr', 'ID_rs1_addr', sigs.id_ex.src1_raddr, 'addr', 'ID/EX');
      addSignal('ID_rs1_data', 'ID_rs1_data', sigs.id_ex.src1_rdata, 'addr', 'ID/EX');
      addSignal('ID_rs2_addr', 'ID_rs2_addr', sigs.id_ex.src2_raddr, 'addr', 'ID/EX');
      addSignal('ID_rs2_data', 'ID_rs2_data', sigs.id_ex.src2_rdata, 'addr', 'ID/EX');
      addSignal('ID_imm', 'ID_imm', sigs.id_ex.imm, 'addr', 'ID/EX');
    }

    // EX/MEM Pipeline Register
    if (sigs.ex_mem) {
      addSignal('EX_PC', 'EX_PC', sigs.ex_mem.pc, 'addr', 'EX/MEM');
      addSignal('EX_valid', 'EX_valid', sigs.ex_mem.valid, 'data', 'EX/MEM');
      addSignal('EX_alu_result', 'EX_alu_result', sigs.ex_mem.alu_result, 'addr', 'EX/MEM');
      addSignal('EX_branch_taken', 'EX_branch_taken', sigs.ex_mem.branch_taken, 'control', 'EX/MEM');
      addSignal('EX_branch_target', 'EX_branch_target', sigs.ex_mem.branch_target, 'addr', 'EX/MEM');
      addSignal('EX_mem_addr', 'EX_mem_addr', sigs.ex_mem.mem_addr, 'addr', 'EX/MEM');
      addSignal('EX_mem_wen', 'EX_mem_wen', sigs.ex_mem.mem_wen, 'control', 'EX/MEM');
      addSignal('EX_mem_ren', 'EX_mem_ren', sigs.ex_mem.mem_ren, 'control', 'EX/MEM');
      addSignal('EX_mem_wdata', 'EX_mem_wdata', sigs.ex_mem.mem_wdata, 'addr', 'EX/MEM');
      addSignal('EX_info', 'EX_info', sigs.ex_mem.info, 'data', 'EX/MEM');
    }

    // MEM/WB Pipeline Register
    if (sigs.mem_wb) {
      addSignal('MEM_PC', 'MEM_PC', sigs.mem_wb.pc, 'addr', 'MEM/WB');
      addSignal('MEM_valid', 'MEM_valid', sigs.mem_wb.valid, 'data', 'MEM/WB');
      addSignal('MEM_wb_value', 'MEM_wb_value', sigs.mem_wb.wb_value, 'addr', 'MEM/WB');
      addSignal('MEM_rf_wen', 'MEM_rf_wen', sigs.mem_wb.rf_wen, 'control', 'MEM/WB');
      addSignal('MEM_rf_waddr', 'MEM_rf_waddr', sigs.mem_wb.rf_waddr, 'addr', 'MEM/WB');
      addSignal('MEM_info', 'MEM_info', sigs.mem_wb.info, 'data', 'MEM/WB');
    }

    // RegFile
    if (sigs.regfile) {
      addSignal('RF_wen', 'RF_wen', sigs.regfile.reg_wen, 'control', 'RF');
      addSignal('RF_waddr', 'RF_waddr', sigs.regfile.reg_waddr, 'addr', 'RF');
      addSignal('RF_wdata', 'RF_wdata', sigs.regfile.reg_wdata, 'addr', 'RF');
    }

    // DataMem
    if (sigs.datamem) {
      addSignal('DM_en', 'DM_en', sigs.datamem.DataMEM_en, 'data', 'DM');
      addSignal('DM_addr', 'DM_addr', sigs.datamem.DataMEM_addr, 'addr', 'DM');
      addSignal('DM_rdata', 'DM_rdata', sigs.datamem.DataMEM_rdata, 'addr', 'DM');
      addSignal('DM_wdata', 'DM_wdata', sigs.datamem.DataMEM_wdata, 'addr', 'DM');
    }

    return signals;
  }

  /**
   * 将 32 位 RISC-V 指令机器码解码为助记符字符串(如 ADD / BEQ / CSRRS / MRET)。
   * 解码顺序:先按 opcode 大类分桶,再按 funct3/funct7 区分。
   * - 0x33 OP 族:funct7=0 → ADD/SLL/SLT/...;funct7=0x20 → SUB/SRA;
   * - 0x13 OP-IMM 族:funct3 决定基本类型,funct3=5 时 funct7 区分 SRLI vs SRAI;
   * - 0x63 BRANCH 族:funct3 直映 BEQ/BNE/BLT/BGE/BLTU/BGEU;
   * - 0x03/0x23 LOAD/STORE 族:funct3 决定访存宽度;
   * - 0x73 SYSTEM 族:整字匹配 ECALL/EBREAK/MRET/WFI,funct3 区分 CSR 读写。
   *
   * @param inst 32 位指令机器码
   * @returns 助记符字符串,无法识别时返回 'NOP' 或 'UNKNOWN'
   */
  function decodeInstruction(inst: number): string {
    if (!inst) return 'NOP';

    // & 0x7F 提取指令最低 7 位 = opcode(RISC-V 规范)
    const opcode = inst & 0x7F;
    // >> 12 & 0x7 提取 bits[14:12] = funct3
    const funct3 = (inst >> 12) & 0x7;
    // >> 25 & 0x7F 提取 bits[31:25] = funct7
    const funct7 = (inst >> 25) & 0x7F;
    
    const opcodeMap: Record<number, string> = {
      0x03: 'LOAD',       // LB, LH, LW, LBU, LHU, LWU, LD
      0x0F: 'FENCE',     // FENCE, FENCE_I
      0x13: 'OP-IMM',    // ADDI, SLTI, SLTIU, XORI, ORI, ANDI, SLLI, SRLI, SRAI
      0x17: 'AUIPC',
      0x1B: 'OP-IMM-32', // ADDIW, SLLIW, SRLIW, SRAIW
      0x23: 'STORE',     // SB, SH, SW, SD
      0x33: 'OP',        // ADD, SUB, SLL, SLT, SLTU, XOR, SRL, SRA, OR, AND
      0x37: 'LUI',
      0x3B: 'OP-32',     // ADDW, SUBW, SLLW, SRLW, SRAW
      0x43: 'FMADD',     // FMADD.S
      0x47: 'FMSUB',     // FMSUB.S
      0x4B: 'FNMSUB',    // FNMSUB.S
      0x4F: 'FNMADD',    // FNMADD.S
      0x63: 'BRANCH',    // BEQ, BNE, BLT, BGE, BLTU, BGEU
      0x67: 'JALR',
      0x6F: 'JAL',
      0x73: 'SYSTEM',    // ECALL, EBREAK, CSRRW, CSRRS, CSRRC, CSRRWI, CSRRSI, CSRRCI
    };
    
    const baseName = opcodeMap[opcode] || 'UNKNOWN';
    
    if (opcode === 0x33) { // OP
      // funct7=0 区分基本算术/逻辑,funct7=0x20 区分 SUB/SRA(RISC-V 约定)
      if (funct7 === 0 && funct3 === 0) return 'ADD';
      if (funct7 === 0 && funct3 === 1) return 'SLL';
      if (funct7 === 0 && funct3 === 2) return 'SLT';
      if (funct7 === 0 && funct3 === 3) return 'SLTU';
      if (funct7 === 0 && funct3 === 4) return 'XOR';
      if (funct7 === 0 && funct3 === 5) return 'SRL';
      if (funct7 === 0 && funct3 === 6) return 'OR';
      if (funct7 === 0 && funct3 === 7) return 'AND';
      if (funct7 === 0x20 && funct3 === 0) return 'SUB';
      if (funct7 === 0x20 && funct3 === 5) return 'SRA';
    }
    
    if (opcode === 0x13) { // OP-IMM
      // funct3 决定立即数操作类型,funct3=5 时由 funct7 区分 SRLI(0) vs SRAI(0x20)
      if (funct3 === 0) return 'ADDI';
      if (funct3 === 1) return 'SLLI';
      if (funct3 === 2) return 'SLTI';
      if (funct3 === 3) return 'SLTIU';
      if (funct3 === 4) return 'XORI';
      if (funct3 === 5 && funct7 === 0) return 'SRLI';
      if (funct3 === 5 && funct7 === 0x20) return 'SRAI';
      if (funct3 === 6) return 'ORI';
      if (funct3 === 7) return 'ANDI';
    }
    
    if (opcode === 0x63) { // BRANCH
      if (funct3 === 0) return 'BEQ';
      if (funct3 === 1) return 'BNE';
      if (funct3 === 4) return 'BLT';
      if (funct3 === 5) return 'BGE';
      if (funct3 === 6) return 'BLTU';
      if (funct3 === 7) return 'BGEU';
    }
    
    if (opcode === 0x03) { // LOAD
      if (funct3 === 0) return 'LB';
      if (funct3 === 1) return 'LH';
      if (funct3 === 2) return 'LW';
      if (funct3 === 3) return 'LD';
      if (funct3 === 4) return 'LBU';
      if (funct3 === 5) return 'LHU';
      if (funct3 === 6) return 'LWU';
    }
    
    if (opcode === 0x23) { // STORE
      if (funct3 === 0) return 'SB';
      if (funct3 === 1) return 'SH';
      if (funct3 === 2) return 'SW';
      if (funct3 === 3) return 'SD';
    }

    if (opcode === 0x73) { // SYSTEM
      // 整字匹配方式识别 ECALL/EBREAK/MRET/WFI
      if (inst === 0x00000073) return 'ECALL';
      if (inst === 0x00100073) return 'EBREAK';
      if (inst === 0x30200073) return 'MRET';
      if (inst === 0x10500073) return 'WFI';
      // funct3 区分 CSR 读写族(1=CSRRW, 2=CSRRS, 3=CSRRC, 5/6/7=立即数族)
      if (funct3 === 1) return 'CSRRW';
      if (funct3 === 2) return 'CSRRS';
      if (funct3 === 3) return 'CSRRC';
      if (funct3 === 5) return 'CSRRWI';
      if (funct3 === 6) return 'CSRRSI';
      if (funct3 === 7) return 'CSRRCI';
    }

    return baseName;
  }

  /**
   * 向后端请求最新寄存器值(通过 WebSocket 发送 get_registers 命令)。
   * 通常在每拍步进后由 onmessage 处理器自动调用,以确保寄存器面板同步。
   */
  async function fetchRegisters() {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ command: 'get_registers' }));
    }
  }

  /**
   * 通过 WebSocket 向后端发送命令。
   * 当 socket 处于 OPEN 状态时,序列化 `{ command, ...data }` 并 send;
   * 否则仅打印日志,不重试(由 connect() 的重连机制兜底)。
   *
   * @param cmd 后端约定的命令字符串
   * @param data 任意附加负载(将被展开到消息顶层)
   */
  function sendCommand(cmd: string, data?: any) {
    console.log('sendCommand called:', cmd, data);
    if (ws?.readyState === WebSocket.OPEN) {
      const msg = JSON.stringify({ command: cmd, ...data });
      console.log('Sending WebSocket message:', msg.substring(0, 200) + '...');
      ws.send(msg);
    } else {
      console.log('WebSocket not open, state:', ws?.readyState);
    }
  }

  /**
   * 从后端拉取一次全量信号(get_signals)。
   * 仅在 useBackend 开启时执行,常用于初始化或重连后刷新。
   */
  async function fetchFromBackend() {
    if (!useBackend.value) return;
    sendCommand('get_signals');
  }

  /**
   * 推进一拍(单步执行)。
   * - 在 pendingLoad / haltedState / difftest 等待输入 期间早返回;
   * - 后端模式:发送 'step' 命令,等待 onmessage 推回新一拍;
   * - 离线 mock 模式:本地递增 cycle 与 PC(+4)。
   */
  async function nextClock() {
    // 正在加载 ELF/测试时,不允许步进
    if (pendingLoad.value) {
      return;
    }
    // CPU 停机(EBREAK 等)后,不再推进
    if (haltedState.value !== null) {
      return;
    }
    // difftest 等待用户输入信号时,不允许步进
    if (difftestConfig.value.enabled && pendingSignalInput.value) {
      return;
    }

    if (useBackend.value) {
      sendCommand('step');
    } else {
      // 离线模式:仅递增 cycle 与 PC,流水线信号保持 mock 不变
      cpuState.value = {
        ...mockCPUState,
        cycle: cpuState.value.cycle + 1,
        pc: '0x' + (parseInt(cpuState.value.pc) + 4).toString(16).toUpperCase()
      };
    }
  }

  /**
   * 启动自动连续运行。
   * - 离线模式:用 setTimeout 递归实现本地步进循环;
   * - 后端模式:在 while 循环中每拍发送 'step' 命令,
   *   并在多种中断/停机条件下主动退出循环(避免脏状态)。
   */
  async function start() {
    if (!useBackend.value) {
      // 离线模式:本地点步
      isRunning.value = true;
      const run = async () => {
        if (isRunning.value) {
          await nextClock();
          // 按 runInterval 间隔递归调用,实现可调速的自动运行
          setTimeout(run, runInterval.value);
        }
      };
      run();
      return;
    }

    isRunning.value = true;

    // 使用循环 step 而不是后端 run,以便前端控制间隔
    const run = async () => {
      // 多种异常条件主动退出:WebSocket 断开 / 加载中 / difftest 待输入 / 不一致 / 停机
      while (isRunning.value && ws?.readyState === WebSocket.OPEN) {
        if (pendingLoad.value) {
          isRunning.value = false;
          break;
        }
        if (difftestConfig.value.enabled && pendingSignalInput.value) {
          isRunning.value = false;
          break;
        }
        if (compareResult.value !== null) {
          isRunning.value = false;
          break;
        }
        if (haltedState.value !== null) {
          isRunning.value = false;
          break;
        }
        sendCommand('step');
        // 按 runInterval 间隔等待后再推进一步
        await new Promise(resolve => setTimeout(resolve, runInterval.value));
      }
    };
    run();
  }

  /**
   * 暂停自动运行。
   * 后端模式:除关闭 isRunning 外,还会发 'stop' 命令通知后端停止连步。
   */
  function pause() {
    isRunning.value = false;
    if (useBackend.value) {
      sendCommand('stop');
    }
  }

  /**
   * 重置 CPU 状态并清空前端 store 中所有运行时数据。
   * - 后端模式:仅发 'reset' 命令,响应回来后由 onmessage 回调同步刷新;
   * - 离线模式:本地重置 difftest、cpuState、registers、aluData、controlSignals。
   * 此外还会清空中断源滞回、prev_*_valid、波形历史等扩展状态。
   */
  async function reset() {
    isRunning.value = false;
    // ★ 中断源滞回字段清空(重置 CPU 时同步)
    lastInterruptSrc.value = null;
    // 流水线 valid 滑动窗口归零
    prev_if_id_valid.value = false;
    prev_id_ex_valid.value = false;
    prev_ex_mem_valid.value = false;
    prev_mem_wb_valid.value = false;
    // 清理 difftest / 比对 / 停机 / 用户输入 / 待加载状态
    pendingSignalInput.value = null;
    pendingLoad.value = false;
    compareResult.value = null;
    haltedState.value = null;
    userInputSignals.value.clear();
    // ★ 波形历史随 CPU 重置同步清空
    signalHistory.value = [];
    if (useBackend.value) {
      // 后端模式:由 onmessage 回调把 registers/aluData/controlSignals 刷成最新值
      sendCommand('reset');
    } else {
      // 离线模式:本地直接恢复为 mock 数据
      difftestConfig.value = {
        enabled: false,
        shadowMode: false,
        scenario: { id: 0, name: '自由模式', description: '自定义所有信号', signals: [] },
        enabledSignals: []
      };
      cpuState.value = mockCPUState;
      registers.value = mockRegisters;
      aluData.value = mockALUData;
      controlSignals.value = mockControlSignals;
    }
  }

  /**
   * 打开指定类型的模态框。
   * 对流水线寄存器类型,使用 `pipelineRegister_<id>` 作为 key 并预加载寄存器数据;
   * 其他类型直接以 type 作为 key。
   * 同时把 key 推入 activeModals 列表,记录"已打开"状态(支持多模态框叠加)。
   *
   * @param type 模态框类型枚举
   * @param registerId 当 type='pipelineRegister' 时,指定寄存器 id
   */
  function openModal(type: ModalType, registerId?: string) {
    let modalKey: string;
    if (type === 'pipelineRegister' && registerId) {
      // 流水线寄存器详情:用 `pipelineRegister_<id>` 区分多个寄存器并存
      modalKey = `pipelineRegister_${registerId}`;
      selectedPipelineRegister.value = {
        id: registerId,
        data: getPipelineRegisterData(registerId)
      };
    } else {
      modalKey = type || '';
    }
    if (!activeModals.value.includes(modalKey)) {
      activeModals.value.push(modalKey);
    }
    // 更新 selectedModal 让 UI 渲染最新打开的模态框
    selectedModal.value = type;
  }

  /**
   * 关闭模态框。
   * - 指定 modalKey 时:从 activeModals 移除该 key,若无残留则 selectedModal=null;
   *   否则把 selectedModal 切到列表中最后一个 key(支持多模态框之间的切换);
   * - 未指定 modalKey 时:清空所有模态框,
   *   并在 difftest 开启时通知后端"跳过信号输入"。
   */
  function closeModal(modalKey?: string) {
    if (modalKey) {
      // 关闭指定 key 的模态框
      activeModals.value = activeModals.value.filter(m => m !== modalKey);
      if (activeModals.value.length > 0) {
        // 还有其他模态框:切到最顶层的那一个
        const lastModal = activeModals.value[activeModals.value.length - 1];
        selectedModal.value = lastModal as ModalType;
      } else {
        // 没有模态框残留:清空选中
        selectedModal.value = null;
      }
    } else {
      // 关闭全部
      activeModals.value = [];
      selectedModal.value = null;
      selectedPipelineRegister.value = null;
      pendingSignalInput.value = null;
      haltedState.value = null;
      // difftest 教学场景:告诉后端"跳过信号输入"
      if (useBackend.value && difftestConfig.value.enabled) {
        sendCommand('skip_signal_input');
      }
    }
  }

  /**
   * 获取指定流水线寄存器的实时数据(用于 PipelineRegisterModal 详情展示)。
   * 支持的 id: if_id / id_ex / ex_mem / mem_wb。
   *
   * @param registerId 流水线寄存器 id
   * @returns 对应的信号对象,未取到时返回 null
   */
  function getPipelineRegisterData(registerId: string) {
    if (!signals.value) return null;
    switch (registerId) {
      case 'if_id':
        return {
          ...signals.value.if_id
        };
      case 'id_ex':
        return {
          ...signals.value.id_ex
        };
      case 'ex_mem':
        return {
          ...signals.value.ex_mem
        };
      case 'mem_wb':
        return {
          ...signals.value.mem_wb
        };
      default:
        return null;
    }
  }

  /**
   * 获取指定模块的实时数据(用于 ModuleModal 详情展示)。
   * 支持的 moduleName: fetchUnit / decodeUnit / executeUnit / writeBackUnit。
   *
   * @param moduleName 模块名
   * @returns 对应的信号对象,未取到时返回 null
   */
  function getModuleData(moduleName: string) {
    if (!signals.value) return null;
    switch (moduleName) {
      case 'fetchUnit':
        return signals.value.if_id;
      case 'decodeUnit':
        return signals.value.id_ex;
      case 'executeUnit':
        return signals.value.execute;
      case 'writeBackUnit':
        return signals.value.writeback;
      default:
        return null;
    }
  }

  /**
   * 切换是否连接后端(useBackend 开关)。
   * - 切到 true:立即 connect() 建立 WebSocket;
   * - 切到 false:关闭 WebSocket,并清理可能挂起的重连定时器。
   *
   * @param enabled 是否使用后端
   */
  function setUseBackend(enabled: boolean) {
    useBackend.value = enabled;
    if (enabled) {
      connect();
    } else {
      ws?.close();
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    }
  }

  /**
   * 设置自动运行步进间隔(毫秒)。
   * 注意:仅影响下一次循环的等待时长,正在 sleep 中的循环不会被打断。
   *
   * @param interval 间隔毫秒数
   */
  function setRunInterval(interval: number) {
    runInterval.value = interval;
  }

  /**
   * 旧接口占位(已不推荐使用):直接传入字节数组加载程序。
   * 后端模式仅打印警告,提示改用 loadElf(filePath) 走文件路径协议。
   *
   * @param _program 指令字节数组(本实现未使用)
   */
  async function loadProgram(_program: number[]) {
    if (useBackend.value) {
      console.warn('ELF loading via WebSocket: use load command with file path');
    }
  }

  /**
   * 通过后端文件路径加载 ELF。
   * 设置 pendingLoad=true 防止用户连点 step,
   * 由 onmessage 收到 cycle 后清零该标志。
   *
   * @param filepath 后端可访问的 ELF 文件路径
   */
  async function loadElf(filepath: string) {
    if (useBackend.value) {
      pendingLoad.value = true;
      sendCommand('load', { path: filepath });
    }
  }

  /**
   * 通过 base64 编码直接传输 ELF 字节。
   * 同时置 pendingLoad 与 editorCodeLoaded,标记"编辑器代码已加载"。
   *
   * @param elfBase64 ELF 二进制的 base64 字符串
   */
  async function loadElfBinary(elfBase64: string) {
    if (useBackend.value) {
      pendingLoad.value = true;
      editorCodeLoaded.value = true;
      sendCommand('load_elf_binary', { elf_data: elfBase64 });
    }
  }

  /**
   * 加载教学测试(asm 源码形式的测试)。
   * 记录到 selectedTest 后,通知后端 'load_test' 命令。
   *
   * @param testName 测试名(对应后端注册的教学测试)
   */
  async function loadTeachingTest(testName: string) {
    selectedTest.value = testName;
    if (useBackend.value) {
      sendCommand('load_test', { testName });
    }
  }

  /**
   * 向后端请求某场景下的教学测试列表('list_tests')。
   * 后端通过 onmessage 的 'tests' 字段回传。
   *
   * @param scenarioId 场景 id(可选,缺省时列出全部)
   */
  async function fetchTeachingTests(scenarioId?: number) {
    if (useBackend.value) {
      // 把数字 id 映射为后端约定的 scenario 字符串
      const scenarioKey = scenarioId ? scenarioIdToKey[scenarioId] : '';
      ws?.send(JSON.stringify({ command: 'list_tests', scenario: scenarioKey }));
    }
  }

  /**
   * 向后端请求某场景下的 ELF 测试列表('list_elf_tests')。
   *
   * @param scenarioId 场景 id(可选,缺省时列出全部)
   */
  async function fetchElfTests(scenarioId?: number) {
    if (useBackend.value) {
      const scenarioKey = scenarioId ? scenarioIdToKey[scenarioId] : '';
      ws?.send(JSON.stringify({ command: 'list_elf_tests', scenario: scenarioKey }));
    }
  }

  /**
   * 直接覆写教学测试列表(供组件在本地静态数据时使用)。
   *
   * @param tests 教学测试数组
   */
  function setTeachingTests(tests: TeachingTest[]) {
    teachingTests.value = tests;
  }

  /**
   * 直接覆写 ELF 测试列表(供组件在本地静态数据时使用)。
   *
   * @param tests ELF 测试数组
   */
  function setElfTests(tests: TeachingTest[]) {
    elfTests.value = tests;
  }

  /**
   * 加载 ELF 测试程序。
   * 记录到 selectedTest 后,通知后端 'load_elf_test' 命令。
   *
   * @param testName ELF 测试名
   */
  async function loadElfTest(testName: string) {
    selectedTest.value = testName;
    if (useBackend.value) {
      sendCommand('load_elf_test', { testName });
    }
  }

  /**
   * 启用 difftest 对比模式。
   * 写入 difftestConfig(场景、信号列表),并通知后端 'enable_difftest' 命令。
   *
   * @param scenario 当前教学场景(用于 UI 显示)
   * @param signals  待对比的信号名列表(以空格拼接发送)
   */
  function enableDifftest(scenario: TeachingScenario, signals: string[]) {
    difftestConfig.value = {
      enabled: true,
      shadowMode: false,
      scenario,
      enabledSignals: signals
    };
    if (useBackend.value) {
      sendCommand('enable_difftest', {
        signals: signals.join(' ')
      });
    }
  }

  /**
   * 关闭 difftest 对比模式。
   * 复位 difftestConfig 至"自由模式",清空用户输入信号,
   * 并通知后端 'disable_difftest' 命令。
   */
  function disableDifftest() {
    difftestConfig.value = {
      enabled: false,
      shadowMode: false,
      scenario: { id: 0, name: '自由模式', description: '自定义所有信号', signals: [] },
      enabledSignals: []
    };
    // 清空用户手动给定的信号值映射
    userInputSignals.value.clear();
    if (useBackend.value) {
      sendCommand('disable_difftest', {});
    }
  }

  /**
   * difftest 教学场景下,由用户给指定信号设定一个布尔值。
   * 同时把信号值缓存到 userInputSignals,并通知后端 'set_user_signal'。
   *
   * @param signalName 信号名
   * @param value      设定值(数字会被转成布尔)
   */
  function setUserSignal(signalName: string, value: boolean | number) {
    userInputSignals.value.set(signalName, value);
    if (useBackend.value) {
      sendCommand('set_user_signal', {
        signalName,
        value: Boolean(value)
      });
    }
  }

  // ★ 中断与异常演示：触发软件中断（默认 bit 3 = MSIP）
  /**
   * 触发一个 mip 位(bits 0~12)对应类型的中断。
   * 默认 bit=3 即 MSIP(机器软件中断挂起位)。
   *
   * @param bit mip 中要置 1 的位(0~12)
   */
  function triggerInterrupt(bit: number = 3) {
    sendCommand('trigger_interrupt', { bit });
  }

  // ★ 中断源 → mip bit 的标准映射（RISC-V 规范）
  //   si → bit 3 (MSIP, Machine Software Interrupt Pending)
  //   ti → bit 7 (MTIP, Machine Timer Interrupt Pending)
  //   ei → bit 11 (MEIP, Machine External Interrupt Pending)
  /**
   * 中断源缩写 → mip bit 位的标准映射(按 RISC-V Privileged Spec):
   * - si → 3 (MSIP)
   * - ti → 7 (MTIP)
   * - ei → 11 (MEIP)
   */
  const INT_SRC_BITS = { si: 3, ti: 7, ei: 11 } as const;
  /** 中断源缩写类型(取自 INT_SRC_BITS 的键) */
  type IntSrc = keyof typeof INT_SRC_BITS;

  // ★ 新增：按源触发中断（推荐上层组件调用）
  /**
   * 按中断源缩写触发对应中断(si/ti/ei)——比直接传 bit 更易用。
   *
   * @param src 中断源缩写
   */
  function triggerInterruptSrc(src: IntSrc) {
    triggerInterrupt(INT_SRC_BITS[src]);
  }

  // ★ 中断源清空（兜底）：后端无 write_csr 命令，只能通过 reset 清 mip
  //   注意：reset 会清掉所有 CPU 状态，不仅是 mip
  /**
   * 兜底清空中断源。后端暂未提供 write_csr 命令,
   * 因此只能通过 reset() 全清 CPU 状态(包含 mip)。
   */
  function resetMip() {
    reset();
  }

  // ★ 中断与异常演示：把预置代码塞到编辑器
  /**
   * 把预置的 RISC-V 汇编代码塞入编辑器。
   * 供"中断/异常演示"页面点击示例后填入代码。
   *
   * @param code 汇编源码
   */
  function setEditorCode(code: string) {
    editorCode.value = code;
  }

  /**
   * 主动清空待输入信号提示(关闭弹窗 / 切换场景时调用)。
   */
  function clearPendingSignalInput() {
    pendingSignalInput.value = null;
  }

  /**
   * difftest 检测到差异后,选择"继续执行"——清空比对结果并补一帧 step。
   */
  function continueAfterDiff() {
    compareResult.value = null;
    if (useBackend.value) {
      sendCommand('step', {});
    }
  }

  /**
   * difftest 检测到差异后,选择"停止执行"——清空比对结果与用户输入信号。
   */
  function stopAfterDiff() {
    compareResult.value = null;
    userInputSignals.value.clear();
  }

  // ★ 波形视图相关方法
  /**
   * 设置中央视图('pipeline' / 'waveform')。
   *
   * @param view 视图枚举
   */
  function setCenterView(view: CenterView) {
    centerView.value = view;
  }
  /**
   * 切换中央视图:在 'pipeline' 与 'waveform' 之间往返。
   */
  function toggleCenterView() {
    centerView.value = centerView.value === 'pipeline' ? 'waveform' : 'pipeline';
  }
  /**
   * 清空波形历史队列(用户主动清除时使用)。
   */
  function clearHistory() {
    signalHistory.value = [];
  }
  /**
   * 切换录制开关(暂停后 appendHistorySnapshot 早返回)。
   */
  function toggleHistoryRecording() {
    historyRecording.value = !historyRecording.value;
  }
  /**
   * 切换某个信号 id 在波形面板中的选中/未选中状态。
   * 注意:Set 的变更不会被 ref 检测到,需整体替换才能触发响应式。
   *
   * @param id 信号 id
   */
  function toggleSignalSelected(id: string) {
    // 用新 Set 触发响应式更新(Set 的变更不会自动被 ref 检测到)
    const next = new Set(selectedSignalIds.value);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    selectedSignalIds.value = next;
  }
  /**
   * 全选当前所有信号到 selectedSignalIds。
   */
  function selectAllSignals() {
    if (!signals.value) return;
    const all = calculateAllSignals(signals.value);
    selectedSignalIds.value = new Set(all.map(s => s.id));
  }
  /**
   * 清空 selectedSignalIds(取消所有信号选中)。
   */
  function deselectAllSignals() {
    selectedSignalIds.value = new Set();
  }
  /**
   * 按流水线阶段(IF/ID、ID/EX 等)批量设置信号选中/未选中。
   *
   * @param stage    流水线阶段标签
   * @param selected true=全选该阶段所有信号;false=全部取消选中
   */
  function setSignalGroupSelected(stage: string, selected: boolean) {
    if (!signals.value) return;
    const all = calculateAllSignals(signals.value);
    const next = new Set(selectedSignalIds.value);
    for (const s of all) {
      if (s.stage !== stage) continue;
      if (selected) {
        next.add(s.id);
      } else {
        next.delete(s.id);
      }
    }
    selectedSignalIds.value = next;
  }
  /**
   * 切换"自动滚动到最新一拍"开关。
   *
   * @param v 是否启用
   */
  function setAutoFollowLatest(v: boolean) {
    autoFollowLatest.value = v;
  }

  connect();

  return {
    cpuState,
    registers,
    aluData,
    controlSignals,
    isRunning,
    selectedModal,
    activeModals,
    selectedPipelineRegister,
    signals,
    useBackend,
    cycle,
    pc,
    currentInstruction,
    activeDataFlows,
    activeControlSignals,
    allSignals: computed(() => signals.value ? calculateAllSignals(signals.value) : []),
    difftestConfig,
    pendingSignalInput,
    compareResult,
    haltedState,
    userInputSignals,
    teachingScenarios,
    teachingTests,
    elfTests,
    selectedTest,
    editorCodeLoaded,
    nextClock,
    start,
    pause,
    reset,
    openModal,
    closeModal,
    getModuleData,
    setUseBackend,
    setRunInterval,
    fetchFromBackend,
    loadProgram,
    loadElf,
    loadElfBinary,
    loadTeachingTest,
    loadElfTest,
    fetchTeachingTests,
    fetchElfTests,
    setTeachingTests,
    setElfTests,
    enableDifftest,
    disableDifftest,
    setUserSignal,
    clearPendingSignalInput,
    continueAfterDiff,
    stopAfterDiff,
    // ★ 中断与异常演示
    csrState,
    lastTrapType,
    lastInterruptSrc,
    editorCode,
    triggerInterrupt,
    triggerInterruptSrc,
    resetMip,
    setEditorCode,
    // ★ 波形视图
    centerView,
    signalHistory,
    historyRecording,
    selectedSignalIds,
    autoFollowLatest,
    MAX_HISTORY,
    setCenterView,
    toggleCenterView,
    clearHistory,
    toggleHistoryRecording,
    toggleSignalSelected,
    selectAllSignals,
    deselectAllSignals,
    setSignalGroupSelected,
    setAutoFollowLatest,
  };
});
