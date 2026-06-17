<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue';

/**
 * 可拖拽弹窗组件的 props 定义。
 *
 * @property {boolean} show - 是否显示弹窗
 * @property {string} title - 弹窗标题
 * @property {boolean} [noOverlay=false] - 是否不显示遮罩层（无遮罩时多个弹窗可同时可见）
 * @property {boolean} [noClose=false] - 是否禁用关闭功能（隐藏关闭按钮与 ESC 键）
 */
const props = withDefaults(defineProps<{
  show: boolean;
  title: string;
  noOverlay?: boolean;
  noClose?: boolean;
}>(), {
  noOverlay: false,
  noClose: false
});

/**
 * 组件事件定义。
 *
 * @event close - 请求关闭弹窗时触发（由父组件决定是否真正关闭）
 */
const emit = defineEmits<{
  (e: 'close'): void;
}>();

/** 弹窗 DOM 元素的引用，用于读取位置和直接设置样式 */
const modalRef = ref<HTMLElement | null>(null);

/** 是否正在拖拽中，用于控制拖拽状态与遮罩点击行为 */
const isDragging = ref(false);

/** 鼠标按下时相对弹窗左上角的偏移量，避免拖拽时跳变 */
const dragOffset = ref({ x: 0, y: 0 });

/** 弹窗当前的位置（left/top 像素值），初始化为居中状态 */
const position = ref({ x: 0, y: 0 });

/**
 * 开始拖拽，记录鼠标相对弹窗的偏移，并注册全局移动/释放事件。
 *
 * @param {MouseEvent} event - mousedown 事件对象
 * @returns {void}
 */
const startDrag = (event: MouseEvent) => {
  if (!modalRef.value) return;

  // 进入拖拽状态
  isDragging.value = true;
  // 计算鼠标在弹窗内的偏移量，保证拖拽过程中鼠标相对位置不变
  const modalRect = modalRef.value.getBoundingClientRect();
  dragOffset.value = {
    x: event.clientX - modalRect.left,
    y: event.clientY - modalRect.top,
  };

  // 在 document 上注册监听器，避免拖出弹窗区域后丢失事件
  document.addEventListener('mousemove', onDrag);
  document.addEventListener('mouseup', stopDrag);
};

/**
 * 拖拽过程处理：实时更新弹窗的 left/top，覆盖 CSS 中的居中 transform。
 *
 * @param {MouseEvent} event - mousemove 事件对象
 * @returns {void}
 */
const onDrag = (event: MouseEvent) => {
  if (!isDragging.value || !modalRef.value) return;

  // 用鼠标坐标减去初始偏移，得到弹窗新的左上角位置
  position.value = {
    x: event.clientX - dragOffset.value.x,
    y: event.clientY - dragOffset.value.y
  };
  // 直接写入内联样式以获得最佳性能，避免触发 Vue 重渲染
  modalRef.value.style.left = `${position.value.x}px`;
  modalRef.value.style.top = `${position.value.y}px`;
  // 清除默认的居中 transform，防止与绝对定位冲突
  modalRef.value.style.transform = 'none';
};

/**
 * 结束拖拽：阻止冒泡（避免触发遮罩点击关闭）并清理全局监听器。
 *
 * @param {MouseEvent} event - mouseup 事件对象
 * @returns {void}
 */
const stopDrag = (event: MouseEvent) => {
  if (isDragging.value) {
    // 防止 mouseup 冒泡到外层遮罩，从而避免误触关闭
    event.preventDefault();
    event.stopPropagation();
  }
  isDragging.value = false;
  // 移除全局监听器，避免内存泄漏
  document.removeEventListener('mousemove', onDrag);
  document.removeEventListener('mouseup', stopDrag);
};

/**
 * 关闭弹窗：仅在允许关闭时向父组件发出 close 事件。
 *
 * @returns {void}
 */
const close = () => {
  if (!props.noClose) {
    emit('close');
  }
};

/**
 * 处理遮罩层点击：忽略拖拽结束时的误触，并仅在点击目标为遮罩本身时关闭。
 *
 * @param {MouseEvent} event - click 事件对象
 * @returns {void}
 */
const handleOverlayClick = (event: MouseEvent) => {
  // 拖拽结束时 mouseup 之后可能立刻 click，需忽略
  if (isDragging.value) return;
  if (props.noClose) return;
  // 仅当点击的是遮罩容器（而非冒泡上来的弹窗内容）时才关闭
  if (event.target === event.currentTarget) {
    close();
  }
};

/**
 * 重置弹窗位置为居中状态：清空内联样式，回退到 CSS 中的默认居中布局。
 *
 * @returns {void}
 */
const resetPosition = () => {
  position.value = { x: 0, y: 0 };
  if (modalRef.value) {
    // 清空内联定位样式，使弹窗回到 CSS 默认的居中位置
    modalRef.value.style.left = '';
    modalRef.value.style.top = '';
    modalRef.value.style.transform = '';
  }
};

/**
 * 监听 show 变化：弹窗从隐藏变为显示时，在下一个 tick 重置位置。
 */
watch(() => props.show, (newVal) => {
  if (newVal) {
    // nextTick 等待 v-if 渲染完成后再操作 DOM，确保能拿到 modalRef
    nextTick(() => {
      resetPosition();
    });
  }
});

/**
 * 组件挂载后注册 ESC 键监听，用于快捷关闭弹窗。
 */
onMounted(() => {
  const handleEscKey = (event: KeyboardEvent) => {
    // 仅在弹窗可见且允许关闭时响应 ESC
    if (event.key === 'Escape' && props.show && !props.noClose) {
      close();
    }
  };
  document.addEventListener('keydown', handleEscKey);

  // 组件卸载时移除监听，避免内存泄漏
  onUnmounted(() => {
    document.removeEventListener('keydown', handleEscKey);
  });
});
</script>

<template>
  <!-- Teleport 将弹窗挂载到 body，避免被父级 transform/overflow 影响 -->
  <Teleport to="body">
    <!-- 遮罩层容器：noOverlay 时无背景且不可点击，仅作为定位参考 -->
    <div
      v-if="show"
      :class="noOverlay
        ? 'fixed inset-0 pointer-events-none z-50'
        : 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 pointer-events-auto'"
      v-on="noOverlay ? {} : { click: handleOverlayClick }"
    >
      <!-- 弹窗主体：noOverlay 时使用绝对定位并贴近顶部，方便多个弹窗并排 -->
      <div
        ref="modalRef"
        :class="noOverlay
          ? 'bg-white rounded-xl shadow-2xl overflow-hidden pointer-events-auto absolute'
          : 'bg-white rounded-xl shadow-2xl overflow-hidden'"
        :style="noOverlay
          ? 'min-width: 20rem; max-width: 90vw; max-height: 90vh; top: 6.25rem; left: 50%; transform: translateX(-50%);'
          : 'min-width: 20rem; max-width: 90vw; max-height: 90vh;'"
      >
        <!-- 弹窗标题栏：cursor-move 标识可拖拽区域，mousedown 触发拖拽 -->
        <div
          class="bg-gray-100 px-4 py-3 flex items-center justify-between cursor-move border-b border-gray-200"
          style="min-height: 3rem;"
          @mousedown="startDrag"
        >
          <h3 class="font-semibold text-gray-800">{{ title }}</h3>
          <!-- 关闭按钮：仅在允许关闭时显示 -->
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

        <!-- 弹窗内容区域：max-height 保证内部可滚动 -->
        <div class="p-4 overflow-auto" style="max-height: calc(90vh - 4rem);">
          <slot></slot>
        </div>
      </div>
    </div>
  </Teleport>
</template>
