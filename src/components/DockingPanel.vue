<script setup lang="ts">
import type { PanelState } from '../stores/panel';

const props = defineProps<{
  panel: PanelState;
}>();
</script>

<template>
  <div class="docking-panel-container">
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
