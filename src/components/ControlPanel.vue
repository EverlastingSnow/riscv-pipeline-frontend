<script setup lang="ts">
import { ref } from 'vue';
import { usePipelineStore } from '../stores/pipeline';
import { 
  Play, 
  Pause, 
  RotateCcw, 
  ChevronRight,
  Clock
} from 'lucide-vue-next';

const pipelineStore = usePipelineStore();
const runInterval = ref(1000);

function handleIntervalChange() {
  pipelineStore.setRunInterval(runInterval.value);
}
</script>

<template>
  <div class="control-panel">
    <div class="logo-section">
      <div class="logo">
        <img src="@/assets/hdu.jpg" class="w-10 h-10" />
      </div>
      <h1 class="title">RV64IM_Zicsr_Zifencei 五级流水线虚拟仿真实验软件</h1>
    </div>
    
    <div class="button-section">
      <div class="interval-section" title="自动运行的指令时间间隔">
        <Clock class="w-4 h-4" title="自动运行的指令时间间隔" />
        <select v-model="runInterval" @change="handleIntervalChange" class="interval-select" title="自动运行的指令时间间隔">
          <option :value="300">0.3s</option>
          <option :value="500">0.5s</option>
          <option :value="1000">1s</option>
          <option :value="2000">2s</option>
          <option :value="5000">5s</option>
        </select>
      </div>
      
      <button 
        @click="pipelineStore.nextClock"
        class="control-btn next-btn"
        :disabled="pipelineStore.isRunning || pipelineStore.compareResult !== null"
      >
        <ChevronRight class="w-4 h-4" />
        <span>下一 clk</span>
      </button>
      
      <button 
        @click="pipelineStore.start"
        class="control-btn play-btn"
        :disabled="pipelineStore.isRunning || pipelineStore.compareResult !== null"
      >
        <Play class="w-4 h-4" />
        <span>运行</span>
      </button>
      
      <button 
        @click="pipelineStore.pause"
        class="control-btn pause-btn"
        :disabled="!pipelineStore.isRunning"
      >
        <Pause class="w-4 h-4" />
        <span>暂停</span>
      </button>
      
      <button 
        @click="pipelineStore.reset"
        class="control-btn reset-btn"
      >
        <RotateCcw class="w-4 h-4" />
        <span>重置</span>
      </button>
    </div>
    
    <div class="status-section">
      <div class="status-indicator" :class="{ 'running': pipelineStore.isRunning }">
        <span class="status-dot"></span>
        <span>{{ pipelineStore.isRunning ? '运行中' : '已暂停' }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.control-panel {
  background-color: #fafafa;
  border-bottom: 1px solid #e5e7eb;
  padding: 1rem 1.5rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.logo-section {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.logo {
  width: clamp(1.5rem, 5vw, 3rem);
  height: clamp(1.5rem, 5vw, 3rem);
  flex-shrink: 0;
}

.logo img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.title {
  font-size: clamp(0.75rem, 3vw, 1.5rem);
  font-weight: 700;
  color: #000000;
}

.button-section {
  display: flex;
  align-items: center;
  gap: clamp(0.25rem, 1vw, 0.5rem);
}

.interval-section {
  display: flex;
  align-items: center;
  gap: clamp(0.125rem, 0.5vw, 0.25rem);
}

.interval-select {
  padding: 0.25rem 0.5rem;
  border: 1px solid #d1d5db;
  border-radius: 0.5rem;
  outline: none;
  box-shadow: 0 0 0 2px #3b82f6;
  border-color: transparent;
  font-size: clamp(0.5rem, 1.2vw, 0.75rem);
}

.control-btn {
  display: flex;
  align-items: center;
  border-radius: 0.5rem;
  font-weight: 500;
  transition: all 0.2s;
  gap: clamp(0.125rem, 0.5vw, 0.25rem);
  padding: clamp(0.25rem, 0.8vw, 0.5rem) clamp(0.5rem, 1.5vw, 0.75rem);
  font-size: clamp(0.5rem, 1.2vw, 0.75rem);
}

.control-btn :deep(svg) {
  width: clamp(0.75rem, 2vw, 1rem);
  height: clamp(0.75rem, 2vw, 1rem);
}

.next-btn {
  background-color: #3b82f6;
  color: white;
}

.next-btn:hover {
  background-color: #2563eb;
}

.next-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.play-btn {
  background-color: #22c55e;
  color: white;
}

.play-btn:hover {
  background-color: #16a34a;
}

.play-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.pause-btn {
  background-color: #eab308;
  color: white;
}

.pause-btn:hover {
  background-color: #ca8a04;
}

.pause-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.reset-btn {
  background-color: #ef4444;
  color: white;
}

.reset-btn:hover {
  background-color: #dc2626;
}

.status-section {
  display: flex;
  align-items: center;
}

.status-indicator {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.25rem 0.5rem;
  border-radius: 9999px;
  font-weight: 500;
  font-size: clamp(0.5rem, 1.2vw, 0.75rem);
  background-color: #f3f4f6;
  color: #4b5563;
}

.status-indicator.running {
  background-color: #dcfce7;
  color: #15803d;
}

.status-dot {
  width: clamp(0.375rem, 1vw, 0.5rem);
  height: clamp(0.375rem, 1vw, 0.5rem);
  border-radius: 9999px;
  background-color: #9ca3af;
}

.status-dot.active {
  background-color: #22c55e;
}

.status-indicator.running .status-dot {
  background-color: #22c55e;
}
</style>
