# RISC-V 中等复杂度测试代码
# 文件大小: ~2KB
# 用途: 算术和逻辑运算测试

.text
.globl _start

_start:
    # 初始化寄存器
    addi x1, x0, 10      # x1 = 10
    addi x2, x0, 20      # x2 = 20
    addi x3, x0, 5       # x3 = 5
    addi x4, x0, 2       # x4 = 2

    # 算术运算
    add x5, x1, x2       # x5 = 10 + 20 = 30
    sub x6, x2, x1       # x6 = 20 - 10 = 10
    addi x7, x3, 15      # x7 = 5 + 15 = 20
    mul x8, x5, x4       # x8 = 30 * 2 = 60

    # 逻辑运算
    and x9, x5, x6       # x9 = 30 & 10 = 10
    or x10, x5, x6       # x10 = 30 | 10 = 30
    xor x11, x5, x6      # x11 = 30 ^ 10 = 20
    slli x12, x1, 2      # x12 = 10 << 2 = 40
    srli x13, x2, 1      # x13 = 20 >> 1 = 10
    srai x14, x2, 1      # x14 = 20 >> 1 = 10

    # 比较运算
    slt x15, x6, x5      # x15 = (10 < 30) = 1
    sltu x16, x5, x6     # x16 = (30 < 10) = 0

    # 立即数运算
    addi x17, x0, -5     # x17 = -5
    andi x18, x5, 0xF    # x18 = 30 & 15 = 14
    ori x19, x6, 0xF     # x19 = 10 | 15 = 15
    xori x20, x5, 0xF    # x20 = 30 ^ 15 = 17

    # 结束程序
    ebreak               # 触发断点异常
