/**
 * 应用入口文件
 *
 * 负责创建 Vue 应用实例、注册 Pinia 状态管理、加载全局样式、挂载根组件，
 * 并配置全局错误处理。
 */
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import './style.css'
import App from './App.vue'

// 创建 Vue 应用实例，根组件为 App.vue
const app = createApp(App)

/**
 * 创建 Pinia 状态管理实例并注册到应用。
 * Pinia 用于集中管理流水线模拟器全局状态（CPU 状态、寄存器、弹窗等）。
 */
const pinia = createPinia()
app.use(pinia)

/**
 * 将应用挂载到 #app 根节点（见 index.html）。
 * 挂载完成后 Vue 开始接管 DOM 渲染。
 */
app.mount('#app')

/**
 * 配置全局错误处理：捕获组件渲染、生命周期钩子、自定义指令等抛出的同步错误。
 *
 * @param err 抛出的错误对象
 * @param instance 发生错误的组件实例（可用于定位组件名）
 * @param info 错误来源描述（如 'render function' / 'mounted hook' 等）
 */
app.config.errorHandler = (err, instance, info) => {
  console.error('Global error:', err)
  console.error('Component:', instance)
  console.error('Info:', info)
}

// 启动成功提示，便于在浏览器控制台确认初始化已完成
console.log('RISC-V Pipeline Simulator initialized successfully!')
