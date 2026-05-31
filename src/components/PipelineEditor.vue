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

const transform = ref({ x: 0, y: 0, k: 1 });
const isDragging = ref(false);
const startPos = ref({ x: 0, y: 0 });
const containerRef = ref<HTMLElement | null>(null);

const tooltipVisible = ref(false);
const tooltipText = ref('');
const tooltipX = ref(0);
const tooltipY = ref(0);

const STAGE_WIDTH = 55;
const STAGE_HEIGHT = 210;
const CTRL_WIDTH = 1120;
const CTRL_HEIGHT = 50;
const STAGE_Y = 135;
const STAGE_MID = STAGE_HEIGHT / 2;

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
];

const initialConnections: ConnectionData[] = [
  //{ id: '', source: '', target: '', type: 'data', label: '', sourceOffset: { x: 0, y: 0 }, targetOffset: { x: 0, y: 0 }, arrowDirection: '', wordOffset: {x: 0, y: 0}},  

  // instMEM相关 - 从fetchUnit右侧连到instMEM
  { id: 'instMEM_en', source: 'fetchUnit', target: 'instMEM', type: 'data', label: 'en', sourceOffset: { x: 20, y: 120 }, targetOffset: { x: 20, y: 0 }, arrowDirection: "bottom"},
  { id: 'instMEM_addr', source: 'fetchUnit', target: 'instMEM', type: 'address', label: 'PC_next', sourceOffset: { x: 60, y: 120 }, targetOffset: { x: 60, y: 0 }, arrowDirection: "bottom"},
  { id: 'instMEM_inst', source: 'instMEM', target: 'fetchUnit', type: 'data', label: 'inst', sourceOffset: { x: 100, y: 0 }, targetOffset: { x: 100, y: 120 }, arrowDirection: "top"},
  
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
  { id: 'interrupt', source: 'executeUnit', target: 'decodeUnit', type: 'data', label: 'interrupt', sourceOffset: { x: 0, y: 20 }, targetOffset: { x: 120, y: 20 }, arrowDirection: 'right', wordOffset: {x: 0, y: -5}},

  //EX到DataMem
  { id: 'DataMem_wen', source: 'executeUnit', target: 'dataMEM', type: 'data', label: 'DataMem_wen', sourceOffset: { x: 5, y: 120 }, targetOffset: { x: 5, y: 0 }, arrowDirection: 'bottom', wordOffset: {x: 0, y: 0}},  
  { id: 'DataMem_addr', source: 'executeUnit', target: 'dataMEM', type: 'data', label: 'DataMem_addr', sourceOffset: { x: 35, y: 120 }, targetOffset: { x: 35, y: 0 }, arrowDirection: 'bottom', wordOffset: {x: 0, y: 20}},
  { id: 'DataMem_rdata', source: 'dataMEM', target: 'memoryUnit', type: 'data', label: 'DataMem_rdata', sourceOffset: { x: 60, y: 0 }, targetOffset: { x: 0, y: 100 }, arrowDirection: 'right', wordOffset: {x: -20, y: 10}},
  { id: 'DataMem_wdata', source: 'executeUnit', target: 'dataMEM', type: 'data', label: 'DataMem_wdata', sourceOffset: { x: 65, y: 120 }, targetOffset: { x: 65, y: 0 }, arrowDirection: 'bottom', wordOffset: {x: 0, y: -20}},

  // EX/MEM
  { id: 'EX_MEM_info', source: 'executeUnit', target: 'memoryStage', type: 'data', label: 'EX_info', sourceOffset: { x: 120, y: 60 }, targetOffset: { x: 0, y: STAGE_MID }, arrowDirection: 'right', wordOffset: {x: 0, y: -5}},
  { id: 'MEM_info', source: 'memoryStage', target: 'memoryUnit', type: 'data', label: 'EX_info', sourceOffset: { x: 55, y: STAGE_MID }, targetOffset: { x: 0, y: 60 }, arrowDirection: 'right', wordOffset: {x: 0, y: -5}},

  // MEM/WB
  { id: 'MEM_WB_info', source: 'memoryUnit', target: 'writeBackStage', type: 'data', label: 'MEM_info', sourceOffset: { x: 120, y: 60 }, targetOffset: { x: 0, y: STAGE_MID }, arrowDirection: 'right', wordOffset: {x: 0, y: -5}},
  { id: 'WB_info', source: 'writeBackStage', target: 'writeBackUnit', type: 'data', label: 'MEM_info', sourceOffset: { x: 55, y: STAGE_MID }, targetOffset: { x: 0, y: 60 }, arrowDirection: 'right', wordOffset: {x: 0, y: -5}},

  //WB到Reg File
  { id: 'wb_en', source: 'writeBackUnit', target: 'regFile', type: 'data', label: 'wb_en', sourceOffset: { x: 0, y: 120 }, targetOffset: { x: 120, y: 70 }, arrowDirection: 'left', wordOffset: {x: 0, y: 0}},
  { id: 'wb_raddr', source: 'writeBackUnit', target: 'regFile', type: 'data', label: 'wb_raddr', sourceOffset: { x: 20, y: 120 }, targetOffset: { x: 120, y: 90 }, arrowDirection: 'left', wordOffset: {x: 20, y: 10}, bendOffset: 40},
  { id: 'wb_rdata', source: 'writeBackUnit', target: 'regFile', type: 'data', label: 'wb_rdata', sourceOffset: { x: 40, y: 120 }, targetOffset: { x: 120, y: 110 }, arrowDirection: 'left', wordOffset: {x: 40, y: 20}, bendOffset: 80},
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
];


const modules = ref<ModuleData[]>([]);
const stageModules = ref<ModuleData[]>([]);
const auxiliaryModules = ref<ModuleData[]>([]);
const connections = ref<ConnectionData[]>([]);

const svgWidth = ref(800);
const svgHeight = ref(450);

const initLayout = () => {
  modules.value = JSON.parse(JSON.stringify(initialModules));
  stageModules.value = JSON.parse(JSON.stringify(initialStageModules));
  auxiliaryModules.value = JSON.parse(JSON.stringify(initialAuxiliaryModules));
  connections.value = JSON.parse(JSON.stringify(initialConnections));
  
  calculateSvgSize();
};

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
  const midX = (startX + endX + bendOffset) / 2;
  return `M ${startX} ${startY} L ${midX} ${startY} L ${midX} ${endY} L ${endX} ${endY}`;
};

const getArrowMarker = (connection: ConnectionData) => {
  const arrowDir = connection.arrowDirection || 'right';
  const isDataActive = connection.type === 'data' && isDataFlowActive(connection.id);
  const isControlActive = connection.type === 'control' && isControlSignalActive(connection.id);
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
  
  
  // 非高亮时使用普通灰色标记
  return `url(#arrow-${connection.type}-${arrowDir})`;
};

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
  
  return { 
    x: (startX + endX) / 2 + wordOffset.x, 
    y: (startY + endY) / 2 + wordOffset.y 
  };
};

const isDataFlowActive = (connectionId: string) => {
  return pipelineStore.activeDataFlows.some(f => f.id === connectionId);
};

const isControlSignalActive = (connectionId: string) => {
  return pipelineStore.activeControlSignals.some(s => s.id === connectionId);
};

const getDataFlowValue = (connectionId: string): string => {
  const flow = pipelineStore.activeDataFlows.find(f => f.id === connectionId);
  return flow ? flow.value : '';
};

const handleMouseEnterConnection = (connectionId: string, event: MouseEvent) => {
  const value = getDataFlowValue(connectionId);
  if (value) {
    tooltipText.value = value;
    tooltipX.value = event.clientX;
    tooltipY.value = event.clientY;
    tooltipVisible.value = true;
  }
};

const handleMouseLeaveConnection = () => {
  tooltipVisible.value = false;
};

const handleModuleClick = (moduleId: string) => {
  if (moduleId === 'regFile') {
    pipelineStore.openModal('register');
  } else if (moduleId === 'executeUnit') {
    pipelineStore.openModal('alu');
  } else if (moduleId === 'ctrl') {
    pipelineStore.openModal('control');
  } else if (moduleId === 'fetchUnit') {
    pipelineStore.openModal('pipelineRegister', 'if_id');
  } else if (moduleId === 'decodeUnit') {
    pipelineStore.openModal('pipelineRegister', 'id_ex');
  } else if (moduleId === 'memoryUnit') {
    pipelineStore.openModal('pipelineRegister', 'ex_mem');
  } else if (moduleId === 'writeBackUnit') {
    pipelineStore.openModal('pipelineRegister', 'mem_wb');
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

const getModuleData = (moduleId: string) => {
  return pipelineStore.getModuleData(moduleId);
};

const handleWheel = (e: WheelEvent) => {
  e.preventDefault();
  const delta = e.deltaY > 0 ? 0.9 : 1.1;
  const newScale = transform.value.k * delta;
  if (newScale >= 0.3 && newScale <= 3) {
    transform.value.k = newScale;
  }
};

const handleMouseDown = (e: MouseEvent) => {
  if (e.button === 0) {
    isDragging.value = true;
    startPos.value = { x: e.clientX - transform.value.x, y: e.clientY - transform.value.y };
  }
};

const handleMouseMove = (e: MouseEvent) => {
  if (isDragging.value) {
    transform.value.x = e.clientX - startPos.value.x;
    transform.value.y = e.clientY - startPos.value.y;
  }
};

const handleMouseUp = () => {
  isDragging.value = false;
};

const handleDoubleClick = () => {
  transform.value = { x: 0, y: 0, k: 1 };
};

const getModuleClass = (moduleId: string) => {
  const baseClass = 'module-group ';
  if (moduleId === 'ctrl') return baseClass + 'control-unit';
  if (auxiliaryModules.value.some(m => m.id === moduleId && m.id !== 'ctrl')) return baseClass + 'auxiliary-module';
  if (modules.value.some(m => m.id === moduleId)) return baseClass + 'main-module';
  return baseClass + 'stage-module';
};

onMounted(() => {
  localStorage.removeItem('pipelineLayout');
  initLayout();
  
  const container = containerRef.value;
  if (container) {
    container.addEventListener('wheel', handleWheel, { passive: false });
  }
  window.addEventListener('mouseup', handleMouseUp);
  window.addEventListener('mousemove', handleMouseMove);
});

onUnmounted(() => {
  const container = containerRef.value;
  if (container) {
    container.removeEventListener('wheel', handleWheel);
  }
  window.removeEventListener('mouseup', handleMouseUp);
  window.removeEventListener('mousemove', handleMouseMove);
});
</script>

<template>
  <div class="editor-wrapper">
    <div 
      ref="containerRef"
      class="pipeline-container"
      @mousedown="handleMouseDown"
      @dblclick="handleDoubleClick"
    >
      <svg 
        class="pipeline-svg"
        :viewBox="`0 0 ${svgWidth} ${svgHeight}`"
        :transform="`translate(${transform.x}, ${transform.y}) scale(${transform.k})`"
      >
        <defs>
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
          
          <!-- Address Highlight Markers -->
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
          
          <!-- Data Highlight Markers -->
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
          
          <!-- Control Highlight Markers (Red) -->
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

        <g v-for="connection in connections" :key="connection.id">
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
            @mouseenter="handleMouseEnterConnection(connection.id, $event)"
            @mouseleave="handleMouseLeaveConnection"
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
  gap: 8px;
}

.pipeline-container {
  flex: 1;
  min-height: 400px;
  overflow: hidden;
  position: relative;
  cursor: grab;
  background: #fafafa;
  border-radius: 8px;
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
  gap: 4px;
  pointer-events: none;
}

.module-data {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.connection-path {
  fill: none;
  stroke-width: 1;
  transition: stroke 0.3s ease, stroke-width 0.3s ease, opacity 0.3s ease;
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
  font-size: 9px;
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
  font-size: 11px;
  fill: var(--color-data-flow);
  font-weight: 700;
}

.active-label-control {
  font-size: 10px;
  fill: var(--color-control-flow);
  font-weight: 700;
}

.active-label-address {
  font-size: 10px;
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
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 13px;
  font-family: monospace;
  white-space: nowrap;
  z-index: 9999;
  transform: translate(-50%, -120%);
  pointer-events: none;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
}
</style>
