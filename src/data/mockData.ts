/**
 * 模拟数据
 *
 * 提供前端开发与测试用的默认 CPU 状态、寄存器、ALU 数据、控制信号等。
 * 当 WebSocket 未连接或后端未启动时，前端回退使用本文件的数据保证 UI 不空。
 */
import type { CPUState, RegisterData, ALUData, ControlSignalsData } from '../types';

/**
 * 默认 CPU 状态。
 *
 * 初始 cycle=0、PC 指向 0x7fffffff、所有数据流与控制信号列表都为空
 * （模板数据用注释占位，方便后续调试时按需启用）。
 */
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
    // 取指单元：当前 PC 与下一拍 PC
    fetchUnit: {
      pc: '0x7fffffff',
      nextPc: '0x80000000',
    },
    // 译码单元：原始指令字与 7 位操作码
    decodeUnit: {
      instruction: '0x00000000',
      opcode: '0',
    },
    // 执行单元：ALU 运算结果与 zero 标志
    executeUnit: {
      aluResult: '0x00000000000',
      zero: false,
    },
    // 访存单元：从数据内存读出的数据（load 指令时才有值）
    memoryUnit: {
      memReadData: null,
    },
    // 写回单元：最终写回寄存器堆的数据
    writeBackUnit: {
      writeData: '0x000000000000',
    },
  },
};

/**
 * 默认寄存器列表。
 *
 * 包含 32 个通用寄存器 x0～x31 与 CSR 寄存器（mstatus/mie/mip/mtvec/mepc/mcause），
 * 全部初始化为 0。CSR 寄存器用于中断与异常演示。
 */
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

/**
 * 默认 ALU 数据：两个操作数、运算类型、结果均为 0 / NONE。
 */
export const mockALUData: ALUData = {
  operand1: '0x0000000000000000',
  operand2: '0x0000000000000000',
  operation: 'NONE',
  result: '0x0000000000000000',
};

/**
 * 默认控制信号数据。
 *
 * inputs / outputs 列表中预置了多个示例项（已注释），可在调试时按需取消注释启用。
 */
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

/**
 * 生成随机 CPU 状态（用于本地演示与压力测试）。
 *
 * 随机从预定义的数据流 / 控制信号池中抽取若干条，PC 与指令也随机生成，
 * 模拟一个持续运行但每拍都不同的 CPU 状态。
 *
 * @returns 随机生成的 CPUState
 */
export const generateRandomCPUState = (): CPUState => {
  // 全部数据流 ID 池，覆盖了 instMEM / fetch / decode / regfile / EX/MEM / MEM/WB / WB 等所有通路
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

  // 全部控制信号 ID 池
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

  // 每拍随机 2~6 条数据流，2~5 条控制信号
  const numDataFlows = Math.floor(Math.random() * 5) + 2;
  const numControlSignals = Math.floor(Math.random() * 4) + 2;

  return {
    timestamp: Date.now(),
    // cycle 限制在 0~999 以方便观察
    cycle: Math.floor(Math.random() * 1000),
    // 随机 32 位 PC
    pc: `0x${Math.floor(Math.random() * 0xFFFFFFFF).toString(16).padStart(8, '0')}`,
    // 随机 32 位指令
    currentInstruction: `0x${Math.floor(Math.random() * 0xFFFFFFFF).toString(16).padStart(8, '0')}`,
    // 随机抽取若干数据流（sort+slice 简单洗牌）
    activeDataFlows: allDataFlows.sort(() => 0.5 - Math.random()).slice(0, numDataFlows).map(id => ({ id, value: '1' })),
    // 随机抽取若干控制信号
    activeControlSignals: allControlSignals.sort(() => 0.5 - Math.random()).slice(0, numControlSignals).map(id => ({ id, value: '1' })),
    modules: {
      // 取指单元：当前 PC + 随机下一拍 PC（粗略 +4）
      fetchUnit: {
        pc: `0x${Math.floor(Math.random() * 0xFFFFFFFF).toString(16).padStart(8, '0')}`,
        nextPc: `0x${(parseInt(`0x${Math.floor(Math.random() * 0xFFFFFFFF).toString(16).padStart(8, '0')}`, 16) + 4).toString(16).padStart(8, '0')}`,
      },
      // 译码单元：随机指令字与 7 位操作码
      decodeUnit: {
        instruction: `0x${Math.floor(Math.random() * 0xFFFFFFFF).toString(16).padStart(8, '0')}`,
        opcode: Math.floor(Math.random() * 128).toString(2).padStart(7, '0'),
      },
      // 执行单元：随机 ALU 结果 + 随机 zero
      executeUnit: {
        aluResult: `0x${Math.floor(Math.random() * 0xFFFFFFFF).toString(16).padStart(8, '0')}`,
        zero: Math.random() > 0.5,
      },
      // 访存单元：一半概率有读出数据
      memoryUnit: {
        memReadData: Math.random() > 0.5 ? `0x${Math.floor(Math.random() * 0xFFFFFFFF).toString(16).padStart(8, '0')}` : null,
      },
      // 写回单元：随机写回数据
      writeBackUnit: {
        writeData: `0x${Math.floor(Math.random() * 0xFFFFFFFF).toString(16).padStart(8, '0')}`,
      },
    },
  };
};
