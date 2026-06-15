// 模块类型定义
export interface ModuleData {
  name: string;
  label: string;
  type: 'pipeline' | 'stage' | 'auxiliary';
  data: Record<string, any>;
}

// 流水线模块数据
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

// CPU状态
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

// 流水线寄存器信息
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

// 差分测试配置
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

// 教学测试用例
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

// 用户信号输入
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
