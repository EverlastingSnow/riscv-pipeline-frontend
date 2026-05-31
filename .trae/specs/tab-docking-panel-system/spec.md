# Tab + 可停靠面板系统规范

## Why
当前 RISC-V 流水线前端布局中，浮动面板（代码编辑器、流水线信息等）采用绝对定位，存在以下问题：
1. 布局固定，难以根据用户需求调整
2. 无法同时显示多个信息面板
3. 响应式支持复杂，维护成本高
4. 缺乏统一的面板管理机制，扩展困难

需要设计一套灵活的 Tab + 可停靠面板系统，支持用户自定义布局，同时保持良好的可扩展性。

## What Changes
- **新增** Tab 标签栏组件（PanelTabBar），支持左右两侧面板管理
- **新增** 可停靠面板容器组件（DockingPanel），统一管理面板显示
- **新增** 面板状态管理（usePanelStore），集中管理面板的显示/隐藏、位置、展开状态
- **重构** 现有浮动面板（CompactPipelineInfo、CompactCodeEditor）纳入面板系统
- **新增** 面板拖拽、排序、最小化、最大化、关闭等功能
- **优化** 响应式布局逻辑，根据屏幕尺寸自动调整面板显示

## Impact
- **受影响的规格**：
  - 用户界面布局系统
  - 面板交互功能
  - 响应式设计

- **受影响的代码**：
  - `src/App.vue` - 主布局调整
  - `src/components/ControlPanel.vue` - 顶部控制面板（保持不变）
  - `src/components/UsageStats.vue` - 底部统计栏（保持不变）
  - `src/components/CompactPipelineInfo.vue` - 纳入面板系统
  - `src/components/CompactCodeEditor.vue` - 纳入面板系统
  - `src/components/InfoPanel.vue` - 纳入面板系统

---

## ADDED Requirements

### Requirement: Tab 标签栏系统
系统 SHALL 提供 Tab 标签栏组件，支持左侧和右侧各一组 Tab，每组最多显示 4 个标签页。

#### Scenario: 左侧 Tab 栏操作
- **WHEN** 用户点击左侧 Tab 栏的标签
- **THEN** 显示对应的面板内容，标签高亮显示
- **AND** 其他未选中的 Tab 保持默认样式

#### Scenario: 右侧 Tab 栏操作
- **WHEN** 用户点击右侧 Tab 栏的标签
- **THEN** 显示对应的面板内容，标签高亮显示
- **AND** 支持与左侧 Tab 栏同时激活

#### Scenario: 超过最大数量限制
- **WHEN** 用户尝试添加第 5 个 Tab
- **THEN** 显示提示信息，阻止添加
- **AND** 保持现有 4 个 Tab 正常显示

### Requirement: 可停靠面板容器
系统 SHALL 提供可停靠面板容器组件，支持面板的展开、折叠、关闭操作。

#### Scenario: 展开面板
- **WHEN** 用户点击 Tab 标签或展开按钮
- **THEN** 面板展开显示完整内容
- **AND** 容器高度根据内容自适应

#### Scenario: 折叠面板
- **WHEN** 用户点击折叠按钮
- **THEN** 面板收缩为标题栏高度
- **AND** 保持面板状态和数据

#### Scenario: 关闭面板
- **WHEN** 用户点击关闭按钮
- **THEN** 面板从 DOM 中移除
- **AND** 相应的 Tab 变为非激活状态

### Requirement: 面板状态持久化
系统 SHALL 保存用户的面板布局偏好，包括：
- 哪些面板处于激活状态
- 面板的展开/折叠状态
- 面板的顺序（Tab 排序）

#### Scenario: 页面刷新后恢复布局
- **WHEN** 用户刷新页面
- **THEN** 自动恢复上次的面板布局状态
- **AND** 保持面板内容的连续性

### Requirement: 响应式布局适配
系统 SHALL 根据屏幕宽度自动调整面板显示策略。

#### Scenario: 大屏幕布局（> 1200px）
- **WHEN** 屏幕宽度大于 1200px
- **THEN** 左右两侧面板正常显示
- **AND** 支持最多 4 个面板同时显示

#### Scenario: 中等屏幕布局（992px - 1200px）
- **WHEN** 屏幕宽度在 992px 到 1200px 之间
- **THEN** 面板宽度适当缩小
- **AND** 保持至少 2 个面板可同时显示

#### Scenario: 小屏幕布局（< 992px）
- **WHEN** 屏幕宽度小于 992px
- **THEN** 面板改为底部弹出式显示
- **AND** 最多同时显示 1 个面板

---

## MODIFIED Requirements

### Requirement: 主布局结构
**变更前**：浮动面板采用绝对定位，紧贴在流水线可视化区域边缘
**变更后**：面板纳入 Tab + Docking 系统，支持灵活布局和用户自定义

#### Scenario: 保留现有功能
- **WHEN** 用户使用现有的控制面板、流水线编辑器等功能
- **THEN** 功能完全保持不变
- **AND** 性能无明显下降

### Requirement: 面板内容展示
**变更前**：CompactCodeEditor 和 CompactPipelineInfo 为独立的浮动面板
**变更后**：作为可停靠面板的内容，支持 Tab 切换和布局调整

#### Scenario: 代码编辑器面板
- **WHEN** 用户选择代码编辑器 Tab
- **THEN** 显示完整的代码编辑器功能
- **AND** 支持展开/折叠/关闭操作

#### Scenario: 流水线信息面板
- **WHEN** 用户选择流水线信息 Tab
- **THEN** 显示流水线寄存器和状态信息
- **AND** 支持展开/折叠/关闭操作

---

## REMOVED Requirements

### Requirement: 旧版浮动面板定位逻辑
**Reason**: 该逻辑与新的 Tab + Docking 系统冲突，无法共存
**Migration**: 统一使用新的面板系统，旧版定位代码将作为注释保留 2 周后删除

---

## Technical Architecture

### 组件结构
```
App.vue
├── ControlPanel (保持不变)
├── MainContent
│   ├── LeftPanelZone
│   │   ├── PanelTabBar (左侧)
│   │   └── DockingPanel
│   │       └── [可配置的 Panel 内容]
│   ├── PipelineEditor (核心可视化区域)
│   └── RightPanelZone
│       ├── PanelTabBar (右侧)
│       └── DockingPanel
│           └── [可配置的 Panel 内容]
└── UsageStats (保持不变)
└── [Modal 弹窗层 - 通过 Teleport 传送到 body，不受影响]
    ├── RegisterModal
    ├── AluModal
    ├── ControlSignalsModal
    ├── PipelineRegisterModal (IF/ID, ID/EX, EX/MEM, MEM/WB)
    └── [其他弹窗组件]
```

### 弹窗系统兼容性说明
**重要**：Tab + Docking 面板系统**不会影响**现有的弹窗功能（Modal）。

原因：
1. **独立渲染**：所有弹窗组件（RegisterModal、AluModal、PipelineRegisterModal 等）使用 Vue 的 `<Teleport to="body">` 传送到 body 元素
2. **浮层定位**：弹窗使用绝对定位，z-index 为 50，覆盖在整个应用之上
3. **独立状态管理**：弹窗由 `pipelineStore.activeModals` 独立管理，与面板系统无依赖关系
4. **无布局冲突**：弹窗的渲染位置与面板系统的 DOM 结构完全分离

影响范围：
- ✅ IF/ID Pipeline Register 弹窗：正常工作
- ✅ ID/EX Pipeline Register 弹窗：正常工作
- ✅ EX/MEM Pipeline Register 弹窗：正常工作
- ✅ MEM/WB Pipeline Register 弹窗：正常工作
- ✅ RegisterModal (通用寄存器)：正常工作
- ✅ AluModal (ALU详情)：正常工作
- ✅ ControlSignalsModal (控制信号)：正常工作
- ✅ 其他弹窗组件：正常工作

### 面板内容分配
**推荐分配到侧边面板的内容：**
1. 流水线寄存器信息（CompactPipelineInfo）
2. 代码编辑器（CompactCodeEditor）
3. 寄存器详情（RegisterModal）
4. ALU 详情（AluModal）
5. 控制信号（ControlSignalsModal）
6. Diff 对比结果（DiffResultModal）

### 状态管理
```typescript
interface PanelState {
  id: string;                    // 面板唯一标识
  title: string;                  // Tab 显示标题
  icon: string;                  // Tab 图标
  position: 'left' | 'right';    // 停靠位置
  isActive: boolean;             // 是否激活
  isExpanded: boolean;           // 是否展开
  order: number;                // 显示顺序
  component: Component;          // 面板内容组件
}

interface PanelStore {
  leftPanels: PanelState[];      // 左侧面板列表
  rightPanels: PanelState[];     // 右侧面板列表
  maxPanelsPerSide: number;      // 每侧最大面板数（默认 4）
}
```
