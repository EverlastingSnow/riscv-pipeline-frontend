<script setup lang="ts">
import { computed } from 'vue';
import { usePipelineStore } from '../stores/pipeline';
import DraggableModal from './DraggableModal.vue';
import { 
  Settings, 
  Activity
} from 'lucide-vue-next';

const pipelineStore = usePipelineStore();

const activeControlSignals = computed(() => pipelineStore.activeControlSignals);

const formatSignalValue = (val: string | undefined): string => {
  return val || '0';
};
</script>

<template>
  <DraggableModal
    :show="pipelineStore.activeModals.includes('control')"
    title="控制单元信号详情"
    :no-overlay="true"
    @close="pipelineStore.closeModal('control')"
  >
    <div class="control-modal">
      <div class="ctrl-header">
        <Settings class="w-8 h-8 text-red-500" />
        <div class="ctrl-title">
          <h3>控制单元 (Control Unit)</h3>
          <p>当前活跃的控制信号</p>
        </div>
      </div>
      
      <div class="signals-section">
        <div class="section-header">
          <Activity class="w-4 h-4 text-green-500" />
          <h4>活跃控制信号 ({{ activeControlSignals.length }})</h4>
        </div>
        <div class="signal-list">
          <div 
            v-for="signal in activeControlSignals" 
            :key="signal.id"
            class="signal-item active"
          >
            <div class="signal-info">
              <span class="signal-name">{{ signal.id }}</span>
              <span class="signal-value">{{ formatSignalValue(signal.value) }}</span>
            </div>
            <div class="signal-status">
              <span class="status-badge active">
                {{ signal.value }}
              </span>
            </div>
          </div>
          <div v-if="activeControlSignals.length === 0" class="signal-item empty">
            <span>暂无活跃控制信号</span>
          </div>
        </div>
      </div>
      
      <div class="info-section">
        <h4>信号说明</h4>
        <ul class="signal-description">
          <li><strong>allow_to_go:</strong> 允许对应流水线阶段继续执行</li>
          <li><strong>do_flush:</strong> 刷新对应流水线阶段</li>
          <li><strong>branch_taken:</strong> 分支跳转信号</li>
          <li><strong>stall:</strong> 暂停上游流水线阶段</li>
        </ul>
      </div>
    </div>
  </DraggableModal>
</template>

<style scoped>
.control-modal {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.ctrl-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem;
  background-color: #fef2f2;
  border-radius: 0.5rem;
}

.ctrl-title h3 {
  font-size: 1.125rem;
  font-weight: 600;
  color: #1f2937;
}

.ctrl-title p {
  font-size: 0.875rem;
  color: #4b5563;
}

.signals-section {
  border: 1px solid #e5e7eb;
  border-radius: 0.5rem;
  overflow: hidden;
}

.section-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  background-color: #f3f4f6;
  border-bottom: 1px solid #e5e7eb;
}

.section-header h4 {
  font-size: 0.875rem;
  font-weight: 500;
  color: #374151;
}

.signal-list {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.5rem;
  max-height: 18.75rem;
  overflow-y: auto;
}

.signal-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem 0.75rem;
  border-radius: 0.25rem;
}

.signal-item:hover {
  background-color: #f9fafb;
  transition: background-color 0.2s;
}

.signal-item.active {
  background-color: #f0fdf4;
}

.signal-item.empty {
  color: #9ca3af;
  justify-content: center;
}

.signal-info {
  display: flex;
  flex-direction: column;
}

.signal-name {
  font-size: 0.875rem;
  font-weight: 500;
  color: #1f2d3d;
}

.signal-value {
  font-size: 0.75rem;
  color: #6b7280;
}

.signal-status {
  display: flex;
  align-items: center;
}

.status-badge {
  padding: 0.25rem 0.5rem;
  border-radius: 0.25rem;
  font-size: 0.75rem;
  font-weight: 700;
  background-color: #e5e7eb;
  color: #4b5563;
}

.status-badge.active {
  background-color: #22c55e;
  color: white;
}

.info-section {
  border: 1px solid #e5e7eb;
  border-radius: 0.5rem;
  padding: 0.75rem;
}

.info-section h4 {
  font-size: 0.875rem;
  font-weight: 500;
  color: #374151;
  margin-bottom: 0.5rem;
}

.signal-description {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.75rem;
  color: #4b5563;
}

.signal-description li {
  list-style-type: disc;
  list-style-position: inside;
}
</style>
