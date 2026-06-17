// 模块类型定义
export interface ModuleData {
  name: string;
  label: string;
  type: 'pipeline' | 'stage' | 'auxiliary';
  data: Record<string, any>;
}

/**
 * 流水线主单元数据
 *
 * 继承自 ModuleData，data 字段包含 PC、指令、ALU 结果、内存读写等运行时信息。
 * 主要用于中央可视化区显示各流水线阶段的当前状态。
 */
export interface PipelineModuleData extends ModuleData {
  data: {
    pc?: string;
    instruction?: string;
    opcode?: string;
    aluResult?: string;
    zero?: boolean;
    memReadData?: string | null;
    writeData?: string;
    nextPc?: string;
    [key: string]: any;
  };
}

// 流水线信号
export interface PipelineSignals {
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
}

// 数据流定义
export interface DataFlow {
  id: string;
  name: string;
  source: string;
  target: string;
  type: 'data' | 'control';
  active?: boolean;
  value?: string;
}

// 控制信号定义
export interface ControlSignal {
  id: string;
  name: string;
  source: string;
  target: string;
  active?: boolean;
  value?: string;
}

/**
 * CPU 整体运行时状态
 *
 * 描述某一拍 CPU 的全局快照：周期、PC、当前指令、活跃的数据流 / 控制信号、
 * 以及五大流水线主单元的内部数据。是 UI 渲染的主数据源。
 */
export interface CPUState {
  timestamp: number;
  cycle: number;
  pc: string;
  currentInstruction: string;
  activeDataFlows: { id: string; value: string }[];
  activeControlSignals: { id: string; value: string }[];
  modules: {
    fetchUnit?: PipelineModuleData['data'];
    decodeUnit?: PipelineModuleData['data'];
    executeUnit?: PipelineModuleData['data'];
    memoryUnit?: PipelineModuleData['data'];
    writeBackUnit?: PipelineModuleData['data'];
    [key: string]: any;
  };
}

// 寄存器数据
export interface RegisterData {
  name: string;
  value: string;
}

// ALU数据
export interface ALUData {
  operand1: string;
  operand2: string;
  operation: string;
  result: string;
}

// 控制单元信号数据
export interface ControlSignalsData {
  inputs: ControlSignal[];
  outputs: ControlSignal[];
}

// 弹窗类型
export type ModalType = 'register' | 'alu' | 'control' | 'diffResult' | 'diffConfig' | 'halted' | 'pipelineRegister' | 'csr' | null;

/**
 * 流水线寄存器数据
 *
 * 描述某个流水线寄存器（IF/ID、ID/EX、EX/MEM、MEM/WB）的当前内容，
 * 用于 PipelineRegisterModal 弹窗展示。
 */
export interface PipelineRegisterData {
  valid: boolean;
  pc: string;
  inst?: number;
  instruction?: string;
  data?: Record<string, string | number | boolean>;
}

// 模块位置
export interface ModulePosition {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * 差分测试配置
 *
 * 描述差分测试（difftest）启用状态、影子模式、当前教学场景与启用的信号列表。
 */
export interface DifftestConfig {
  enabled: boolean;
  shadowMode: boolean;
  scenario: TeachingScenario;
  enabledSignals: string[];
}

// 教学场景
export interface TeachingScenario {
  id: number;
  name: string;
  description: string;
  signals: string[];
}

/**
 * 教学测试用例
 *
 * 描述后端注册的某个具体测试用例，关联到某个教学场景。
 */
export interface TeachingTest {
  name: string;
  displayName?: string;
  description: string;
  scenario: string;
}

// 教学测试用例配置（带场景分组）
export interface TeachingTestGroup {
  scenario: string;
  scenarioName: string;
  tests: TeachingTest[];
}

/**
 * 用户信号输入
 *
 * 在差分测试过程中，用户需要为某个信号提供预期值。
 * 用于 DifftestInputModal 弹窗提交。
 */
export interface UserSignalInput {
  signalName: string;
  value: boolean | number;
}

// 比较结果
export interface CompareResult {
  stage: 'EX' | 'WB';
  detected: boolean;
  goldenPC?: string;
  userPC?: string;
  goldenResult?: {
    regWrite: boolean;
    waddr: number;
    wdata: string;
  };
  userResult?: {
    regWrite: boolean;
    waddr: number;
    wdata: string;
  };
  message?: string;
}

// 后端响应类型
export type BackendResponseType =
  | 'need_signal_input'
  | 'diff_detected'
  | 'update'
  | 'ok';

export interface BackendResponse {
  type: BackendResponseType;
  signals?: any;
  registers?: any;
  message?: string;
  needInput?: {
    instruction: string;
    signalName: string;
    expectedValue?: string;
  };
  diffResult?: CompareResult;
}

/**
 * 中央视图模式
 *
 * 决定中央 pipeline-section 区域当前显示的是流水线图还是波形图。
 */
export type CenterView = 'pipeline' | 'waveform';

/**
 * 单拍波形快照
 *
 * 记录某一拍（cycle）下所有信号的瞬时值与活跃 ID 集合，
 * 用于波形面板的 FIFO 滑窗历史累加。
 */
export interface WaveformSnapshot {
  /** 时钟周期编号 */
  cycle: number;
  /** 快照创建时间戳（毫秒） */
  timestamp: number;
  // key = signal.id（来自 calculateAllSignals），value 为该 cycle 的显示值
  /** 该拍各信号 ID → 显示值的映射 */
  values: Record<string, string>;
  // 该 cycle 活跃的信号 id 集合（用于方波着色）
  /** 该拍活跃（值为非零 / 非空）的信号 ID 集合 */
  activeIds: Set<string>;
}
