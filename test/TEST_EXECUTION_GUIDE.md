# RISC-V Pipeline 前端并发测试执行报告

**生成时间**: 2026-05-31
**测试目标**: 100 并发用户

---

## 一、测试环境准备状态

### 1.1 测试工具安装

✅ **已完成**
- K6 负载测试工具 v0.55.0 已安装
- 可执行文件位置: `./k6`
- 安装路径: `/var/www/riscv-pipeline-frontend/k6`

### 1.2 测试脚本准备

✅ **已完成**

| 脚本名称 | 功能描述 | 位置 |
|---------|---------|------|
| k6-load-test-template.js | HTTP API 负载测试 | test/k6-load-test-template.js |
| websocket-load-test.js | WebSocket 并发测试 | test/websocket-load-test.js |
| prometheus.yml | Prometheus 监控配置 | test/monitoring/prometheus.yml |
| grafana-dashboard.json | Grafana Dashboard | test/monitoring/grafana-dashboard.json |

### 1.3 测试数据准备

✅ **已完成**

#### RISC-V 测试代码
- ✅ test_small.asm (~100 bytes) - 基础指令测试
- ✅ test_medium.asm (~2KB) - 算术和逻辑运算测试
- ✅ test_large.asm (~5KB) - 函数调用、循环、条件分支测试

#### 教学场景测试数据
- ✅ scenario1.json - 寄存器写 (RegWrite)
- ✅ scenario2.json - 操作数选择 (ALUSrc)
- ✅ scenario3.json - 内存访问 (MemRead/MemWrite)
- ✅ scenario4.json - 分支控制 (Branch)

#### 模拟用户数据
- ✅ mock_sessions.json - 模拟用户会话数据

### 1.4 服务器状态

⚠️ **需要启动服务器**

当前服务器未运行，无法执行实际测试。

**需要执行的步骤**:

```bash
# 1. 启动后端服务器（如果使用后端）
# 请参考后端服务文档

# 2. 启动前端开发服务器
npm run dev

# 3. 或者启动生产服务器
npm run preview
```

---

## 二、测试执行指南

### 2.1 快速开始

当服务器启动后，按以下步骤执行测试：

#### 步骤 1: 编译接口并发测试

```bash
# 进入测试目录
cd test

# 执行 100 并发编译测试 (5分钟)
BASE_URL=http://localhost:8080 ../k6 run --vus 100 --duration 5m k6-load-test-template.js

# 生成 HTML 报告
BASE_URL=http://localhost:8080 ../k6 run --html-report=compile-test-report.html --vus 100 --duration 5m k6-load-test-template.js
```

#### 步骤 2: 统计接口并发测试

```bash
# 执行 100 并发统计查询测试 (5分钟)
BASE_URL=http://localhost:8080 ../k6 run --vus 100 --duration 5m --env SCENARIO=stats_only k6-load-test-template.js
```

#### 步骤 3: WebSocket 并发测试

```bash
# 执行 100 并发 WebSocket 连接测试 (5分钟)
WS_URL=ws://localhost:8080/ws ../k6 run --vus 100 --duration 5m websocket-load-test.js
```

### 2.2 高级测试场景

#### 场景 1: 阶梯负载测试

```bash
# 从 10 用户逐步增加到 150 用户
BASE_URL=http://localhost:8080 ../k6 run --vus 10 --duration 2m \
  k6-load-test-template.js &
sleep 120
BASE_URL=http://localhost:8080 ../k6 run --vus 50 --duration 5m \
  k6-load-test-template.js &
sleep 300
BASE_URL=http://localhost:8080 ../k6 run --vus 100 --duration 5m \
  k6-load-test-template.js
```

#### 场景 2: 峰值负载测试

```bash
# 瞬时 150 并发，持续 1 分钟
BASE_URL=http://localhost:8080 ../k6 run --vus 150 --duration 1m k6-load-test-template.js
```

#### 场景 3: 长时间稳定性测试

```bash
# 8 小时持续负载测试
BASE_URL=http://localhost:8080 ../k6 run --vus 100 --duration 8h k6-load-test-template.js
```

#### 场景 4: 混合场景测试

```bash
# 同时运行多种测试
# 终端 1: HTTP API 测试 (50 并发)
BASE_URL=http://localhost:8080 ../k6 run --vus 50 --duration 30m k6-load-test-template.js

# 终端 2: WebSocket 测试 (50 并发)
WS_URL=ws://localhost:8080/ws ../k6 run --vus 50 --duration 30m websocket-load-test.js
```

### 2.3 测试配置修改

#### 修改并发用户数

编辑测试脚本的 `options` 部分:

```javascript
export const options = {
  scenarios: {
    constant_load: {
      executor: 'constant-vus',
      vus: 100,  // 修改为你的目标并发数
      duration: '5m',
    },
  },
};
```

#### 修改测试目标 URL

```bash
# 生产环境
BASE_URL=https://your-production-domain.com k6 run k6-load-test-template.js

# 测试环境
BASE_URL=http://test-server:8080 k6 run k6-load-test-template.js
```

#### 调整性能阈值

编辑测试脚本的 `thresholds` 部分:

```javascript
thresholds: {
  http_req_duration: ['p(95)<2000'],  // 95% 请求 < 2秒
  errors: ['rate<0.01'],               // 错误率 < 1%
  'compile_duration': ['p(95)<3000'], // 编译 < 3秒
  'stats_duration': ['p(95)<500'],     // 统计查询 < 500ms
},
```

---

## 三、性能指标说明

### 3.1 关键性能指标

| 指标名称 | 描述 | 目标值 | 优先级 |
|---------|------|--------|--------|
| HTTP 平均响应时间 | API 请求平均响应时间 | < 2秒 | 🔴 高 |
| HTTP P95 响应时间 | 95% 请求的响应时间 | < 2秒 | 🔴 高 |
| WebSocket 消息延迟 | 消息发送和接收的延迟 | < 500ms | 🔴 高 |
| 错误率 | 失败请求的百分比 | < 1% | 🔴 高 |
| CPU 使用率 | 服务器 CPU 占用 | < 80% | 🟡 中 |
| 内存使用率 | 服务器内存占用 | < 85% | 🟡 中 |

### 3.2 K6 报告解读

测试完成后，K6 会输出类似以下的摘要:

```
=== K6 Load Test Summary ===

HTTP Metrics:
  Total Requests: 15000
  Request Rate: 50.00 req/s
  Average Duration: 1250.00ms
  P95 Duration: 1800.00ms
  Max Duration: 3500.00ms

Error Metrics:
  Error Rate: 0.50%
  Total Errors: 75

Compile API Metrics:
  Average: 1500.00ms
  P95: 2200.00ms
  Max: 4000.00ms

Stats API Metrics:
  Average: 250.00ms
  P95: 400.00ms
  Max: 800.00ms

Threshold Checks:
  ✓ http_req_duration: 95% < 2000ms
  ✓ errors: 0.50% < 1%
  ✓ compile_duration: 95% < 3000ms
  ✓ stats_duration: 95% < 500ms
```

### 3.3 WebSocket 测试报告解读

```
=== WebSocket Load Test Summary ===

Connection Success: 100.00% | Avg Duration: 150ms | P95 Latency: 450ms
Messages: 5000 sent | 4500 received
Errors: 0 connection | 0 message
```

---

## 四、监控配置

### 4.1 Prometheus 监控

1. **安装 Prometheus**:
```bash
# macOS
brew install prometheus

# Linux
sudo apt-get install prometheus
```

2. **启动 Prometheus**:
```bash
prometheus --config.file=test/monitoring/prometheus.yml
```

3. **访问 Prometheus UI**: http://localhost:9090

### 4.2 Grafana 可视化

1. **安装 Grafana**:
```bash
# macOS
brew install grafana

# Linux
sudo apt-get install grafana
```

2. **启动 Grafana**:
```bash
grafana-server
```

3. **导入 Dashboard**:
   - 访问 http://localhost:3000
   - 登录 (默认: admin/admin)
   - 导入 test/monitoring/grafana-dashboard.json

### 4.3 实时监控指标

配置 Grafana Dashboard 可以实时监控:
- HTTP 请求速率和响应时间
- WebSocket 连接数和消息延迟
- CPU 和内存使用率
- 错误率趋势

---

## 五、问题排查

### 5.1 常见问题

#### Q1: 服务器连接失败

**错误**: `Connection refused` 或 `ECONNREFUSED`

**解决方案**:
1. 确认服务器已启动
2. 检查端口配置
3. 检查防火墙设置

#### Q2: WebSocket 连接超时

**错误**: `WebSocket connection timeout`

**解决方案**:
1. 检查 WebSocket 服务器配置
2. 增加超时时间
3. 检查网络延迟

#### Q3: 测试执行缓慢

**原因**: 服务器性能不足

**解决方案**:
1. 减少并发用户数
2. 优化服务器配置
3. 增加硬件资源

#### Q4: 错误率过高

**原因**: 服务器过载或代码问题

**解决方案**:
1. 检查服务器日志
2. 减少并发压力
3. 优化数据库查询
4. 增加连接池大小

### 5.2 调试技巧

#### 启用详细日志

```bash
# K6 详细输出
../k6 run --verbose k6-load-test-template.js

# 显示 HTTP 请求详情
../k6 run --http-debug k6-load-test-template.js
```

#### 单用户测试

```bash
# 单用户测试，用于调试
../k6 run --vus 1 k6-load-test-template.js
```

---

## 六、后续步骤

### 6.1 测试执行计划

建议按以下顺序执行测试:

1. **单功能测试** (2-3天)
   - 编译接口并发测试
   - 统计接口并发测试
   - WebSocket 连接测试

2. **混合场景测试** (2-3天)
   - 综合并发测试
   - 长时间稳定性测试

3. **结果分析** (1-2天)
   - 性能瓶颈分析
   - 优化建议
   - 测试报告编写

### 6.2 性能优化建议

根据测试结果，可能需要优化:

1. **数据库优化**
   - 增加连接池大小
   - 优化查询语句
   - 添加索引

2. **服务器优化**
   - 增加工作线程
   - 调整内存配置
   - 启用缓存

3. **代码优化**
   - 异步处理
   - 减少锁竞争
   - 优化算法

### 6.3 持续监控

测试完成后，建议:

1. 部署监控系统
2. 设置性能告警
3. 定期执行负载测试
4. 监控系统健康状态

---

## 七、联系和支持

如有问题或需要帮助，请联系开发团队。

**文档版本**: 1.0.0
**最后更新**: 2026-05-31
