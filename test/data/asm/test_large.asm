# RISC-V 复杂程序测试代码
# 文件大小: ~5KB
# 用途: 函数调用、循环、条件分支测试

.text
.globl _start

_start:
    # 设置栈指针
    addi sp, sp, -64

    # 初始化参数
    addi a0, x0, 10      # 第一个参数: 10
    addi a1, x0, 20     # 第二个参数: 20

    # 调用函数
    jal ra, sum_array   # 调用 sum_array 函数

    # 将结果存储到内存
    sw a0, 0(sp)        # 存储结果

    # 调用另一个函数
    addi a0, x0, 5
    jal ra, factorial   # 调用阶乘函数

    # 恢复栈指针
    addi sp, sp, 64

    # 结束程序
    ebreak

# sum_array 函数: 计算数组和
# 参数: a0 = 数组大小, a1 = 初始值
# 返回: a0 = 和
sum_array:
    # 保存返回地址和寄存器
    addi sp, sp, -16
    sw ra, 12(sp)       # 保存返回地址
    sw s0, 8(sp)        # 保存 s0
    sw s1, 4(sp)        # 保存 s1

    # 初始化
    add s0, x0, a0      # s0 = 数组大小
    add s1, x0, a1      # s1 = 当前和
    add t0, x0, x0      # t0 = 循环计数器 = 0

sum_loop:
    # 检查循环条件
    bge t0, s0, sum_done

    # 累加
    add s1, s1, t0

    # 递增计数器
    addi t0, t0, 1

    # 继续循环
    jal x0, sum_loop

sum_done:
    # 设置返回值
    add a0, x0, s1

    # 恢复寄存器
    lw ra, 12(sp)       # 恢复返回地址
    lw s0, 8(sp)        # 恢复 s0
    lw s1, 4(sp)        # 恢复 s1
    addi sp, sp, 16

    # 返回
    jalr x0, 0(ra)

# factorial 函数: 计算阶乘
# 参数: a0 = n
# 返回: a0 = n!
factorial:
    # 保存返回地址
    addi sp, sp, -8
    sw ra, 4(sp)

    # 基本情况: n <= 1
    addi t0, x0, 1
    ble a0, t0, fact_done

    # 递归情况: n! = n * (n-1)!
    addi sp, sp, -8
    sw a0, 0(sp)        # 保存 n

    # 计算 (n-1)
    addi a0, a0, -1

    # 递归调用
    jal ra, factorial

    # 恢复 n 并计算结果
    lw t0, 0(sp)
    mul a0, t0, a0

    # 恢复栈
    addi sp, sp, 8

fact_done:
    # 恢复返回地址
    lw ra, 4(sp)
    addi sp, sp, 8

    # 返回
    jalr x0, 0(ra)

# 额外测试: 内存访问
test_memory:
    # 分配栈空间
    addi sp, sp, -32

    # 存储数据到栈
    addi t0, x0, 100
    sw t0, 0(sp)        # 存储到栈偏移 0
    sw x0, 4(sp)        # 存储 0 到栈偏移 4
    addi t1, x0, 1
    sw t1, 8(sp)        # 存储 1 到栈偏移 8

    # 加载数据
    lw t2, 0(sp)        # 加载 100
    lw t3, 4(sp)        # 加载 0
    lw t4, 8(sp)        # 加载 1

    # 计算
    add t5, t2, t3
    sub t6, t2, t4

    # 恢复栈
    addi sp, sp, 32

    # 返回
    jalr x0, 0(ra)

# 额外测试: 条件分支
test_branches:
    # 测试 beq
    addi t0, x0, 5
    addi t1, x0, 5
    beq t0, t1, branch_equal

branch_not_equal:
    addi t2, x0, 0
    jal x0, branch_done

branch_equal:
    addi t2, x0, 1

branch_done:
    # 测试 bne
    addi t3, x0, 10
    addi t4, x0, 20
    bne t3, t4, branches_not_equal

branches_equal:
    addi t5, x0, 0
    jal x0, branches_done

branches_not_equal:
    addi t5, x0, 1

branches_done:
    # 测试 blt
    addi t6, x0, 5
    addi t7, x0, 10
    blt t6, t7, less_than

not_less_than:
    addi s0, x0, 0
    jal x0, branches_end

less_than:
    addi s0, x0, 1

branches_end:
    # 返回
    jalr x0, 0(ra)
