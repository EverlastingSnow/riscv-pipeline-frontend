# 最终计划：RISC-V 流水线中断与异常教学演示（v2 - 评审修正版）

> 本计划在 `riscv-pipeline-interrupt-exception-demo.md`（v1）的基础上，根据 AI 评审意见修正 MSTATUS 操作、`last_trap_cause_` 生命周期、触发器语义、MRET 恢复、CSR 数据流等关键点。已通过 Phase 1 探索（源码 `simulator.cpp:200-839`、`riscv_sim_server.cpp:445-585`、`api_websocket_server.py:309-490`、`stores/pipeline.ts:402-445`、`PipelineEditor.vue:57-150`）确认所有引用与现状一致。

---

## 一、新增需求总结（不变）

- 中断 + 异常各 1 个，按钮触发软件中断，程序中的 `ecall` 自然触发异常
- 流水线动画清晰呈现：trap entry → 写 mepc/mcause/mstatus → 跳 MTVEC → flush → mret 返回
- 最小化修改：1 个 C++ 命令、1 个 Python 转发、1 个新 Vue 组件 + 少量 SVG/Store 字段

---

## 二、AI 评审意见采纳情况（v1→v2 关键变更）

| # | AI 评审意见 | v1 计划 | **v2 修正** | 状态 |
|---|------------|--------|------------|------|
| 1 | MSTATUS.MIE 操作逻辑（old_mie 直接放 bit 7） | v1 已改为 if/else | 保持；新增 MSTATUS_MPP 掩码常量统一在 simulator.cpp 顶部 | ✅ 已采纳 |
| 1-2 | EBREAK 遗漏 mstatus 更新 | v1 已修复 | 保持 | ✅ 已采纳 |
| 2 | `last_trap_cause_` 不应由前端清零 | v1 计划模糊 | **v2 明确在 `output_signals_body` 末尾 `sim.clear_trap_cause()`** | ✅ 已采纳 |
| 3 | `trigger_pending_interrupt` 不应自动设 MIE | v1 已只设 MIP | 保持；在示例程序中通过 `csrw mie, t0` 显式打开 MSIE | ✅ 已采纳 |
| 4 | 异常优先于中断（EX 先于 IF） | v1 未说明 | **v2 文档化**：EX 阶段异常在下一 IF 阶段中断检测前完成，符合 RISC-V 规范 | ✅ 已采纳 |
| 5 | mret 三元运算符优先级 bug | v1 已 if/else 化 | 保持 | ✅ 已采纳 |
| 6 | 前端 CSR 字段从 `sigs.csr` 读取 | v1 已规划 | **v2 确认**：Python 转发逻辑 `if 'cycle' in parsed_data: response = {'status':'ok','signals': parsed_data}` 整段透传，`parsed_data` 中的 `csr/trap_taken/interrupt_taken` 字段自动随 `signals` 一同发给前端；前端 `updateStateFromSignals(sigs)` 接收到 `signals` 对象后即可访问 `sigs.csr` | ✅ 路径已确认 |
| 7 | PipelineEditor 中 CSR 模块坐标 y=620 | v1 用了 y=620 | **v2 改为 y=640**（避开 ctrl 控制单元底部 60px 高度区间） | ✅ 已采纳 |
| 8 | 示例程序 `auipc`/`addi` 偏移量语义注释 | v1 已有 | **v2 强化**：注释中明确"auipc 的 PC=auipc 指令地址"，而非"当前 PC" | ✅ 已采纳 |

---

## 三、修改方案（最终版）

### 3.1 C++ 后端（`/opt/RISC-V_Platform/`）

#### A. `include/riscv/simulator.h` —— 新增 `TrapCause` 枚举与公开方法

```cpp
namespace riscv {
enum class HaltReason { None, Ecall, Ebreak, InvalidInstruction };

class RISCVSimulator {
public:
    // ... 既有内容 ...

    // ★ 新增：Trap 原因枚举
    enum class TrapCause { None, Interrupt, Exception };

    // ★ 新增：触发软件中断入口
    void trigger_pending_interrupt(u64 bit);

    // ★ 新增：访问器
    [[nodiscard]] TrapCause last_trap_cause() const { return last_trap_cause_; }
    void clear_trap_cause() { last_trap_cause_ = TrapCause::None; }
    [[nodiscard]] const CSR& csr() const { return csr_; }

private:
    // ... 既有私有成员 ...
    TrapCause last_trap_cause_{TrapCause::None};
};
}  // namespace riscv
```

#### B. `src/simulator.cpp` —— 修改 ECALL、新增 trigger、记录 trap cause

**1) ECALL：从 halt 改为 trap 重定向**（`simulator.cpp:788-794`）

```cpp
case InstructionKind::ECALL: {
    // ★ 与 EBREAK 对齐：写 mepc/mcause/mtval + 更新 mstatus + 跳 MTVEC
    csr_.write(CSR_MEPC, instr.pc);
    csr_.write(CSR_MCAUSE, 11);  // Environment call from M-mode
    csr_.write(CSR_MTVAL, 0);

    constexpr u64 MSTATUS_MIE  = 1ULL << 3;
    constexpr u64 MSTATUS_MPIE = 1ULL << 7;
    u64 mstatus = csr_.read(CSR_MSTATUS);
    // ★ 评审修正：用 if/else 避免位操作三元运算
    if (mstatus & MSTATUS_MIE) {
        mstatus |= MSTATUS_MPIE;
    } else {
        mstatus &= ~MSTATUS_MPIE;
    }
    mstatus &= ~MSTATUS_MIE;
    csr_.write(CSR_MSTATUS, mstatus);

    u64 mtvec = csr_.read(CSR_MTVEC);
    branch_taken = true;
    branch_target = mtvec & ~0x3ULL;
    flush_decode_ = true;
    flush_execute_ = true;
    pending_ebreak_ = false;          // ★ 不再走 halt
    last_trap_cause_ = TrapCause::Exception;
    alu_result = 0;
    break;
}
```

**2) EBREAK 块（`simulator.cpp:795-816`）—— 同步修复 mstatus 遗漏**

将现有 mstatus 更新代码替换为 if/else 版本（与 ECALL 一致），并增加 `last_trap_cause_ = TrapCause::Exception;`

**3) MRET 块（`simulator.cpp:817-839`）—— 评审修正后版本**

```cpp
case InstructionKind::MRET: {
    u64 mepc = csr_.read(CSR_MEPC);
    branch_taken = true;
    branch_target = mepc;
    flush_decode_ = true;
    flush_execute_ = true;
    next_if_id_ = {};
    stall_fetch_ = false;

    constexpr u64 MSTATUS_MIE  = 1ULL << 3;
    constexpr u64 MSTATUS_MPIE = 1ULL << 7;
    constexpr u64 MSTATUS_MPP  = 0x1800;  // bits [12:11]
    u64 mstatus = csr_.read(CSR_MSTATUS);

    // ★ MIE = MPIE（恢复中断使能）
    if (mstatus & MSTATUS_MPIE) {
        mstatus |= MSTATUS_MIE;
    } else {
        mstatus &= ~MSTATUS_MIE;
    }
    // ★ MPIE 置 1（规范要求）
    mstatus |= MSTATUS_MPIE;
    // ★ MPP 不变（教学演示简化，保留原值）
    csr_.write(CSR_MSTATUS, mstatus);

    alu_result = 0;
    break;
}
```

> **评审修正要点**：原 v1 保留 old_mpp 后写回 MPP，但 v1 中间代码 `mstatus = (mstatus & ~MSTATUS_MPP) | (old_mpp << 11);` 实际上等价于"不变"，可简化为直接保留 MPP 字段。v2 进一步精简。

**4) `stage_if()` 中断检测处（约 `simulator.cpp:219-256`）—— 记录 `last_trap_cause_`**

在 `redirect_ = true;` 之前新增一行：
```cpp
last_trap_cause_ = TrapCause::Interrupt;
```

**5) `stage_wb()` 中 `pending_ebreak_` 处理（`simulator.cpp:1069-1072`）**

```cpp
// ★ 评审修正：ECALL 已不产生 pending_ebreak_，仅 EBREAK 触发 halt
if (pending_ebreak_ && mem_wb_.instr.kind == InstructionKind::EBREAK) {
    halted_ = true;
    pending_ebreak_ = false;
}
```

**6) 新增 `trigger_pending_interrupt` 方法**（在 `set_user_signal_for_id` 之后）

```cpp
void RISCVSimulator::trigger_pending_interrupt(u64 bit) {
    if (bit >= 64) return;
    // ★ 评审修正：只设置 MIP，不自动设 MIE
    // 教学意义：让学生程序显式 `csrw mie, t0` 打开 MSIE，
    // 体现"中断 pending"与"中断使能"是两个独立的概念
    u64 mip = csr_.read(CSR_MIP);
    csr_.write(CSR_MIP, mip | (1ULL << bit));
}
```

**7) `reset()` 中清零 trap cause**（`simulator.cpp` 的 `reset()` 实现末尾）

```cpp
last_trap_cause_ = TrapCause::None;
```

#### C. 关于异常 vs 中断优先级（v2 文档化）

当前实现的 trap 检测顺序（**符合 RISC-V 规范**）：

| 触发源 | 阶段 | 写入 CSR | 跳转目标 |
|--------|------|----------|----------|
| ECALL/EBREAK（异常） | **EX 阶段** | mepc/mcause/mtval + 更新 mstatus | MTVEC |
| pending interrupt | **IF 阶段**（每条新指令取指前） | 同上 | MTVEC |

**行为**：若某条指令执行 ECALL 时有 pending 中断，EX 阶段异常会先于下一个 IF 阶段中断检测触发，**符合 RISC-V 规范的"异常优先"**。在示例程序注释中说明此点。

#### D. `src/riscv_sim_server.cpp` —— 添加 trigger_interrupt 命令与 CSR 输出

**1) 新增命令**（在 `main()` 的命令分发处，约 1087 行）

```cpp
} else if (cmd == "trigger_interrupt") {
    u64 bit = 0;
    iss >> bit;
    if (sim) {
        sim->trigger_pending_interrupt(bit);
    }
    std::cout << "{\"status\":\"ok\",\"message\":\"Triggered interrupt bit "
              << bit << "\"}" << std::endl;
}
```

**2) `output_signals_body` 末尾（`halted` 字段之前，约 575 行）追加 CSR JSON**

```cpp
// ★ 新增：CSR 状态输出
std::cout << ",\"csr\":{"
          << "\"mtvec\":\"0x" << std::hex << sim.csr().read(0x305) << std::dec << "\","
          << "\"mepc\":\"0x" << std::hex << sim.csr().read(0x341) << std::dec << "\","
          << "\"mcause\":\"0x" << std::hex << sim.csr().read(0x342) << std::dec << "\","
          << "\"mtval\":\"0x" << std::hex << sim.csr().read(0x343) << std::dec << "\","
          << "\"mstatus\":\"0x" << std::hex << sim.csr().read(0x300) << std::dec << "\","
          << "\"mie\":\"0x" << std::hex << sim.csr().read(0x304) << std::dec << "\","
          << "\"mip\":\"0x" << std::hex << sim.csr().read(0x344) << std::dec << "\""
          << "}";
```

**3) `output_signals_body` 末尾（`halted` 字段之后，约 585 行）追加 trap 标志 + 清零**

```cpp
// ★ 新增：trap 标志（区分异常与中断）
std::cout << ",\"trap_taken\":" << (sim.last_trap_cause() == riscv::RISCVSimulator::TrapCause::Exception ? "true" : "false");
std::cout << ",\"interrupt_taken\":" << (sim.last_trap_cause() == riscv::RISCVSimulator::TrapCause::Interrupt ? "true" : "false");

std::cout << ",\"halted\":" << (sim.halted() ? "true" : "false");
if (sim.halted()) {
    if (sim.halt_reason_ecall()) {
        std::cout << ",\"halt_reason\":\"ecall\"";
    } else if (sim.halt_reason_ebreak()) {
        std::cout << ",\"halt_reason\":\"ebreak\"";
    } else {
        std::cout << ",\"halt_reason\":\"other\"";
    }
}

// ★ 评审修正 #2：每次输出后立即清零 trap_cause
// 保证前端每个 cycle 看到的 trap_taken 只反映本 cycle 发生的 trap
sim.clear_trap_cause();
```

### 3.2 Python WebSocket 桥（`api_websocket_server.py`）

在 `handle_client` 的 `elif command == 'stop':` 之后（约 386 行）添加：

```python
elif command == 'trigger_interrupt':
    bit = int(data.get('bit', 3))
    sim = self.simulators.get(client_id)
    if not sim:
        response = {'status': 'error', 'message': 'Simulator not initialized'}
    else:
        # send_command 返回的 JSON 已含 status 字段
        result = sim.send_command(f"trigger_interrupt {bit}")
        if result:
            try:
                response = json.loads(result)
            except:
                response = {'status': 'ok', 'message': f'Interrupt {bit} triggered'}
        else:
            response = {'status': 'error', 'message': 'Failed to trigger interrupt'}
    await websocket.send(json.dumps(response))
```

> **数据流说明**（评审点 #6 已确认）：Python 在 `step` / `run` 响应中执行 `if 'cycle' in parsed_data: response = {'status':'ok','signals': parsed_data}`（`api_websocket_server.py:334-335`），**整段透传**。C++ 端将 `csr/trap_taken/interrupt_taken` 字段作为 `output_signals_body` 输出 JSON 的顶层 key，因此 `parsed_data` 自动包含这些字段，前端 store 通过 `sigs.csr` 即可访问，**无需在 Python 端额外解包**。

### 3.3 前端 Vue（`/var/www/riscv-pipeline-frontend/src/`）

#### A. `stores/pipeline.ts`

**1) 扩展 `PipelineSignals` 接口**（`pipeline.ts:15-28`）

```ts
interface PipelineSignals {
  cycle?: number;
  pc?: string;
  if_id: any;
  id_ex: any;
  execute: any;
  ex_mem: any;
  mem_wb: any;
  writeback: any;
  regfile: any;
  datamem: any;
  // ★ 新增
  csr?: {
    mtvec: string;
    mepc: string;
    mcause: string;
    mtval: string;
    mstatus: string;
    mie: string;
    mip: string;
  };
  trap_taken?: boolean;
  interrupt_taken?: boolean;
}
```

**2) 新增 store 字段与方法**

```ts
// ★ 新增：CSR 状态
const csrState = ref<PipelineSignals['csr'] | null>(null);
const lastTrapType = ref<'none' | 'interrupt' | 'exception'>('none');

// ★ 新增：触发软件中断
function triggerInterrupt(bit: number = 3) {
  sendCommand('trigger_interrupt', { bit });
}

// ★ 新增：设置编辑器代码（供 InterruptDemoPanel 调用）
const editorCode = ref<string>('');
function setEditorCode(code: string) {
  editorCode.value = code;
}
```

**3) `updateStateFromSignals()` 中解析 CSR**（`pipeline.ts:191-244`）

在 `setTimeout` 内 `cpuState.value = {...}` 之前添加：
```ts
if (sigs.csr) {
  csrState.value = sigs.csr;
}
if (sigs.trap_taken || sigs.interrupt_taken) {
  lastTrapType.value = sigs.interrupt_taken ? 'interrupt' : 'exception';
} else {
  lastTrapType.value = 'none';
}
```

**4) `calculateActiveControlSignals()` 中添加 trap 高亮**（`pipeline.ts:432-443`）

```ts
// ★ 新增：trap 跳转路径高亮
if (sigs.trap_taken || sigs.interrupt_taken) {
  activeSignals.push({ id: 'fetchUnit_do_flush', value: '1' });
  activeSignals.push({ id: 'decodeUnit_do_flush', value: '1' });
  activeSignals.push({ id: 'executeUnit_do_flush', value: '1' });
  activeSignals.push({ id: 'trap_mcause', value: sigs.csr?.mcause || '0x0' });
  activeSignals.push({ id: 'trap_mepc', value: sigs.csr?.mepc || '0x0' });
  activeSignals.push({ id: 'trap_taken_signal', value: '1' });
}
```

**5) return 语句补充导出**

```ts
return {
  // ... 既有字段 ...
  csrState,            // ★ 新增
  lastTrapType,        // ★ 新增
  editorCode,          // ★ 新增
  triggerInterrupt,    // ★ 新增
  setEditorCode,       // ★ 新增
};
```

#### B. `components/InterruptDemoPanel.vue`（新建）

参考 `DifftestPanel.vue` 的写法。功能包括：

1. **"加载示例程序" 按钮** → 调用 `setEditorCode()` 写入预置汇编
2. **"触发软件中断" 按钮** → `pipelineStore.triggerInterrupt(3)` → `signals.csr.mip` 应出现 `0x8`
3. **CSR 状态表**：实时显示 MTVEC / MEPC / MCAUSE / MTVAL / MSTATUS / MIE / MIP
4. **当前 Trap 状态指示**：空闲 / 异常（mcause=0xb）/ 中断（mcause=0x8000000000000003）
5. **Trap 说明面板**：用文字解释"按下按钮后会发生什么"

**预置示例程序**（v2 修正版）：

```asm
# ===== 中断与异常演示程序 =====
# 加载并编译后，按"单步"或"运行"。
# 观察：ECALL 触发异常，CSR 状态栏出现 mcause=0xb。
# 中断面板点击"触发软件中断"按钮，CSR 状态栏出现 mcause=0x8000000000000003。
.text
.globl _start
_start:
    # 1) 设置 trap vector base = PC(auipc) + 32
    #    注意：auipc 指令的"PC"=auipc 自身的地址
    #    trap_handler 距离 auipc 之后 8 条指令 = 32 字节
    auipc t0, 0
    addi  t0, t0, 32
    csrw  mtvec, t0

    # 2) 显式打开 MSIE（MIE bit 3 = 1）
    #    这里演示"中断使能"是程序主动配置的，不是外设自动开启
    li    t1, 8
    csrw  mie, t1

    # 3) 全局使能机器中断（mstatus.MIE = 1）
    li    t1, 8
    csrw  mstatus, t1

loop:
    addi  x1, x1, 1     # 正常工作
    ecall               # 异常：environment call → mcause=11
    j     loop

trap_handler:
    csrr  t0, mcause    # 读取 mcause 区分中断/异常
    addi  x2, x2, 1     # 计数 trap 次数
    mret                # 从 trap 返回
```

#### C. `components/PipelineEditor.vue` —— 新增 trap 跳转连线与 CSR 模块

**1) `initialAuxiliaryModules` 中新增 CSR 模块**（`PipelineEditor.vue:72-77`）

> **评审修正 #7**：坐标改为 y=640（避开 ctrl 控制单元 60px 高度区）

```ts
const initialAuxiliaryModules: ModuleData[] = [
  { id: 'regFile', name: 'Register File', icon: Database, x: 400, y: 480, width: 120, height: 120 },
  { id: 'instMEM', name: 'instMEM', icon: HardDrive, x: 150, y: 370, width: 120, height: 120 },
  { id: 'dataMEM', name: 'Data Memory', icon: Database, x: 650, y: 370, width: 120, height: 120 },
  { id: 'ctrl', name: 'Control Unit', icon: Settings, x: 150, y: 0, width: CTRL_WIDTH, height: CTRL_HEIGHT },
  // ★ 新增：CSR 模块
  { id: 'csr', name: 'CSR (mtvec/mepc/mcause/mstatus)', icon: Settings,
    x: 400, y: 640, width: 400, height: 60, editable: false },
];
```

**2) `initialConnections` 中新增 trap 跳转连线**（在 `fetchUnit_do_flush` 后追加）

```ts
// ★ 新增：trap 跳转与 flush 连线（红色箭头从 csr 指向 fetchUnit）
{ id: 'trap_redirect', source: 'csr', target: 'fetchUnit', type: 'control',
  label: 'trap_redirect', sourceOffset: { x: 50, y: 0 },
  targetOffset: { x: 60, y: 120 }, arrowDirection: 'top', wordOffset: {x: -10, y: -5} },
{ id: 'trap_flush_decode', source: 'csr', target: 'decodeStage', type: 'control',
  label: 'flush_IF_ID', sourceOffset: { x: 150, y: 0 },
  targetOffset: { x: 15, y: STAGE_HEIGHT }, arrowDirection: 'top' },
{ id: 'trap_flush_execute', source: 'csr', target: 'executeStage', type: 'control',
  label: 'flush_ID_EX', sourceOffset: { x: 250, y: 0 },
  targetOffset: { x: 15, y: STAGE_HEIGHT }, arrowDirection: 'top' },
```

#### D. `components/PanelContainer.vue` —— 注册新组件（约 23-28 行的 `componentMap`）

```ts
'InterruptDemoPanel': defineAsyncComponent(() => import('./InterruptDemoPanel.vue'))
```

#### E. `stores/panel.ts` —— 添加 InterruptDemoPanel

在 `rightPanels` 中添加：
```ts
{
  id: 'right-interrupt-demo',
  title: '中断与异常演示',
  icon: 'zap',
  position: 'right',
  isActive: false,
  isExpanded: false,
  order: 2,
  componentName: 'InterruptDemoPanel'
}
```

#### F. `components/CompactCodeEditor.vue`

监听 `pipelineStore.editorCode` 的变化：
```ts
import { usePipelineStore } from '@/stores/pipeline';
const store = usePipelineStore();
watch(() => store.editorCode, (newCode) => {
  if (newCode) {
    code.value = newCode;
    store.editorCode = '';  // 清空，避免循环触发
    // 触发编译...
  }
});
```

---

## 四、文件清单

| 文件 | 类型 | 关键变更 |
|------|------|----------|
| `opt/RISC-V_Platform/include/riscv/simulator.h` | 修改 | `TrapCause` 枚举、公开方法声明、访问器 |
| `opt/RISC-V_Platform/src/simulator.cpp` | 修改 | ECALL 走 trap、EBREAK 补 mstatus、MRET 修正、IF 中断检测记录 trap cause、`trigger_pending_interrupt()`（仅设 MIP）、`stage_wb` ECALL 不再 halt、`reset` 清零 trap cause |
| `opt/RISC-V_Platform/src/riscv_sim_server.cpp` | 修改 | `trigger_interrupt` 命令、CSR JSON 输出、trap_taken/interrupt_taken 字段、**`output_signals_body` 末尾 `clear_trap_cause()`** |
| `opt/RISC-V_Platform/api_websocket_server.py` | 修改 | `trigger_interrupt` 命令转发 |
| `var/www/riscv-pipeline-frontend/src/stores/pipeline.ts` | 修改 | csr 字段、`triggerInterrupt()` 方法、`csrState/lastTrapType/editorCode` 状态、trap 高亮 |
| `var/www/riscv-pipeline-frontend/src/components/InterruptDemoPanel.vue` | **新建** | 触发按钮、CSR 状态表、加载示例程序、说明面板 |
| `var/www/riscv-pipeline-frontend/src/components/PipelineEditor.vue` | 修改 | trap 跳转连线、CSR 模块（**y=640**） |
| `var/www/riscv-pipeline-frontend/src/components/PanelContainer.vue` | 修改 | 注册新组件 |
| `var/www/riscv-pipeline-frontend/src/stores/panel.ts` | 修改 | 添加新面板（right, order=2） |
| `var/www/riscv-pipeline-frontend/src/components/CompactCodeEditor.vue` | 修改 | 监听 `editorCode` 自动填入 |

---

## 五、决策与假设（v2 强化）

1. **软件中断选 MSIP (bit 3)**：CSR 配置最简单，按钮即可触发
2. **异常选 ECALL**：标准 RISC-V 行为，最容易理解 trap entry
3. **`trigger_pending_interrupt` 只设 MIP**：v2 强化教学清晰度；MIE 必须由学生程序 `csrw mie, t0` 显式打开
4. **MRET 中 MPP 处理**：v2 简化为保持不变（原 v1 的"恢复 MPP"实际等价于不变）
5. **`last_trap_cause_` 由 simulator 输出后立即清零**：v2 修正 v1 的"前端清零"方案，避免跨 cycle 状态污染
6. **异常 vs 中断优先级**：v2 文档化——EX 阶段异常先于 IF 阶段中断检测，符合 RISC-V 规范
7. **CSR 模块坐标 y=640**：v2 修正 v1 的 y=620，避开 ctrl 60px 高度区
8. **示例程序 auipc 偏移注释**：v2 强化——明确 auipc 的"PC"=auipc 自身地址
9. **MSTATUS 更新用 if/else**：v2 统一所有 trap entry/exit 用 if/else，避免三元运算符优先级陷阱
10. **不实现 trap 嵌套 / 上下文保存**：超纲

---

## 六、验证步骤

1. **后端编译**：`cd /opt/RISC-V_Platform/build && cmake --build . -j4`
2. **后端协议测试**：`echo "load <elf>\ntrigger_interrupt 3\nstep\nquit" | ./build/riscv_sim_server`
   - 验证 JSON 中 `csr.mip == 0x8`、`csr.mstatus.MPIE` 在 trap entry 后为 1
   - 验证 `trap_taken=true` 仅在 trap 发生 cycle 为 true，后续 cycle 为 false
3. **前端启动**：`cd /var/www/riscv-pipeline-frontend && npm run dev`
4. **集成验证**：
   - 加载示例程序 → 单步至 `ecall` → 观察 PC 跳至 trap_handler、流水线被 flush、`mcause=0xb`
   - 单步至 `mret` → 观察 PC 恢复、`mstatus.MIE` 重新使能
   - 在 loop 中点击"触发软件中断" → `mcause=0x8000000000000003`
5. **回归测试**：原有 4 个 difftest 场景正常运行

---

## 七、风险与缓解

| 风险 | v2 缓解 |
|------|---------|
| `last_trap_cause_` 状态污染 | C++ 端 `output_signals_body` 末尾 `clear_trap_cause()` |
| EBREAK 路径 mstatus 遗漏 | v1 已修复，v2 保持 |
| MSTATUS 操作可读性差 | v2 统一 if/else |
| trigger 同时改 MIP/MIE 导致概念混淆 | v2 只设 MIP，示例程序显式开 MIE |
| 忘记开 MIE 按按钮无反应 | 示例程序 `_start` 已 `csrw mie, t0` + 注释 |
| ECALL 改 trap 影响其他测试 | 现有 ELF 测试无 ECALL 用法（grep 已确认） |
| CSR 模块与 ctrl 重叠 | v2 坐标 y=640 避开 |
| `csr()` 访问器暴露内部 CSR | 仅 const 引用，封装原则 OK |
| `auipc` 偏移量硬编码 | v2 注释中明确 PC-of-auipc 语义 |
| 异常 vs 中断优先级混淆 | v2 §3.1.C 文档化 |
