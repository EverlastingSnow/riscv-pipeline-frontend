<script setup lang="ts">
import { ref, computed } from 'vue';
import { onMounted, onUnmounted } from 'vue';
import PipelineEditor from './components/PipelineEditor.vue';
import ControlPanel from './components/ControlPanel.vue';
import InfoPanel from './components/InfoPanel.vue';
import RegisterModal from './components/RegisterModal.vue';
import AluModal from './components/AluModal.vue';
import ControlSignalsModal from './components/ControlSignalsModal.vue';
import DiffConfigModal from './components/DiffConfigModal.vue';
import DiffResultModal from './components/DiffResultModal.vue';
import DifftestInputModal from './components/DifftestInputModal.vue';
import HaltedModal from './components/HaltedModal.vue';
import PipelineRegisterModal from './components/PipelineRegisterModal.vue';
import CompactPipelineInfo from './components/CompactPipelineInfo.vue';
import UsageStats from './components/UsageStats.vue';
import CompactCodeEditor from './components/CompactCodeEditor.vue';
import { usePipelineStore } from './stores/pipeline';
import { ChevronRight, ChevronLeft } from 'lucide-vue-next';

const pipelineStore = usePipelineStore();

const isInfoPanelCollapsed = ref(false);
const showDiffConfig = ref(false);
const isCodeEditorExpanded = ref(true);
const compactInfoRef = ref<any>(null);

// Pipeline Register 弹窗状态
const showIfIdRegister = computed(() => pipelineStore.activeModals.includes('pipelineRegister_if_id'));
const showIdExRegister = computed(() => pipelineStore.activeModals.includes('pipelineRegister_id_ex'));
const showExMemRegister = computed(() => pipelineStore.activeModals.includes('pipelineRegister_ex_mem'));
const showMemWbRegister = computed(() => pipelineStore.activeModals.includes('pipelineRegister_mem_wb'));

const handleResize = () => {
};

const toggleInfoPanel = () => {
  isInfoPanelCollapsed.value = !isInfoPanelCollapsed.value;
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
      <!-- 左侧栏 -->
      <div class="left-column">
        <!-- 顶部控制面板 -->
        <ControlPanel @openDiffConfig="showDiffConfig = true" />
        
        <!-- 流水线可视化 -->
        <div class="pipeline-section">
          <PipelineEditor />
          <div class="pipeline-floating-info" :class="{ collapsed: compactInfoRef?.isExpanded === false }">
            <CompactPipelineInfo ref="compactInfoRef" />
          </div>
          
          <!-- 独立的代码编辑器 - 右下角位置 -->
          <div 
            class="code-editor-panel" 
            :class="{ 
              'shift-left': !isInfoPanelCollapsed,
              'collapsed': !isCodeEditorExpanded 
            }"
          >
            <CompactCodeEditor :expanded="isCodeEditorExpanded" @expand-change="isCodeEditorExpanded = $event" />
          </div>
        </div>
      </div>
      
      <!-- 右侧信息面板 -->
      <div class="info-section" :class="{ 'collapsed': isInfoPanelCollapsed }">
        <button 
          class="collapse-btn" 
          @click="toggleInfoPanel"
          :title="isInfoPanelCollapsed ? '展开' : '收起'"
        >
          <ChevronRight v-if="isInfoPanelCollapsed" class="w-5 h-5" />
          <ChevronLeft v-else class="w-5 h-5" />
        </button>
        <div v-show="!isInfoPanelCollapsed" class="info-panel-content">
          <InfoPanel />
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
    <DiffConfigModal 
      v-if="showDiffConfig" 
      @close="showDiffConfig = false" 
    />
    <DiffResultModal />
    <DifftestInputModal />
    <HaltedModal @close="pipelineStore.closeModal()" />
    
    <!-- Pipeline Register 弹窗 - 每个寄存器独立的实例 -->
    <PipelineRegisterModal 
      v-if="showIfIdRegister"
      register-id="if_id"
      @close="pipelineStore.closeModal('pipelineRegister_if_id')"
    />
    <PipelineRegisterModal 
      v-if="showIdExRegister"
      register-id="id_ex"
      @close="pipelineStore.closeModal('pipelineRegister_id_ex')"
    />
    <PipelineRegisterModal 
      v-if="showExMemRegister"
      register-id="ex_mem"
      @close="pipelineStore.closeModal('pipelineRegister_ex_mem')"
    />
    <PipelineRegisterModal 
      v-if="showMemWbRegister"
      register-id="mem_wb"
      @close="pipelineStore.closeModal('pipelineRegister_mem_wb')"
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

.left-column {
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

.pipeline-floating-info {
  position: absolute;
  bottom: 1.5rem;
  left: 1.0rem;
  z-index: 10;
  width: 24rem;
  height: 10rem;
  transition: all 0.3s ease;
}

.pipeline-floating-info.collapsed {
  height: 3.25rem;
}

.code-editor-panel {
  position: absolute;
  bottom: 1.5rem;
  right: 1.5rem;
  z-index: 10;
  width: 28rem;
  max-height: calc(100vh - 9rem);
  transition: all 0.3s ease;
}

.code-editor-panel.shift-left {
  right: 0rem;
}

.code-editor-panel.collapsed {
  top: auto;
  height: 3.25rem;
  max-height: 3.25rem;
}

.code-editor-panel.collapsed.shift-left {
  right: 0rem;
}

@media (max-width: 1400px) {
  .code-editor-panel {
    width: 20rem;
  }
  
}

@media (max-width: 1200px) {
  .pipeline-floating-info {
    width: 16rem;
  }

  .code-editor-panel {
    width: 18rem;
  }

}

@media (max-width: 992px) {
  .pipeline-floating-info {
    width: 20rem;
    bottom: 5rem;
  }

  .code-editor-panel {
    width: calc(100% - 2rem);
    right: 1rem;
    left: 1rem;
    bottom: calc(0.5rem);
    max-height: calc(100vh - 8rem);
    border-radius: 0.5rem;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
  }

  .code-editor-panel.collapsed {
    height: 3.25rem;
    max-height: 3.25rem;
    top: auto;
    bottom: calc(0.5rem);
    border-radius: 0.5rem;
    box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.1);
  }

  .code-editor-panel.shift-left {
    right: 1rem;
  }

  .code-editor-panel.collapsed.shift-left {
    right: 1rem;
  }
}

@media (max-width: 768px) {
  .pipeline-floating-info {
    width: 13rem;
    height: 6rem;
    bottom: 10rem;
  }
  .code-editor-panel {
    width: calc(100% - 1rem);
    right: 0.5rem;
    left: 0.5rem;
    bottom: calc(0.5rem);
    max-height: calc(100vh - 6rem);
  }

  .code-editor-panel.collapsed {
    bottom: calc(0.5rem);
  }

  .code-editor-panel.shift-left {
    right: 0.5rem;
  }

  .code-editor-panel.collapsed.shift-left {
    right: 0.5rem;
  }
}

.info-section {
  width: 16rem;
  min-width: 16rem;
  max-width: 25rem;
  height: 100vh;
  background: white;
  border-left: 0.0625rem solid #E2E8F0;
  position: relative;
  transition: all 0.3s ease;
  overflow: hidden;
  flex-shrink: 0;
}

.info-section.collapsed {
  width: 3rem;
  min-width: 3rem;
  max-width: 3rem;
  border-left: 0.0625rem solid #E2E8F0;
}

.info-panel-content {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.collapse-btn {
  position: absolute;
  top: 50%;
  left: 0;
  transform: translateY(-50%);
  z-index: 10;
  width: 1.5rem;
  height: 3rem;
  background: #F1F5F9;
  border: none;
  border-radius: 0 0.375rem 0.375rem 0;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #64748B;
  transition: all 0.2s ease;
}

.collapse-btn:hover {
  background: #E2E8F0;
  color: #3B82F6;
}

.info-section.collapsed .collapse-btn {
  left: 0;
  border-radius: 0 0.375rem 0.375rem 0;
}

/* 响应式设计 */
@media (max-width: 1400px) {
  .info-section {
    width: 17.5rem;
    min-width: 15rem;
  }
}

@media (max-width: 1200px) {
  .info-section {
    width: 16rem;
    min-width: 14rem;
  }
}

@media (max-width: 992px) {
  .app {
    flex-direction: column;
    overflow-y: auto;
    height: auto;
    min-height: 100vh;
  }

  .main-row {
    flex-direction: column;
    flex: none;
    overflow-y: auto;
    min-height: 0;
  }

  .left-column {
    flex: none;
    height: auto;
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
  }

  .info-section {
    width: 100%;
    max-width: none;
    height: auto;
    border-left: none;
    border-top: 0.0625rem solid #E2E8F0;
    max-height: none;
    overflow: visible;
    flex-shrink: 0;
  }

  .info-section.collapsed {
    width: 100%;
    max-width: none;
    max-height: 3rem;
    overflow: visible;
  }

  .collapse-btn {
    top: auto;
    bottom: 0;
    left: 50%;
    transform: translateX(-50%);
    width: 3rem;
    height: 1.5rem;
    border-radius: 0.375rem 0.375rem 0 0;
    z-index: 100;
  }

  .info-section.collapsed .collapse-btn {
    left: 50%;
    transform: translateX(-50%);
    z-index: 100;
  }

  .pipeline-section {
    flex: none;
    overflow: visible;
    display: flex;
    flex-direction: column;
  }

  .pipeline-section :deep(.pipeline-container) {
    flex-shrink: 1;
    min-height: 10rem;
    max-height: 40vh;
  }

  .pipeline-floating-info {
    position: relative;
    width: 100%;
    height: auto;
    min-height: auto;
    bottom: auto;
    left: auto;
    margin-bottom: 0.5rem;
    flex-shrink: 0;
  }

  .pipeline-floating-info.collapsed {
    height: 3.25rem;
  }

  .code-editor-panel {
    position: relative;
    width: 100%;
    right: auto;
    bottom: auto;
    max-height: none;
    margin-top: 0.5rem;
    min-height: 15rem;
    flex: 1;
  }

  .code-editor-panel.shift-left {
    right: auto;
  }

  .code-editor-panel.collapsed {
    height: 3.25rem;
    max-height: 3.25rem;
    min-height: 3.25rem;
    top: auto;
    bottom: auto;
    border-radius: 0.5rem;
    box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.1);
  }

  .code-editor-panel.collapsed.shift-left {
    right: auto;
  }

  .bottom-stats-bar {
    height: auto;
    min-height: 4rem;
    padding: 0.5rem 1rem;
  }
}

@media (max-width: 768px) {
  .pipeline-section {
    padding: 0.5rem;
  }
}

@media (max-width: 576px) {
  .pipeline-section {
    padding: 0.25rem;
  }
  
  .info-section {
    min-width: 100%;
  }
}
</style>
