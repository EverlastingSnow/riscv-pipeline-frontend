# RISC-V 基础算术运算测试代码
# 文件大小: ~100 bytes
# 用途: 基础指令测试

.text
.globl _start

_start:
    # 初始化寄存器
    addi x1, x0, 5    # x1 = 5
    addi x2, x0, 3    # x2 = 3

    # 算术运算
    add x3, x1, x2    # x3 = 5 + 3 = 8

    # 结束程序
    ebreak            # 触发断点异常
