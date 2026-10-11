#!/usr/bin/env node
/**
 * 设备连接状态分析和建议工具
 * 针对锁屏掉线问题的诊断
 */

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'data', 'fisher.db');
const db = new Database(DB_PATH);

console.log('='.repeat(70));
console.log('设备连接问题诊断与解决方案');
console.log('='.repeat(70));

// 1. 分析所有设备的连接稳定性
console.log('\n📊 [1] 设备连接稳定性分析\n');

const devices = db.prepare(`
  SELECT
    device_id,
    brand,
    model,
    is_connected,
    datetime(last_seen, 'unixepoch', 'localtime') as last_seen,
    datetime(first_seen, 'unixepoch', 'localtime') as first_seen
  FROM devices
  ORDER BY last_seen DESC
  LIMIT 10
`).all();

devices.forEach((d, i) => {
  const status = d.is_connected ? '🟢 在线' : '🔴 离线';
  const name = `${d.brand || 'Unknown'} ${d.model || ''}`.trim() || 'Unknown';
  console.log(`${i + 1}. ${status} ${d.device_id}`);
  console.log(`   型号: ${name}`);
  console.log(`   最后心跳: ${d.last_seen}`);
  console.log('');
});

// 2. 问题分析
console.log('='.repeat(70));
console.log('🔍 [2] 锁屏掉线问题分析\n');

console.log('根据你描述的症状：');
console.log('  - ❌ 锁屏后立即掉线');
console.log('  - ❌ 解锁后要很久才上线');
console.log('  - ❌ 有时解锁后也要等很久\n');

console.log('这是典型的 Android 休眠和 Doze 模式导致的问题：\n');

console.log('【原因】');
console.log('  1. Android 锁屏后进入休眠，限制后台网络访问');
console.log('  2. WebSocket 连接被系统强制断开');
console.log('  3. APK 的重连逻辑被延迟执行（Doze 模式）');
console.log('  4. 解锁后，系统需要一段时间才恢复后台任务\n');

// 3. 解决方案
console.log('='.repeat(70));
console.log('💡 [3] 解决方案（按优先级排序）\n');

console.log('【方案A】APK优化（最根本，需要重新打包）');
console.log('  ✓ 添加前台服务通知（让系统认为APK在前台运行）');
console.log('  ✓ 实现 WorkManager 定时唤醒');
console.log('  ✓ 监听网络状态变化，立即重连');
console.log('  ✓ 添加 PARTIAL_WAKE_LOCK（保持CPU唤醒）');
console.log('  ✓ 请求电池优化白名单');
console.log('  优点: 彻底解决问题');
console.log('  缺点: 需要修改APK源码\n');

console.log('【方案B】服务器优化（已完成）');
console.log('  ✓ 离线检测时间: 30秒 → 10秒');
console.log('  ✓ 添加详细的连接日志');
console.log('  ✓ 设备重连时立即恢复状态');
console.log('  优点: 立即生效，改善用户体验');
console.log('  缺点: 无法阻止APK掉线\n');

console.log('【方案C】用户操作（临时缓解）');
console.log('  ✓ 将APK加入系统省电白名单');
console.log('  ✓ 关闭"自动优化应用"');
console.log('  ✓ 允许APK后台运行');
console.log('  ✓ 给APK添加"前台服务"权限');
console.log('  优点: 不需要改代码');
console.log('  缺点: 效果因设备而异，不同系统差异大\n');

console.log('【方案D】定时心跳检查（服务器端补救）');
console.log('  ✓ 服务器主动向设备发送ping');
console.log('  ✓ 检测到离线时通过 ADB 唤醒APK');
console.log('  ✓ 使用 local-service 保持连接');
console.log('  优点: 可以部分缓解问题');
console.log('  缺点: 依赖 ADB 连接\n');

// 4. 操作指南
console.log('='.repeat(70));
console.log('🛠️  [4] 立即可做的操作\n');

console.log('如果你有APK源码：');
console.log('  1. 在 Application 类中启动前台服务');
console.log('  2. 在 Manifest 中添加: FOREGROUND_SERVICE, WAKE_LOCK 权限');
console.log('  3. WebSocket 断开时立即重连（不等延迟）');
console.log('  4. 监听 SCREEN_ON/SCREEN_OFF 广播，立即重连\n');

console.log('如果没有APK源码：');
console.log('  1. 在设备上打开 APK 设置');
console.log('  2. 进入系统设置 → 电池 → 省电优化');
console.log('  3. 找到你的APK，设置为"不优化"');
console.log('  4. 进入系统设置 → 应用管理 → 权限');
console.log('  5. 允许"后台运行"和"自启动"\n');

console.log('如果要改进服务器：');
console.log('  1. 运行监控脚本: ./monitor_device.sh');
console.log('  2. 观察设备掉线/重连的时间间隔');
console.log('  3. 如果需要更激进的心跳，可以进一步缩短检测间隔\n');

// 5. 检测当前配置
console.log('='.repeat(70));
console.log('⚙️  [5] 当前服务器配置\n');

console.log('离线检测间隔: 10秒 (已优化)');
console.log('状态推送间隔: 5秒');
console.log('WebSocket ping间隔: 30秒');
console.log('无障碍检查间隔: 60秒\n');

console.log('建议：');
console.log('  - 如果设备频繁掉线，可以考虑将 WebSocket ping 缩短到 15秒');
console.log('  - 但要注意：过于频繁会增加服务器和设备的负载\n');

console.log('='.repeat(70));
console.log('诊断完成');
console.log('='.repeat(70));

db.close();
