<script setup lang="ts">
import { computed, defineAsyncComponent } from 'vue';
import { usePanelStore } from '../stores/panel';
import PanelTabBar from './PanelTabBar.vue';
import DockingPanel from './DockingPanel.vue';
import CompactPipelineInfo from './CompactPipelineInfo.vue';
import CompactCodeEditor from './CompactCodeEditor.vue';
import InfoPanel from './InfoPanel.vue';
import DifftestPanel from './DifftestPanel.vue';

/**
 * 组件 Props 定义
 * @property {'left' | 'right'} position 面板容器所处的位置，决定渲染左侧还是右侧面板组
 */
const props = defineProps<{
  position: 'left' | 'right';
}>();

const panelStore = usePanelStore();

/**
 * 当前显示的面板列表
 * 根据 position props 选择左侧或右侧面板数组
 */
const panels = computed(() => {
  // 根据面板位置（左侧/右侧）从 store 中获取对应的面板集合
  return props.position === 'left'
    ? panelStore.leftPanels
    : panelStore.rightPanels;
});

/**
 * 组件名称到组件实例的映射表
 * 用于通过字符串名称动态解析出实际的 Vue 组件
 */
const componentMap: Record<string, any> = {
  'CompactPipelineInfo': CompactPipelineInfo,
  'CompactCodeEditor': CompactCodeEditor,
  'InfoPanel': InfoPanel,
  'DifftestPanel': DifftestPanel,
  // 中断演示面板使用异步加载，避免打包时全部引入，提升首屏性能
  'InterruptDemoPanel': defineAsyncComponent(() => import('./InterruptDemoPanel.vue'))
};

/**
 * 根据组件名称获取对应的 Vue 组件实例
 * @param {string} componentName 面板配置中的组件名称
 * @returns {any} 对应的组件定义，未找到时返回 null
 */
function getComponent(componentName: string) {
  return componentMap[componentName] || null;
}
</script>

<template>
  <!-- 面板容器根元素：根据 position 应用左右样式类 -->
  <div
    class="panel-container"
    :class="[`position-${position}`]"
  >
    <!-- 面板标签栏：展示可切换的标签页 -->
    <PanelTabBar :position="position" />

    <!-- 面板内容区域：使用 TransitionGroup 实现切换动画 -->
    <div class="panels-area">
      <TransitionGroup name="panel-slide">
        <!-- 遍历所有面板，停靠外壳负责展开/收起，业务组件通过动态 component 渲染 -->
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
          <!-- 组件未找到时的占位提示 -->
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
  transform: translateY(-0.625rem);
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
