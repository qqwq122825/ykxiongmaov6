const REDIS_ENABLE = /^(1|true|yes)$/i.test(process.env.REDIS_ENABLE || '');
const REDIS_URL = process.env.REDIS_URL || 'redis://redis:6379';
const REDIS_PREFIX = String(process.env.REDIS_PREFIX || 'eaod').replace(/:+$/, '');

let createClient;
try {
  ({ createClient } = require('redis'));
} catch (error) {
  createClient = null;
}

let pubClient = null;
let subClient = null;
let initPromise = null;

function buildChannel(name) {
  return `${REDIS_PREFIX}:${name}`;
}

function buildKey(name) {
  return `${REDIS_PREFIX}:${name}`;
}

function isEnabled() {
  return REDIS_ENABLE && !!createClient;
}

async function initRedisBus() {
  if (!isEnabled()) {
    if (REDIS_ENABLE && !createClient) {
      console.warn('[REDIS] redis package not installed, bus disabled.');
    }
    return { enabled: false };
  }

  if (initPromise) return initPromise;

  initPromise = (async () => {
    pubClient = createClient({ url: REDIS_URL });
    subClient = pubClient.duplicate();

    pubClient.on('error', (error) => {
      console.warn('[REDIS] publisher error:', error && error.message ? error.message : error);
    });

    subClient.on('error', (error) => {
      console.warn('[REDIS] subscriber error:', error && error.message ? error.message : error);
    });

    await pubClient.connect();
    await subClient.connect();
    console.log('[REDIS] bus connected:', REDIS_URL);
    return { enabled: true };
  })().catch((error) => {
    console.warn('[REDIS] init failed:', error && error.message ? error.message : error);
    initPromise = null;
    pubClient = null;
    subClient = null;
    return { enabled: false, error };
  });

  return initPromise;
}

async function publishEvent(name, payload) {
  if (!isEnabled()) return false;
  await initRedisBus();
  if (!pubClient || !pubClient.isOpen) return false;
  await pubClient.publish(buildChannel(name), JSON.stringify(payload || {}));
  return true;
}

async function subscribeEvent(name, handler) {
  if (!isEnabled()) return false;
  await initRedisBus();
  if (!subClient || !subClient.isOpen) return false;

  await subClient.subscribe(buildChannel(name), async (message) => {
    let parsed = null;
    try {
      parsed = JSON.parse(message);
    } catch {
      parsed = { raw: message };
    }

    try {
      await handler(parsed);
    } catch (error) {
      console.warn('[REDIS] subscriber handler failed:', error && error.message ? error.message : error);
    }
  });

  return true;
}

async function setJsonValue(name, payload, ttlSec = 0) {
  if (!isEnabled()) return false;
  await initRedisBus();
  if (!pubClient || !pubClient.isOpen) return false;

  const key = buildKey(name);
  const value = JSON.stringify(payload || {});
  if (ttlSec > 0) {
    await pubClient.set(key, value, { EX: ttlSec });
  } else {
    await pubClient.set(key, value);
  }
  return true;
}

async function deleteKey(name) {
  if (!isEnabled()) return false;
  await initRedisBus();
  if (!pubClient || !pubClient.isOpen) return false;
  await pubClient.del(buildKey(name));
  return true;
}

async function getJsonValue(name) {
  if (!isEnabled()) return null;
  await initRedisBus();
  if (!pubClient || !pubClient.isOpen) return null;

  const raw = await pubClient.get(buildKey(name));
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function listJsonByPattern(pattern, limit = 100) {
  if (!isEnabled()) return [];
  await initRedisBus();
  if (!pubClient || !pubClient.isOpen) return [];

  const values = [];
  const keyPattern = buildKey(pattern);
  for await (const key of pubClient.scanIterator({ MATCH: keyPattern, COUNT: Math.min(Math.max(limit, 10), 500) })) {
    const raw = await pubClient.get(key);
    if (!raw) continue;
    try {
      values.push(JSON.parse(raw));
    } catch {
      continue;
    }
    if (values.length >= limit) break;
  }
  return values;
}

function getRedisConfig() {
  return {
    enabled: isEnabled(),
    url: REDIS_URL,
    prefix: REDIS_PREFIX,
  };
}

module.exports = {
  getRedisConfig,
  initRedisBus,
  publishEvent,
  subscribeEvent,
  setJsonValue,
  deleteKey,
  getJsonValue,
  listJsonByPattern,
};