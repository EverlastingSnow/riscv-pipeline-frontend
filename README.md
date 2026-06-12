# RISC-V 五级流水线前端实验平台

`riscv-pipeline-frontend` 是一个基于 Vue 3 + TypeScript + Vite 的 RISC-V 五级流水线虚拟仿真实验平台前端。它面向教学和实验场景，提供 RV64IM_Zicsr_Zifencei 流水线结构可视化、汇编代码编辑与编译加载、逐周期执行控制、差分测试、寄存器与控制信号查看、运行统计和并发测试脚本。

## 项目定位

- **项目名称**：RISC-V 五级流水线前端实验平台。
- **主要目的**：帮助学生或开发者直观理解 RISC-V 五级流水线 IF、ID、EX、MEM、WB 的数据流、控制流和执行状态。
- **核心模式**：自由编程模式和差分测试模式。
- **前端职责**：可视化流水线、收集用户操作、调用编译接口、通过 WebSocket 控制后端模拟器、展示后端返回的周期信号。
- **后端依赖**：需要 `RISC-V_Platform` 提供 `/api/compile`、`/api/stats` 和 `/ws` 对应服务或反向代理。

## 技术栈

| 类别           | 技术                   | 当前版本              | 用途                                   |
| -------------- | ---------------------- | --------------------- | -------------------------------------- |
| 前端框架       | Vue                    | `^3.5.24`             | 单页应用与组件系统                     |
| 语言           | TypeScript             | `~5.9.3`              | 类型检查和开发体验                     |
| 构建工具       | Vite                   | `^7.2.4`              | 开发服务器、生产构建、预览             |
| Vue 插件       | `@vitejs/plugin-vue`   | `^6.0.1`              | Vue SFC 编译                           |
| 状态管理       | Pinia                  | `^3.0.4`              | 流水线、WebSocket、面板状态            |
| 样式           | Tailwind CSS           | `^3.4.17`             | 工具类和组件样式基础                   |
| CSS 处理       | PostCSS / Autoprefixer | `^8.5.6` / `^10.4.24` | CSS 编译和浏览器前缀                   |
| 图标           | `lucide-vue-next`      | `^0.563.0`            | 控制按钮、面板和弹窗图标               |
| HTTP           | Fetch / Axios          | Axios `^1.13.4`       | 代码中主要使用 Fetch，Axios 已安装备用 |
| WebSocket 调试 | `wscat`                | `^6.1.0`              | 命令行调试 WebSocket                   |
| 负载测试       | K6                     | 文档建议 `v0.55.0+`   | HTTP/WebSocket 并发测试                |

## 项目架构

```text
┌──────────────────────────────────────────────┐
│ App.vue                                      │
│ 三栏布局 / 顶部控制栏 / 底部统计栏 / 弹窗挂载 │
└──────────────────────┬───────────────────────┘
                       │
┌──────────────────────▼───────────────────────┐
│ Pinia Stores                                  │
│ pipeline.ts: WebSocket、流水线状态、差分测试   │
│ panel.ts: 左右面板、Tab、本地持久化            │
└──────────────────────┬───────────────────────┘
                       │
┌──────────────────────▼───────────────────────┐
│ Components                                    │
│ PipelineEditor / ControlPanel / Panels / Modals│
└──────────────────────┬───────────────────────┘
                       │
┌──────────────────────▼───────────────────────┐
│ Backend APIs                                  │
│ /ws /api/compile /api/stats                   │
└──────────────────────────────────────────────┘
```

### 前端数据流

1. `main.ts` 创建 Vue 应用并注册 Pinia。
2. `App.vue` 组织左侧面板、中央流水线、右侧面板、底部统计和全局弹窗。
3. `stores/pipeline.ts` 启动 WebSocket，默认连接同源 `/ws`。
4. 用户点击“下一 clk”“运行”“重置”等按钮后，store 向后端发送 `step`、`reset`、`load_elf_binary` 等命令。
5. 后端返回周期信号后，store 转换为 `cpuState`、`activeDataFlows`、`activeControlSignals`、`registers`、`aluData` 等状态。
6. `PipelineEditor.vue` 使用 SVG 展示流水线模块和连线，并根据 active 状态高亮数据流、地址流和控制流。
7. 点击模块后打开寄存器、ALU、控制信号或流水线寄存器详情弹窗。

## 功能特性

- **五级流水线可视化**：展示 Fetch Unit、Decode Unit、Execute Unit、Memory Unit、WriteBack Unit。
- **流水线寄存器展示**：展示 IF/ID、ID/EX、EX/MEM、MEM/WB 四个阶段寄存器。
- **数据流与控制流高亮**：蓝色表示数据流，橙色表示地址流，红色表示控制流。
- **交互式视图**：支持鼠标滚轮缩放、拖拽平移、双击重置视图、悬停查看连线值。
- **运行控制**：支持单周期执行、自动运行、暂停、重置和运行间隔选择。
- **汇编代码编辑器**：支持在线编辑、上传 `.S` / `.s` / `.asm`、拖拽文件、调用 `/api/compile` 编译并加载 ELF。
- **差分测试**：支持场景化选择 `RegWrite`、`ALUSrc`、`MemRead`、`MemWrite`、`Branch` 控制信号。
- **教学测试用例**：内置 ELF 测试列表，按寄存器写、操作数选择、内存访问、分支控制等场景过滤。
- **状态信息面板**：展示周期、PC、活跃信号、通用寄存器堆和运行状态。
- **可拖拽弹窗**：寄存器、ALU、控制信号、差分输入、差异结果、停机提示、流水线寄存器详情均以弹窗呈现。
- **使用统计**：底部调用 `/api/stats`，支持日期范围查询访问次数和累计使用时长。
- **响应式布局**：桌面为左右面板 + 中央流水线，移动端纵向堆叠并优化面板高度。
- **并发测试资源**：`test` 目录提供 K6 HTTP/WebSocket 100 并发测试脚本和监控配置。

## 快速开始

### 前置条件

- Node.js `16+`，建议使用较新的 LTS 版本。
- npm，随 Node.js 安装。
- 已启动或可代理的后端服务：WebSocket、编译接口、统计接口。

### 安装依赖

```bash
npm install
```

### 启动开发服务器

```bash
npm run dev
```

### 生产构建

```bash
npm run build
```

该命令会先执行 `vue-tsc -b` 类型检查，再执行 `vite build`。

### 预览生产构建

```bash
npm run preview
```

## 后端接口与代理要求

前端代码使用同源路径访问后端：

| 前端路径       | 使用位置                                  | 后端含义                 |
| -------------- | ----------------------------------------- | ------------------------ |
| `/ws`          | `stores/pipeline.ts`                      | WebSocket 模拟器控制通道 |
| `/api/compile` | `CompactCodeEditor.vue`、`CodeEditor.vue` | 汇编源码编译接口         |
| `/api/stats`   | `UsageStats.vue`                          | 使用统计查询接口         |

`vite.config.ts` 当前未配置 dev server proxy，因此本地开发时有两种方式：

- 使用 Nginx、Caddy 或学校服务器网关，将 `/ws`、`/api/compile`、`/api/stats` 转发到 `RISC-V_Platform` 后端服务。
- 临时在 `vite.config.ts` 增加 `server.proxy`，让 Vite 开发服务器代理这些路径。

示例代理配置：

```ts
server: {
  proxy: {
    '/api/compile': 'http://localhost:8083',
    '/api/stats': 'http://localhost:8082',
    '/ws': {
      target: 'ws://localhost:8081',
      ws: true,
      changeOrigin: true,
    },
  },
}
```

生产部署时也需要等价反向代理，否则前端页面会加载成功，但编译、运行、统计功能无法连接后端。

## 项目结构

```text
riscv-pipeline-frontend/
├── index.html                    # Vite HTML 入口
├── package.json                  # npm 脚本和依赖
├── vite.config.ts                # Vite 配置，含 @ -> src alias
├── tailwind.config.js            # Tailwind 主题和扫描范围
├── postcss.config.js             # PostCSS 配置
├── tsconfig*.json                # TypeScript 工程配置
├── USER_GUIDE.md                 # 面向用户的中文操作说明书
├── src/
│   ├── main.ts                   # Vue 应用入口，注册 Pinia
│   ├── App.vue                   # 应用主布局和全局弹窗挂载
│   ├── style.css                 # 全局样式、CSS 变量、Tailwind 引入
│   ├── types/index.ts            # 前端核心类型定义
│   ├── stores/
│   │   ├── pipeline.ts           # WebSocket、流水线、差分测试、寄存器状态
│   │   └── panel.ts              # 左右面板配置、本地存储和 Tab 状态
│   ├── data/mockData.ts          # 无后端时的初始状态和开发模拟数据
│   └── components/
│       ├── PipelineEditor.vue    # SVG 流水线结构和连线高亮
│       ├── ControlPanel.vue      # 顶部运行控制栏
│       ├── PanelContainer.vue    # 左右面板容器
│       ├── PanelTabBar.vue       # 面板 Tab 切换
│       ├── DockingPanel.vue      # 可停靠面板外壳
│       ├── CompactPipelineInfo.vue # 左侧流水线信息面板
│       ├── CompactCodeEditor.vue # 右侧汇编代码编辑器
│       ├── DifftestPanel.vue     # 差分测试配置面板
│       ├── InfoPanel.vue         # CPU 状态信息面板
│       ├── UsageStats.vue        # 底部使用统计栏
│       ├── DraggableModal.vue    # 可拖拽弹窗基础组件
│       ├── RegisterModal.vue     # 寄存器详情弹窗
│       ├── AluModal.vue          # ALU 详情弹窗
│       ├── ControlSignalsModal.vue # 控制信号详情弹窗
│       ├── PipelineRegisterModal.vue # 流水线寄存器详情弹窗
│       ├── DifftestInputModal.vue # 差分测试信号输入弹窗
│       ├── DiffResultModal.vue   # 差分测试结果弹窗
│       └── HaltedModal.vue       # 程序停机提示弹窗
└── test/
    ├── k6-load-test-template.js  # HTTP API 负载测试
    ├── websocket-load-test.js    # WebSocket 并发测试
    ├── data/scenarios/*.json     # 教学场景数据
    ├── data/mock/*.json          # 模拟会话数据
    ├── monitoring/               # Prometheus / Grafana 配置
    └── *.md                      # 测试执行、数据准备和报告文档
```

## 关键模块说明

### `stores/pipeline.ts`

- 建立并维护 WebSocket 连接，默认 URL 为当前页面同源 `/ws`。
- 处理 `need_signal_input`、`diff_detected`、`ok`、`update` 等后端消息。
- 将后端 `signals` 转换为前端的 `CPUState`、活跃数据流、活跃控制信号、寄存器和 ALU 数据。
- 暴露 `nextClock()`、`start()`、`pause()`、`reset()`、`loadElfBinary()`、`enableDifftest()` 等核心操作。
- 使用 `safeJsonParse()` 处理大整数，避免 JavaScript number 精度导致寄存器值解析错误。

### `stores/panel.ts`

- 定义左右面板默认布局。
- 左侧默认包含“流水线信息”和“差分测试”。
- 右侧默认包含“代码编辑器”和“CPU 状态信息”。
- 使用 `localStorage` 的 `panel-system-state` 持久化当前面板状态。

### `PipelineEditor.vue`

- 使用 SVG 静态描述流水线模块、阶段寄存器、辅助模块和连接关系。
- 通过 `activeDataFlows` 和 `activeControlSignals` 决定连线高亮、箭头颜色和动画。
- 支持点击 Register File、Execute Unit、Control Unit、流水线阶段模块打开对应弹窗。
- 支持鼠标拖拽平移、滚轮缩放、双击重置视图。

### `CompactCodeEditor.vue`

- 默认提供一段包含 `.text`、`.globl _start`、`_start:` 和 `ebreak` 的示例汇编。
- 支持上传或拖拽 `.S`、`.s`、`.asm` 文件。
- 调用 `POST /api/compile` 编译源码。
- 编译成功后调用 `pipelineStore.loadElfBinary()`，通过 WebSocket 加载 ELF。

### `DifftestPanel.vue`

- 提供 4 个教学场景和自由模式。
- 场景 1：寄存器写，关注 `RegWrite`。
- 场景 2：操作数选择，关注 `RegWrite`、`ALUSrc`。
- 场景 3：内存访问，关注 `RegWrite`、`ALUSrc`、`MemRead`、`MemWrite`。
- 场景 4：分支控制，关注全部 5 个信号。
- 可选择后端教学 ELF 测试，也可在代码编辑器加载自定义程序后确认差分配置。

## 使用方式

### 自由编程模式

1. 在右侧“代码编辑器”面板编写汇编代码。
2. 确保包含 `.text`、`.globl _start` 和 `_start:`。
3. 建议用 `ebreak` 结束程序。
4. 点击“编译运行”。
5. 编译成功后点击“下一 clk”逐周期观察，或点击“运行”自动执行。

示例：

```asm
.text
.globl _start
_start:
    addi x1, x0, 10
    addi x2, x0, 20
    add x3, x1, x2
    ebreak
```

### 差分测试模式

1. 打开左侧“差分测试”面板。
2. 选择教学场景或自由模式。
3. 可选一个配套 ELF 测试用例并点击“加载并运行”。
4. 如果使用自定义代码，先在代码编辑器编译加载，再点击“确认配置”。
5. 后端请求控制信号输入时，前端弹出 `DifftestInputModal`。
6. 用户选择信号值并提交；若与参考结果不一致，弹出 `DiffResultModal`。

### 查看内部状态

- 点击 `Register File` 查看 32 个通用寄存器。
- 点击 `Execute Unit` 查看 ALU 操作数、操作类型和结果。
- 点击 `Control Unit` 查看控制信号。
- 点击 IF/ID、ID/EX、EX/MEM、MEM/WB 相关模块查看流水线寄存器详情。
- 在右侧“CPU 状态信息”面板查看周期、PC、活跃信号和寄存器堆。

## 后端消息约定

前端主要处理以下后端消息形态：

```json
{
  "status": "ok",
  "signals": {
    "cycle": 1,
    "pc": "0x80000000",
    "if_id": {},
    "id_ex": {},
    "execute": {},
    "ex_mem": {},
    "mem_wb": {},
    "writeback": {},
    "regfile": {},
    "datamem": {}
  }
}
```

```json
{
  "type": "need_signal_input",
  "needInput": {
    "pc": "0x80000000",
    "instruction": "ADDI",
    "signals": [
      { "name": "RegWrite", "expectedValue": "1" }
    ]
  }
}
```

```json
{
  "type": "diff_detected",
  "diffResult": {
    "detected": true,
    "stage": "WB",
    "message": "WB阶段差异"
  }
}
```

## 测试

### 类型检查与生产构建

```bash
npm run build
```

### 本地预览

```bash
npm run preview
```

### K6 HTTP API 负载测试

```bash
cd test
k6 run k6-load-test-template.js
```

指定目标服务：

```bash
BASE_URL=http://localhost:8080 k6 run k6-load-test-template.js
```

覆盖接口：

- `/api/compile`
- `/api/stats`

默认目标：

- `100` 并发用户。
- 持续 `5m`。
- `http_req_duration p(95)<2000ms`。
- 错误率 `<1%`。

### K6 WebSocket 负载测试

```bash
cd test
k6 run websocket-load-test.js
```

指定目标 WebSocket：

```bash
WS_URL=ws://localhost:8080/ws k6 run websocket-load-test.js
```

默认目标：

- `100` 并发 WebSocket 连接。
- 持续 `5m`。
- 连接成功率 `>99%`。
- 消息延迟 `p(95)<500ms`。

### 监控配置

`test/monitoring` 提供 Prometheus 和 Grafana 配置示例，可用于观察 HTTP 请求、WebSocket 连接、延迟和错误率趋势。

## 开发工作流

1. 先启动或代理后端 `/ws`、`/api/compile`、`/api/stats`。
2. 执行 `npm install` 安装前端依赖。
3. 执行 `npm run dev` 启动开发服务器。
4. 修改组件后在桌面和移动尺寸下检查布局。
5. 修改 WebSocket 字段后同步检查 `stores/pipeline.ts` 和后端输出 JSON。
6. 修改差分测试场景后同步检查 `DifftestPanel.vue`、`DifftestInputModal.vue`、后端教学 ELF 配置和用户指南。
7. 提交前运行 `npm run build`，涉及并发或接口改动时运行 K6 脚本。

当前目录未发现明确分支策略。建议按功能拆分小提交，避免把构建产物、测试报告和依赖缓存混入源码变更。

## 编码规范

- Vue 组件使用 `<script setup lang="ts">`。
- 状态集中放在 Pinia store 中，组件尽量只负责展示和触发 action。
- WebSocket 命令和后端响应字段应保持稳定，新增字段优先兼容旧字段。
- 涉及 64 位寄存器或大整数时避免直接依赖 JavaScript `number` 精度，可使用字符串或 `BigInt`。
- 面板新增项需同步更新 `stores/panel.ts` 的默认配置和 `PanelContainer.vue` 的 `componentMap`。
- 新增可视化连线需同步维护 `PipelineEditor.vue` 的连接定义和 `stores/pipeline.ts` 的 active flow 计算。
- 样式优先复用现有颜色变量：`--color-data-flow`、`--color-control-flow`、`--color-address-flow`。
- 移动端改动需检查 `992px`、`768px`、`576px` 断点下的布局。

## 常见问题

### 页面能打开，但编译或运行没有反应

检查 `/api/compile` 和 `/ws` 是否已代理到后端。当前 Vite 配置没有内置代理。

### WebSocket 一直断开重连

`pipeline.ts` 会在连接关闭后每 3 秒重连。检查浏览器控制台、后端 WebSocket 服务、代理是否支持 WebSocket upgrade。

### 编译成功后无法加载 ELF

确认后端 `api_compile_server.py` 返回了 `elf_data`，并且 WebSocket 后端支持 `load_elf_binary` 命令。

### 差分测试提示“请先加载程序”

自由模式需要先在代码编辑器中编译加载程序；场景模式可以选择配套 ELF 测试后点击“加载并运行”。

### 统计栏显示异常

检查 `/api/stats` 是否代理到后端统计服务，后端默认统计端口通常为 `8082`。

## 相关文档

- [用户使用说明书](USER_GUIDE.md)
- [并发测试指南](test/README.md)
- [测试执行指南](test/TEST_EXECUTION_GUIDE.md)
- [测试数据准备](test/TEST_DATA_PREPARATION.md)
- [并发测试项目总结](test/PROJECT_SUMMARY.md)
- [快速参考](test/QUICK_REFERENCE.md)
