<script setup lang="ts">
import { computed } from 'vue';
import { usePanelStore, type PanelState } from '../stores/panel';
import { Cpu, Code, Activity, FlaskConical } from 'lucide-vue-next';

/**
 * 面板标签栏组件的 props 定义。
 *
 * @property {'left' | 'right'} position - 标签栏位置，决定从 store 读取哪一组面板
 */
const props = defineProps<{
  position: 'left' | 'right';
}>();

const panelStore = usePanelStore();

/**
 * 当前标签栏展示的面板列表：根据 position 从 store 中取出对应侧的标签集合。
 *
 * @returns {PanelState[]} 当前可见的标签数组
 */
const panels = computed(() => {
  return props.position === 'left'
    ? panelStore.leftPanels
    : panelStore.rightPanels;
});

/**
 * 图标名称到 Lucide 图标组件的映射表，用于在模板中动态渲染图标。
 */
const iconComponents: Record<string, any> = {
  cpu: Cpu,
  code: Code,
  activity: Activity,
  flask: FlaskConical
};

/**
 * 根据图标名称获取对应的图标组件，未匹配时回退到通用 Activity 图标。
 *
 * @param {string} iconName - 图标名称键
 * @returns {any} 对应的 Vue 图标组件
 */
function getIcon(iconName: string) {
  return iconComponents[iconName] || Activity;
}

/**
 * 处理标签点击：当前激活的标签再次点击会展开面板，未激活的标签则切换为激活态。
 *
 * @param {PanelState} panel - 被点击的标签对象
 * @returns {void}
 */
function handleTabClick(panel: PanelState) {
  if (panel.isActive) {
    // 已激活态下再次点击，进入展开/收起切换
    panelStore.expandPanel(panel.id);
  } else {
    // 未激活态点击，切换为激活
    panelStore.setActivePanel(panel.id);
  }
}

/**
 * 根据面板状态拼接标签按钮的 class，用于响应式样式切换。
 *
 * @param {PanelState} panel - 标签对象
 * @returns {Record<string, boolean>} class 名 -> 是否启用的映射
 */
function getTabClass(panel: PanelState) {
  return {
    'tab-item': true,
    'active': panel.isActive,
    'expanded': panel.isExpanded
  };
}
</script>

<template>
  <!-- 面板标签栏容器：根据 position 添加左侧或右侧边框样式 -->
  <div
    class="panel-tab-bar"
    :class="[`position-${position}`]"
  >
    <!-- 标签列表：纵向排列的按钮组 -->
    <div class="tab-list">
      <button
        v-for="panel in panels"
        :key="panel.id"
        :class="getTabClass(panel)"
        @click="handleTabClick(panel)"
        :title="panel.title"
      >
        <!-- 动态渲染图标组件，class 来自 store 中配置的 icon 字段 -->
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
