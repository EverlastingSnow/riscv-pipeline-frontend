# RISC-V Pipeline 前端并发测试指南

## 概述

本文档提供了 RISC-V Pipeline 前端系统的并发负载测试方案和工具。

## 测试目标

- **并发用户数**: 100 人同时在线
- **功能覆盖**: HTTP API、WebSocket、功能模块
- **性能指标**: 响应时间、吞吐量、错误率、资源利用率

## 测试工具

### K6 负载测试工具

K6 是一个现代化的开源负载测试工具，支持：
- HTTP/HTTPS 协议测试
- WebSocket 测试
- JavaScript 脚本化配置
- 多种输出格式（JSON, HTML, InfluxDB 等）

**官网**: https://k6.io

**安装方式**:

```bash
# macOS
brew install k6

# Linux
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update
sudo apt-get install k6

# Windows (使用 Chocolatey)
choco install k6

# 或者直接下载二进制文件
# https://github.com/grafana/k6/releases
```

## 测试脚本说明

### 1. HTTP API 负载测试 (`k6-load-test-template.js`)

测试 HTTP API 接口的并发性能：
- `/api/compile` - 代码编译接口
- `/api/stats` - 统计查询接口

**运行命令**:

```bash
# 基本运行
k6 run k6-load-test-template.js

# 指定目标 URL
BASE_URL=http://your-server.com:8080 k6 run k6-load-test-template.js

# 生成 HTML 报告
k6 run --html-report=report.html k6-load-test-template.js

# 使用阶梯负载配置
k6 run -e STAGES=true k6-load-test-template.js

# 运行特定场景
k6 run -e SCENARIO=compile_only k6-load-test-template.js
```

### 2. WebSocket 负载测试 (`websocket-load-test.js`)

测试 WebSocket 连接的并发性能：
- 100 并发连接测试
- 消息发送和接收测试
- 连接稳定性测试

**运行命令**:

```bash
# 基本运行
k6 run websocket-load-test.js

# 指定 WebSocket URL
WS_URL=wss://your-server.com/ws k6 run websocket-load-test.js

# 生成详细报告
k6 run --html-report=ws-report.html websocket-load-test.js
```

## 测试配置说明

### 修改并发用户数

编辑测试脚本中的 `options` 配置：

```javascript
export const options = {
  scenarios: {
    constant_load: {
      executor: 'constant-vus',
      vus: 100,  // 修改为你的目标并发数
      duration: '5m',  // 测试持续时间
    },
  },
};
```

### 修改测试目标

通过环境变量指定测试目标：

```bash
# HTTP API 测试
BASE_URL=http://production-server.com:8080 k6 run k6-load-test-template.js

# WebSocket 测试
WS_URL=wss://production-server.com/ws k6 run websocket-load-test.js
```

### 调整性能阈值

根据你的系统要求调整阈值：

```javascript
thresholds: {
  http_req_duration: ['p(95)<2000'],  // 95% 请求在 2 秒内
  errors: ['rate<0.01'],               // 错误率 < 1%
  'compile_duration': ['p(95)<3000'],  // 编译 95% 在 3 秒内
  'stats_duration': ['p(95)<500'],     // 统计查询 95% 在 500ms 内
},
```

## 测试场景设计

### 场景 1: 恒定负载测试

模拟 100 并发用户持续请求：

```bash
k6 run --vus 100 --duration 5m k6-load-test-template.js
```

### 场景 2: 阶梯负载测试

逐步增加负载，观察系统性能变化：

```bash
# 编辑脚本启用阶梯配置
# options.stages = [
#   { duration: '2m', target: 10 },
#   { duration: '5m', target: 50 },
#   { duration: '5m', target: 100 },
#   { duration: '5m', target: 0 },
# ];

k6 run k6-load-test-template.js
```

### 场景 3: 峰值负载测试

模拟瞬时高并发：

```bash
# 瞬时 150 并发，持续 1 分钟
k6 run --vus 150 --duration 1m k6-load-test-template.js
```

### 场景 4: 混合场景测试

同时测试 HTTP API 和 WebSocket：

```bash
# 终端 1: HTTP API 测试
k6 run --vus 50 --duration 5m k6-load-test-template.js

# 终端 2: WebSocket 测试
k6 run --vus 50 --duration 5m websocket-load-test.js
```

## 测试数据准备

### RISC-V 测试代码

准备不同大小的测试代码：

1. **小文件** (1-5 行): 简单指令测试
2. **中文件** (10-50 行): 多指令序列测试
3. **大文件** (100+ 行): 复杂程序测试

### ELF 测试文件

准备不同场景的 ELF 文件：
- 基础算术运算
- 内存访问操作
- 分支跳转指令
- 函数调用
- 中断处理

### 教学场景数据

准备教学测试数据：
- 场景 1-4 的信号测试
- ELF 测试用例

## 性能指标解读

### HTTP API 指标

- **http_req_duration**: 请求响应时间
  - avg: 平均响应时间
  - p(95): 95% 请求的响应时间
  - max: 最大响应时间

- **http_reqs**: 请求速率
  - count: 总请求数
  - rate: 每秒请求数

### WebSocket 指标

- **ws_connection_duration**: 连接建立时间
- **ws_message_latency**: 消息延迟
- **ws_message_send/receive**: 消息发送/接收速率

### 错误指标

- **errors**: 错误率
- **ws_connection_errors**: 连接错误数
- **ws_message_errors**: 消息错误数

## 测试执行流程

1. **准备阶段**
   - 确认测试环境
   - 准备测试数据
   - 配置监控系统

2. **基线测试**
   - 单用户性能测试
   - 确定基准性能

3. **负载测试**
   - 逐步增加并发
   - 监控性能指标

4. **峰值测试**
   - 测试极限负载
   - 验证系统稳定性

5. **结果分析**
   - 收集测试数据
   - 分析性能瓶颈
   - 生成测试报告

## 常见问题

### Q: WebSocket 测试报错 "k6/ws module not found"

**A**: 确保 k6 版本 >= 0.34.0。检查版本：

```bash
k6 version
```

### Q: 测试时连接被拒绝

**A**: 检查：
1. 服务器是否启动
2. 防火墙是否允许连接
3. URL 是否正确

### Q: 错误率过高

**A**: 可能的原因：
1. 服务器负载过高
2. 数据库连接池不足
3. 内存或 CPU 资源不足

### Q: 如何测试 HTTPS/WSS？

**A**: 确保服务器配置了有效的 SSL 证书，URL 使用 https:// 或 wss:// 前缀。

## 后续步骤

1. **监控部署**: 配置 Prometheus 和 Grafana 进行实时监控
2. **自动化测试**: 集成到 CI/CD 流程
3. **定期测试**: 建立周期性性能测试机制
4. **性能优化**: 根据测试结果优化系统性能

## 参考资源

- K6 官方文档: https://k6.io/docs/
- K6 HTTP 测试: https://k6.io/docs/using-k6/http-requests/
- K6 WebSocket 测试: https://k6.io/docs/using-k6/websockets/
- K6 阈值配置: https://k6.io/docs/using-k6/thresholds/
- K6 输出格式: https://k6.io/docs/getting-started/results-output/

## 联系方式

如有问题，请联系开发团队。
