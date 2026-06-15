import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { CPUState, RegisterData, ALUData, ControlSignalsData, ModalType, DifftestConfig, TeachingScenario, CompareResult, TeachingTest, CenterView, WaveformSnapshot } from '../types';
import { mockCPUState, mockRegisters, mockALUData, mockControlSignals } from '../data/mockData';

const MAX_HISTORY = 256;

function safeJsonParse(raw: string): any {
  const processed = raw.replace(/:\s*(-?\d{16,})/g, (_match, numStr) => {
    return ': "' + numStr + '"';
  });
  return JSON.parse(processed);
}

const WS_URL = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`;

interface PipelineSignals {
  cycle?: number;
  pc?: string;
  if_id: any;
  id_ex: any;
  execute: any;
  ex_mem: any;
  mem_wb: any;
  writeback: any;
  regfile: any;
  datamem: any;
  exc_ctrl: any;
  forward: any;
  // ★ 中断与异常教学演示新增字段
  csr?: {
    mtvec: string;
    mepc: string;
    mcause: string;
    mtval: string;
    mstatus: string;
    mie: string;
    mip: string;
  };
  trap_taken?: boolean;
  interrupt_taken?: boolean;
}

export const usePipelineStore = defineStore('pipeline', () => {
  const cpuState = ref<CPUState>(mockCPUState);
  const registers = ref<RegisterData[]>(mockRegisters);
  const aluData = ref<ALUData>(mockALUData);
  const controlSignals = ref<ControlSignalsData>(mockControlSignals);
  const isRunning = ref(false);
  const selectedModal = ref<ModalType | null>(null);
const activeModals = ref<string[]>([]);
const signals = ref<PipelineSignals | null>(null);
  const useBackend = ref(true);
  const runInterval = ref(1000);
  const isUpdating = ref(false);
  const pendingLoad = ref(false);
  const editorCodeLoaded = ref(false);

  const difftestConfig = ref<DifftestConfig>({
    enabled: false,
    shadowMode: false,
    scenario: { id: 0, name: '自由模式', description: '自定义所有信号', signals: [] },
    enabledSignals: []
  });

  const pendingSignalInput = ref<{ signalName?: string; signals?: Array<{ name: string; expectedValue: string }>; expectedValue?: string; instruction?: string; pc?: string } | null>(null);
  const compareResult = ref<CompareResult | null>(null);
  const haltedState = ref<{ reason: string; pc: string } | null>(null);
  const userInputSignals = ref<Map<string, boolean | number>>(new Map());
  const selectedPipelineRegister = ref<{ id: string; data: any } | null>(null);
  const prev_if_id_valid = ref(false);
  const prev_id_ex_valid = ref(false);
  const prev_ex_mem_valid = ref(false);
  const prev_mem_wb_valid = ref(false);

  // ★ 中断与异常演示：CSR 状态、Trap 类型、编辑器代码
  // 给予全 0 字符串默认值，组件里可直接 csrState.value.mip 访问而不必判空
  const csrState = ref<NonNullable<PipelineSignals['csr']>>({
    mtvec: '0x0',
    mepc: '0x0',
    mcause: '0x0',
    mtval: '0x0',
    mstatus: '0x0',
    mie: '0x0',
    mip: '0x0',
  });
  const lastTrapType = ref<'none' | 'interrupt' | 'exception'>('none');
  // ★ 中断源滞回字段：trap 发生后锁定为 si/ti/ei，reset 或下个 trap 才更新
  const lastInterruptSrc = ref<'si' | 'ti' | 'ei' | null>(null);
  const editorCode = ref<string>('');

  // ★ 波形视图相关状态（centerView 决定中央 pipeline-section 渲染 PipelineEditor 还是 WaveformPanel）
  const centerView = ref<CenterView>('pipeline');
  // FIFO 滑窗历史快照，到达 MAX_HISTORY 时丢弃最早的记录
  const signalHistory = ref<WaveformSnapshot[]>([]);
  // 录制开关（默认开）
  const historyRecording = ref(true);
  // 用户在波形区域内勾选要展示的信号 id 集合
  const selectedSignalIds = ref<Set<string>>(new Set());
  // "跳转最新"自动跟随开关
  const autoFollowLatest = ref(true);

  const teachingScenarios: TeachingScenario[] = [
    { id: 1, name: '场景1: 寄存器写', description: '学习 RegWrite 信号', signals: ['RegWrite'] },
    { id: 2, name: '场景2: 操作数选择', description: '学习 RegWrite + ALUSrc', signals: ['RegWrite', 'ALUSrc'] },
    { id: 3, name: '场景3: 内存访问', description: '学习 RegWrite + ALUSrc + MemRead + MemWrite', signals: ['RegWrite', 'ALUSrc', 'MemRead', 'MemWrite'] },
    { id: 4, name: '场景4: 分支控制', description: '学习 RegWrite + ALUSrc + MemRead + MemWrite + Branch', signals: ['RegWrite', 'ALUSrc', 'MemRead', 'MemWrite', 'Branch'] },
    { id: 0, name: '自由模式', description: '自定义所有信号', signals: [] },
  ];

  const teachingTests = ref<TeachingTest[]>([]);
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
  const selectedTest = ref<string>('');

  const scenarioIdToKey: Record<number, string> = {
    1: 'scenario1',
    2: 'scenario2',
    3: 'scenario3',
    4: 'scenario4',
  };

  let ws: WebSocket | null = null;
  let reconnectTimer: number | null = null;

  const cycle = computed(() => cpuState.value.cycle);
  const pc = computed(() => cpuState.value.pc);
  const currentInstruction = computed(() => cpuState.value.currentInstruction);
  const activeDataFlows = computed(() => cpuState.value.activeDataFlows);
  const activeControlSignals = computed(() => cpuState.value.activeControlSignals);

  function connect() {
    if (ws?.readyState === WebSocket.OPEN) return;

    ws = new WebSocket(WS_URL);

    ws.onopen = () => {
      console.log('WebSocket connected');
      fetchFromBackend();
    };

    ws.onmessage = (event) => {
      try {
        const data = safeJsonParse(event.data);
        // console.log('Backend data received:', JSON.stringify(data, null, 2));

        if (data.type === 'need_signal_input') {
          pendingSignalInput.value = data.needInput || null;
          isRunning.value = false;
          return;
        }

        if (data.type === 'diff_detected') {
          compareResult.value = data.diffResult || null;
          isRunning.value = false;
          fetchRegisters();
          selectedModal.value = 'diffResult';
          return;
        }

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
      if (useBackend.value) {
        reconnectTimer = window.setTimeout(connect, 3000);
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
  }

  function updateStateFromSignals(sigs: any) {
    signals.value = sigs;

    // ★ 中断与异常演示：解析 CSR 状态与 trap 类型
    if (sigs.csr) {
      csrState.value = sigs.csr;
    }
    if (sigs.interrupt_taken) {
      lastTrapType.value = 'interrupt';
      // ★ 滞回：interrupt_taken 那个 cycle 锁定源（基于后端推回的 mcause）
      try {
        const cause = Number(BigInt(sigs.csr?.mcause ?? '0x0') & 0xFn);
        if (cause === 3) lastInterruptSrc.value = 'si';
        else if (cause === 7) lastInterruptSrc.value = 'ti';
        else if (cause === 11) lastInterruptSrc.value = 'ei';
      } catch {
        /* 保留旧值 */
      }
    } else if (sigs.trap_taken) {
      lastTrapType.value = 'exception';
    } else {
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
    setTimeout(() => {
      cpuState.value = {
        ...mockCPUState,
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
            opcode: sigs.id_ex?.inst ? (Number(sigs.id_ex.inst) & 0x7F).toString(2).padStart(7, '0') : '0000000',
          },
          executeUnit: {
            aluResult: sigs.execute?.alu_result || '0x0',
            zero: sigs.execute?.alu_result === 0,
          },
          memoryUnit: {
            memReadData: sigs.ex_mem?.mem_ren ? sigs.datamem?.DataMEM_rdata || null : null,
          },
          writeBackUnit: {
            writeData: sigs.writeback?.debug_wb_rf_wdata || '0x0',
          },
        }
      };
      prev_mem_wb_valid.value = prev_ex_mem_valid.value;
      prev_ex_mem_valid.value = prev_id_ex_valid.value;
      prev_id_ex_valid.value = prev_if_id_valid.value;
      prev_if_id_valid.value = sigs.if_id?.valid;
      isUpdating.value = false;
    }, 200);

    if (sigs.regfile) {
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
      const parseHexValue = (val: any): string => {
        if (val === undefined || val === null) return '0x0';
        const strVal = String(val);
        if (strVal.startsWith('0x') || strVal.startsWith('0X')) {
          return strVal.toUpperCase();
        }
        if (/^-?\d{16,}$/.test(strVal)) {
          try {
            return '0x' + BigInt(strVal).toString(16).toUpperCase().padStart(1, '0');
          } catch { return '0x0'; }
        }
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
      // 覆盖队尾（防止重复步进写入两次）
      list[list.length - 1] = snap;
    } else {
      if (list.length >= MAX_HISTORY) {
        list.shift();
      }
      list.push(snap);
    }
  }

  function calculateActiveDataFlows(sigs: any): { id: string, value: string }[] {
    const activeFlows: { id: string, value: string }[] = [];

    const parseHex = (val: any): string => {
      if (!val) return '0x0';
      if (typeof val === 'string') return val.startsWith('0x') ? val.toUpperCase() : '0x' + Number(val).toString(16).toUpperCase();
      return '0x' + Number(val).toString(16).toUpperCase();
    };

    // 解析 ID/EX 当前指令（EX 阶段正在执行时：id_ex.valid 且 prev_id_ex_valid）
    const idExInst = Number(sigs.id_ex?.inst) || 0;
    const exuInstrKind = (idExInst !== 0) ? decodeInstruction(idExInst) : 'NOP';
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
    // 仅当上一周期IF/ID有效时才亮（表示数据正在传递到Decode Unit）
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

    // ★ CSR 指令：EX 阶段 Execute Unit 读 CSR（旧值，作为 wb_value 回写寄存器），
    //            同时写 CSR（addr / wdata / wen）
    if (prev_id_ex_valid.value && isExuCsr) {
      // id_ex.imm 是 hex 字符串（如 "0x305"），需要先 parseInt 解析
      const immRaw = sigs.id_ex?.imm;
      const csrAddr = immRaw ? (parseInt(String(immRaw), 16) & 0xFFF) : 0;
      activeFlows.push({ id: 'csr_read',  value: '0x' + Number(sigs.ex_mem?.alu_result || 0).toString(16).toUpperCase() });
      activeFlows.push({ id: 'csr_addr',  value: '0x' + csrAddr.toString(16).toUpperCase().padStart(3, '0') });
      activeFlows.push({ id: 'csr_wdata', value: parseHex(sigs.id_ex?.src1_rdata) });
      activeFlows.push({ id: 'csr_wen',   value: '1' });
    }

    // ★ MRET：EX 阶段读 mepc 作为跳转目标，PC ← mepc（最终由 IF 阶段 PC 寄存器接收）
    if (prev_id_ex_valid.value && isExuMret) {
      activeFlows.push({ id: 'mepc_to_pc', value: sigs.csr?.mepc || '0x0' });
    }

    // ★ Trap entry（IF 阶段 trap_taken / interrupt_taken）：读 mtvec 作为跳转目标
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

    // 刷新信号（branch_taken + trap/interrupt 都会 flush IF/ID、ID/EX）
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

    // ★ 中断与异常演示：trap 跳转路径高亮
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

  type SignalType = 'data' | 'addr' | 'control';

  interface SignalItem {
    id: string;
    label: string;
    value: string;
    type: SignalType;
    stage: string;
    active: boolean;
  }

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

  function decodeInstruction(inst: number): string {
    if (!inst) return 'NOP';
    
    const opcode = inst & 0x7F;
    const funct3 = (inst >> 12) & 0x7;
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
      if (inst === 0x00000073) return 'ECALL';
      if (inst === 0x00100073) return 'EBREAK';
      if (inst === 0x30200073) return 'MRET';
      if (inst === 0x10500073) return 'WFI';
      // funct3 区分 CSR 读写族
      if (funct3 === 1) return 'CSRRW';
      if (funct3 === 2) return 'CSRRS';
      if (funct3 === 3) return 'CSRRC';
      if (funct3 === 5) return 'CSRRWI';
      if (funct3 === 6) return 'CSRRSI';
      if (funct3 === 7) return 'CSRRCI';
    }

    return baseName;
  }

  async function fetchRegisters() {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ command: 'get_registers' }));
    }
  }

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

  async function fetchFromBackend() {
    if (!useBackend.value) return;
    sendCommand('get_signals');
  }

  async function nextClock() {
    if (pendingLoad.value) {
      return;
    }
    if (haltedState.value !== null) {
      return;
    }
    if (difftestConfig.value.enabled && pendingSignalInput.value) {
      return;
    }

    if (useBackend.value) {
      sendCommand('step');
    } else {
      cpuState.value = {
        ...mockCPUState,
        cycle: cpuState.value.cycle + 1,
        pc: '0x' + (parseInt(cpuState.value.pc) + 4).toString(16).toUpperCase()
      };
    }
  }

  async function start() {
    if (!useBackend.value) {
      isRunning.value = true;
      const run = async () => {
        if (isRunning.value) {
          await nextClock();
          setTimeout(run, runInterval.value);
        }
      };
      run();
      return;
    }
    
    isRunning.value = true;
    
    // 使用循环step而不是后端run，以便控制间隔
    const run = async () => {
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
        await new Promise(resolve => setTimeout(resolve, runInterval.value));
      }
    };
    run();
  }

  function pause() {
    isRunning.value = false;
    if (useBackend.value) {
      sendCommand('stop');
    }
  }

  async function reset() {
    isRunning.value = false;
    // ★ 中断源滞回字段清空（重置 CPU 时同步）
    lastInterruptSrc.value = null;
    prev_if_id_valid.value = false;
    prev_id_ex_valid.value = false;
    prev_ex_mem_valid.value = false;
    prev_mem_wb_valid.value = false;
    pendingSignalInput.value = null;
    pendingLoad.value = false;
    compareResult.value = null;
    haltedState.value = null;
    userInputSignals.value.clear();
    // ★ 波形历史随 CPU 重置同步清空
    signalHistory.value = [];
    if (useBackend.value) {
      sendCommand('reset');
    } else {
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

  function openModal(type: ModalType, registerId?: string) {
    let modalKey: string;
    if (type === 'pipelineRegister' && registerId) {
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
    selectedModal.value = type;
  }

  function closeModal(modalKey?: string) {
    if (modalKey) {
      activeModals.value = activeModals.value.filter(m => m !== modalKey);
      if (activeModals.value.length > 0) {
        const lastModal = activeModals.value[activeModals.value.length - 1];
        selectedModal.value = lastModal as ModalType;
      } else {
        selectedModal.value = null;
      }
    } else {
      activeModals.value = [];
      selectedModal.value = null;
      selectedPipelineRegister.value = null;
      pendingSignalInput.value = null;
      haltedState.value = null;
      if (useBackend.value && difftestConfig.value.enabled) {
        sendCommand('skip_signal_input');
      }
    }
  }

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

  function setRunInterval(interval: number) {
    runInterval.value = interval;
  }

  async function loadProgram(_program: number[]) {
    if (useBackend.value) {
      console.warn('ELF loading via WebSocket: use load command with file path');
    }
  }

  async function loadElf(filepath: string) {
    if (useBackend.value) {
      pendingLoad.value = true;
      sendCommand('load', { path: filepath });
    }
  }

  async function loadElfBinary(elfBase64: string) {
    if (useBackend.value) {
      pendingLoad.value = true;
      editorCodeLoaded.value = true;
      sendCommand('load_elf_binary', { elf_data: elfBase64 });
    }
  }

  async function loadTeachingTest(testName: string) {
    selectedTest.value = testName;
    if (useBackend.value) {
      sendCommand('load_test', { testName });
    }
  }

  async function fetchTeachingTests(scenarioId?: number) {
    if (useBackend.value) {
      const scenarioKey = scenarioId ? scenarioIdToKey[scenarioId] : '';
      ws?.send(JSON.stringify({ command: 'list_tests', scenario: scenarioKey }));
    }
  }

  async function fetchElfTests(scenarioId?: number) {
    if (useBackend.value) {
      const scenarioKey = scenarioId ? scenarioIdToKey[scenarioId] : '';
      ws?.send(JSON.stringify({ command: 'list_elf_tests', scenario: scenarioKey }));
    }
  }

  function setTeachingTests(tests: TeachingTest[]) {
    teachingTests.value = tests;
  }

  function setElfTests(tests: TeachingTest[]) {
    elfTests.value = tests;
  }

  async function loadElfTest(testName: string) {
    selectedTest.value = testName;
    if (useBackend.value) {
      sendCommand('load_elf_test', { testName });
    }
  }

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

  function disableDifftest() {
    difftestConfig.value = {
      enabled: false,
      shadowMode: false,
      scenario: { id: 0, name: '自由模式', description: '自定义所有信号', signals: [] },
      enabledSignals: []
    };
    userInputSignals.value.clear();
    if (useBackend.value) {
      sendCommand('disable_difftest', {});
    }
  }

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
  function triggerInterrupt(bit: number = 3) {
    sendCommand('trigger_interrupt', { bit });
  }

  // ★ 中断源 → mip bit 的标准映射（RISC-V 规范）
  //   si → bit 3 (MSIP, Machine Software Interrupt Pending)
  //   ti → bit 7 (MTIP, Machine Timer Interrupt Pending)
  //   ei → bit 11 (MEIP, Machine External Interrupt Pending)
  const INT_SRC_BITS = { si: 3, ti: 7, ei: 11 } as const;
  type IntSrc = keyof typeof INT_SRC_BITS;

  // ★ 新增：按源触发中断（推荐上层组件调用）
  function triggerInterruptSrc(src: IntSrc) {
    triggerInterrupt(INT_SRC_BITS[src]);
  }

  // ★ 中断源清空（兜底）：后端无 write_csr 命令，只能通过 reset 清 mip
  //   注意：reset 会清掉所有 CPU 状态，不仅是 mip
  function resetMip() {
    reset();
  }

  // ★ 中断与异常演示：把预置代码塞到编辑器
  function setEditorCode(code: string) {
    editorCode.value = code;
  }

  function clearPendingSignalInput() {
    pendingSignalInput.value = null;
  }

  function continueAfterDiff() {
    compareResult.value = null;
    if (useBackend.value) {
      sendCommand('step', {});
    }
  }

  function stopAfterDiff() {
    compareResult.value = null;
    userInputSignals.value.clear();
  }

  // ★ 波形视图相关方法
  function setCenterView(view: CenterView) {
    centerView.value = view;
  }
  function toggleCenterView() {
    centerView.value = centerView.value === 'pipeline' ? 'waveform' : 'pipeline';
  }
  function clearHistory() {
    signalHistory.value = [];
  }
  function toggleHistoryRecording() {
    historyRecording.value = !historyRecording.value;
  }
  function toggleSignalSelected(id: string) {
    // 用新 Set 触发响应式更新（Set 的变更不会自动被 ref 检测到）
    const next = new Set(selectedSignalIds.value);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    selectedSignalIds.value = next;
  }
  function selectAllSignals() {
    if (!signals.value) return;
    const all = calculateAllSignals(signals.value);
    selectedSignalIds.value = new Set(all.map(s => s.id));
  }
  function deselectAllSignals() {
    selectedSignalIds.value = new Set();
  }
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
