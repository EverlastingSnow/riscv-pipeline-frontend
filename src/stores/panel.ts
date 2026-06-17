/**
 * 面板状态管理（Pinia store）
 *
 * 负责管理左右侧面板的状态（激活、展开、顺序），并把状态持久化到
 * localStorage，刷新后能自动恢复上次布局。
 */
import { defineStore } from 'pinia';
import { shallowRef } from 'vue';

/**
 * 面板状态描述
 *
 * 描述单个可停靠面板的配置：位置、激活态、展开态、显示顺序与对应组件名。
 */
export interface PanelState {
  /** 面板唯一 ID（用于 localStorage 持久化与查找） */
  id: string;
  /** 面板标题（中文显示名） */
  title: string;
  /** 图标名（Lucide 图标 key） */
  icon: string;
  /** 面板所在侧：左或右 */
  position: 'left' | 'right';
  /** 是否为当前激活面板（同一侧只有一个激活） */
  isActive: boolean;
  /** 是否展开内容区 */
  isExpanded: boolean;
  /** 面板在同侧的排序序号（数字越小越靠前） */
  order: number;
  /** 渲染的组件名（用于动态 <component :is="...">） */
  componentName: string;
}

// localStorage 持久化键名，统一管理避免散落字符串
const STORAGE_KEY = 'panel-system-state';

/**
 * 合并已保存面板与默认面板：保留用户已保存的面板，补充新增的默认面板。
 *
 * @param saved 从 localStorage 反序列化得到的左右面板列表
 * @returns 合并后的左右面板列表
 */
function mergeWithDefaults(saved: { leftPanels: PanelState[]; rightPanels: PanelState[] }): { leftPanels: PanelState[]; rightPanels: PanelState[] } {
  /**
   * 补齐某侧缺失的面板：以默认面板为基线，把已保存中不存在的默认项追加到尾部。
   */
  const addMissingPanels = (savedPanels: PanelState[], defaultPanels: PanelState[]): PanelState[] => {
    // 用 Set 加速 ID 查找
    const savedIds = new Set(savedPanels.map(p => p.id));
    // 过滤出已保存中不存在的默认项
    const missingPanels = defaultPanels.filter(p => !savedIds.has(p.id));
    // 拼接：已保存优先，补齐项追加在尾部
    return [...savedPanels, ...missingPanels];
  };

  return {
    leftPanels: addMissingPanels(saved.leftPanels, defaultPanels.leftPanels),
    rightPanels: addMissingPanels(saved.rightPanels, defaultPanels.rightPanels)
  };
}

/**
 * 从 localStorage 读取持久化的面板状态。读取失败或不存在时返回 null。
 *
 * @returns 解析后的左右面板列表，若无数据或解析异常则返回 null
 */
function loadFromStorage(): { leftPanels: PanelState[]; rightPanels: PanelState[] } | null {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      // 合并默认面板，确保新增面板即使旧用户也能看到
      return mergeWithDefaults(parsed);
    }
  } catch (error) {
    // localStorage 可能因为隐私模式或反序列化错误读取失败，兜底走默认配置
    console.warn('Failed to load panel state from storage:', error);
  }
  return null;
}

/**
 * 将面板状态写入 localStorage。写入失败仅打印告警，不影响运行时。
 *
 * @param state 待持久化的左右面板列表
 */
function saveToStorage(state: { leftPanels: PanelState[]; rightPanels: PanelState[] }) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    // 配额超限或隐私模式时静默失败，不阻塞 UI
    console.warn('Failed to save panel state to storage:', error);
  }
}

/**
 * 默认面板配置：首次访问或 localStorage 无数据时使用。
 */
const defaultPanels: { leftPanels: PanelState[]; rightPanels: PanelState[] } = {
  leftPanels: [
    {
      id: 'left-pipeline-info',
      title: '流水线信息',
      icon: 'cpu',
      position: 'left',
      isActive: true,
      isExpanded: true,
      order: 0,
      componentName: 'CompactPipelineInfo'
    },
    {
      id: 'left-difftest',
      title: '差分测试',
      icon: 'flask',
      position: 'left',
      isActive: false,
      isExpanded: false,
      order: 1,
      componentName: 'DifftestPanel'
    }
  ],
  rightPanels: [
    {
      id: 'right-code-editor',
      title: '代码编辑器',
      icon: 'code',
      position: 'right',
      isActive: true,
      isExpanded: true,
      order: 0,
      componentName: 'CompactCodeEditor'
    },
    {
      id: 'right-cpu-status',
      title: 'CPU 状态信息',
      icon: 'activity',
      position: 'right',
      isActive: false,
      isExpanded: false,
      order: 1,
      componentName: 'InfoPanel'
    },
    {
      id: 'right-interrupt-demo',
      title: '中断与异常演示',
      icon: 'zap',
      position: 'right',
      isActive: false,
      isExpanded: false,
      order: 2,
      componentName: 'InterruptDemoPanel'
    }
  ]
};

/**
 * 面板状态 Pinia store。
 *
 * 通过 shallowRef 包装数组，避免深响应式带来的不必要性能开销
 * （面板列表变化时整体替换而非深 diff）。
 */
export const usePanelStore = defineStore('panel', () => {
  // 启动时尝试恢复已保存的面板状态
  const savedState = loadFromStorage();

  // 使用 shallowRef：避免数组内部对象被深响应化（每次替换整个数组即可触发更新）
  const leftPanels = shallowRef<PanelState[]>(savedState?.leftPanels || defaultPanels.leftPanels);
  const rightPanels = shallowRef<PanelState[]>(savedState?.rightPanels || defaultPanels.rightPanels);

  /**
   * 持久化当前左右面板状态到 localStorage。
   * 在每次面板状态变化后调用，确保刷新后能恢复。
   */
  function persistState() {
    saveToStorage({
      leftPanels: leftPanels.value,
      rightPanels: rightPanels.value
    });
  }

  /**
   * 设置指定面板为同侧的唯一激活面板，并自动展开它。
   * 若同侧其他面板原本处于激活态会被取消激活。
   *
   * @param panelId 目标面板 ID
   */
  function setActivePanel(panelId: string) {
    // 工具函数：把指定 ID 的面板设为激活并展开，其余保留原状
    const updatePanels = (panels: PanelState[]) => {
      return panels.map(p => ({
        ...p,
        // 仅匹配 ID 的面板激活
        isActive: p.id === panelId,
        // 激活时强制展开，方便用户立刻看到内容
        isExpanded: p.id === panelId ? true : p.isExpanded
      }));
    };

    // 先查左侧，未命中再查右侧，避免一次扫描双侧
    const leftIndex = leftPanels.value.findIndex(p => p.id === panelId);
    if (leftIndex !== -1) {
      leftPanels.value = updatePanels(leftPanels.value);
      persistState();
      return;
    }

    const rightIndex = rightPanels.value.findIndex(p => p.id === panelId);
    if (rightIndex !== -1) {
      rightPanels.value = updatePanels(rightPanels.value);
      persistState();
    }
  }

  /**
   * 强制展开指定面板（不影响激活态）。
   *
   * @param panelId 目标面板 ID
   */
  function expandPanel(panelId: string) {
    const updatePanels = (panels: PanelState[]) => {
      return panels.map(p =>
        p.id === panelId ? { ...p, isExpanded: true } : p
      );
    };

    const leftIndex = leftPanels.value.findIndex(p => p.id === panelId);
    if (leftIndex !== -1) {
      leftPanels.value = updatePanels(leftPanels.value);
      persistState();
      return;
    }

    const rightIndex = rightPanels.value.findIndex(p => p.id === panelId);
    if (rightIndex !== -1) {
      rightPanels.value = updatePanels(rightPanels.value);
      persistState();
    }
  }

  /**
   * 切换指定面板的展开 / 收起状态。
   *
   * @param panelId 目标面板 ID
   */
  function togglePanel(panelId: string) {
    const updatePanels = (panels: PanelState[]) => {
      return panels.map(p => {
        if (p.id === panelId) {
          // 命中目标：取反 isExpanded
          return { ...p, isExpanded: !p.isExpanded };
        }
        return p;
      });
    };

    const leftIndex = leftPanels.value.findIndex(p => p.id === panelId);
    if (leftIndex !== -1) {
      leftPanels.value = updatePanels(leftPanels.value);
      persistState();
      return;
    }

    const rightIndex = rightPanels.value.findIndex(p => p.id === panelId);
    if (rightIndex !== -1) {
      rightPanels.value = updatePanels(rightPanels.value);
      persistState();
    }
  }

  /**
   * 直接设置指定面板的展开状态为给定值。
   *
   * @param panelId 目标面板 ID
   * @param expanded true=展开，false=收起
   */
  function setPanelExpanded(panelId: string, expanded: boolean) {
    const updatePanels = (panels: PanelState[]) => {
      return panels.map(p =>
        p.id === panelId ? { ...p, isExpanded: expanded } : p
      );
    };

    const leftIndex = leftPanels.value.findIndex(p => p.id === panelId);
    if (leftIndex !== -1) {
      leftPanels.value = updatePanels(leftPanels.value);
      persistState();
      return;
    }

    const rightIndex = rightPanels.value.findIndex(p => p.id === panelId);
    if (rightIndex !== -1) {
      rightPanels.value = updatePanels(rightPanels.value);
      persistState();
    }
  }

  return {
    leftPanels,
    rightPanels,
    setActivePanel,
    expandPanel,
    togglePanel,
    setPanelExpanded
  };
});
