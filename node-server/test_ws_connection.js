#!/usr/bin/env node
/**
 * WebSocket连接测试工具
 * 模拟设备 ebde1d405b59d409 连接服务器
 */

const WebSocket = require('ws');

const DEVICE_ID = 'ebde1d405b59d409';
const WS_URL = `wss://127.0.0.1:8443/ws/device?sessionId=${DEVICE_ID}`;

console.log('='.repeat(60));
console.log('WebSocket连接测试');
console.log('设备ID:', DEVICE_ID);
console.log('连接URL:', WS_URL);
console.log('='.repeat(60));

const ws = new WebSocket(WS_URL, {
  rejectUnauthorized: false, // 忽略自签名证书
  handshakeTimeout: 10000
});

ws.on('open', () => {
  console.log('\n✅ WebSocket连接成功！');

  // 发送设备状态消息
  const statusMsg = {
    type: 'status',
    sessionId: DEVICE_ID,
    deviceId: DEVICE_ID,
    data: {
      brand: 'TestDevice',
      model: 'TestModel',
      osVersion: '13',
      appVersion: '1.0.0',
      batteryLevel: 80,
      networkType: 'WiFi',
      screenWidth: 1080,
      screenHeight: 2400,
      isLocked: false,
      isScreenOn: true,
      accessibilityAlive: true
    }
  };

  console.log('\n📤 发送状态消息...');
  ws.send(JSON.stringify(statusMsg));
});

ws.on('message', (data) => {
  try {
    const msg = JSON.parse(data.toString());
    console.log('\n📥 收到服务器消息:', msg.type || 'unknown');
    console.log('   内容:', JSON.stringify(msg).slice(0, 200));
  } catch (e) {
    console.log('\n📥 收到二进制消息:', data.length, 'bytes');
  }
});

ws.on('error', (err) => {
  console.error('\n❌ 连接错误:', err.message);
  process.exit(1);
});

ws.on('close', (code, reason) => {
  console.log('\n🔌 连接关闭');
  console.log('   代码:', code);
  console.log('   原因:', reason ? reason.toString() : 'none');
  process.exit(0);
});

// 保持连接30秒后关闭
setTimeout(() => {
  console.log('\n⏱️  测试完成，关闭连接');
  ws.close();
}, 30000);

console.log('\n等待连接...');
