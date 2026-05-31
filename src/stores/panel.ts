import { defineStore } from 'pinia';
import { shallowRef } from 'vue';

export interface PanelState {
  id: string;
  title: string;
  icon: string;
  position: 'left' | 'right';
  isActive: boolean;
  isExpanded: boolean;
  order: number;
  componentName: string;
}

const STORAGE_KEY = 'panel-system-state';

function mergeWithDefaults(saved: { leftPanels: PanelState[]; rightPanels: PanelState[] }): { leftPanels: PanelState[]; rightPanels: PanelState[] } {
  const addMissingPanels = (savedPanels: PanelState[], defaultPanels: PanelState[]): PanelState[] => {
    const savedIds = new Set(savedPanels.map(p => p.id));
    const missingPanels = defaultPanels.filter(p => !savedIds.has(p.id));
    return [...savedPanels, ...missingPanels];
  };

  return {
    leftPanels: addMissingPanels(saved.leftPanels, defaultPanels.leftPanels),
    rightPanels: addMissingPanels(saved.rightPanels, defaultPanels.rightPanels)
  };
}

function loadFromStorage(): { leftPanels: PanelState[]; rightPanels: PanelState[] } | null {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return mergeWithDefaults(parsed);
    }
  } catch (error) {
    console.warn('Failed to load panel state from storage:', error);
  }
  return null;
}

function saveToStorage(state: { leftPanels: PanelState[]; rightPanels: PanelState[] }) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn('Failed to save panel state to storage:', error);
  }
}

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
    }
  ]
};

export const usePanelStore = defineStore('panel', () => {
  const savedState = loadFromStorage();

  const leftPanels = shallowRef<PanelState[]>(savedState?.leftPanels || defaultPanels.leftPanels);
  const rightPanels = shallowRef<PanelState[]>(savedState?.rightPanels || defaultPanels.rightPanels);

  function persistState() {
    saveToStorage({
      leftPanels: leftPanels.value,
      rightPanels: rightPanels.value
    });
  }

  function setActivePanel(panelId: string) {
    const updatePanels = (panels: PanelState[]) => {
      return panels.map(p => ({
        ...p,
        isActive: p.id === panelId,
        isExpanded: p.id === panelId ? true : p.isExpanded
      }));
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

  function togglePanel(panelId: string) {
    const updatePanels = (panels: PanelState[]) => {
      return panels.map(p => {
        if (p.id === panelId) {
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
