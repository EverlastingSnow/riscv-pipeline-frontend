<script setup lang="ts">
import { ref } from 'vue';
import { onMounted, onUnmounted } from 'vue';
import PipelineEditor from './components/PipelineEditor.vue';
import ControlPanel from './components/ControlPanel.vue';
import RegisterModal from './components/RegisterModal.vue';
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

const pipelineStore = usePipelineStore();

const isLeftPanelCollapsed = ref(false);
const isRightPanelCollapsed = ref(false);

const handleResize = () => {
};

onMounted(() => {
  window.addEventListener('resize', handleResize);
});

onUnmounted(() => {
  window.removeEventListener('resize', handleResize);
});
</script>

<template>
  <div class="app">
    <!-- 主内容区域 -->
    <div class="main-row">
      <!-- 左侧面板区域 -->
      <div class="left-panel-area" :class="{ collapsed: isLeftPanelCollapsed }">
        <button
          class="collapse-panel-btn left"
          @click="isLeftPanelCollapsed = !isLeftPanelCollapsed"
          :title="isLeftPanelCollapsed ? '展开左侧面板' : '收起左侧面板'"
        >
          <ChevronLeft v-if="!isLeftPanelCollapsed" class="collapse-icon" />
          <ChevronRight v-else class="collapse-icon" />
        </button>
        <div v-show="!isLeftPanelCollapsed" class="panel-content">
          <PanelContainer position="left" />
        </div>
      </div>
      
      <!-- 中央区域 -->
      <div class="center-column">
        <!-- 顶部控制面板 -->
        <ControlPanel />
        
        <!-- 流水线可视化 -->
        <div class="pipeline-section">
          <PipelineEditor />
        </div>
      </div>
      
      <!-- 右侧面板区域 -->
      <div class="right-panel-area" :class="{ collapsed: isRightPanelCollapsed }">
        <button
          class="collapse-panel-btn right"
          @click="isRightPanelCollapsed = !isRightPanelCollapsed"
          :title="isRightPanelCollapsed ? '展开右侧面板' : '收起右侧面板'"
        >
          <ChevronRight v-if="!isRightPanelCollapsed" class="collapse-icon" />
          <ChevronLeft v-else class="collapse-icon" />
        </button>
        <div v-show="!isRightPanelCollapsed" class="panel-content">
          <PanelContainer position="right" />
        </div>
      </div>
    </div>
    
    <!-- 底部统计栏 -->
    <div class="bottom-stats-bar">
      <UsageStats />
    </div>
    
    <!-- 弹窗组件 -->
    <RegisterModal />
    <AluModal />
    <ControlSignalsModal />
    <DiffResultModal />
    <DifftestInputModal />
    <HaltedModal />
    
    <!-- Pipeline Register 弹窗 -->
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
