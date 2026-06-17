<script setup lang="ts">
import { ref } from 'vue';
import { onMounted, onUnmounted } from 'vue';
import PipelineEditor from './components/PipelineEditor.vue';
import WaveformPanel from './components/WaveformPanel.vue';
import ControlPanel from './components/ControlPanel.vue';
import RegisterModal from './components/RegisterModal.vue';
import CsrModal from './components/CsrModal.vue';
import AluModal from './components/AluModal.vue';
import ControlSignalsModal from './components/ControlSignalsModal.vue';
import DiffResultModal from './components/DiffResultModal.vue';
import DifftestInputModal from './components/DifftestInputModal.vue';
import HaltedModal from './components/HaltedModal.vue';
import PipelineRegisterModal from './components/PipelineRegisterModal.vue';
import UsageStats from './components/UsageStats.vue';
import PanelContainer from './components/PanelContainer.vue';
import { ChevronLeft, ChevronRight } from 'lucide-vue-next';
import { usePipelineStore } from './stores/pipeline';

/** 全局流水线状态实例，供子组件共享数据 */
const pipelineStore = usePipelineStore();

/** 左侧面板是否处于折叠态（仅保留折叠按钮，隐藏内容） */
const isLeftPanelCollapsed = ref(false);
/** 右侧面板是否处于折叠态 */
const isRightPanelCollapsed = ref(false);

/**
 * 窗口尺寸变化时的回调（占位实现）
 * 当前未承载具体逻辑，保留为扩展点
 *
 * @returns {void}
 */
const handleResize = () => {
};

/**
 * 组件挂载：注册窗口 resize 事件监听
 * 卸载时对应移除，避免内存泄漏
 */
onMounted(() => {
  window.addEventListener('resize', handleResize);
});

/**
 * 组件卸载：移除窗口 resize 事件监听
 */
onUnmounted(() => {
  window.removeEventListener('resize', handleResize);
});
</script>

<template>
  <div class="app">
    <!-- 主内容区域：左中右三栏布局 -->
    <div class="main-row">
      <!-- 左侧面板区域：含折叠按钮与可折叠内容 -->
      <div class="left-panel-area" :class="{ collapsed: isLeftPanelCollapsed }">
        <!-- 左侧面板折叠/展开按钮：根据状态切换箭头方向 -->
        <button
          class="collapse-panel-btn left"
          @click="isLeftPanelCollapsed = !isLeftPanelCollapsed"
          :title="isLeftPanelCollapsed ? '展开左侧面板' : '收起左侧面板'"
        >
          <ChevronLeft v-if="!isLeftPanelCollapsed" class="collapse-icon" />
          <ChevronRight v-else class="collapse-icon" />
        </button>
        <!-- 左侧面板内容（折叠时通过 v-show 隐藏，保留 DOM） -->
        <div v-show="!isLeftPanelCollapsed" class="panel-content">
          <PanelContainer position="left" />
        </div>
      </div>

      <!-- 中央区域：控制面板 + 流水线/波形可视化 -->
      <div class="center-column">
        <!-- 顶部控制面板 -->
        <ControlPanel />

        <!-- 流水线可视化 / 波形图（互斥占位，根据 centerView 切换） -->
        <div class="pipeline-section">
          <PipelineEditor v-if="pipelineStore.centerView === 'pipeline'" />
          <WaveformPanel v-else />
        </div>
      </div>

      <!-- 右侧面板区域：与左侧对称 -->
      <div class="right-panel-area" :class="{ collapsed: isRightPanelCollapsed }">
        <!-- 右侧面板折叠/展开按钮 -->
        <button
          class="collapse-panel-btn right"
          @click="isRightPanelCollapsed = !isRightPanelCollapsed"
          :title="isRightPanelCollapsed ? '展开右侧面板' : '收起右侧面板'"
        >
          <ChevronRight v-if="!isRightPanelCollapsed" class="collapse-icon" />
          <ChevronLeft v-else class="collapse-icon" />
        </button>
        <!-- 右侧面板内容 -->
        <div v-show="!isRightPanelCollapsed" class="panel-content">
          <PanelContainer position="right" />
        </div>
      </div>
    </div>

    <!-- 底部统计栏：使用时长、访问次数等 -->
    <div class="bottom-stats-bar">
      <UsageStats />
    </div>

    <!-- 弹窗组件：仅由 store 内部控制显隐，模板中始终挂载 -->
    <RegisterModal />
    <CsrModal />
    <AluModal />
    <ControlSignalsModal />
    <DiffResultModal />
    <DifftestInputModal />
    <HaltedModal />

    <!-- 流水线寄存器详情弹窗：仅在选中具体寄存器时挂载以传递 ID -->
    <PipelineRegisterModal
      v-if="pipelineStore.selectedPipelineRegister"
      :registerId="pipelineStore.selectedPipelineRegister.id"
      @close="pipelineStore.closeModal()"
    />
  </div>
</template>

<style scoped>
.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
}

.main-row {
  display: flex;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.left-panel-area {
  width: 20rem;
  min-width: 18rem;
  max-width: 26rem;
  background-color: #f1f5f9;
  border-right: 1px solid #e2e8f0;
  overflow: hidden;
  flex-shrink: 0;
  position: relative;
  transition: width 0.3s ease, min-width 0.3s ease, max-width 0.3s ease;
}

.left-panel-area.collapsed {
  width: 3.5rem;
  min-width: 3.5rem;
  max-width: 3.5rem;
}

.left-panel-area .collapse-panel-btn {
  position: absolute;
  top: 50%;
  right: 0.5rem;
  transform: translateY(-50%);
  z-index: 30;
  width: 2rem;
  height: 4rem;
  background: #ffffff;
  border: 2px solid #e2e8f0;
  border-radius: 0.5rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #64748b;
  transition: all 0.2s ease;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.left-panel-area .collapse-panel-btn:hover {
  background: #f1f5f9;
  color: #3b82f6;
  border-color: #3b82f6;
}

.left-panel-area .collapse-icon {
  width: 1.5rem;
  height: 1.5rem;
}

.left-panel-area .panel-content {
  height: 100%;
  overflow: hidden;
}

.center-column {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  overflow: hidden;
}

.bottom-stats-bar {
  flex-shrink: 0;
  padding: 0rem 1rem;
  background-color: #f9fafb;
  border-top: 1px solid #e5e7eb;
  height: 4rem;
}

.pipeline-section {
  flex: 1;
  padding: 1rem;
  overflow: hidden;
  background: #F8FAFC;
  position: relative;
  display: flex;
  flex-direction: column;
}

.pipeline-section :deep(.pipeline-container) {
  flex: 1;
  min-height: 0;
}

.right-panel-area {
  width: 22rem;
  min-width: 20rem;
  max-width: 30rem;
  background-color: #f1f5f9;
  border-left: 1px solid #e2e8f0;
  overflow: hidden;
  flex-shrink: 0;
  position: relative;
  transition: width 0.3s ease, min-width 0.3s ease, max-width 0.3s ease;
}

.right-panel-area.collapsed {
  width: 3.5rem;
  min-width: 3.5rem;
  max-width: 3.5rem;
}

.right-panel-area .collapse-panel-btn {
  position: absolute;
  top: 50%;
  left: 0.5rem;
  transform: translateY(-50%);
  z-index: 30;
  width: 2rem;
  height: 4rem;
  background: #ffffff;
  border: 2px solid #e2e8f0;
  border-radius: 0.5rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #64748b;
  transition: all 0.2s ease;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.right-panel-area .collapse-panel-btn:hover {
  background: #f1f5f9;
  color: #3b82f6;
  border-color: #3b82f6;
}

.right-panel-area .collapse-icon {
  width: 1.5rem;
  height: 1.5rem;
}

.right-panel-area .panel-content {
  height: 100%;
  overflow: hidden;
}

/* 响应式设计 */
@media (max-width: 1400px) {
  .left-panel-area {
    width: 18rem;
    min-width: 16rem;
  }
  
  .right-panel-area {
    width: 20rem;
    min-width: 18rem;
  }
}

@media (max-width: 1200px) {
  .left-panel-area {
    width: 16rem;
    min-width: 14rem;
  }
  
  .right-panel-area {
    width: 18rem;
    min-width: 16rem;
  }
}

@media (max-width: 992px) {
  .app {
    flex-direction: column;
    height: auto;
    min-height: 100vh;
    overflow-y: auto;
    overflow-x: hidden;
  }

  .main-row {
    flex-direction: column;
    flex: none;
    overflow: visible;
    min-height: 0;
    padding-bottom: 0;
  }

  .left-panel-area {
    width: 100%;
    max-width: none;
    height: auto;
    min-height: 0;
    max-height: none;
    border-right: none;
    border-bottom: 1px solid #e2e8f0;
    border-top: 1px solid #e2e8f0;
    flex-shrink: 0;
    order: 1;
  }

  .left-panel-area.collapsed {
    width: 100%;
    max-width: none;
    min-height: 3rem;
    max-height: none;
  }

  .left-panel-area .collapse-panel-btn {
    display: none;
  }

  .left-panel-area .panel-content {
    height: auto;
    max-height: none;
    overflow-y: visible;
  }

  .center-column {
    flex: none;
    min-height: 0;
    overflow: visible;
    display: flex;
    flex-direction: column;
    order: 2;
  }

  .right-panel-area {
    width: 100%;
    max-width: none;
    height: auto;
    min-height: 0;
    max-height: none;
    border-left: none;
    border-top: 1px solid #e2e8f0;
    flex-shrink: 0;
    order: 3;
    padding-bottom: 0;
  }

  .right-panel-area.collapsed {
    width: 100%;
    max-width: none;
    min-height: 3rem;
    max-height: none;
  }

  .right-panel-area .collapse-panel-btn {
    display: none;
  }

  .right-panel-area .panel-content {
    height: auto;
    max-height: none;
    overflow-y: visible;
    padding-bottom: 0;
  }

  .pipeline-section {
    flex: none;
    min-height: 20rem;
    height: auto;
    overflow: visible;
    display: flex;
    flex-direction: column;
  }

  .pipeline-section :deep(.pipeline-container) {
    flex: none;
    min-height: 20rem;
    height: 25rem;
  }

  .bottom-stats-bar {
    position: static;
    width: 100%;
    height: auto;
    min-height: 3.5rem;
    padding: 0.75rem 1rem;
    box-shadow: none;
    border-top: 1px solid #e5e7eb;
    order: 4;
  }
}

@media (max-width: 768px) {
  .pipeline-section {
    padding: 0.5rem;
    min-height: 15rem;
  }
  
  .left-panel-area,
  .right-panel-area {
    min-height: 0;
    max-height: none;
  }

  .left-panel-area .panel-content,
  .right-panel-area .panel-content {
    max-height: none;
    padding-bottom: 0;
  }

  .bottom-stats-bar {
    min-height: 3rem;
    padding: 0.5rem 0.75rem;
  }
}

@media (max-width: 576px) {
  .pipeline-section {
    padding: 0.25rem;
    min-height: 12rem;
  }
  
  .left-panel-area,
  .right-panel-area {
    min-height: 0;
    max-height: none;
  }

  .left-panel-area .panel-content,
  .right-panel-area .panel-content {
    max-height: none;
    padding-bottom: 0;
  }

  .bottom-stats-bar {
    min-height: 2.5rem;
    padding: 0.375rem 0.5rem;
  }

  .main-row {
    padding-bottom: 0;
  }
}
</style>
