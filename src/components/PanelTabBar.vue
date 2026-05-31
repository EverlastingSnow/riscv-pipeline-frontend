<script setup lang="ts">
import { computed } from 'vue';
import { usePanelStore, type PanelState } from '../stores/panel';
import { Cpu, Code, Activity, FlaskConical } from 'lucide-vue-next';

const props = defineProps<{
  position: 'left' | 'right';
}>();

const panelStore = usePanelStore();

const panels = computed(() => {
  return props.position === 'left'
    ? panelStore.leftPanels
    : panelStore.rightPanels;
});

const iconComponents: Record<string, any> = {
  cpu: Cpu,
  code: Code,
  activity: Activity,
  flask: FlaskConical
};

function getIcon(iconName: string) {
  return iconComponents[iconName] || Activity;
}

function handleTabClick(panel: PanelState) {
  if (panel.isActive) {
    panelStore.expandPanel(panel.id);
  } else {
    panelStore.setActivePanel(panel.id);
  }
}

function getTabClass(panel: PanelState) {
  return {
    'tab-item': true,
    'active': panel.isActive,
    'expanded': panel.isExpanded
  };
}
</script>

<template>
  <div
    class="panel-tab-bar"
    :class="[`position-${position}`]"
  >
    <div class="tab-list">
      <button
        v-for="panel in panels"
        :key="panel.id"
        :class="getTabClass(panel)"
        @click="handleTabClick(panel)"
        :title="panel.title"
      >
        <component :is="getIcon(panel.icon)" class="tab-icon" />
        <span class="tab-title">{{ panel.title }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.panel-tab-bar {
  display: flex;
  flex-direction: column;
  background-color: #f1f5f9;
}

.position-left {
  border-right: 1px solid #e2e8f0;
}

.position-right {
  border-left: 1px solid #e2e8f0;
}

.tab-list {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.5rem;
}

.tab-item {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  padding: 0.75rem 0.875rem;
  border: none;
  background-color: transparent;
  border-radius: 0.5rem;
  cursor: pointer;
  transition: all 0.15s ease;
  color: #64748b;
  font-size: 0.875rem;
  text-align: left;
  width: 100%;
  min-width: 10rem;
  font-weight: 500;
  border-left: 3px solid transparent;
}

.tab-item:hover {
  background-color: rgba(59, 130, 246, 0.08);
  color: #3b82f6;
}

.tab-item.active {
  background-color: #ffffff;
  color: #2563eb;
  font-weight: 600;
  border-left-color: #3b82f6;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

.tab-icon {
  width: 1.125rem;
  height: 1.125rem;
  flex-shrink: 0;
}

.tab-title {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 992px) {
  .panel-tab-bar {
    flex-direction: row;
    border-bottom: 1px solid #e2e8f0;
    border-left: none;
    border-right: none;
    flex-shrink: 0;
    min-height: 3rem;
  }

  .position-left,
  .position-right {
    border: none;
  }

  .tab-list {
    flex-direction: row;
    gap: 0.375rem;
    padding: 0.375rem 0.5rem;
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: thin;
  }

  .tab-item {
    min-width: auto;
    padding: 0.375rem 0.75rem;
    white-space: nowrap;
    border-left: none;
    border-bottom: 3px solid transparent;
    border-radius: 0.375rem;
    background: #f1f5f9;
    font-size: 0.75rem;
  }

  .tab-item:hover {
    background: #e2e8f0;
  }

  .tab-item.active {
    background: #3b82f6;
    color: white;
    font-weight: 600;
    border-bottom-color: #3b82f6;
  }

  .tab-icon {
    width: 1rem;
    height: 1rem;
  }

  .tab-title {
    max-width: 6rem;
    font-size: 0.75rem;
  }
}
</style>
