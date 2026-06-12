# 计划：RISC-V 流水线中断与异常教学演示

## 一、新增需求总结

**目标**：让学生在已有的五级流水线虚拟仿真平台上观察**中断（Interrupt）**与**异常（Exception）**的处理流程，理解：
- 触发条件 → 流水线检测 → 写入 CSR（mepc/mcause/mstatus）→ 跳转 MTVEC → 执行 handler → `mret` 返回

**演示方式（黑盒）**：
- 前端预装一个示例程序（含 `_start` + `trap_handler` + `mret`），学生只需"运行"即可
- 异常由程序中的 `ecall` 自然触发（无需额外控件）
- 中断由前端"触发软件中断"按钮触发（设置 `MIP[3]=1`）
- 异常/中断发生后，handler 内部"假设修复完毕"，执行 `mret` 返回

**实施原则**：
- 尽量利用已有 CSR/中断/EBREAK 机制，最小化修改
- 仅添加 1 个新 C++ 命令、1 个 Python 转发、1 个新 Vue 组件 + 少量 SVG 动画

---

## 二、现状分析（Phase 1 探索结果）

### 后端基础设施（已具备）

| 能力 | 位置 | 状态 |
|------|------|------|
| MSTATUS/MIE/MTVEC/MEPC/MCAUSE/MTVAL/MIP CSR | `src/csr.cpp` | ✅ 完整 |
| `has_pending_interrupt()` / `get_interrupt_cause()` | `csr.cpp:163-182` | ✅ 完整 |
| IF 阶段检测 pending interrupt 并跳转 MTVEC | `src/simulator.cpp:219-256` | ✅ 完整 |
| EBREAK 跳转 MTVEC（mcause=3） | `simulator.cpp:795-816` | ✅ 完整 |
| MRET 指令（恢复 mstatus.MIE/MPIE，跳 mepc） | `simulator.cpp:817-839` | ✅ 完整 |
| WFI 唤醒 | `simulator.cpp:761-787` | ✅ 完整 |
| flush_decode / flush_execute 支持 | `simulator.cpp:1106-1136` | ✅ 完整 |
| 教学测试加载 `load_test` / `load_elf_test` | `riscv_sim_server.cpp:663-758` | ✅ 完整 |
| 用户按钮控件 | `components/ControlPanel.vue` | ✅ 完整 |
| SVG 流水线可视化（含 branch_taken 闪烁） | `components/PipelineEditor.vue` | ✅ 完整 |
| Pinia store + WebSocket | `stores/pipeline.ts` | ✅ 完整 |

### 关键缺口

| 缺口 | 说明 | 影响 |
|------|------|------|
| `ECALL` 行为 | 当前只是 `halt_reason_=Ecall` 后停机（`simulator.cpp:788-794`） | 无法演示异常 → handler 流程 |
| 触发中断的外部入口 | 没有命令可让外部设置 `MIP[bit]` | 没有交互入口触发中断 |
| CSR 寄存器不可见 | `output_signals_body` 不输出 mtvec/mepc/mcause/mstatus/mie/mip | 学生看不到关键 CSR 变化 |
| Trap redirect 与 Branch redirect 不可区分 | 两者都走 `redirect_/branch_taken` | SVG 动画无法针对性高亮 |
| 无 Trap 模块/连线 | SVG 缺少从 CSR/控制单元到 FetchUnit 的跳转动画 | 缺少"中断→改 PC→flush 流水线"的可视化 |
| 无 CSR 状态显示 | InfoPanel 只有通用寄存器 | 学生看不到 MTVEC/MEPC/MCAUSE 等关键状态 |

---

## 三、修改方案

### 3.1 C++ 后端（`/opt/RISC-V_Platform/`）

#### A. 修改 `src/simulator.cpp`：让 `ECALL` 走 trap 重定向，并修复 EBREAK 的 mstatus 遗漏

**位置**：`simulator.cpp:788-794`（`case InstructionKind::ECALL`）

**修改内容**：将 ECALL 行为从"halt"改为"跳转到 MTVEC"（与 EBREAK 一致），MCAUSE=11（environment call from M-mode）。MSTATUS 更新采用清晰的 if/else 写法（避免位操作三元运算的阅读负担）：

```cpp
case InstructionKind::ECALL:
    csr_.write(CSR_MEPC, instr.pc);
    csr_.write(CSR_MCAUSE, 11);  // Environment call from M-mode
    csr_.write(CSR_MTVAL, 0);
    {
        // MSTATUS 更新：MPIE = old MIE; MIE = 0
        u64 mstatus = csr_.read(CSR_MSTATUS);
        constexpr u64 MSTATUS_MIE  = 1ULL << 3;
        constexpr u64 MSTATUS_MPIE = 1ULL << 7;
        if (mstatus & MSTATUS_MIE) {
            mstatus |= MSTATUS_MPIE;
        } else {
            mstatus &= ~MSTATUS_MPIE;
        }
        mstatus &= ~MSTATUS_MIE;
        csr_.write(CSR_MSTATUS, mstatus);
    }
    {
        u64 mtvec = csr_.read(CSR_MTVEC);
        branch_taken = true;
        branch_target = mtvec & ~0x3ULL;
        flush_decode_ = true;
        flush_execute_ = true;
    }
    alu_result = 0;
    break;
```

**位置**：`simulator.cpp:795-816`（`case InstructionKind::EBREAK`）—— 同步修复 mstatus 遗漏：

原代码只写了 mepc/mcause/mtval，没有更新 mstatus。按 RISC-V 规范，trap entry 时必须保存当前 MIE 到 MPIE 并清零 MIE，否则 mret 后中断会错误恢复。**补充如下代码块**到 EBREAK 的 mepc/mcause/mtval 写入之后、mtvec 重定向之前：

```cpp
{
    // MSTATUS 更新：MPIE = old MIE; MIE = 0 (与 ECALL 一致)
    u64 mstatus = csr_.read(CSR_MSTATUS);
    constexpr u64 MSTATUS_MIE  = 1ULL << 3;
    constexpr u64 MSTATUS_MPIE = 1ULL << 7;
    if (mstatus & MSTATUS_MIE) {
        mstatus |= MSTATUS_MPIE;
    } else {
        mstatus &= ~MSTATUS_MPIE;
    }
    mstatus &= ~MSTATUS_MIE;
    csr_.write(CSR_MSTATUS, mstatus);
}
```

**同时**：
- 移除 `stage_wb()` 中 `pending_ebreak_` 对 ECALL 的处理（`simulator.cpp:1069-1072` 改为只判断 EBREAK）
- 在 `RISCVSimulator` 中**新增成员**：
  ```cpp
  enum class TrapCause { None, Interrupt, Exception };
  TrapCause last_trap_cause_{TrapCause::None};
  void clear_trap_cause() { last_trap_cause_ = TrapCause::None; }
  ```
- 在 `stage_if()` 检测到 pending interrupt 时设置 `last_trap_cause_ = TrapCause::Interrupt;`
- 在 ECALL/EBREAK trap 重定向时设置 `last_trap_cause_ = TrapCause::Exception;`
- 在 `reset()` 中清零为 `TrapCause::None`
- 在 `simulator.h` 中添加 `TrapCause last_trap_cause() const { return last_trap_cause_; }` 和 `const CSR& csr() const { return csr_; }` 访问器

#### B. 修改 `src/simulator.cpp`：添加 `trigger_pending_interrupt(bit)` 方法

**位置**：在 `set_user_signal_for_id` 附近添加：

```cpp
void RISCVSimulator::trigger_pending_interrupt(u64 bit) {
    if (bit >= 64) return;
    // 教学演示：只设置 MIP，不自动设置 MIE
    // 让学生程序显式配置 MIE，体现"中断使能"与"中断 pending"是两个独立概念
    u64 mip = csr_.read(CSR_MIP);
    csr_.write(CSR_MIP, mip | (1ULL << bit));
}
```

在 `simulator.h` 中声明。

> **注意**：之前版本同时设置 MIE/MIP，会导致后续实验中所有中断都永久使能，造成概念混淆。本版本只在按钮触发时设置 MIP，示例程序中通过 `csrw mie, t0` 显式打开 MSIE。

#### B-2. 修改 `src/simulator.cpp`：MRET 的 mstatus 恢复逻辑（清晰化）

**位置**：`simulator.cpp:817-839`（`case InstructionKind::MRET`）

当前实现已使用 `old_mpie` 局部变量避免了三元运算优先级问题，但可以更清晰。**保持现有逻辑**，但建议改为：

```cpp
case InstructionKind::MRET: {
    u64 mepc = csr_.read(CSR_MEPC);
    branch_taken = true;
    branch_target = mepc;
    flush_decode_ = true;
    flush_execute_ = true;
    next_if_id_ = {};
    stall_fetch_ = false;
    
    u64 mstatus = csr_.read(CSR_MSTATUS);
    constexpr u64 MSTATUS_MIE  = 1ULL << 3;
    constexpr u64 MSTATUS_MPIE = 1ULL << 7;
    constexpr u64 MSTATUS_MPP  = 0x1800;  // bits [12:11]
    u64 old_mpp = (mstatus >> 11) & 0x3;
    
    // MIE = MPIE (恢复中断使能)
    if (mstatus & MSTATUS_MPIE) {
        mstatus |= MSTATUS_MIE;
    } else {
        mstatus &= ~MSTATUS_MIE;
    }
    // MPIE 保持 1 (规范要求，简单实现)
    mstatus |= MSTATUS_MPIE;
    // MPP 恢复
    mstatus = (mstatus & ~MSTATUS_MPP) | (old_mpp << 11);
    csr_.write(CSR_MSTATUS, mstatus);
    
    alu_result = 0;
    break;
}
```

> 此改动与现有实现行为等价（之前的 `(mstatus & ~MSTATUS_MIE) | (old_mpie ? MSTATUS_MIE : 0)` 数学上正确，但 if/else 版本更易读易审）。

#### B-3. 关于异常与中断的优先级（文档说明）

当前实现的 trap 检测顺序：
- **异常**（ECALL/EBREAK）：在 **EX 阶段**（`stage_ex`）触发，会立即设置 `branch_taken/branch_target/flush_decode/flush_execute`
- **中断**（pending interrupt）：在 **IF 阶段**（`stage_if`，每条新指令取指前）触发

**行为说明**：如果某条指令执行时既产生异常（如 ECALL）又有 pending 中断，异常会先触发（因为 EX 阶段在下一个 IF 阶段之前）。这符合 RISC-V 规范（异常优先于中断），**无需修改**，但在演示程序注释中说明。

#### C. 修改 `src/riscv_sim_server.cpp`：添加新命令 + CSR 输出

**1) 添加 `trigger_interrupt` 命令**（在 `main()` 的命令分发处，约 1087 行 `else` 之前）：

```cpp
} else if (cmd == "trigger_interrupt") {
    u64 bit = 0;
    iss >> bit;
    if (sim) {
        sim->trigger_pending_interrupt(bit);
    }
    std::cout << "{\"status\":\"ok\",\"message\":\"Triggered interrupt bit " << bit << "\"}" << std::endl;
}
```

**2) 在 `output_signals_body` 末尾追加 CSR JSON 字段**（约 `simulator.halted()` 输出之前）：

```cpp
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

> 关键：CSR 字段输出在 `output_signals_body` 函数体内部，与 if_id/ex_mem/mem_wb 等平级。Python 端在 `step`/`run` 响应中将其作为 `signals` 对象的一个 key 转给前端（参考 `api_websocket_server.py:334-336` 的现有转发逻辑），前端 store 直接从 `sigs.csr` 读取，**JSON 路径为 `data.signals.csr`**，无需额外解包。

**3) 区分 trap_taken 与 branch_taken**：

在 `output_signals_body` 的 `ex_mem` 段（约 511-527 行）追加：

```cpp
std::cout << ",\"trap_taken\":" << (sim.last_trap_cause() == riscv::RISCVSimulator::TrapCause::Exception ? "true" : "false");
```

在 `if_id` 段追加：

```cpp
std::cout << ",\"interrupt_taken\":" << (sim.last_trap_cause() == riscv::RISCVSimulator::TrapCause::Interrupt ? "true" : "false");
```

**4) **关键**：在 `output_signals_body` 末尾、`output_signals` 闭合 `}` 之前调用 `sim.clear_trap_cause()`：

```cpp
void output_signals_body(riscv::RISCVSimulator& sim) {
    // ... 原有 if_id / id_ex / ex_mem / mem_wb / writeback / regfile / datamem 输出 ...
    
    // 输出 trap 标志位
    std::cout << ",\"trap_taken\":" << (sim.last_trap_cause() == riscv::RISCVSimulator::TrapCause::Exception ? "true" : "false");
    std::cout << ",\"interrupt_taken\":" << (sim.last_trap_cause() == riscv::RISCVSimulator::TrapCause::Interrupt ? "true" : "false");
    
    std::cout << ",\"halted\":" << (sim.halted() ? "true" : "false");
    if (sim.halted()) {
        // ... 原有 halt_reason 输出 ...
    }
    
    // ★ 输出后立即清零，下一次 step 将产生新的 trap 标志
    // 这保证前端每个 cycle 看到的 trap_taken 只对应本 cycle 发生的 trap
    sim.clear_trap_cause();
}
```

> **修正了原方案的错误**：原本打算在前端 store 收到数据后清零，但 simulator 无法知道前端何时读完。正确做法是 simulator 端每次输出 JSON 后立即清零，因为每次 `output_signals_body` 对应一次完整的状态快照。

### 3.2 Python WebSocket 桥（`api_websocket_server.py`）

在 `handle_client` 的 `command` 分发处（约 629 行 `else` 之前）添加：

```python
elif command == 'trigger_interrupt':
    bit = data.get('bit', 3)  # 默认 bit 3 = software interrupt
    sim = self.simulators.get(client_id)
    if sim:
        result = sim.send_command(f"trigger_interrupt {bit}")
        if result:
            try:
                resp_data = json.loads(result)
                response = resp_data
            except:
                response = {'status': 'ok', 'message': f'Interrupt {bit} triggered'}
        else:
            response = {'status': 'error', 'message': 'Failed to trigger interrupt'}
    else:
        response = {'status': 'error', 'message': 'Simulator not initialized'}
    await websocket.send(json.dumps(response))
```

### 3.3 前端 Vue（`/var/www/riscv-pipeline-frontend/src/`）

#### A. 新增 `components/InterruptDemoPanel.vue`（新组件，参考 `DifftestPanel.vue` 的写法）

**功能**：
1. **"触发软件中断" 按钮** → `pipelineStore.triggerInterrupt(3)` → 发送 `trigger_interrupt 3` 到后端
2. **CSR 状态表**：实时显示 MTVEC / MEPC / MCAUSE / MTVAL / MSTATUS / MIE / MIP 的十六进制值（绿色高亮表示刚变化）
3. **当前 Trap 状态指示**：
   - 空闲（无 trap）
   - 异常：`mcause=11 (ECALL)`
   - 中断：`mcause=0x8000000000000003 (MSI)`
4. **"加载中断演示程序" 按钮**：将预置的示例汇编代码插入到代码编辑器（见下）
5. **"清空中断标志" 按钮**（可选）：用于反复演示

**预置示例程序**（`constant` 字符串）：

```asm
# ===== 中断与异常演示程序 =====
# 1) 异常：执行 ecall 自动触发，跳转 trap_handler
# 2) 中断：点击"触发软件中断"按钮设置 MIP[3]，跳转 trap_handler
# 3) Handler 处理完毕后 mret 返回
.text
.globl _start
_start:
    # 1. 设置 trap vector base 指向 trap_handler
    #    auipc 加载当前 PC (auipc 指令自身的 PC) 高 20 位到 t0，
    #    addi t0, t0, 32 中 32 = (auipc 之后 8 条指令) × 4 字节
    #    即 trap_handler 的 PC = PC(auipc) + 32
    auipc t0, 0
    addi  t0, t0, 32        # trap_handler 位于 PC+32 (相对 PC-of-auipc)
    csrw  mtvec, t0

    # 2. 使能软件中断 (mie.MSIP = bit 3)
    li    t1, 8
    csrw  mie, t1

    # 3. 全局使能机器中断 (mstatus.MIE = bit 3)
    li    t1, 8
    csrw  mstatus, t1

loop:
    addi  x1, x1, 1         # 正常工作（学生可观察 x1 递增）
    ecall                   # 异常：environment call → mcause=11
    j      loop

trap_handler:
    csrr  t0, mcause        # 读取 mcause，区分中断/异常
    addi  x2, x2, 1         # 计数 trap 次数
    mret                     # 从 trap 返回
```

#### B. 修改 `stores/pipeline.ts`

**1) 扩展 `PipelineSignals` 接口**（约 17-28 行）：

```ts
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
```

**2) 添加 store 状态**：

```ts
const csrState = ref<{ mtvec: string; mepc: string; mcause: string; ... } | null>(null);
const lastTrapType = ref<'none' | 'interrupt' | 'exception'>('none');
```

**3) 添加方法 `triggerInterrupt(bit: number = 3)`**：

```ts
function triggerInterrupt(bit: number = 3) {
  sendCommand('trigger_interrupt', { bit });
}
```

**4) 在 `updateStateFromSignals()` 中解析 CSR 字段**（约 191-244 行）：

```ts
if (sigs.csr) {
  csrState.value = sigs.csr;
}
if (sigs.trap_taken || sigs.interrupt_taken) {
  lastTrapType.value = sigs.interrupt_taken ? 'interrupt' : 'exception';
}
```

**5) 在 `calculateActiveControlSignals()` 中添加 trap 路径高亮**（约 432 行）：

```ts
if (sigs.trap_taken) {
  activeSignals.push({ id: 'trap_redirect', value: '1' });
  activeSignals.push({ id: 'trap_flush_decode', value: '1' });
  activeSignals.push({ id: 'trap_flush_execute', value: '1' });
  activeSignals.push({ id: 'trap_mcause', value: sigs.csr?.mcause || '0xb' });
}
if (sigs.interrupt_taken) {
  activeSignals.push({ id: 'interrupt_redirect', value: '1' });
  activeSignals.push({ id: 'trap_flush_decode', value: '1' });
  activeSignals.push({ id: 'trap_flush_execute', value: '1' });
  activeSignals.push({ id: 'trap_mcause', value: sigs.csr?.mcause || '0x8000000000000003' });
}
```

#### C. 修改 `components/PipelineEditor.vue`（SVG 动画）

**1) 在 `initialConnections` 中新增 trap 跳转连线**（约 79-151 行）：

```ts
// 从 csr module 指向 fetchUnit 的 trap 跳转连线（红色，加粗）
{ id: 'trap_redirect', source: 'ctrl', target: 'fetchUnit', type: 'control',
  label: 'trap_redirect', sourceOffset: { x: 50, y: CTRL_HEIGHT },
  targetOffset: { x: 80, y: 0 }, arrowDirection: 'bottom', wordOffset: {x: 0, y: -5} },
{ id: 'trap_flush_decode', source: 'ctrl', target: 'decodeStage', type: 'control',
  label: 'flush_IF_ID', sourceOffset: { x: 80, y: CTRL_HEIGHT },
  targetOffset: { x: 25, y: 0 }, arrowDirection: 'bottom' },
{ id: 'trap_flush_execute', source: 'ctrl', target: 'executeStage', type: 'control',
  label: 'flush_ID_EX', sourceOffset: { x: 110, y: CTRL_HEIGHT },
  targetOffset: { x: 25, y: 0 }, arrowDirection: 'bottom' },
```

**2) 在 `initialAuxiliaryModules` 中添加 CSR 模块**（约 72-77 行）：

```ts
// 现有模块位置参考：fetchUnit y=180, RegFile y=480, DataMEM y=370, ctrl y=0
// 放在 ctrl 下方（y=600+），跨越控制单元与流水线之间的空白区域
{ id: 'csr', name: 'CSR (mtvec/mepc/mcause/mstatus)', icon: Cpu,
  x: 400, y: 620, width: 400, height: 60 }
```

> 坐标说明：现有 `initialAuxiliaryModules` 中其他模块 Y 范围为 0~600，CSR 模块放在 y=620 留出间距。如果需要避免与 ctrl 顶部重叠，可下移到 y=640。

在 `handleModuleClick()` 中点击 csr 模块弹出 CSR 详情弹窗（沿用 `DraggableModal` 模式）。

#### D. 修改 `components/PanelContainer.vue` 组件映射

在 `componentMap`（约 23-28 行）中加入：

```ts
'InterruptDemoPanel': defineAsyncComponent(() => import('./InterruptDemoPanel.vue'))
```

#### E. 修改 `stores/panel.ts`

添加 InterruptDemoPanel 到 `rightPanels` 列表（参考 DifftestPanel 的注册方式）。

#### F. 修改 `components/CompactCodeEditor.vue`

无需大改 — `InterruptDemoPanel` 中的"加载示例程序"按钮通过 `usePipelineStore` 提供一个 `setEditorCode(code: string)` 方法，或者通过 emit / event 通知 CompactCodeEditor。后者更解耦，但前者实现更简单（约 5 行代码）。

---

## 四、文件清单（实施时的实际修改列表）

| 文件 | 类型 | 关键变更 |
|------|------|----------|
| `opt/RISC-V_Platform/src/simulator.cpp` | 修改 | ECALL 走 trap；**修复 EBREAK 遗漏的 mstatus 更新**；MRET 改 if/else 清晰化；新增 `trigger_pending_interrupt()`（仅设 MIP）、`last_trap_cause_` 机制、`clear_trap_cause()` 方法 |
| `opt/RISC-V_Platform/include/riscv/simulator.h` | 修改 | 声明新方法、`TrapCause` 枚举、`csr()` 访问器 |
| `opt/RISC-V_Platform/src/riscv_sim_server.cpp` | 修改 | `trigger_interrupt` 命令、CSR JSON 输出、trap_taken/interrupt_taken 字段、**`output_signals_body` 末尾调用 `clear_trap_cause()`** |
| `opt/RISC-V_Platform/api_websocket_server.py` | 修改 | `trigger_interrupt` 命令转发 |
| `var/www/riscv-pipeline-frontend/src/stores/pipeline.ts` | 修改 | csr 字段、`triggerInterrupt()` 方法、trap 高亮 |
| `var/www/riscv-pipeline-frontend/src/components/PipelineEditor.vue` | 修改 | 新增 trap 跳转连线、CSR 模块（y=620） |
| `var/www/riscv-pipeline-frontend/src/components/InterruptDemoPanel.vue` | **新建** | 触发按钮、CSR 状态表、加载示例程序 |
| `var/www/riscv-pipeline-frontend/src/components/PanelContainer.vue` | 修改 | 注册新组件 |
| `var/www/riscv-pipeline-frontend/src/stores/panel.ts` | 修改 | 添加新面板 |

---

## 五、决策与假设

1. **中断实现选 software interrupt (bit 3 = MSIP)**：教学意义最直观，CSR 设置最简单
2. **异常实现选 ECALL**：当前 ECALL 行为改为 trap，与标准 RISC-V 规范一致
3. **`trigger_pending_interrupt` 只设置 MIP，不自动设置 MIE**：避免学生混淆"中断 pending"与"中断使能"两个独立概念。示例程序中由 `csrw mie, t0` 显式打开 MSIE
4. **`trigger_pending_interrupt` 不自动清零 MIP**：trap entry 后 MIP 是否清零属于硬件/PLIC 设计范畴，本演示忽略，由学生通过 mret 后观察 MIP 仍为 1（教学简化）
5. **handler 内部逻辑最简化**：学生只观察 mcause 读取、计数、mret 返回
6. **不实现 trap 嵌套 / 多级中断 / 上下文保存**：超纲，按用户要求"尽量简洁"
7. **保留 ebreak 作为程序末尾停机手段**：学生可看到 trap_handler 返回后继续执行 loop，再遇 ebreak 停机
8. **`last_trap_cause_` 由 simulator 端输出后立即清零**：避免跨 cycle 状态污染，前端无需关心

---

## 六、验证步骤

1. **后端编译**：
   ```bash
   cd /opt/RISC-V_Platform/build && cmake --build . -j4
   ```
   确认 `riscv_sim_server` 编译通过

2. **后端协议测试**（手动 stdin/stdout）：
   ```bash
   echo -e "load /path/to/some.elf\nstep\ntrigger_interrupt 3\nstep\nquit" | ./build/riscv_sim_server
   ```
   确认输出 JSON 中包含 `csr.mtvec/mepc/mcause` 字段，`trap_taken=true`

3. **前端启动**：
   ```bash
   cd /var/www/riscv-pipeline-frontend && npm run dev
   ```

4. **集成验证**：
   - 打开页面 → 右侧"中断演示"面板 → 点"加载示例程序" → 点"编译运行"
   - **异常路径**：单步运行直到 `ecall`，观察：
     - PC 从 ecall 地址跳到 trap_handler 地址
     - IF/ID、ID/EX 两个流水线寄存器被 flush（虚线）
     - mcause = 0xb，mepc = ecall 的 PC
     - 运行至 `mret` 后 PC 恢复，mstatus.MIE 重新置位
   - **中断路径**：运行到 loop 中，点"触发软件中断"按钮，再点"下一 clk"：
     - PC 跳到 trap_handler
     - mcause = 0x8000000000000003（最高位置 1 表示中断）
     - mret 后回到 loop 继续

5. **回归测试**：
   - 原有 4 个差分测试场景仍能正常运行
   - 自由编程模式（默认 ebreak 结尾程序）不受影响

---

## 七、风险与缓解

| 风险 | 缓解 |
|------|------|
| `last_trap_cause_` 状态在多次 step 之间污染 | **已在 C++ 端 `output_signals_body` 末尾调用 `clear_trap_cause()`**——保证每个 cycle 的 trap_taken 只反映本 cycle 发生的 trap，与前端 store 无关 |
| EBREK 路径中 mstatus 遗漏（trap entry 时未保存/关闭 MIE） | **已在 §3.1.A 中修复**——在 EBREAK 处理流程中补上 mstatus 更新，与 ECALL 一致 |
| MSTATUS 更新代码可读性差（三元运算符） | **已重构为 if/else**——更易审核，避免后续维护陷阱 |
| `trigger_pending_interrupt` 同时改 MIP 和 MIE，导致学生混淆 | **已改为只设 MIP**——MIE 必须在示例程序中由 `csrw mie, t0` 显式打开，体现"中断 pending"与"中断使能"是两个独立概念 |
| `trigger_pending_interrupt` 只设 MIP 时，学生忘记开 MIE 导致按按钮无反应 | 示例程序在 `_start` 中已显式 `csrw mie, t0` 和 `csrw mstatus, t0`，并通过注释提示 |
| ECALL 改 trap 后影响其他教学测试 | 检查所有现有 ELF 测试无 ECALL 用法即可（grep `ecall` `isa/*.S`） |
| 示例程序中的 `auipc`+`addi` 偏移量硬编码为 32 | 在注释中说明 PC-of-auipc 偏移的语义；若未来修改 trap_handler 位置需同步更新 |
| 异常 vs 中断的优先级混淆 | 已在 §3.1.B-3 文档化——EX 阶段异常先于下一个 IF 阶段的中断检测，符合 RISC-V 规范 |
| 前端修改对其他面板造成影响 | 改动只追加新 component、新连线、新 store 字段，不修改现有行为 |
| `output_signals_body` 末尾清零 trap_cause 后，JSON 仍可能包含旧的 trap_taken 字段 | 字段值已与 `last_trap_cause_` 同步读取并清零，JSON 内容反映的是清零前的值，下一次调用时已是 None |
| `csr()` 访问器暴露内部 CSR 引用 | 仅添加 const 引用，不暴露可写引用，符合封装原则 |
