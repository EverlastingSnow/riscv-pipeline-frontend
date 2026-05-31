<script setup lang="ts">
import { computed } from 'vue';
import { usePanelStore } from '../stores/panel';
import PanelTabBar from './PanelTabBar.vue';
import DockingPanel from './DockingPanel.vue';
import CompactPipelineInfo from './CompactPipelineInfo.vue';
import CompactCodeEditor from './CompactCodeEditor.vue';
import InfoPanel from './InfoPanel.vue';
import DifftestPanel from './DifftestPanel.vue';

const props = defineProps<{
  position: 'left' | 'right';
}>();

const panelStore = usePanelStore();

const panels = computed(() => {
  return props.position === 'left'
    ? panelStore.leftPanels
    : panelStore.rightPanels;
});

const componentMap: Record<string, any> = {
  'CompactPipelineInfo': CompactPipelineInfo,
  'CompactCodeEditor': CompactCodeEditor,
  'InfoPanel': InfoPanel,
  'DifftestPanel': DifftestPanel
};

function getComponent(componentName: string) {
  return componentMap[componentName] || null;
}
</script>

<template>
  <div
    class="panel-container"
    :class="[`position-${position}`]"
  >
    <PanelTabBar :position="position" />

    <div class="panels-area">
      <TransitionGroup name="panel-slide">
        <DockingPanel
          v-for="panel in panels"
          v-show="panel.isActive"
          :key="panel.id"
          :panel="panel"
        >
          <component
            v-if="getComponent(panel.componentName)"
            :is="getComponent(panel.componentName)"
          />
          <div v-else class="no-component">
            <p>组件 "{{ panel.componentName }}" 未找到</p>
          </div>
        </DockingPanel>
      </TransitionGroup>
    </div>
  </div>
</template>

<style scoped>
.panel-container {
  display: flex;
  flex-direction: column;
  background-color: #f1f5f9;
  height: 100%;
  overflow: hidden;
}

.position-left {
  border-right: 1px solid #e2e8f0;
}

.position-right {
  border-left: 1px solid #e2e8f0;
}

.panels-area {
  flex: 1;
  overflow: hidden;
  padding: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.no-component {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #ef4444;
  font-size: 0.875rem;
}

.panel-slide-enter-active,
.panel-slide-leave-active {
  transition: all 0.3s ease;
}

.panel-slide-enter-from,
.panel-slide-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

@media (max-width: 992px) {
  .panel-container {
    flex-direction: column;
    height: auto;
    min-height: 0;
  }

  .position-left,
  .position-right {
    border: none;
    width: 100%;
    max-width: none;
    height: auto;
    min-height: 0;
  }

  .panels-area {
    flex: 1;
    padding: 0.5rem;
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
  }
}
</style>
