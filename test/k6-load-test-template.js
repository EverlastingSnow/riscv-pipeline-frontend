/**
 * K6 负载测试脚本模板
 * 用于 RISC-V Pipeline 前端的并发测试
 *
 * 安装 k6: https://k6.io/docs/getting-started/installation/
 *
 * 运行测试:
 * k6 run test-script.js
 *
 * 查看 HTML 报告:
 * k6 run --html-report=report.html test-script.js
 */

import http from 'k6/http';
import { sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// 自定义指标
const errorRate = new Rate('errors');
const compileDuration = new Trend('compile_duration');
const statsDuration = new Trend('stats_duration');

// 配置默认 URL
const BASE_URL = __ENV.BASE_URL || 'http://localhost';
const WS_URL = __ENV.WS_URL || 'ws://localhost/ws';

// 测试配置
export const options = {
  // 场景1: 恒定负载测试 (100 并发)
  scenarios: {
    constant_load: {
      executor: 'constant-vus',
      vus: 100,
      duration: '5m',
    },
  },

  // 场景2: 阶梯负载测试
  // stages: [
  //   { duration: '2m', target: 10 },   // 从 10 用户开始
  //   { duration: '5m', target: 50 },   // 增加到 50 用户
  //   { duration: '5m', target: 100 },  // 增加到 100 用户
  //   { duration: '5m', target: 150 },  // 增加到 150 用户（超过目标）
  //   { duration: '5m', target: 0 },    // 降低到 0
  // ],

  // 全局配置
  thresholds: {
    http_req_duration: ['p(95)<2000'],  // 95% 请求在 2 秒内完成
    errors: ['rate<0.01'],              // 错误率 < 1%
    'compile_duration': ['p(95)<3000'], // 编译 95% 在 3 秒内完成
    'stats_duration': ['p(95)<500'],    // 统计查询 95% 在 500ms 内完成
  },
};

// 默认测试函数
export default function () {
  // 模拟用户随机操作
  const actions = [
    () => testStatsAPI(),
    () => testCompileAPI(),
    () => testWebSocket(),
  ];

  // 随机选择一个操作
  const action = actions[Math.floor(Math.random() * actions.length)];
  action();

  // 模拟用户思考时间 (1-3 秒)
  sleep(Math.random() * 2 + 1);
}

// 测试统计接口
function testStatsAPI() {
  const startTime = Date.now();

  const res = http.get(BASE_URL + '/api/stats', {
    tags: { name: 'stats_api' },
  });

  statsDuration.add(Date.now() - startTime);

  const success = res.status === 200;
  errorRate.add(!success);

  if (!success) {
    console.error('Stats API Error:', res.status, res.body);
  }
}

// 测试编译接口
function testCompileAPI() {
  const startTime = Date.now();

  // 准备测试代码
  const testCode = `
    .text
    .globl _start
_start:
    addi x1, x0, 5
    addi x2, x0, 3
    add x3, x1, x2
    ebreak
  `;

  const payload = JSON.stringify({
    code: testCode,
    optimize: false,
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
    },
    tags: { name: 'compile_api' },
  };

  const res = http.post(BASE_URL + '/api/compile', payload, params);

  compileDuration.add(Date.now() - startTime);

  const success = res.status === 200;
  errorRate.add(!success);

  if (!success) {
    console.error('Compile API Error:', res.status, res.body);
  }
}

// 测试 WebSocket 连接
function testWebSocket() {
  // 注意: k6 的 WebSocket 支持需要使用 ws 模块
  // import ws from 'k6/ws';

  // 示例代码 (需要安装 k6)
  // const url = __ENV.WS_URL || 'ws://localhost:8080/ws';
  // const res = ws.connect(url, {}, function (socket) {
  //   socket.on('open', () => {
  //     socket.send(JSON.stringify({ command: 'get_signals' }));
  //   });
  //
  //   socket.on('message', (data) => {
  //     // 处理消息
  //     socket.close();
  //   });
  //
  //   socket.on('error', (e) => {
  //     console.error('WebSocket Error:', e);
  //   });
  // });
  //
  // errorRate.add(res.status !== 101);

  console.log('WebSocket test placeholder - implement with k6/ws module');
}

// 测试设置 (可选)
export function setup() {
  console.log('Test setup - preparing test data...');

  // 可以在这里准备测试数据
  const testData = {
    baseUrl: __ENV.BASE_URL || 'http://localhost:8080',
    wsUrl: __ENV.WS_URL || 'ws://localhost:8080/ws',
    testUsers: 100,
  };

  console.log('Test configuration:', JSON.stringify(testData));

  return testData;
}

// 测试完成 (可选)
export function handleSummary(data) {
  console.log('Test completed - generating report...');

  return {
    'stdout': textSummary(data, { indent: ' ', enableColors: true }),
    'summary.json': JSON.stringify(data),
  };
}

// 文本格式的摘要
function textSummary(data, opts) {
  const indent = opts.indent || '';
  let summary = '\n' + indent + '=== K6 Load Test Summary ===\n\n';

  // HTTP 相关指标
  summary += indent + 'HTTP Metrics:\n';
  summary += indent + `  Total Requests: ${data.metrics.http_reqs?.values?.count || 0}\n`;
  summary += indent + `  Request Rate: ${(data.metrics.http_reqs?.values?.rate || 0).toFixed(2)} req/s\n`;
  summary += indent + `  Average Duration: ${(data.metrics.http_req_duration?.values?.avg || 0).toFixed(2)}ms\n`;
  summary += indent + `  P95 Duration: ${(data.metrics.http_req_duration?.values?.['p(95)'] || 0).toFixed(2)}ms\n`;
  summary += indent + `  Max Duration: ${(data.metrics.http_req_duration?.values?.max || 0).toFixed(2)}ms\n\n`;

  // 错误率
  summary += indent + 'Error Metrics:\n';
  summary += indent + `  Error Rate: ${((data.metrics.errors?.values?.rate || 0) * 100).toFixed(2)}%\n`;
  summary += indent + `  Total Errors: ${data.metrics.errors?.values?.count || 0}\n\n`;

  // 自定义指标
  if (data.metrics.compile_duration) {
    summary += indent + 'Compile API Metrics:\n';
    summary += indent + `  Average: ${(data.metrics.compile_duration.values?.avg || 0).toFixed(2)}ms\n`;
    summary += indent + `  P95: ${(data.metrics.compile_duration.values?.['p(95)'] || 0).toFixed(2)}ms\n`;
    summary += indent + `  Max: ${(data.metrics.compile_duration.values?.max || 0).toFixed(2)}ms\n\n`;
  }

  if (data.metrics.stats_duration) {
    summary += indent + 'Stats API Metrics:\n';
    summary += indent + `  Average: ${(data.metrics.stats_duration.values?.avg || 0).toFixed(2)}ms\n`;
    summary += indent + `  P95: ${(data.metrics.stats_duration.values?.['p(95)'] || 0).toFixed(2)}ms\n`;
    summary += indent + `  Max: ${(data.metrics.stats_duration.values?.max || 0).toFixed(2)}ms\n\n`;
  }

  // 检查阈值
  summary += indent + 'Threshold Checks:\n';
  const checks = data.metrics.checks?.values || {};
  for (const [name, value] of Object.entries(checks)) {
    const status = value === 1 ? '✓' : '✗';
    summary += indent + `  ${status} ${name}: ${(value * 100).toFixed(2)}%\n`;
  }

  summary += '\n' + indent + '================================\n';

  return summary;
}
