# RISC-V 五级流水线前端实验平台

这是一个基于 Vue 3 + TypeScript 的 RISC-V 五级流水线前端实验平台，提供交互式的流水线可视化界面。

## 功能特性

### 核心功能
- **流水线可视化**：展示取指(IF)、译码(ID)、执行(EX)、访存(MEM)、写回(WB)五个阶段
- **数据流高亮**：动态高亮显示当前活跃的数据流和控制信号
- **模块交互**：点击模块可查看详细信息（寄存器、ALU、控制信号等）
- **暂存阶段可视化**：展示DecodeStage、ExecuteStage、MemoryStage、WriteBackStage等暂存模块

### 控制功能
- **下一 clk**：单步执行一个时钟周期
- **运行**：连续执行流水线
- **暂停**：暂停流水线执行
- **重置**：重置流水线状态

### 响应式设计
- 支持桌面端、平板端、移动端
- 自动适配不同屏幕尺寸
- 流畅的动画效果

## 技术栈

- **Vue 3**：前端框架
- **TypeScript**：类型安全
- **Tailwind CSS**：样式框架
- **Pinia**：状态管理
- **Lucide Icons**：图标库
- **Vite**：构建工具

## 快速开始

### 安装依赖
```bash
npm install
```

### 启动开发服务器
```bash
npm run dev
```

### 构建生产版本
```bash
npm run build
```

### 预览生产版本
```bash
npm run preview
```

## 项目结构

```
src/
├── components/
│   ├── PipelineView.vue      # 流水线可视化核心组件
│   ├── ControlPanel.vue      # 控制按钮面板
│   ├── InfoPanel.vue         # CPU状态信息面板
│   ├── RegisterModal.vue     # 寄存器详情弹窗
│   ├── AluModal.vue          # ALU详情弹窗
│   ├── ControlSignalsModal.vue # 控制信号详情弹窗
│   └── DraggableModal.vue    # 可拖拽弹窗基础组件
├── composables/
│   └── usePipeline.ts         # 流水线相关逻辑
├── stores/
│   └── pipeline.ts           # Pinia状态管理
├── services/
│   └── api.ts               # API通信服务
├── types/
│   └── index.ts              # TypeScript类型定义
├── data/
│   └── mockData.ts          # 模拟数据
├── App.vue                   # 根组件
├── main.ts                   # 入口文件
└── style.css                 # 全局样式
```

## API接口

### 控制接口
- `POST /api/pipeline/next`：执行下一个时钟周期
- `POST /api/pipeline/start`：开始运行流水线
- `POST /api/pipeline/pause`：暂停流水线
- `POST /api/pipeline/reset`：重置流水线

### 状态查询接口
- `GET /api/pipeline/state`：获取流水线状态
- `GET /api/pipeline/registers`：获取寄存器状态
- `GET /api/pipeline/alu`：获取ALU状态

## 模拟数据

当前版本使用模拟数据进行演示，可以独立运行查看效果。后续可对接真实后端API。

## 浏览器支持

- Chrome (最新版本)
- Firefox (最新版本)
- Safari (最新版本)
- Edge (最新版本)

## 许可证

MIT

## 贡献

欢迎提交 Issue 和 Pull Request！
