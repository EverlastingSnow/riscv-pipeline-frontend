<script setup lang="ts">
import type { PanelState } from '../stores/panel';

/**
 * 组件 Props 定义
 * @property {PanelState} panel 当前停靠面板的状态对象，包含 id、componentName、isActive、isExpanded 等字段
 */
const props = defineProps<{
  panel: PanelState;
}>();
</script>

<template>
  <!-- 停靠面板外壳：根据 isExpanded 控制内容显示 -->
  <div class="docking-panel-container">
    <!-- 面板内容区域：仅在展开时显示 -->
    <div v-show="panel.isExpanded" class="panel-content">
      <slot></slot>
    </div>
  </div>
</template>

<style scoped>
.docking-panel-container {
  background-color: white;
  border-radius: 0.5rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  transition: all 0.3s ease;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  flex: 1;
}

.panel-content {
  flex: 1;
  overflow: auto;
  padding: 1rem;
  min-height: 0;
}

@media (max-width: 992px) {
  .docking-panel-container {
    border-radius: 0.375rem;
  }

  .panel-content {
    padding: 0.75rem;
  }
}
</style>
