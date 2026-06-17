<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { usePipelineStore } from '../stores/pipeline';
import { 
  Cpu, 
  Database, 
  HardDrive, 
  Settings,
  Eye
} from 'lucide-vue-next';

const pipelineStore = usePipelineStore();

/** 画布的平移与缩放状态。`x/y` 为平移像素，`k` 为缩放系数（1 = 原始大小）。 */
const transform = ref({ x: 0, y: 0, k: 1 });
/** 是否正处于拖拽画布状态。仅当位移超过阈值后才会被置为 true。 */
const isDragging = ref(false);
// 只有 mousedown 真正发生在本容器上时才会被 arm。
// 这样 window 上的 mousemove 不会因为用户点击了左右侧面板里的文本而误判为拖拽。
/** 拖拽 arm 标志：仅当 mousedown 命中本容器时为 true，避免在左右侧面板选中文本时误判为拖拽。 */
const dragArmed = ref(false);
// 鼠标按下时记录起点 & 当前 transform；只有位移超过阈值才真正进入拖拽，
// 这样点击（不移动）不会触发拖拽，信号 hover 才能正常显示 tooltip。
/** mousedown 时记录的鼠标起点（clientX/clientY），用于计算位移。 */
const dragOrigin = ref({ x: 0, y: 0 });
/** mousedown 时记录的 transform 快照，拖拽过程基于此做相对位移。 */
const transformAtDragStart = ref({ x: 0, y: 0 });
/** 容器 DOM 引用，用于挂载 wheel 监听以及获取容器尺寸。 */
const containerRef = ref<HTMLElement | null>(null);

/** tooltip 是否可见。仅在 hover 命中带有数据流值的连接时显示。 */
const tooltipVisible = ref(false);
/** tooltip 显示的文本内容（通常为数据流的当前值）。 */
const tooltipText = ref('');
/** tooltip 屏幕坐标 X（clientX），用于 fixed 定位。 */
const tooltipX = ref(0);
/** tooltip 屏幕坐标 Y（clientY），用于 fixed 定位。 */
const tooltipY = ref(0);

/** 流水线寄存器（IF/ID、ID/EX、EX/MEM、MEM/WB）矩形的统一宽度（像素）。 */
const STAGE_WIDTH = 55;
/** 流水线寄存器矩形的高度（像素）。 */
const STAGE_HEIGHT = 210;
/** Control Unit 控制器的宽度（像素），与 csr 宽度保持一致以便连线对齐。 */
const CTRL_WIDTH = 1120;
/** Control Unit 控制器的高度（像素）。 */
const CTRL_HEIGHT = 50;
/** 流水线寄存器矩形的纵向 Y 坐标（与各主模块的中部对齐）。 */
const STAGE_Y = 135;
/** 流水线寄存器矩形纵向中点 Y 的快捷常量，等价于 STAGE_HEIGHT / 2。 */
const STAGE_MID = STAGE_HEIGHT / 2;

/** 鼠标按下与拖拽开始之间的最小位移阈值（像素），用于区分点击与拖拽。 */
const DRAG_THRESHOLD = 4; // px

/**
 * 描述 SVG 画布上任意一个模块（主模块、流水线寄存器或辅助模块）的渲染数据。
 * @property {string} id 唯一标识，用于连线 source/target 路由。
 * @property {string} name 显示名称。
 * @property {any} [icon] 可选的 lucide-vue-next 图标组件。
 * @property {number} x 模块左上角 X 坐标。
 * @property {number} y 模块左上角 Y 坐标。
 * @property {number} width 矩形宽度。
 * @property {number} height 矩形高度。
 * @property {boolean} [editable] 是否允许拖拽编辑（流水线寄存器固定为 false）。
 */
interface ModuleData {
  id: string;
  name: string;
  icon?: any;
  x: number;
  y: number;
  width: number;
  height: number;
  editable?: boolean;
}

/**
 * 描述两个模块之间的一条连线。
 * @property {string} id 唯一标识，匹配后端 activeDataFlows / activeControlSignals。
 * @property {string} source 源模块 id。
 * @property {string} target 目标模块 id。
 * @property {'data' | 'control' | 'address'} type 连线类型：数据 / 控制 / 地址。
 * @property {string} label 显示在连线中部的文本（如 `PC`、`src1_raddr`）。
 * @property {{x: number, y: number}} sourceOffset 起点相对源模块左上角的偏移。
 * @property {{x: number, y: number}} targetOffset 终点相对目标模块左上角的偏移。
 * @property {'top' | 'right' | 'bottom' | 'left'} [arrowDirection] 箭头朝向。
 * @property {{x: number, y: number}} [wordOffset] label 相对中点的额外偏移。
 * @property {number} [bendOffset] 折线拐点的水平微调。
 * @property {boolean} [editable] 是否允许编辑。
 * @property {'auto' | 'down-left' | 'right-up'} [pathStyle] 路径风格：
 *   - `auto`（默认）：起点→中点→中点→终点，水平折线
 *   - `down-left`：先向下到底再向左（适合写回链路）
 *   - `right-up`：先向右再向上（适合数据回传）
 */
interface ConnectionData {
  id: string;
  source: string;
  target: string;
  type: 'data' | 'control' | 'address';
  label: string;
  sourceOffset: { x: number; y: number };
  targetOffset: { x: number; y: number };
  arrowDirection?: 'top' | 'right' | 'bottom' | 'left';
  wordOffset?: { x: number; y: number };
  bendOffset?: number;
  editable?: boolean;
  pathStyle?: 'auto' | 'down-left' | 'right-up';
}

const initialModules: ModuleData[] = [
  { id: 'fetchUnit', name: 'Fetch Unit', icon: Cpu, x: 150, y: 180, width: 120, height: 120 },
  { id: 'decodeUnit', name: 'Decode Unit', icon: Eye, x: 400, y: 180, width: 120, height: 120 },
  { id: 'executeUnit', name: 'Execute Unit', icon: Settings, x: 650, y: 180, width: 120, height: 120 },
  { id: 'memoryUnit', name: 'Memory Unit', icon: Database, x: 900, y: 180, width: 120, height: 120 },
  { id: 'writeBackUnit', name: 'WriteBack Unit', icon: HardDrive, x: 1150, y: 180, width: 120, height: 120 },
];

const initialStageModules: ModuleData[] = [
  { id: 'decodeStage', name: 'IF/ID', x: 310, y: STAGE_Y, width: STAGE_WIDTH, height: STAGE_HEIGHT, editable: false },
  { id: 'executeStage', name: 'ID/EX', x: 560, y: STAGE_Y, width: STAGE_WIDTH, height: STAGE_HEIGHT, editable: false },
  { id: 'memoryStage', name: 'EX/MEM', x: 810, y: STAGE_Y, width: STAGE_WIDTH, height: STAGE_HEIGHT, editable: false },
  { id: 'writeBackStage', name: 'MEM/WB', x: 1060, y: STAGE_Y, width: STAGE_WIDTH, height: STAGE_HEIGHT, editable: false },
];

const initialAuxiliaryModules: ModuleData[] = [
  { id: 'regFile', name: 'Register File', icon: Database, x: 400, y: 480, width: 120, height: 120 },
  { id: 'instMEM', name: 'instMEM', icon: HardDrive, x: 150, y: 370, width: 120, height: 120 },
  { id: 'dataMEM', name: 'Data Memory', icon: Database, x: 650, y: 370, width: 120, height: 120 },
  { id: 'ctrl', name: 'Control Unit', icon: Settings, x: 150, y: 0, width: CTRL_WIDTH, height: CTRL_HEIGHT },
  // ★ 中断与异常演示：CSR 模块（横跨底部，宽度与 ctrl 对齐，便于 6 条线分散）
  { id: 'csr', name: 'CSR (mtvec / mepc / mcause / mstatus / mie / mip)', icon: Settings,
    x: 150, y: 640, width: 1120, height: 60, editable: false },
];

const initialConnections: ConnectionData[] = [
  //{ id: '', source: '', target: '', type: 'data', label: '', sourceOffset: { x: 0, y: 0 }, targetOffset: { x: 0, y: 0 }, arrowDirection: '', wordOffset: {x: 0, y: 0}},  

  // instMEM相关 - 从fetchUnit右侧连到instMEM
  { id: 'instMEM_en', source: 'fetchUnit', target: 'instMEM', type: 'data', label: 'en', sourceOffset: { x: 20, y: 120 }, targetOffset: { x: 20, y: 0 }, arrowDirection: "bottom"},
  { id: 'instMEM_addr', source: 'fetchUnit', target: 'instMEM', type: 'address', label: 'PC_next', sourceOffset: { x: 40, y: 120 }, targetOffset: { x: 40, y: 0 }, arrowDirection: "bottom", wordOffset: {x:0, y:20}},
  { id: 'instMEM_inst', source: 'instMEM', target: 'fetchUnit', type: 'data', label: 'inst', sourceOffset: { x: 60, y: 0 }, targetOffset: { x: 60, y: 120 }, arrowDirection: "top"},
  
  // 取指到IF/ID - 从fetchUnit右侧连到decodeStage左侧
  { id: 'fetchUnit_PC', source: 'fetchUnit', target: 'decodeStage', type: 'data', label: 'PC', sourceOffset: { x: 120, y: 40 }, targetOffset: { x: 0, y: STAGE_MID } },
  { id: 'fetchUnit_inst', source: 'fetchUnit', target: 'decodeStage', type: 'data', label: 'inst', sourceOffset: { x: 120, y: 60 }, targetOffset: { x: 0, y: STAGE_MID } },
  { id: 'fetchUnit_valid', source: 'fetchUnit', target: 'decodeStage', type: 'data', label: 'valid', sourceOffset: { x: 120, y: 80 }, targetOffset: { x: 0, y: STAGE_MID } },
  
  // IF/ID到译码 - 从decodeStage右侧连到decodeUnit左侧
  { id: 'decodeStage_PC', source: 'decodeStage', target: 'decodeUnit', type: 'data', label: 'PC', sourceOffset: { x: 40, y: STAGE_MID }, targetOffset: { x: 0, y: 40 } },
  { id: 'decodeStage_inst', source: 'decodeStage', target: 'decodeUnit', type: 'data', label: 'inst', sourceOffset: { x: 40, y: STAGE_MID }, targetOffset: { x: 0, y: 60 } },
  { id: 'decodeStage_valid', source: 'decodeStage', target: 'decodeUnit', type: 'data', label: 'valid', sourceOffset: { x: 40, y: STAGE_MID }, targetOffset: { x: 0, y: 80 } },

  //decoderUnit到Reg File
  { id: 'src1_raddr', source: 'decodeUnit', target: 'regFile', type: 'data', label: 'src1_raddr', sourceOffset: { x: 5, y: 120 }, targetOffset: { x: 5, y: 0 }, arrowDirection: 'bottom', wordOffset: {x: 0, y: 0}},
  { id: 'src2_raddr', source: 'decodeUnit', target: 'regFile', type: 'data', label: 'src2_raddr', sourceOffset: { x: 35, y: 120 }, targetOffset: { x: 35, y: 0 }, arrowDirection: 'bottom', wordOffset: {x: 0, y: 20}},
  { id: 'src1_rdata', source: 'regFile', target: 'decodeUnit', type: 'data', label: 'src1_rdata', sourceOffset: { x: 65, y: 0 }, targetOffset: { x: 65, y: 120 }, arrowDirection: 'top', wordOffset: {x: 0, y: 0}},
  { id: 'src2_rdata', source: 'regFile', target: 'decodeUnit', type: 'data', label: 'src2_rdata', sourceOffset: { x: 95, y: 0 }, targetOffset: { x: 95, y: 120 }, arrowDirection: 'top', wordOffset: {x: 0, y: 20}},

  // ID/EX
  { id: 'ID_EX_info', source: 'decodeUnit', target: 'executeStage', type: 'data', label: 'ID_info', sourceOffset: { x: 120, y: 60 }, targetOffset: { x: 0, y: STAGE_MID }, arrowDirection: 'right', wordOffset: {x: 0, y: -5}},
  { id: 'EX_info', source: 'executeStage', target: 'executeUnit', type: 'data', label: 'ID_info', sourceOffset: { x: 55, y: STAGE_MID }, targetOffset: { x: 0, y: 60 }, arrowDirection: 'right', wordOffset: {x: 0, y: -5}},
  { id: 'Forward_info', source: 'executeUnit', target: 'decodeUnit', type: 'data', label: 'Forward_info', sourceOffset: { x: 0, y: 95 }, targetOffset: { x: 120, y: 95 }, arrowDirection: 'right', wordOffset: {x: 0, y: 10}},
  // { id: 'interrupt', source: 'executeUnit', target: 'decodeUnit', type: 'data', label: 'interrupt', sourceOffset: { x: 0, y: 20 }, targetOffset: { x: 120, y: 20 }, arrowDirection: 'right', wordOffset: {x: 0, y: -5}},

  //EX到DataMem
  { id: 'DataMem_wen', source: 'executeUnit', target: 'dataMEM', type: 'data', label: 'DataMem_wen', sourceOffset: { x: 5, y: 120 }, targetOffset: { x: 5, y: 0 }, arrowDirection: 'bottom', wordOffset: {x: 0, y: 0}},  
  { id: 'DataMem_addr', source: 'executeUnit', target: 'dataMEM', type: 'data', label: 'DataMem_addr', sourceOffset: { x: 25, y: 120 }, targetOffset: { x: 25, y: 0 }, arrowDirection: 'bottom', wordOffset: {x: 0, y: 20}},
  { id: 'DataMem_rdata', source: 'dataMEM', target: 'memoryUnit', type: 'data', label: 'DataMem_rdata', sourceOffset: { x: 120, y: 20 }, targetOffset: { x:20, y: 120 }, arrowDirection: 'right', wordOffset: {x: -20, y: 10}, pathStyle: 'right-up'},
  { id: 'DataMem_wdata', source: 'executeUnit', target: 'dataMEM', type: 'data', label: 'DataMem_wdata', sourceOffset: { x: 45, y: 120 }, targetOffset: { x: 45, y: 0 }, arrowDirection: 'bottom', wordOffset: {x: 0, y: -20}},

  // EX/MEM
  { id: 'EX_MEM_info', source: 'executeUnit', target: 'memoryStage', type: 'data', label: 'EX_info', sourceOffset: { x: 120, y: 60 }, targetOffset: { x: 0, y: STAGE_MID }, arrowDirection: 'right', wordOffset: {x: 0, y: -5}},
  { id: 'MEM_info', source: 'memoryStage', target: 'memoryUnit', type: 'data', label: 'EX_info', sourceOffset: { x: 55, y: STAGE_MID }, targetOffset: { x: 0, y: 60 }, arrowDirection: 'right', wordOffset: {x: 0, y: -5}},

  // MEM/WB
  { id: 'MEM_WB_info', source: 'memoryUnit', target: 'writeBackStage', type: 'data', label: 'MEM_info', sourceOffset: { x: 120, y: 60 }, targetOffset: { x: 0, y: STAGE_MID }, arrowDirection: 'right', wordOffset: {x: 0, y: -5}},
  { id: 'WB_info', source: 'writeBackStage', target: 'writeBackUnit', type: 'data', label: 'MEM_info', sourceOffset: { x: 55, y: STAGE_MID }, targetOffset: { x: 0, y: 60 }, arrowDirection: 'right', wordOffset: {x: 0, y: -5}},

  //WB到Reg File
  { id: 'wb_en', source: 'writeBackUnit', target: 'regFile', type: 'data', label: 'wb_en', sourceOffset: { x: 20, y: 120 }, targetOffset: { x: 120, y: 70 }, arrowDirection: 'left', wordOffset: {x: 0, y: 0}, pathStyle: 'down-left'},
  { id: 'wb_raddr', source: 'writeBackUnit', target: 'regFile', type: 'data', label: 'wb_raddr', sourceOffset: { x: 40, y: 120 }, targetOffset: { x: 120, y: 90 }, arrowDirection: 'left', wordOffset: {x: 20, y: 10}, pathStyle: 'down-left'},
  { id: 'wb_rdata', source: 'writeBackUnit', target: 'regFile', type: 'data', label: 'wb_rdata', sourceOffset: { x: 60, y: 120 }, targetOffset: { x: 120, y: 110 }, arrowDirection: 'left', wordOffset: {x: 40, y: 20}, pathStyle: 'down-left'},
  //ctrl到fetchUnit
  { id: 'fetchUnit_allow_to_go', source: 'ctrl', target: 'fetchUnit', type: 'control', label: 'fetchUnit_allow_to_go', sourceOffset: { x: 20, y: CTRL_HEIGHT }, targetOffset: { x: 20, y: 0 }, arrowDirection: 'bottom'},

  //ctrl到decodeStage
  { id: 'fetchStage_allow_to_go', source: 'ctrl', target: 'decodeStage', type: 'control', label: 'fetchStage_allow_to_go', sourceOffset: { x: 170, y: CTRL_HEIGHT }, targetOffset: { x: 10, y: 0 }, arrowDirection: 'bottom', wordOffset: {x: -20, y: 0}},    
  { id: 'fetchUnit_do_flush', source: 'ctrl', target: 'decodeStage', type: 'control', label: 'fetchUnit_do_flush', sourceOffset: { x: 200, y: CTRL_HEIGHT }, targetOffset: { x: 40, y: 0 }, arrowDirection: 'bottom', wordOffset: {x: 20, y: 30}},    

  //ctrl到executeStage
  { id: 'decodeStage_allow_to_go', source: 'ctrl', target: 'executeStage', type: 'control', label: 'decodeStage_allow_to_go', sourceOffset: { x: 420, y: CTRL_HEIGHT }, targetOffset: { x: 10, y: 0 }, arrowDirection: 'bottom', wordOffset: {x: -20, y: 0}},    
  { id: 'decodeUnit_do_flush', source: 'ctrl', target: 'executeStage', type: 'control', label: 'decodeUnit_do_flush', sourceOffset: { x: 450, y: CTRL_HEIGHT }, targetOffset: { x: 40, y: 0 }, arrowDirection: 'bottom', wordOffset: {x: 20, y: 30}},

  //ctrl到memoryStage
  { id: 'executeStage_allow_to_go', source: 'ctrl', target: 'memoryStage', type: 'control', label: 'executeStage_allow_to_go=1', sourceOffset: { x: 670, y: CTRL_HEIGHT }, targetOffset: { x: 10, y: 0 }, arrowDirection: 'bottom', wordOffset: {x: -20, y: 0}},    
  { id: 'executeUnit_do_flush', source: 'ctrl', target: 'memoryStage', type: 'control', label: 'executeUnit_do_flush', sourceOffset: { x: 700, y: CTRL_HEIGHT }, targetOffset: { x: 40, y: 0 }, arrowDirection: 'bottom', wordOffset: {x: 20, y: 30}},

  //ctrl到writeBackStage
  { id: 'memoryStage_allow_to_go', source: 'ctrl', target: 'writeBackStage', type: 'control', label: 'memoryStage_allow_to_go=1', sourceOffset: { x: 920, y: CTRL_HEIGHT }, targetOffset: { x: 10, y: 0 }, arrowDirection: 'bottom', wordOffset: {x: -20, y: 0}},    
  { id: 'memoryUnit_do_flush', source: 'ctrl', target: 'writeBackStage', type: 'control', label: 'memoryUnit_do_flush=0', sourceOffset: { x: 950, y: CTRL_HEIGHT }, targetOffset: { x: 40, y: 0 }, arrowDirection: 'bottom', wordOffset: {x: 20, y: 30}},

  //unit到ctrl
  { id: 'decodeInfo', source: 'decodeUnit', target: 'ctrl', type: 'data', label: 'decodeInfo', sourceOffset: { x: 50, y: 0 }, targetOffset: { x: 300, y: CTRL_HEIGHT }, arrowDirection: 'top', wordOffset: {x: 0, y: -5}},  
  { id: 'executeInfo', source: 'executeUnit', target: 'ctrl', type: 'data', label: 'executeInfo', sourceOffset: { x: 50, y: 0 }, targetOffset: { x: 550, y: CTRL_HEIGHT }, arrowDirection: 'top', wordOffset: {x: 0, y: -5}},  
  { id: 'memoryInfo', source: 'memoryUnit', target: 'ctrl', type: 'data', label: 'memoryInfo', sourceOffset: { x: 50, y: 0 }, targetOffset: { x: 800, y: CTRL_HEIGHT }, arrowDirection: 'top', wordOffset: {x: 0, y: -5}},  
  { id: 'writeBackInfo', source: 'writeBackUnit', target: 'ctrl', type: 'data', label: 'writeBackInfo', sourceOffset: { x: 50, y: 0 }, targetOffset: { x: 1050, y: CTRL_HEIGHT }, arrowDirection: 'top', wordOffset: {x: 0, y: -5}},

  // ★ 中断与异常演示：CSR 数据/地址通路（与后端 CSR 真实数据流一致）
  // CSR 指令（CSRRW/CSRRS/CSRRC/...）发生在 EX 阶段：Execute Unit 读写 CSR
  { id: 'csr_addr', source: 'executeUnit', target: 'csr', type: 'data',
    label: 'csr_addr', sourceOffset: { x: 65, y: 120 },
    targetOffset: { x: 565, y: 0 }, arrowDirection: 'bottom', wordOffset: {x: 0, y: 0} },
  { id: 'csr_wdata', source: 'executeUnit', target: 'csr', type: 'data',
    label: 'csr_wdata', sourceOffset: { x: 85, y: 120 },
    targetOffset: { x: 585, y: 0 }, arrowDirection: 'bottom', wordOffset: {x: 0, y: 25} },
  { id: 'csr_wen', source: 'executeUnit', target: 'csr', type: 'data',
    label: 'csr_wen', sourceOffset: { x: 105, y: 120 },
    targetOffset: { x: 605, y: 0 }, arrowDirection: 'bottom', wordOffset: {x: 0, y: 40} },
  { id: 'csr_read', source: 'csr', target: 'executeUnit', type: 'data',
    label: 'csr_rdata (old)', sourceOffset: { x: 620, y: 0 },
    targetOffset: { x: 120, y: 120 }, arrowDirection: 'top', wordOffset: {x: 10, y: 55}},

  // ★ MRET（EX 阶段）：读 mepc 写 branch_target → PC ← mepc
  { id: 'mepc_to_pc', source: 'csr', target: 'fetchUnit', type: 'address',
    label: 'mepc → PC (mret)', sourceOffset: { x: 80, y: 0 },
    targetOffset: { x: 80, y: 120 }, arrowDirection: 'top', wordOffset: {x: -30, y: 160}},

  // ★ Trap entry（IF 阶段 trap_taken / interrupt_taken）：读 mtvec → PC ← mtvec
  { id: 'mtvec_to_pc', source: 'csr', target: 'fetchUnit', type: 'address',
    label: 'mtvec → PC (trap)', sourceOffset: { x: 100, y: 0 },
    targetOffset: { x: 100, y: 120 }, arrowDirection: 'top', wordOffset: {x: 30, y: 180}},
];


/** 主模块列表（Fetch / Decode / Execute / Memory / WriteBack Unit）。 */
const modules = ref<ModuleData[]>([]);
/** 流水线寄存器列表（IF/ID、ID/EX、EX/MEM、MEM/WB），仅做显示不能拖拽。 */
const stageModules = ref<ModuleData[]>([]);
/** 辅助模块列表（Control Unit、Register File、instMEM、Data Memory、CSR）。 */
const auxiliaryModules = ref<ModuleData[]>([]);
/** 当前画布上所有连线（数据 / 控制 / 地址）。 */
const connections = ref<ConnectionData[]>([]);

/** SVG 画布的 viewBox 宽度（像素），由 `calculateSvgSize` 计算。 */
const svgWidth = ref(800);
/** SVG 画布的 viewBox 高度（像素），由 `calculateSvgSize` 计算。 */
const svgHeight = ref(450);

/**
 * 初始化画布布局：深拷贝所有默认模块与连线到响应式 ref，并触发 SVG 尺寸计算。
 * 使用 `JSON.parse(JSON.stringify(...))` 是为了彻底断开与 `initial*` 数组的引用，
 * 防止后续任何编辑直接污染默认数据。
 * @returns {void}
 */
const initLayout = () => {
  modules.value = JSON.parse(JSON.stringify(initialModules));
  stageModules.value = JSON.parse(JSON.stringify(initialStageModules));
  auxiliaryModules.value = JSON.parse(JSON.stringify(initialAuxiliaryModules));
  connections.value = JSON.parse(JSON.stringify(initialConnections));

  calculateSvgSize();
};

/**
 * 根据当前所有模块的位置与尺寸计算 SVG viewBox 的宽高，并在四周各留 80px 边距。
 * 用于确保任何模块都不会被画布边缘裁切。
 * @returns {void}
 */
const calculateSvgSize = () => {
  const allModules = [...modules.value, ...stageModules.value, ...auxiliaryModules.value];
  let maxX = 0;
  let maxY = 0;

  allModules.forEach(m => {
    maxX = Math.max(maxX, m.x + m.width);
    maxY = Math.max(maxY, m.y + m.height);
  });

  svgWidth.value = maxX + 80;
  svgHeight.value = maxY + 80;
};

/**
 * 根据连线配置生成 SVG `<path>` 的 `d` 属性字符串。
 * 支持三种 `pathStyle`：
 *   - `auto`（默认）：`起点 → 水平中点 → 垂直中点 → 终点`，呈水平折线
 *   - `down-left`：先竖直下降到 `endY`，再水平走到 `endX`（适合 WriteBack → RegFile）
 *   - `right-up`：先水平走到 `endX`，再竖直上升到 `endY`（适合 DataMEM → MemoryUnit）
 * @param {ConnectionData} connection 连线配置。
 * @returns {string} 形如 `M x y L x y ...` 的 path 字符串；找不到端点模块时返回空串。
 */
const generatePath = (connection: ConnectionData) => {
  const startModule = [...modules.value, ...stageModules.value, ...auxiliaryModules.value].find(m => m.id === connection.source);
  const endModule = [...modules.value, ...stageModules.value, ...auxiliaryModules.value].find(m => m.id === connection.target);

  if (!startModule || !endModule) {
    return '';
  }

  // 起点: 源模块左上角 + 偏移
  const startX = startModule.x + connection.sourceOffset.x;
  const startY = startModule.y + connection.sourceOffset.y;

  // 终点: 目标模块左上角 + 偏移
  const endX = endModule.x + connection.targetOffset.x;
  const endY = endModule.y + connection.targetOffset.y;

  const bendOffset = connection.bendOffset || 0;
  const pathStyle = connection.pathStyle || 'auto';

  // down-left：起点先竖直下降到 endY，再水平走到 endX。
  // 典型用例：WriteBackUnit(右下) → RegFile(左上)，走 ⌐ 形。
  if (pathStyle === 'down-left') {
    return `M ${startX} ${startY} L ${startX} ${endY} L ${endX} ${endY}`;
  }

  // right-up：起点先水平走到 endX，再竖直上升到 endY。
  // 典型用例：DataMEM(下) → MemoryUnit(上)，走 ⌐ 的镜像。
  if (pathStyle === 'right-up') {
    return `M ${startX} ${startY} L ${endX} ${startY} L ${endX} ${endY}`;
  }

  // auto（默认）：先水平中点、再垂直中点的 Z 形折线，bendOffset 用于微调拐点位置。
  const midX = (startX + endX + bendOffset) / 2;
  return `M ${startX} ${startY} L ${midX} ${startY} L ${midX} ${endY} L ${endX} ${endY}`;
};

/**
 * 根据连线类型与当前激活状态，返回 SVG `marker-end` 应引用的箭头 marker id。
 *
 * 颜色约定（与 CSS 变量对应）：
 *   - data  默认 #3B82F6（蓝），高亮使用 `var(--color-data-flow)`
 *   - control 默认 #94A3B8（灰），高亮使用 `var(--color-control-flow)`（红色）
 *   - address 默认 #10B981（绿），高亮使用 `var(--color-address-flow)`
 *   - highlight 系列（橙色 #F59E0B）保留备用，目前未在路由中使用
 *
 * 优先级：address-highlight > data-highlight > control-highlight > 普通 marker。
 * @param {ConnectionData} connection 连线配置。
 * @returns {string} `url(#arrow-...)` 形式的 marker 引用。
 */
const getArrowMarker = (connection: ConnectionData) => {
  const arrowDir = connection.arrowDirection || 'right';
  // 数据类高亮：后端报上来且匹配 id
  const isDataActive = connection.type === 'data' && isDataFlowActive(connection.id);
  // 控制类高亮：仅当 type === 'control' 才走控制信号匹配
  const isControlActive = connection.type === 'control' && isControlSignalActive(connection.id);
  // 地址类高亮：依靠 label 中是否含 addr/PC 来识别（兼容 type=='data' 的 PC/地址线）
  const isAddressActive = (connection.label?.includes('addr') || connection.label?.includes('PC')) && isDataFlowActive(connection.id);

  if (isAddressActive) {
    return `url(#arrow-address-highlight-${arrowDir})`;
  }
  if (isDataActive) {
    return `url(#arrow-data-highlight-${arrowDir})`;
  }
  if (isControlActive) {
    return `url(#arrow-control-highlight-${arrowDir})`;
  }


  // 非高亮时使用普通灰色标记（颜色随 type 变化：data 蓝 / control 灰 / address 绿）
  return `url(#arrow-${connection.type}-${arrowDir})`;
};

/**
 * 计算连线中部用于显示 label 文本的坐标。
 * 同样按 `pathStyle` 区分：down-left 取竖直段中点；right-up 取水平段中点；auto 取总中点。
 * 叠加 `wordOffset` 便于人为微调 label 位置，避免与连线重叠。
 * @param {ConnectionData} connection 连线配置。
 * @returns {{x: number, y: number}} label 在 SVG 坐标系中的中心点。
 */
const getPathMidPoint = (connection: ConnectionData) => {
  const startModule = [...modules.value, ...stageModules.value, ...auxiliaryModules.value].find(m => m.id === connection.source);
  const endModule = [...modules.value, ...stageModules.value, ...auxiliaryModules.value].find(m => m.id === connection.target);

  if (!startModule || !endModule) {
    return { x: 0, y: 0 };
  }

  const startX = startModule.x + connection.sourceOffset.x;
  const startY = startModule.y + connection.sourceOffset.y;
  const endX = endModule.x + connection.targetOffset.x;
  const endY = endModule.y + connection.targetOffset.y;

  const wordOffset = connection.wordOffset || { x: 0, y: 0 };
  const pathStyle = connection.pathStyle || 'auto';

  if (pathStyle === 'down-left') {
    return {
      x: startX + wordOffset.x,
      y: (startY + endY) / 2 + wordOffset.y
    };
  }

  if (pathStyle === 'right-up') {
    return {
      x: (startX + endX) / 2 + wordOffset.x,
      y: startY + wordOffset.y
    };
  }

  return {
    x: (startX + endX) / 2 + wordOffset.x,
    y: (startY + endY) / 2 + wordOffset.y
  };
};

/**
 * 判断某条连线是否命中当前后端上报的活跃数据流集合。
 * 用于决定连接是否需要高亮（动画描边 + 彩色箭头）。
 * @param {string} connectionId 连线 id。
 * @returns {boolean} 是否在 `pipelineStore.activeDataFlows` 中。
 */
const isDataFlowActive = (connectionId: string) => {
  return pipelineStore.activeDataFlows.some(f => f.id === connectionId);
};

/**
 * 判断某条控制连线是否处于激活态。
 * 控制信号由后端单独维护在 `pipelineStore.activeControlSignals`。
 * @param {string} connectionId 连线 id。
 * @returns {boolean} 是否在活跃控制信号集合中。
 */
const isControlSignalActive = (connectionId: string) => {
  return pipelineStore.activeControlSignals.some(s => s.id === connectionId);
};

/**
 * 获取某条连线上的数据流当前值（用于 tooltip 显示）。
 * @param {string} connectionId 连线 id。
 * @returns {string} 数据流值；不存在则返回空串。
 */
const getDataFlowValue = (connectionId: string): string => {
  const flow = pipelineStore.activeDataFlows.find(f => f.id === connectionId);
  return flow ? flow.value : '';
};

/**
 * 鼠标进入连线时的处理：若该连线有数据流值则显示 tooltip，
 * 定位在鼠标屏幕坐标处。命中层（`connection-hit`）保证 1px 细线也能触发。
 * @param {string} connectionId 连线 id。
 * @param {MouseEvent} event 原生鼠标事件，用于取 clientX/clientY。
 * @returns {void}
 */
const handleMouseEnterConnection = (connectionId: string, event: MouseEvent) => {
  const value = getDataFlowValue(connectionId);
  if (value) {
    tooltipText.value = value;
    tooltipX.value = event.clientX;
    tooltipY.value = event.clientY;
    tooltipVisible.value = true;
  }
};

/**
 * 鼠标离开连线时关闭 tooltip。
 * @returns {void}
 */
const handleMouseLeaveConnection = () => {
  tooltipVisible.value = false;
};

/**
 * 模块点击路由：按模块 id 打开不同的详情弹窗。
 * - `regFile` → 寄存器文件弹窗
 * - `executeUnit` → ALU 弹窗
 * - `ctrl` → Control Unit 弹窗
 * - 各级 Unit/Stage → 对应阶段的流水线寄存器弹窗（if_id / id_ex / ex_mem / mem_wb）
 * - `csr` → CSR 弹窗
 * @param {string} moduleId 模块 id。
 * @returns {void}
 */
const handleModuleClick = (moduleId: string) => {
  // 寄存器文件：弹出寄存器详细值
  if (moduleId === 'regFile') {
    pipelineStore.openModal('register');
  // ALU 单元：弹窗显示当前 ALU 操作 / 结果
  } else if (moduleId === 'executeUnit') {
    pipelineStore.openModal('alu');
  // 控制单元：弹窗显示控制信号矩阵
  } else if (moduleId === 'ctrl') {
    pipelineStore.openModal('control');
  // IF 阶段：弹窗显示 IF/ID 流水线寄存器内容
  } else if (moduleId === 'fetchUnit') {
    pipelineStore.openModal('pipelineRegister', 'if_id');
  // ID 阶段：弹窗显示 ID/EX 流水线寄存器内容
  } else if (moduleId === 'decodeUnit') {
    pipelineStore.openModal('pipelineRegister', 'id_ex');
  // EX/MEM 阶段：弹窗显示 EX/MEM 流水线寄存器内容
  } else if (moduleId === 'memoryUnit') {
    pipelineStore.openModal('pipelineRegister', 'ex_mem');
  // MEM/WB 阶段：弹窗显示 MEM/WB 流水线寄存器内容
  } else if (moduleId === 'writeBackUnit') {
    pipelineStore.openModal('pipelineRegister', 'mem_wb');
  // CSR 模块：弹窗显示 CSR 当前值
  } else if (moduleId === 'csr') {
    pipelineStore.openModal('csr');
  // 流水线寄存器本体也允许点击：依旧打开对应阶段的内容
  } else if (moduleId === 'decodeStage') {
    pipelineStore.openModal('pipelineRegister', 'if_id');
  } else if (moduleId === 'executeStage') {
    pipelineStore.openModal('pipelineRegister', 'id_ex');
  } else if (moduleId === 'memoryStage') {
    pipelineStore.openModal('pipelineRegister', 'ex_mem');
  } else if (moduleId === 'writeBackStage') {
    pipelineStore.openModal('pipelineRegister', 'mem_wb');
  }
};

/**
 * 从 `pipelineStore` 中获取某个模块的实时数据（如 PC、当前指令等）。
 * @param {string} moduleId 模块 id。
 * @returns {*} 模块数据对象；不存在则返回 undefined。
 */
const getModuleData = (moduleId: string) => {
  return pipelineStore.getModuleData(moduleId);
};

/**
 * 处理鼠标滚轮：以 0.9 / 1.1 倍率缩放画布，并限制在 0.3 ~ 3 倍之间。
 * 调用 `preventDefault` 阻止页面整体滚动；`passive: false` 才能在 `onMounted` 中注册。
 * @param {WheelEvent} e wheel 事件。
 * @returns {void}
 */
const handleWheel = (e: WheelEvent) => {
  e.preventDefault();
  const delta = e.deltaY > 0 ? 0.9 : 1.1;
  const newScale = transform.value.k * delta;
  if (newScale >= 0.3 && newScale <= 3) {
    transform.value.k = newScale;
  }
};

/**
 * mousedown 处理：arm 拖拽。
 * 仅当鼠标左键按下时进入"预备"状态，记录起点和 transform 快照；
 * 真正的拖拽由 `handleMouseMove` 在位移超过阈值后再开启。
 * @param {MouseEvent} e mousedown 事件。
 * @returns {void}
 */
const handleMouseDown = (e: MouseEvent) => {
  if (e.button === 0) {
    // arm：本容器的 mousedown 才允许后续触发拖拽
    dragArmed.value = true;
    isDragging.value = false;
    dragOrigin.value = { x: e.clientX, y: e.clientY };
    transformAtDragStart.value = { ...transform.value };
  }
};

/**
 * mousemove 处理：分两种情况。
 * 1. 已在拖拽：基于 mousedown 时的 transform 快照做平移。
 * 2. arm 状态：用欧氏距离判断是否超过 4px 阈值（用平方避免开方）；超过则升级为真正拖拽。
 * 之所以选 4px 阈值：既能容忍正常点击的微抖，又能让轻微拖拽不误触。
 * @param {MouseEvent} e mousemove 事件。
 * @returns {void}
 */
const handleMouseMove = (e: MouseEvent) => {
  if (isDragging.value) {
    transform.value.x = transformAtDragStart.value.x + (e.clientX - dragOrigin.value.x);
    transform.value.y = transformAtDragStart.value.y + (e.clientY - dragOrigin.value.y);
    return;
  }
  // 只有 arm 之后才检测阈值（避免在左右侧面板选中文本时误判为拖拽）
  if (dragArmed.value) {
    const dx = e.clientX - dragOrigin.value.x;
    const dy = e.clientY - dragOrigin.value.y;
    // 平方比较避免 sqrt；4px 阈值兼顾点击抖动与拖拽判定
    if (dx * dx + dy * dy >= DRAG_THRESHOLD * DRAG_THRESHOLD) {
      isDragging.value = true;
      // 拖拽时立刻关闭 tooltip，避免 tooltip 跟随画布移动造成闪烁
      if (tooltipVisible.value) tooltipVisible.value = false;
    }
  }
};

/**
 * mouseup 处理：清空 arm 与拖拽标志。
 * 必须在 `window` 上监听，否则鼠标移出容器时松开将无法复位。
 * @returns {void}
 */
const handleMouseUp = () => {
  isDragging.value = false;
  dragArmed.value = false;
};

/**
 * 双击画布：重置 transform 到初始值（位置 0,0，缩放 1）。
 * @returns {void}
 */
const handleDoubleClick = () => {
  transform.value = { x: 0, y: 0, k: 1 };
};

/**
 * 根据模块 id 返回对应的 CSS class，用于模块视觉差异化：
 *   - `ctrl`        → `control-unit`（红色边框）
 *   - 其他辅助模块   → `auxiliary-module`
 *   - 主模块         → `main-module`
 *   - 流水线寄存器   → `stage-module`（虚线灰色矩形）
 * @param {string} moduleId 模块 id。
 * @returns {string} 完整的 class 字符串。
 */
const getModuleClass = (moduleId: string) => {
  const baseClass = 'module-group ';
  if (moduleId === 'ctrl') return baseClass + 'control-unit';
  if (auxiliaryModules.value.some(m => m.id === moduleId && m.id !== 'ctrl')) return baseClass + 'auxiliary-module';
  if (modules.value.some(m => m.id === moduleId)) return baseClass + 'main-module';
  return baseClass + 'stage-module';
};

onMounted(() => {
  // 强制清除可能残留的旧布局缓存：早期版本曾把布局写入 localStorage，
  // 这里显式清理是为了让每次挂载都使用最新默认布局，避免开发/调试时污染。
  localStorage.removeItem('pipelineLayout');
  initLayout();

  const container = containerRef.value;
  if (container) {
    // 必须用 passive:false，否则无法在 wheel 中调用 preventDefault 阻止页面整体滚动
    container.addEventListener('wheel', handleWheel, { passive: false });
  }
  // 监听挂在 window 上，保证鼠标在容器外松开时也能复位拖拽状态
  window.addEventListener('mouseup', handleMouseUp);
  window.addEventListener('mousemove', handleMouseMove);
});

onUnmounted(() => {
  // 清理顺序：先摘容器 wheel，再摘 window 全局监听；
  // 与 onMounted 的注册顺序一一对应，避免漏摘导致内存泄漏或幽灵回调。
  const container = containerRef.value;
  if (container) {
    container.removeEventListener('wheel', handleWheel);
  }
  window.removeEventListener('mouseup', handleMouseUp);
  window.removeEventListener('mousemove', handleMouseMove);
});
</script>

<template>
  <!-- 顶层外层容器：纵向布局，包裹后续所有编辑器内容 -->
  <div class="editor-wrapper">
    <!--
      画布主容器：负责接收 mousedown / dblclick，内部承载可平移/缩放的 SVG。
      `is-dragging` class 在拖拽期间用于禁用命中层、改变光标。
    -->
    <div
      ref="containerRef"
      class="pipeline-container"
      :class="{ 'is-dragging': isDragging }"
      @mousedown="handleMouseDown"
      @dblclick="handleDoubleClick"
    >
      <!--
        流水线 SVG 画布：viewBox 由 svgWidth/svgHeight 决定；
        transform 属性实现平移和缩放（外层 div 不再用 CSS transform 避免冲突）。
      -->
      <svg
        class="pipeline-svg"
        :viewBox="`0 0 ${svgWidth} ${svgHeight}`"
        :transform="`translate(${transform.x}, ${transform.y}) scale(${transform.k})`"
      >
        <!--
          SVG <defs>：集中声明所有箭头 marker 供 `marker-end` 引用。
          命名规则统一为 `arrow-<type>-<dir>` 与 `arrow-<type>-highlight-<dir>`。
        -->
        <defs>
          <!--
            ===== Data Markers（蓝色 #3B82F6）=====
            默认（非高亮）的数据流向箭头，提供 right/left/top/bottom 四个方向。
            颜色约定：data 流默认蓝，高亮时切换为 var(--color-data-flow)。
          -->
          <marker
            id="arrow-data-right"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="5"
            markerHeight="5"
            orient="auto"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#3B82F6" />
          </marker>

          <marker
            id="arrow-data-left"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="5"
            markerHeight="5"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#3B82F6" />
          </marker>

          <marker
            id="arrow-data-top"
            viewBox="0 0 10 10"
            refX="5"
            refY="1"
            markerWidth="6"
            markerHeight="6"
            orient="auto"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" transform="rotate(-90 5 5)" fill="#3B82F6" />
          </marker>

          <marker
            id="arrow-data-bottom"
            viewBox="0 0 10 10"
            refX="5"
            refY="9"
            markerWidth="6"
            markerHeight="6"
            orient="auto"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" transform="rotate(90 5 5)" fill="#3B82F6" />
          </marker>

          <!--
            ===== Control Markers（灰色 #94A3B8）=====
            控制信号箭头：颜色更暗以区别于数据流。
            颜色约定：control 流默认灰，高亮时切换为 var(--color-control-flow)（红）。
          -->
          <marker
            id="arrow-control-right"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#94A3B8" />
          </marker>

          <marker
            id="arrow-control-left"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#94A3B8" />
          </marker>

          <marker
            id="arrow-control-top"
            viewBox="0 0 10 10"
            refX="5"
            refY="1"
            markerWidth="6"
            markerHeight="6"
            orient="auto"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" transform="rotate(-90 5 5)" fill="#94A3B8" />
          </marker>

          <marker
            id="arrow-control-bottom"
            viewBox="0 0 10 10"
            refX="5"
            refY="9"
            markerWidth="6"
            markerHeight="6"
            orient="auto"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" transform="rotate(90 5 5)" fill="#94A3B8" />
          </marker>

          <!--
            ===== Address Markers（绿色 #10B981）=====
            地址类箭头：用于 PC、instMEM_addr、DataMem_addr、csr_addr、mepc_to_pc、mtvec_to_pc 等。
            颜色约定：address 流默认绿，高亮时切换为 var(--color-address-flow)。
          -->
          <marker
            id="arrow-address-right"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#10B981" />
          </marker>

          <marker
            id="arrow-address-left"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#10B981" />
          </marker>

          <marker
            id="arrow-address-top"
            viewBox="0 0 10 10"
            refX="5"
            refY="1"
            markerWidth="6"
            markerHeight="6"
            orient="auto"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" transform="rotate(-90 5 5)" fill="#10B981" />
          </marker>

          <marker
            id="arrow-address-bottom"
            viewBox="0 0 10 10"
            refX="5"
            refY="9"
            markerWidth="6"
            markerHeight="6"
            orient="auto"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" transform="rotate(90 5 5)" fill="#10B981" />
          </marker>

          <!--
            ===== Highlight Series（橙色 #F59E0B）=====
            通用高亮箭头（备用集），目前 getArrowMarker 未直接引用，
            保留以便后续接入新的高亮类型。
          -->
          <marker
            id="arrow-highlight-right"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="8"
            markerHeight="8"
            orient="auto"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#F59E0B" />
          </marker>

          <marker
            id="arrow-highlight-left"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="8"
            markerHeight="8"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#F59E0B" />
          </marker>

          <marker
            id="arrow-highlight-top"
            viewBox="0 0 10 10"
            refX="5"
            refY="1"
            markerWidth="8"
            markerHeight="8"
            orient="auto"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" transform="rotate(-90 5 5)" fill="#F59E0B" />
          </marker>

          <marker
            id="arrow-highlight-bottom"
            viewBox="0 0 10 10"
            refX="5"
            refY="9"
            markerWidth="8"
            markerHeight="8"
            orient="auto"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" transform="rotate(90 5 5)" fill="#F59E0B" />
          </marker>

          <!--
            ===== Address Highlight Markers =====
            地址高亮箭头：与 address 普通 marker 同色调（绿系）但更大、动画更明显，
            用于显示当前周期激活的 PC/CSR 地址流。
          -->
          <marker
            id="arrow-address-highlight-right"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="8"
            markerHeight="8"
            orient="auto"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--color-address-flow)" />
          </marker>

          <marker
            id="arrow-address-highlight-left"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="8"
            markerHeight="8"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--color-address-flow)" />
          </marker>

          <marker
            id="arrow-address-highlight-top"
            viewBox="0 0 10 10"
            refX="5"
            refY="1"
            markerWidth="8"
            markerHeight="8"
            orient="auto"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" transform="rotate(-90 5 5)" fill="var(--color-address-flow)" />
          </marker>

          <marker
            id="arrow-address-highlight-bottom"
            viewBox="0 0 10 10"
            refX="5"
            refY="9"
            markerWidth="8"
            markerHeight="8"
            orient="auto"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" transform="rotate(90 5 5)" fill="var(--color-address-flow)" />
          </marker>

          <!--
            ===== Data Highlight Markers =====
            数据高亮箭头：当前活跃数据流使用此 marker，颜色由 CSS 变量控制。
          -->
          <marker
            id="arrow-data-highlight-right"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="8"
            markerHeight="8"
            orient="auto"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--color-data-flow)" />
          </marker>

          <marker
            id="arrow-data-highlight-left"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="8"
            markerHeight="8"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--color-data-flow)" />
          </marker>

          <marker
            id="arrow-data-highlight-top"
            viewBox="0 0 10 10"
            refX="5"
            refY="1"
            markerWidth="8"
            markerHeight="8"
            orient="auto"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" transform="rotate(-90 5 5)" fill="var(--color-data-flow)" />
          </marker>

          <marker
            id="arrow-data-highlight-bottom"
            viewBox="0 0 10 10"
            refX="5"
            refY="9"
            markerWidth="8"
            markerHeight="8"
            orient="auto"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" transform="rotate(90 5 5)" fill="var(--color-data-flow)" />
          </marker>

          <!--
            ===== Control Highlight Markers (Red) =====
            控制信号高亮箭头：颜色由 --color-control-flow 控制（默认红色系），
            用于显示当前周期使能的控制信号。
          -->
          <marker
            id="arrow-control-highlight-right"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="8"
            markerHeight="8"
            orient="auto"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--color-control-flow)" />
          </marker>

          <marker
            id="arrow-control-highlight-left"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="8"
            markerHeight="8"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--color-control-flow)" />
          </marker>

          <marker
            id="arrow-control-highlight-top"
            viewBox="0 0 10 10"
            refX="5"
            refY="1"
            markerWidth="8"
            markerHeight="8"
            orient="auto"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" transform="rotate(-90 5 5)" fill="var(--color-control-flow)" />
          </marker>

          <marker
            id="arrow-control-highlight-bottom"
            viewBox="0 0 10 10"
            refX="5"
            refY="9"
            markerWidth="8"
            markerHeight="8"
            orient="auto"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" transform="rotate(90 5 5)" fill="var(--color-control-flow)" />
          </marker>
        </defs>

        <!--
          ===== Control Unit 渲染分组 =====
          单独绘制 ctrl（横跨顶部的控制单元），先于其他模块绘制以保证位于 z-index 底层。
        -->
        <g
          v-for="module in auxiliaryModules.filter(m => m.id === 'ctrl')"
          :key="module.id"
          :class="getModuleClass(module.id)"
          :transform="`translate(${module.x}, ${module.y})`"
          @click="handleModuleClick(module.id)"
        >
          <rect
            :width="module.width"
            :height="module.height"
            rx="8"
            fill="white"
            stroke="#EF4444"
            stroke-width="1"
          />
          <foreignObject :width="module.width" :height="module.height">
            <div class="module-content">
              <component :is="module.icon" v-if="module.icon" class="w-5 h-5 text-red-500" />
              <span class="text-xs font-semibold">{{ module.name }}</span>
            </div>
          </foreignObject>
        </g>

        <!--
          ===== 主模块渲染分组（Fetch / Decode / Execute / Memory / WriteBack）=====
          蓝色边框，便于与辅助模块和流水线寄存器视觉区分。
        -->
        <g
          v-for="module in modules"
          :key="module.id"
          :class="getModuleClass(module.id)"
          :transform="`translate(${module.x}, ${module.y})`"
          @click="handleModuleClick(module.id)"
        >
          <rect
            :width="module.width"
            :height="module.height"
            rx="8"
            fill="white"
            stroke="#3B82F6"
            stroke-width="2"
          />
          <foreignObject :width="module.width" :height="module.height">
            <div class="module-content">
              <component :is="module.icon" v-if="module.icon" class="w-6 h-6 text-blue-500" />
              <span class="text-sm font-semibold">{{ module.name }}</span>
              <div class="module-data mt-1" v-if="getModuleData(module.id)">
                <!-- <span class="text-xs" v-if="getModuleData(module.id)?.pc">PC: {{ getModuleData(module.id)?.pc }}</span> -->
              </div>
            </div>
          </foreignObject>
        </g>

        <!--
          ===== 流水线寄存器渲染分组（IF/ID、ID/EX、EX/MEM、MEM/WB）=====
          虚线灰色矩形，仅显示阶段名（不渲染图标），但仍可点击打开对应阶段详情。
        -->
        <g
          v-for="module in stageModules"
          :key="module.id"
          :class="getModuleClass(module.id)"
          :transform="`translate(${module.x}, ${module.y})`"
          @click="handleModuleClick(module.id)"
          style="cursor: pointer;"
        >
          <rect
            :width="module.width"
            :height="module.height"
            rx="6"
            fill="#F1F5F9"
            stroke="#94A3B8"
            stroke-width="1"
            stroke-dasharray="4,2"
          />
          <text
            :x="module.width / 2"
            :y="module.height / 2 + 4"
            text-anchor="middle"
            class="text-xs fill-gray-500"
          >
            {{ module.name }}
          </text>
        </g>

        <!--
          ===== 辅助模块渲染分组（除 ctrl 之外）=====
          绿色边框，承载 Register File、instMEM、Data Memory、CSR。
        -->
        <g
          v-for="module in auxiliaryModules.filter(m => m.id !== 'ctrl')"
          :key="module.id"
          :class="getModuleClass(module.id)"
          :transform="`translate(${module.x}, ${module.y})`"
          @click="handleModuleClick(module.id)"
        >
          <rect
            :width="module.width"
            :height="module.height"
            rx="6"
            fill="white"
            stroke="#10B981"
            stroke-width="1"
          />
          <foreignObject :width="module.width" :height="module.height">
            <div class="module-content">
              <component :is="module.icon" v-if="module.icon" class="w-5 h-5 text-emerald-500" />
              <span class="text-xs font-semibold">{{ module.name }}</span>
            </div>
          </foreignObject>
        </g>

        <!--
          ===== 单条连线渲染组 =====
          每条连线由三层 SVG 元素组成：
          1. 透明加宽的命中层（`connection-hit`）：接 mouseenter/leave，让 1px 细线也容易 hover
          2. 实际可见的 path（`connection-path`）：负责视觉与高亮动画
          3. 中部 label `<text>`：在 path 上叠加显示信号名
        -->
        <g v-for="connection in connections" :key="connection.id">
          <!-- 透明加宽的命中层：只负责接 mouseenter/leave，不影响视觉 -->
          <path
            :d="generatePath(connection)"
            class="connection-hit"
            @mouseenter="handleMouseEnterConnection(connection.id, $event)"
            @mouseleave="handleMouseLeaveConnection"
          />
          <path
            :d="generatePath(connection)"
            :class="[
              'connection-path',
              connection.type === 'data' ? 'data-flow' : connection.type === 'address' ? 'address-flow' : 'control-flow',
              {
                'active-data': connection.type === 'data' && isDataFlowActive(connection.id),
                'active-control': connection.type === 'control' && isControlSignalActive(connection.id),
                'active-address': (connection.type === 'address' || connection.label?.includes('addr') || connection.label?.includes('PC')) && isDataFlowActive(connection.id),
              }
            ]"
            :marker-end="getArrowMarker(connection)"
          />
          <text
            :x="getPathMidPoint(connection).x"
            :y="getPathMidPoint(connection).y"
            class="connection-label"
            :class="{
              'active-label': connection.type === 'data' && isDataFlowActive(connection.id),
              'active-label-control': connection.type === 'control' && isControlSignalActive(connection.id),
              'active-label-address': (connection.label?.includes('addr') || connection.label?.includes('PC')) && isDataFlowActive(connection.id),
            }"
          >
            {{ connection.label }}
          </text>
        </g>
      </svg>

      <!--
        数据流 tooltip：fixed 定位在鼠标位置，仅当 hover 命中带值连线时显示。
        用于展示当前周期数据流的具体数值。
      -->
      <div
        v-if="tooltipVisible"
        class="dataflow-tooltip"
        :style="{ left: tooltipX + 'px', top: tooltipY + 'px' }"
      >
        {{ tooltipText }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.editor-wrapper {
  display: flex;
  flex-direction: column;
  height: 100%;
  gap: 0.5rem;
}

.pipeline-container {
  flex: 1;
  min-height: 25rem;
  overflow: hidden;
  position: relative;
  cursor: grab;
  background: #fafafa;
  border-radius: 0.5rem;
}

.pipeline-container:active {
  cursor: grabbing;
}

.pipeline-svg {
  width: 100%;
  height: 100%;
  display: block;
  transform-origin: 0 0;
  transition: transform 0.1s ease-out;
  background: #f8f9fa;
}

.module-group {
  cursor: pointer;
  transition: opacity 0.2s ease;
}

.module-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 0.25rem;
  pointer-events: none;
}

.module-data {
  display: flex;
  flex-direction: column;
  gap: 0.0625rem;
}

.connection-path {
  fill: none;
  stroke-width: 1;
  transition: stroke 0.3s ease, stroke-width 0.3s ease, opacity 0.3s ease;
  pointer-events: none;
}

/* 透明加宽的命中层：接 mouseenter/leave，让 1px 的细线也容易 hover 到 */
.connection-hit {
  fill: none;
  stroke: transparent;
  stroke-width: 14;
  pointer-events: stroke;
  cursor: help;
}

/* 拖拽过程中禁用命中层，避免鼠标跟着画布一起移动时误触 hover */
.is-dragging .connection-hit {
  pointer-events: none;
}

.data-flow {
  stroke: var(--color-data-flow);
  opacity: 0.6;
}

.control-flow {
  stroke: var(--color-control-flow);
  opacity: 0.5;
}

.address-flow {
  stroke: var(--color-address-flow);
  opacity: 0.6;
}

.connection-label {
  font-size: 0.5625rem;
  fill: #64748B;
  text-anchor: middle;
  pointer-events: none;
  transition: all 0.3s ease;
  font-weight: 500;
  paint-order: stroke;
  stroke: #fafafa;
  stroke-width: 1px;
}

.active-data {
  stroke: var(--color-data-flow);
  stroke-width: 1.5;
  opacity: 1;
  stroke-dasharray: 2, 4;
  animation: data-flow-animation 1s linear infinite;
}

.active-control {
  stroke: var(--color-control-flow);
  stroke-width: 1.2;
  opacity: 1;
  stroke-dasharray: 2, 3;
  animation: control-flow-animation 0.8s linear infinite;
}

.active-address {
  stroke: var(--color-address-flow);
  stroke-width: 1.5;
  opacity: 1;
  stroke-dasharray: 2, 4;
  animation: data-flow-animation 1s linear infinite;
}

.active-label {
  font-size: 0.6875rem;
  fill: var(--color-data-flow);
  font-weight: 700;
}

.active-label-control {
  font-size: 0.625rem;
  fill: var(--color-control-flow);
  font-weight: 700;
}

.active-label-address {
  font-size: 0.625rem;
  fill: var(--color-address-flow);
  font-weight: 700;
}

@keyframes data-flow-animation {
  0% {
    stroke-dashoffset: 0;
  }
  100% {
    stroke-dashoffset: -24;
  }
}

@keyframes control-flow-animation {
 0% {
   stroke-dashoffset: 0;
 }
 100% {
   stroke-dashoffset: -15;
 }
}

.dataflow-tooltip {
  position: fixed;
  background-color: #1f2937;
  color: white;
  padding: 0.375rem 0.75rem;
  border-radius: 0.375rem;
  font-size: 0.8125rem;
  font-family: monospace;
  white-space: nowrap;
  z-index: 9999;
  transform: translate(-50%, -120%);
  pointer-events: none;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
}
</style>
