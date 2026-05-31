<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue';

const props = withDefaults(defineProps<{
  show: boolean;
  title: string;
  noOverlay?: boolean;
  noClose?: boolean;
}>(), {
  noOverlay: false,
  noClose: false
});

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const modalRef = ref<HTMLElement | null>(null);
const isDragging = ref(false);
const dragOffset = ref({ x: 0, y: 0 });
const position = ref({ x: 0, y: 0 });

const startDrag = (event: MouseEvent) => {
  if (!modalRef.value) return;
  
  isDragging.value = true;
  const modalRect = modalRef.value.getBoundingClientRect();
  dragOffset.value = {
    x: event.clientX - modalRect.left,
    y: event.clientY - modalRect.top,
  };
  
  document.addEventListener('mousemove', onDrag);
  document.addEventListener('mouseup', stopDrag);
};

const onDrag = (event: MouseEvent) => {
  if (!isDragging.value || !modalRef.value) return;
  
  position.value = {
    x: event.clientX - dragOffset.value.x,
    y: event.clientY - dragOffset.value.y
  };
  modalRef.value.style.left = `${position.value.x}px`;
  modalRef.value.style.top = `${position.value.y}px`;
  modalRef.value.style.transform = 'none';
};

const stopDrag = (event: MouseEvent) => {
  if (isDragging.value) {
    event.preventDefault();
    event.stopPropagation();
  }
  isDragging.value = false;
  document.removeEventListener('mousemove', onDrag);
  document.removeEventListener('mouseup', stopDrag);
};

const close = () => {
  if (!props.noClose) {
    emit('close');
  }
};

const handleOverlayClick = (event: MouseEvent) => {
  if (isDragging.value) return;
  if (props.noClose) return;
  if (event.target === event.currentTarget) {
    close();
  }
};

const resetPosition = () => {
  position.value = { x: 0, y: 0 };
  if (modalRef.value) {
    modalRef.value.style.left = '';
    modalRef.value.style.top = '';
    modalRef.value.style.transform = '';
  }
};

watch(() => props.show, (newVal) => {
  if (newVal) {
    nextTick(() => {
      resetPosition();
    });
  }
});

onMounted(() => {
  const handleEscKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && props.show && !props.noClose) {
      close();
    }
  };
  document.addEventListener('keydown', handleEscKey);
  
  onUnmounted(() => {
    document.removeEventListener('keydown', handleEscKey);
  });
});
</script>

<template>
  <Teleport to="body">
    <div 
      v-if="show" 
      :class="noOverlay 
        ? 'fixed inset-0 pointer-events-none z-50' 
        : 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 pointer-events-auto'"
      v-on="noOverlay ? {} : { click: handleOverlayClick }"
    >
      <div 
        ref="modalRef"
        :class="noOverlay 
          ? 'bg-white rounded-xl shadow-2xl overflow-hidden pointer-events-auto absolute' 
          : 'bg-white rounded-xl shadow-2xl overflow-hidden'"
        :style="noOverlay 
          ? 'min-width: 20rem; max-width: 90vw; max-height: 90vh; top: 6.25rem; left: 50%; transform: translateX(-50%);' 
          : 'min-width: 20rem; max-width: 90vw; max-height: 90vh;'"
      >
        <div 
          class="bg-gray-100 px-4 py-3 flex items-center justify-between cursor-move border-b border-gray-200"
          style="min-height: 3rem;"
          @mousedown="startDrag"
        >
          <h3 class="font-semibold text-gray-800">{{ title }}</h3>
          <button 
            v-if="!noClose"
            @click="close"
            class="text-gray-500 hover:text-gray-700 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
            </svg>
          </button>
        </div>
        
        <div class="p-4 overflow-auto" style="max-height: calc(90vh - 4rem);">
          <slot></slot>
        </div>
      </div>
    </div>
  </Teleport>
</template>
