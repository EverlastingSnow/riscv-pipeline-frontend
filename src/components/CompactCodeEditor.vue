<script setup lang="ts">
import { ref, watch } from 'vue';
import { usePipelineStore } from '../stores/pipeline';
import { Upload, Play, FileCode, AlertCircle, CheckCircle } from 'lucide-vue-next';

const pipelineStore = usePipelineStore();

/**
 * 编辑器默认示例代码。
 *
 * 提示用户必须包含 .text 段、.globl _start 入口并以 ebreak 结尾。
 */
const defaultCode = `# - 必须包含 .text 段 - 表示代码段
# - 必须包含 .globl _start - 声明程序入口点
# - 代码写在 _start: 标签之后
# - 必须以 ebreak 结尾 - 停止程序运行
.text
.globl _start
_start:
    addi x1, x0, 10
    addi x2, x0, 20
    add x3, x1, x2
    ebreak
`;

/**
 * 当前编辑器中的源代码。
 */
const code = ref(defaultCode);
/**
 * 是否处于文件拖拽悬停状态。
 */
const isDragging = ref(false);
/**
 * 编译状态：空闲 / 编译中 / 成功 / 失败。
 */
const compileStatus = ref<'idle' | 'compiling' | 'success' | 'error'>('idle');
/**
 * 编译错误信息。
 */
const compileError = ref('');
/**
 * 已上传的文件名（用于界面展示与编译请求）。
 */
const uploadedFileName = ref('');

/**
 * ★ 中断与异常演示：监听 store.editorCode 的变化，自动填入。
 *
 * 监听到非空内容时同步到编辑器并清空 store 字段，避免重复触发。
 */
watch(() => pipelineStore.editorCode, (newCode) => {
  if (newCode) {
    code.value = newCode;
    // 清空 store 字段，避免循环触发
    pipelineStore.editorCode = '';
  }
});

/**
 * 组件事件：编译并加载完成后通知父组件。
 */
const emit = defineEmits<{
  (e: 'compiled'): void;
}>();

/**
 * 将当前编辑器中的代码发送到后端编译并加载到 CPU。
 *
 * 流程：
 * 1. 防重复点击（编译中状态直接返回）
 * 2. POST /api/compile，body 为源代码与文件名
 * 3. 成功后调用 store.loadElfBinary 注入 ELF
 * 4. 失败时显示错误信息（支持行级错误列表）
 *
 * @returns {Promise<void>} 异步操作完成后 resolve
 */
async function compileAndLoad() {
  // 防止用户在编译过程中重复点击
  if (compileStatus.value === 'compiling') return;

  compileStatus.value = 'compiling';
  compileError.value = '';

  try {
    // 异步调用后端编译接口
    const response = await fetch('/api/compile', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        source: code.value,
        filename: uploadedFileName.value || 'student_code.S'
      })
    });

    const result = await response.json();

    if (result.success) {
      compileStatus.value = 'success';
      console.log('Compilation successful, ELF received, length:', result.elf_data.length);

      const elfData = result.elf_data;
      console.log('Calling loadElfBinary with ELF data...');
      // 将编译得到的 ELF 注入到流水线 store
      pipelineStore.loadElfBinary(elfData);
      console.log('loadElfBinary called');

      // 通知父组件编译加载完成
      emit('compiled');
    } else {
      // 编译失败：收集错误信息（优先展示行级错误列表）
      compileStatus.value = 'error';
      compileError.value = result.error || 'Compilation failed';
      if (result.line_errors && result.line_errors.length > 0) {
        compileError.value = result.line_errors.join('\n');
      }
    }
  } catch (err) {
    // 网络错误等异常统一处理
    compileStatus.value = 'error';
    compileError.value = `Network error: ${err}`;
  }
}

/**
 * 处理拖拽进入/悬停事件：阻止默认行为并显示高亮。
 *
 * @param {DragEvent} e 原生拖拽事件
 */
function handleDragOver(e: DragEvent) {
  e.preventDefault();
  isDragging.value = true;
}

/**
 * 处理拖拽离开事件：清除高亮。
 */
function handleDragLeave() {
  isDragging.value = false;
}

/**
 * 处理文件拖放事件：读取第一个文件并加载。
 *
 * @param {DragEvent} e 原生拖拽事件
 */
function handleDrop(e: DragEvent) {
  e.preventDefault();
  isDragging.value = false;

  // 仅取拖入的第一个文件进行加载
  const files = e.dataTransfer?.files;
  if (files && files.length > 0 && files[0]) {
    loadFile(files[0]);
  }
}

/**
 * 处理文件选择控件（input[type=file]）的变化事件。
 *
 * @param {Event} e input change 事件
 */
function handleFileSelect(e: Event) {
  const input = e.target as HTMLInputElement;
  if (input.files && input.files.length > 0 && input.files[0]) {
    loadFile(input.files[0]);
  }
}

/**
 * 读取并校验用户上传的汇编文件，校验通过后填入编辑器。
 *
 * 仅接受 .S / .s / .asm 后缀的文件。
 *
 * @param {File} file 用户上传的文件
 */
function loadFile(file: File) {
  // 文件后缀校验：仅接受 RISC-V 汇编源文件
  if (!file.name.endsWith('.S') && !file.name.endsWith('.s') && !file.name.endsWith('.asm')) {
    compileError.value = 'Please upload a .S or .s assembly file';
    compileStatus.value = 'error';
    return;
  }

  uploadedFileName.value = file.name;
  // 使用 FileReader 异步读取文本内容
  const reader = new FileReader();
  reader.onload = (e) => {
    // 读取失败时回退为默认代码
    code.value = e.target?.result as string || defaultCode;
  };
  reader.readAsText(file);
}

/**
 * 将编辑器恢复为默认示例代码，并清空所有状态。
 */
function resetCode() {
  code.value = defaultCode;
  uploadedFileName.value = '';
  compileStatus.value = 'idle';
  compileError.value = '';
}
</script>

<template>
  <div class="compact-editor-panel">
    <!-- 编辑器头部：标题区 -->
    <div class="editor-header">
      <div class="header-left">
        <FileCode class="w-4 h-4 text-blue-500" />
        <span class="header-title">汇编代码编辑器</span>
      </div>
    </div>

    <div class="editor-body">
      <!-- 编辑器主体：支持拖拽上传 -->
      <div
        class="editor-area"
        :class="{ 'drag-over': isDragging }"
        @dragover="handleDragOver"
        @dragleave="handleDragLeave"
        @drop="handleDrop"
      >
        <!-- 已上传文件名指示 -->
        <div v-if="uploadedFileName" class="file-indicator">
          {{ uploadedFileName }}
        </div>
        <textarea
          v-model="code"
          class="code-textarea"
          spellcheck="false"
          placeholder="RISC-V汇编代码..."
        ></textarea>
        <!-- 拖拽时的浮层提示 -->
        <div v-if="isDragging" class="drop-overlay">
          <Upload class="w-6 h-6" />
          <span>拖放文件</span>
        </div>
      </div>

      <!-- 操作按钮区 -->
      <div class="action-bar">
        <label class="upload-btn">
          <Upload class="w-3 h-3" />
          <span>上传</span>
          <input
            type="file"
            accept=".S,.s,.asm"
            @change="handleFileSelect"
            class="hidden"
          />
        </label>
        <button @click="resetCode" class="reset-btn">重置代码</button>
        <button
          @click="compileAndLoad"
          class="compile-btn"
          :disabled="compileStatus === 'compiling'"
        >
          <Play class="w-3 h-3" />
          <span>{{ compileStatus === 'compiling' ? '编译中' : '编译运行' }}</span>
        </button>
      </div>

      <!-- 编译成功状态条 -->
      <div v-if="compileStatus === 'success'" class="status-bar success">
        <CheckCircle class="w-3 h-3" />
        <span>编译成功！程序已加载，请点击下一clk或运行按钮！</span>
      </div>

      <!-- 编译失败状态条 -->
      <div v-if="compileStatus === 'error'" class="status-bar error">
        <AlertCircle class="w-3 h-3" />
        <pre class="error-message">{{ compileError }}</pre>
      </div>
    </div>
  </div>
</template>

<style scoped>
.compact-editor-panel {
  background: white;
  border-radius: 0.5rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  border: 1px solid #e5e7eb;
  width: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  height: 100%;
}

.editor-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem 0.75rem;
  border-bottom: 0.0625rem solid #e5e7eb;
  background: #f9fafb;
  flex-shrink: 0;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 0.375rem;
}

.header-title {
  font-size: 0.8125rem;
  font-weight: 600;
  color: #374151;
}

.editor-body {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.editor-area {
  flex: 1;
  position: relative;
  min-height: 8rem;
  overflow: hidden;
}

.file-indicator {
  position: absolute;
  top: 0.25rem;
  right: 0.5rem;
  background: #dbeafe;
  color: #1d4ed8;
  padding: 0.125rem 0.375rem;
  border-radius: 0.25rem;
  font-size: 0.6875rem;
  z-index: 10;
}

.code-textarea {
  width: 100%;
  height: 100%;
  min-height: 12rem;
  padding: 0.5rem;
  border: none;
  resize: none;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 0.75rem;
  line-height: 1.4;
  outline: none;
  background: #fefefe;
  white-space: nowrap;
  overflow-x: auto;
}

.code-textarea:focus {
  background: #fff;
}

.drag-over {
  background: #eff6ff;
}

.drop-overlay {
  position: absolute;
  inset: 0;
  background: rgba(59, 130, 246, 0.1);
  border: 0.125rem dashed #3b82f6;
  border-radius: 0.25rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.25rem;
  color: #3b82f6;
  font-size: 0.75rem;
  font-weight: 500;
  pointer-events: none;
}

.action-bar {
  display: flex;
  gap: 0.375rem;
  padding: 0.375rem 0.5rem;
  border-top: 0.0625rem solid #e5e7eb;
  background: #f9fafb;
  flex-shrink: 0;
  min-height: 2.75rem;
}

.upload-btn {
  padding: 0.25rem 0.5rem;
  border: 0.0625rem solid #3b82f6;
  border-radius: 0.25rem;
  background: white;
  color: #3b82f6;
  font-size: 0.6875rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 0.1875rem;
  flex-shrink: 0;
}

.upload-btn:hover {
  background: #eff6ff;
}

.hidden {
  display: none;
}

.reset-btn {
  padding: 0.25rem 0.5rem;
  border: 0.0625rem solid #d1d5db;
  border-radius: 0.25rem;
  background: white;
  font-size: 0.6875rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 0.125rem;
  flex-shrink: 0;
}

.reset-btn:hover {
  background: #f3f4f6;
}

.compile-btn {
  padding: 0.25rem 0.625rem;
  border: none;
  border-radius: 0.25rem;
  background: #22c55e;
  color: white;
  font-size: 0.6875rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 0.1875rem;
  flex-shrink: 0;
}

.compile-btn:hover:not(:disabled) {
  background: #16a34a;
}

.compile-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.status-bar {
  padding: 0.375rem 0.5rem;
  display: flex;
  align-items: flex-start;
  gap: 0.375rem;
  font-size: 0.6875rem;
  flex-shrink: 0;
}

.status-bar.success {
  background: #dcfce7;
  color: #15803d;
  border-top: 0.0625rem solid #bbf7d0;
}

.status-bar.error {
  background: #fef2f2;
  color: #dc2626;
  border-top: 0.0625rem solid #fecaca;
  flex-direction: column;
}

.error-message {
  margin: 0;
  font-family: monospace;
  font-size: 0.625rem;
  white-space: pre-wrap;
  word-break: break-all;
}

@media (max-width: 992px) {
  .compact-editor-panel {
    min-height: auto;
    height: auto;
    max-height: none;
    padding-bottom: 0;
  }

  .editor-header {
    padding: 0.4rem 0.5rem;
    flex-shrink: 0;
  }

  .header-title {
    font-size: 0.75rem;
  }

  .editor-body {
    display: flex;
    flex-direction: column;
    overflow: visible;
    flex: 1;
  }

  .editor-area {
    flex: none;
    min-height: 12rem;
    height: auto;
    overflow-y: visible;
  }

  .code-textarea {
    min-height: 12rem;
    height: auto;
  }

  .action-bar {
    flex-shrink: 0;
    min-height: 3rem;
    padding: 0.5rem 0.75rem;
    position: relative;
    background: #f9fafb;
    border-top: 0.0625rem solid #e5e7eb;
    z-index: 10;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
}

@media (max-width: 576px) {
  .action-bar {
    min-height: 2.5rem;
    padding: 0.375rem 0.5rem;
    flex-wrap: wrap;
  }
}
</style>
