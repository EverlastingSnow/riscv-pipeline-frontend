// 模拟数据 - 用于前端开发和测试
import type { CPUState, RegisterData, ALUData, ControlSignalsData } from '../types';

export const mockCPUState: CPUState = {
  timestamp: Date.now(),
  cycle: 0,
  pc: '0x7fffffff',
  currentInstruction: '0x00000000',
  activeDataFlows: [
    // { id: 'fetchUnit_inst', value: '1' },
    // { id: 'fetchUnit_PC', value: '0x40000000' },
    // { id: 'decodeStage_inst', value: '0x12345678' },
    // { id: 'ID_EX_info', value: '1' },
    // { id: 'EX_MEM_info', value: '1' },
    // { id: 'MEM_WB_info', value: '1' },
  ],
  activeControlSignals: [
    // { id: 'fetchUnit_allow_to_go', value: '1' },
    // { id: 'decodeStage_allow_to_go', value: '1' },
  ],
  modules: {
    fetchUnit: {
      pc: '0x7fffffff',
      nextPc: '0x80000000',
    },
    decodeUnit: {
      instruction: '0x00000000',
      opcode: '0',
    },
    executeUnit: {
      aluResult: '0x00000000000',
      zero: false,
    },
    memoryUnit: {
      memReadData: null,
    },
    writeBackUnit: {
      writeData: '0x000000000000',
    },
  },
};

export const mockRegisters: RegisterData[] = [
  { name: 'x0', value: '0x00000000' },
  { name: 'x1', value: '0x00000000' },
  { name: 'x2', value: '0x00000000' },
  { name: 'x3', value: '0x00000000' },
  { name: 'x4', value: '0x00000000' },
  { name: 'x5', value: '0x00000000' },
  { name: 'x6', value: '0x00000000' },
  { name: 'x7', value: '0x00000000' },
  { name: 'x8', value: '0x00000000' },
  { name: 'x9', value: '0x00000000' },
  { name: 'x10', value: '0x00000000' },
  { name: 'x11', value: '0x00000000' },
  { name: 'x12', value: '0x00000000' },
  { name: 'x13', value: '0x00000000' },
  { name: 'x14', value: '0x00000000' },
  { name: 'x15', value: '0x00000000' },
  { name: 'x16', value: '0x00000000' },
  { name: 'x17', value: '0x00000000' },
  { name: 'x18', value: '0x00000000' },
  { name: 'x19', value: '0x00000000' },
  { name: 'x20', value: '0x00000000' },
  { name: 'x21', value: '0x00000000' },
  { name: 'x22', value: '0x00000000' },
  { name: 'x23', value: '0x00000000' },
  { name: 'x24', value: '0x00000000' },
  { name: 'x25', value: '0x00000000' },
  { name: 'x26', value: '0x00000000' },
  { name: 'x27', value: '0x00000000' },
  { name: 'x28', value: '0x00000000' },
  { name: 'x29', value: '0x00000000' },
  { name: 'x30', value: '0x00000000' },
  { name: 'x31', value: '0x00000000' },
  { name: 'mstatus', value: '0x00000000' },
  { name: 'mie', value: '0x00000000' },
  { name: 'mip', value: '0x00000000' },
  { name: 'mtvec', value: '0x00000000' },
  { name: 'mepc', value: '0x00000000' },
  { name: 'mcause', value: '0x00000000' },
];

export const mockALUData: ALUData = {
  operand1: '0x0000000000000000',
  operand2: '0x0000000000000000',
  operation: 'NONE',
  result: '0x0000000000000000',
};

export const mockControlSignals: ControlSignalsData = {
  inputs: [
    // { id: 'flush-fetch', name: 'flushFetch', source: 'Execute Unit', target: 'Ctrl', active: false },
    // { id: 'flush-decode', name: 'flushDecode', source: 'Execute Unit', target: 'Ctrl', active: false },
    // { id: 'flush-execute', name: 'flushExecute', source: 'Execute Unit', target: 'Ctrl', active: false },
    // { id: 'exe-conflict', name: 'exeConflict', source: 'Execute Unit', target: 'Ctrl', active: false },
    // { id: 'info-op', name: 'infoOp', source: 'Decode Unit', target: 'Ctrl', active: true },
    // { id: 'info-valid', name: 'infoValid', source: 'Decode Unit', target: 'Ctrl', active: true },
    // { id: 'info-reg-waddr', name: 'infoRegWaddr', source: 'Decode Unit', target: 'Ctrl', active: true },
    // { id: 'info-src1-en', name: 'infoSrc1En', source: 'Decode Unit', target: 'Ctrl', active: true },
    // { id: 'info-src1-raddr', name: 'infoSrc1Raddr', source: 'Decode Unit', target: 'Ctrl', active: true },
    // { id: 'info-src2-en', name: 'infoSrc2En', source: 'Decode Unit', target: 'Ctrl', active: true },
    // { id: 'info-src2-raddr', name: 'infoSrc2Raddr', source: 'Decode Unit', target: 'Ctrl', active: true },
  ],
  outputs: [
    // { id: 'fetch-allow', name: 'fetchAllow', source: 'Ctrl', target: 'Fetch Unit', active: true },
    // { id: 'decode-allow', name: 'decodeAllow', source: 'Ctrl', target: 'Decode Unit', active: true },
    // { id: 'execute-allow', name: 'executeAllow', source: 'Ctrl', target: 'Execute Unit', active: false },
    // { id: 'memory-allow', name: 'memoryAllow', source: 'Ctrl', target: 'Memory Unit', active: false },
    // { id: 'fetch-slow', name: 'fetchSlow', source: 'Ctrl', target: 'Fetch Unit', active: false },
    // { id: 'fetch-flush', name: 'fetchFlush', source: 'Ctrl', target: 'Fetch Unit', active: false },
    // { id: 'decode-flush', name: 'decodeFlush', source: 'Ctrl', target: 'Decode Unit', active: false },
    // { id: 'execute-flush', name: 'executeFlush', source: 'Ctrl', target: 'Execute Unit', active: false },
    // { id: 'memory-flush', name: 'memoryFlush', source: 'Ctrl', target: 'Memory Unit', active: false },
  ],
};

// 生成随机CPU状态（用于演示）
export const generateRandomCPUState = (): CPUState => {
  const allDataFlows = [
    // instMEM 相关
    'instMEM_en',
    'instMEM_addr',
    'instMEM_inst',
    // 取指到IF/ID
    'fetchUnit_PC',
    'fetchUnit_inst',
    'fetchUnit_valid',
    // IF/ID到译码
    'decodeStage_PC',
    'decodeStage_inst',
    'decodeStage_valid',
    // decoderUnit到Reg File
    'src1_raddr',
    'src2_raddr',
    'src1_rdata',
    'src2_rdata',
    // ID/EX
    'ID_EX_info',
    'EX_info',
    'Forward_info',
    'interrupt',
    // EX到DataMem
    'DataMem_wen',
    'DataMem_addr',
    'DataMem_rdata',
    'DataMem_wdata',
    // EX/MEM
    'EX_MEM_info',
    'MEM_info',
    // MEM/WB
    'MEM_WB_info',
    'WB_info',
    // WB到Reg File
    'wb_en',
    'wb_raddr',
    'wb_rdata',
    // unit到ctrl
    'decodeInfo',
    'executeInfo',
    'memoryInfo',
    'writeBackInfo',
  ];
  
  const allControlSignals = [
    'fetchUnit_allow_to_go',
    'decodeStage_allow_to_fetch',
    'fetchUnit_do_flush',
    'decodeStage_allow_to_go',
    'decodeUnit_do_flush',
    'executeStage_allow_to_go',
    'executeUnit_do_flush',
    'memoryStage_allow_to_go',
    'memoryUnit_do_flush',
  ];
  
  const numDataFlows = Math.floor(Math.random() * 5) + 2;
  const numControlSignals = Math.floor(Math.random() * 4) + 2;

  return {
    timestamp: Date.now(),
    cycle: Math.floor(Math.random() * 1000),
    pc: `0x${Math.floor(Math.random() * 0xFFFFFFFF).toString(16).padStart(8, '0')}`,
    currentInstruction: `0x${Math.floor(Math.random() * 0xFFFFFFFF).toString(16).padStart(8, '0')}`,
    activeDataFlows: allDataFlows.sort(() => 0.5 - Math.random()).slice(0, numDataFlows).map(id => ({ id, value: '1' })),
    activeControlSignals: allControlSignals.sort(() => 0.5 - Math.random()).slice(0, numControlSignals).map(id => ({ id, value: '1' })),
    modules: {
      fetchUnit: {
        pc: `0x${Math.floor(Math.random() * 0xFFFFFFFF).toString(16).padStart(8, '0')}`,
        nextPc: `0x${(parseInt(`0x${Math.floor(Math.random() * 0xFFFFFFFF).toString(16).padStart(8, '0')}`, 16) + 4).toString(16).padStart(8, '0')}`,
      },
      decodeUnit: {
        instruction: `0x${Math.floor(Math.random() * 0xFFFFFFFF).toString(16).padStart(8, '0')}`,
        opcode: Math.floor(Math.random() * 128).toString(2).padStart(7, '0'),
      },
      executeUnit: {
        aluResult: `0x${Math.floor(Math.random() * 0xFFFFFFFF).toString(16).padStart(8, '0')}`,
        zero: Math.random() > 0.5,
      },
      memoryUnit: {
        memReadData: Math.random() > 0.5 ? `0x${Math.floor(Math.random() * 0xFFFFFFFF).toString(16).padStart(8, '0')}` : null,
      },
      writeBackUnit: {
        writeData: `0x${Math.floor(Math.random() * 0xFFFFFFFF).toString(16).padStart(8, '0')}`,
      },
    },
  };
};
