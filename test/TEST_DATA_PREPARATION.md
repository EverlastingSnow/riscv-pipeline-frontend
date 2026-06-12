# 并发测试 - 测试数据准备清单

## RISC-V 测试代码准备

### 小文件 (1-5 行)

```asm
; 文件: test_small.asm
; 大小: ~100 bytes
; 用途: 基础指令测试

.text
.globl _start
_start:
    addi x1, x0, 5
    addi x2, x0, 3
    add x3, x1, x2
    ebreak
```

### 中等文件 (10-50 行)

```asm
; 文件: test_medium.asm
; 大小: ~2KB
; 用途: 算术和逻辑运算测试

.text
.globl _start
_start:
    ; 初始化寄存器
    addi x1, x0, 10
    addi x2, x0, 20
    addi x3, x0, 5

    ; 算术运算
    add x4, x1, x2      ; x4 = 10 + 20 = 30
    sub x5, x2, x1      ; x5 = 20 - 10 = 10
    addi x6, x3, 15     ; x6 = 5 + 15 = 20

    ; 逻辑运算
    and x7, x4, x5      ; x7 = 30 & 10
    or x8, x4, x5       ; x8 = 30 | 10
    xor x9, x4, x5      ; x9 = 30 ^ 10

    ; 移位操作
    slli x10, x1, 2     ; x10 = 10 << 2 = 40
    srli x11, x2, 1     ; x11 = 20 >> 1 = 10

    ebreak
```

### 大文件 (100+ 行)

准备包含以下功能的复杂程序：
- 函数调用和返回
- 循环结构
- 条件分支
- 内存访问 (LOAD/STORE)
- 堆栈操作

## ELF 测试文件准备

### 场景 1: 基础算术运算

```bash
# 编译命令
riscv64-unknown-elf-gcc -o test_arith.elf test_arith.c
```

测试内容：
- ADD, SUB, MUL, DIV
- 立即数运算
- 寄存器间运算

### 场景 2: 内存访问操作

测试内容：
- LB, LH, LW, LD
- SB, SH, SW, SD
- 边界情况测试

### 场景 3: 分支跳转指令

测试内容：
- BEQ, BNE
- BLT, BGE, BLTU, BGEU
- JAL, JALR
- 条件分支预测测试

### 场景 4: 函数调用

测试内容：
- 叶子函数
- 嵌套函数调用
- 参数传递
- 返回值处理

### 场景 5: 中断处理

测试内容：
- 异常处理
- 中断响应
- 上下文保存和恢复

## 教学场景测试数据

### 场景 1: 寄存器写 (RegWrite)

```json
{
  "scenario_id": 1,
  "name": "场景1: 寄存器写",
  "description": "学习 RegWrite 信号",
  "signals": ["RegWrite"],
  "test_instructions": [
    "ADDI x1, x0, 5",
    "ADD x2, x1, x2",
    "LW x3, 0(x1)",
    "BEQ x0, x0, label"
  ]
}
```

### 场景 2: 操作数选择 (ALUSrc)

```json
{
  "scenario_id": 2,
  "name": "场景2: 操作数选择",
  "description": "学习 RegWrite + ALUSrc",
  "signals": ["RegWrite", "ALUSrc"],
  "test_instructions": [
    "ADDI x1, x0, 10",
    "ADD x2, x1, x1",
    "LW x3, 0(x0)"
  ]
}
```

### 场景 3: 内存访问

```json
{
  "scenario_id": 3,
  "name": "场景3: 内存访问",
  "description": "学习 RegWrite + ALUSrc + MemRead + MemWrite",
  "signals": ["RegWrite", "ALUSrc", "MemRead", "MemWrite"],
  "test_instructions": [
    "SW x1, 0(x2)",
    "LW x3, 0(x2)",
    "ADDI x4, x3, 1"
  ]
}
```

### 场景 4: 分支控制

```json
{
  "scenario_id": 4,
  "name": "场景4: 分支控制",
  "description": "学习 RegWrite + ALUSrc + MemRead + MemWrite + Branch",
  "signals": ["RegWrite", "ALUSrc", "MemRead", "MemWrite", "Branch"],
  "test_instructions": [
    "BEQ x1, x2, label",
    "BNE x3, x4, label",
    "BLT x5, x6, label"
  ]
}
```

## 模拟用户数据

### 生成模拟用户会话

```javascript
// 模拟用户会话数据
const mockUserSession = {
  userId: `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
  sessionId: `session_${Date.now()}`,
  actions: [
    { type: 'load_elf', file: 'test_arith.elf', timestamp: Date.now() },
    { type: 'step', count: 10, timestamp: Date.now() + 1000 },
    { type: 'get_signals', timestamp: Date.now() + 2000 },
    { type: 'get_registers', timestamp: Date.now() + 3000 },
  ]
};
```

### 用户行为模型

```javascript
// 用户行为概率分布
const userBehavior = {
  // 编译操作: 20%
  compile: 0.2,

  // 统计查询: 30%
  statsQuery: 0.3,

  // 单步执行: 25%
  step: 0.25,

  // 加载 ELF: 10%
  loadElf: 0.1,

  // 其他操作: 15%
  other: 0.15,
};
```

## 测试数据清单

- [ ] RISC-V 小文件测试代码 (test_small.asm)
- [ ] RISC-V 中等文件测试代码 (test_medium.asm)
- [ ] RISC-V 大文件测试代码 (test_large.asm)
- [ ] ELF 测试文件 - 算术运算 (test_arith.elf)
- [ ] ELF 测试文件 - 内存访问 (test_mem.elf)
- [ ] ELF 测试文件 - 分支跳转 (test_branch.elf)
- [ ] ELF 测试文件 - 函数调用 (test_function.elf)
- [ ] ELF 测试文件 - 中断处理 (test_interrupt.elf)
- [ ] 教学场景数据 JSON (scenarios.json)
- [ ] 模拟用户会话数据 (mock_sessions.json)

## 文件存放位置

所有测试数据应存放在以下目录结构中：

```
test/
├── data/
│   ├── asm/
│   │   ├── test_small.asm
│   │   ├── test_medium.asm
│   │   └── test_large.asm
│   ├── elf/
│   │   ├── test_arith.elf
│   │   ├── test_mem.elf
│   │   ├── test_branch.elf
│   │   ├── test_function.elf
│   │   └── test_interrupt.elf
│   ├── scenarios/
│   │   ├── scenario1.json
│   │   ├── scenario2.json
│   │   ├── scenario3.json
│   │   └── scenario4.json
│   └── mock/
│       └── mock_sessions.json
└── monitoring/
    ├── prometheus.yml
    └── grafana-dashboard.json
```

## 下一步

1. 准备所有测试数据文件
2. 验证测试数据有效性
3. 配置测试环境
4. 开始执行测试
