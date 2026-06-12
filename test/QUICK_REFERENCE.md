# 快速参考卡片 - 并发测试

## ⚡ 5 分钟快速开始

### 1. 启动服务器 (必需)
```bash
npm run dev  # 或你的后端启动命令
```

### 2. 执行测试
```bash
cd test

# HTTP API 测试 (100 并发, 5分钟)
BASE_URL=http://localhost:8080 ../k6 run --vus 100 --duration 5m k6-load-test-template.js

# WebSocket 测试 (100 并发, 5分钟)
WS_URL=ws://localhost:8080/ws ../k6 run --vus 100 --duration 5m websocket-load-test.js

# 生成 HTML 报告
BASE_URL=http://localhost:8080 ../k6 run --html-report=report.html k6-load-test-template.js
```

## 📊 常用测试命令

### 恒定负载测试
```bash
../k6 run --vus 100 --duration 5m k6-load-test-template.js
```

### 阶梯负载测试
```bash
../k6 run --vus 10 --duration 2m k6-load-test-template.js  # 2分钟
../k6 run --vus 50 --duration 5m k6-load-test-template.js  # 5分钟
../k6 run --vus 100 --duration 5m k6-load-test-template.js # 5分钟
```

### 峰值负载测试
```bash
../k6 run --vus 150 --duration 1m k6-load-test-template.js
```

### 长时间稳定性测试
```bash
../k6 run --vus 100 --duration 8h k6-load-test-template.js
```

## 🎯 性能目标

| 指标 | 目标 | 状态 |
|------|------|------|
| HTTP 响应时间 | < 2秒 | ⏳ |
| WebSocket 延迟 | < 500ms | ⏳ |
| 错误率 | < 1% | ⏳ |
| CPU 使用率 | < 80% | ⏳ |
| 内存使用率 | < 85% | ⏳ |

## 📁 关键文件

- `k6-load-test-template.js` - HTTP API 测试
- `websocket-load-test.js` - WebSocket 测试
- `README.md` - 完整使用指南
- `TEST_EXECUTION_GUIDE.md` - 详细执行文档
- `PROJECT_SUMMARY.md` - 项目总结

## 🔧 常用配置

### 修改并发数
```bash
../k6 run --vus 200 --duration 5m k6-load-test-template.js  # 200 并发
```

### 修改测试目标
```bash
BASE_URL=http://production-server.com:8080 ../k6 run k6-load-test-template.js
```

### 启用详细日志
```bash
../k6 run --verbose --vus 10 k6-load-test-template.js
```

## 📈 解读测试结果

### 成功示例
```
✓ http_req_duration: 95% < 2000ms
✓ errors: 0.50% < 1%
✓ compile_duration: 95% < 3000ms
```

### 失败示例
```
✗ http_req_duration: 95% > 2000ms (实际: 3500ms)
✗ errors: 2.00% > 1%
```

## 🆘 常见问题

**Q: 服务器连接失败?**
```bash
# 检查服务器是否运行
curl http://localhost:8080/api/stats
```

**Q: 测试执行太慢?**
```bash
# 减少并发数
../k6 run --vus 50 k6-load-test-template.js
```

**Q: 如何调试?**
```bash
# 单用户测试
../k6 run --vus 1 k6-load-test-template.js

# 详细输出
../k6 run --verbose k6-load-test-template.js
```

---

**版本**: 1.0.0 | **更新**: 2026-05-31 | **工具**: K6 v0.55.0
