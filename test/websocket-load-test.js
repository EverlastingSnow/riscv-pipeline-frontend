/**
 * K6 WebSocket 负载测试脚本
 * 用于测试 RISC-V Pipeline 前端的 WebSocket 并发连接
 *
 * 运行测试:
 * k6 run websocket-load-test.js
 *
 * 需要 k6 >= 0.34.0 (支持 WebSocket)
 */

import ws from 'k6/ws';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// 自定义指标
const connectionSuccessRate = new Rate('ws_connection_success');
const messageSendRate = new Rate('ws_message_send');
const messageReceiveRate = new Rate('ws_message_receive');
const connectionDuration = new Trend('ws_connection_duration');
const messageLatency = new Trend('ws_message_latency');
const connectionErrors = new Counter('ws_connection_errors');
const messageErrors = new Counter('ws_message_errors');

// 配置默认 WebSocket URL
const WS_URL = __ENV.WS_URL || 'ws://localhost/ws';

// 测试配置
export const options = {
  // 场景: 100 并发 WebSocket 连接
  scenarios: {
    ws_load_test: {
      executor: 'constant-vus',
      vus: 100,
      duration: '5m',
    },
  },

  // 阈值配置
  thresholds: {
    ws_connection_success: ['rate>0.99'],     // 连接成功率 > 99%
    ws_message_send: ['rate>0.99'],           // 消息发送成功率 > 99%
    ws_message_latency: ['p(95)<500'],       // 95% 消息延迟 < 500ms
    ws_connection_duration: ['p(95)<1000'],   // 95% 连接时长 < 1秒
  },
};

// 测试函数
export default function () {
  const url = __ENV.WS_URL || 'ws://localhost:8080/ws';
  const testDuration = 30; // 每个连接测试 30 秒

  // 建立 WebSocket 连接
  const connectStart = Date.now();

  const res = ws.connect(WS_URL, {}, function (socket) {
    // 连接成功
    connectionDuration.add(Date.now() - connectStart);
    connectionSuccessRate.add(1);

    let messageCount = 0;

    // 设置超时
    socket.setTimeout(() => {
      console.log(`VU ${__VU} - Connection timeout after ${testDuration}s`);
      socket.close();
    }, testDuration * 1000);

    // 监听连接打开
    socket.on('open', () => {
      console.log(`VU ${__VU} - WebSocket connected`);

      // 发送初始命令
      const initCommand = JSON.stringify({
        command: 'get_signals'
      });

      socket.send(initCommand);
      messageSendRate.add(1);
      messageCount++;
    });

    // 监听消息
    socket.on('message', (data) => {
      const receiveTime = Date.now();
      messageReceiveRate.add(1);

      try {
        const message = JSON.parse(data);

        // 计算消息延迟 (如果有 timestamp)
        if (message.timestamp) {
          const latency = receiveTime - message.timestamp;
          messageLatency.add(latency);

          if (latency > 1000) {
            console.warn(`VU ${__VU} - High message latency: ${latency}ms`);
          }
        }

        // 模拟单步执行
        if (messageCount < 10) {
          const stepCommand = JSON.stringify({
            command: 'step'
          });

          const sendTime = Date.now();
          socket.send(stepCommand);
          messageSendRate.add(1);
          messageCount++;

          // 记录发送延迟
          if (message.timestamp) {
            messageLatency.add(Date.now() - sendTime, { type: 'send' });
          }
        }
      } catch (e) {
        console.error(`VU ${__VU} - Failed to parse message:`, e);
        messageErrors.add(1);
      }
    });

    // 监听错误
    socket.on('error', (e) => {
      console.error(`VU ${__VU} - WebSocket error:`, e);
      connectionErrors.add(1);
      connectionSuccessRate.add(0);
    });

    // 监听关闭
    socket.on('close', () => {
      console.log(`VU ${__VU} - WebSocket closed after ${messageCount} messages`);
    });

    // 模拟用户活动
    const activityInterval = setInterval(() => {
      if (socket.readyState === ws.OPEN) {
        // 随机发送命令
        const commands = [
          { command: 'get_signals' },
          { command: 'get_registers' },
        ];

        const command = commands[Math.floor(Math.random() * commands.length)];
        socket.send(JSON.stringify(command));
        messageSendRate.add(1);
        messageCount++;

        // 模拟用户思考时间
        sleep(Math.random() * 2 + 1);
      }
    }, 3000);

    // 清理
    socket.on('close', () => {
      clearInterval(activityInterval);
    });
  });

  // 检查连接结果
  check(res, {
    'WebSocket connection established': (r) => r && r.status === 101,
    'No connection errors': (r) => !r || r.status === 101,
  });

  if (res && res.status !== 101) {
    connectionSuccessRate.add(0);
    connectionErrors.add(1);
    console.error(`VU ${__VU} - Connection failed with status: ${res?.status}`);
  }
}

// 测试设置
export function setup() {
  console.log('WebSocket Load Test Setup');
  console.log('Target:', __ENV.WS_URL || 'ws://localhost:8080/ws');
  console.log('Concurrent Users: 100');
  console.log('Test Duration: 5 minutes');

  return {
    url: __ENV.WS_URL || 'ws://localhost:8080/ws',
    users: 100,
    duration: '5m',
  };
}

// 生成测试报告
export function handleSummary(data) {
  const wsMetrics = {
    connections: data.metrics.ws_connection_duration?.values || {},
    messages: {
      sent: data.metrics.ws_message_send?.values?.count || 0,
      received: data.metrics.ws_message_receive?.values?.count || 0,
    },
    errors: {
      connections: data.metrics.ws_connection_errors?.values?.count || 0,
      messages: data.metrics.ws_message_errors?.values?.count || 0,
    },
    latency: data.metrics.ws_message_latency?.values || {},
  };

  console.log('\n=== WebSocket Load Test Summary ===\n');
  console.log('Connection Metrics:');
  console.log(`  Success Rate: ${((data.metrics.ws_connection_success?.values?.rate || 0) * 100).toFixed(2)}%`);
  console.log(`  Average Duration: ${(wsMetrics.connections.avg || 0).toFixed(2)}ms`);
  console.log(`  P95 Duration: ${(wsMetrics.connections['p(95)'] || 0).toFixed(2)}ms`);
  console.log(`  Max Duration: ${(wsMetrics.connections.max || 0).toFixed(2)}ms`);
  console.log('\nMessage Metrics:');
  console.log(`  Messages Sent: ${wsMetrics.messages.sent}`);
  console.log(`  Messages Received: ${wsMetrics.messages.received}`);
  console.log(`  Send Rate: ${(data.metrics.ws_message_send?.values?.rate || 0).toFixed(2)}/s`);
  console.log(`  Receive Rate: ${(data.metrics.ws_message_receive?.values?.rate || 0).toFixed(2)}/s`);
  console.log('\nLatency Metrics:');
  console.log(`  Average: ${(wsMetrics.latency.avg || 0).toFixed(2)}ms`);
  console.log(`  P95: ${(wsMetrics.latency['p(95)'] || 0).toFixed(2)}ms`);
  console.log(`  Max: ${(wsMetrics.latency.max || 0).toFixed(2)}ms`);
  console.log('\nError Metrics:');
  console.log(`  Connection Errors: ${wsMetrics.errors.connections}`);
  console.log(`  Message Errors: ${wsMetrics.errors.messages}`);
  console.log('\n====================================\n');

  return {
    'stdout': textSummary(data),
    'websocket-summary.json': JSON.stringify(wsMetrics, null, 2),
  };
}

function textSummary(data) {
  const wsMetrics = data.metrics;

  let summary = '\n=== WebSocket Load Test Summary ===\n\n';

  summary += 'Connection Success: ';
  summary += `${((wsMetrics.ws_connection_success?.values?.rate || 0) * 100).toFixed(2)}%`;
  summary += ' | ';

  summary += 'Avg Duration: ';
  summary += `${(wsMetrics.ws_connection_duration?.values?.avg || 0).toFixed(2)}ms`;
  summary += ' | ';

  summary += 'P95 Latency: ';
  summary += `${(wsMetrics.ws_message_latency?.values?.['p(95)'] || 0).toFixed(2)}ms`;
  summary += '\n';

  summary += 'Messages: ';
  summary += `${wsMetrics.ws_message_send?.values?.count || 0}`;
  summary += ' sent | ';
  summary += `${wsMetrics.ws_message_receive?.values?.count || 0}`;
  summary += ' received\n';

  summary += 'Errors: ';
  summary += `${wsMetrics.ws_connection_errors?.values?.count || 0}`;
  summary += ' connection | ';
  summary += `${wsMetrics.ws_message_errors?.values?.count || 0}`;
  summary += ' message\n';

  summary += '\n====================================\n';

  return summary;
}
