# 安全加固说明（源码泄露后必做）

若你的源码曾泄露，请务必完成以下配置，防止他人使用泄露版本入侵。

## 1. 配置管理员入口密钥（必做）

在 `.env` 中设置 `ADMIN_PATH`，使用随机字符串（建议 16 位以上）：

```
ADMIN_PATH=你生成的随机密钥
```

**效果**：访问后台必须使用  
`https://你的域名/private/login.php?key=你生成的随机密钥`  
直接访问 `/private/login.php` 将返回 404。

**生成随机密钥示例**：
```bash
# Linux/Mac
openssl rand -hex 16
```

## 2. 修改管理员密码（必做）

将 `ADMIN_KEY` 改为强密码，不要使用默认值。

## 3. 配置 IP 白名单（推荐）

若管理员仅从固定 IP 访问，可设置：

```
ADMIN_IP_WHITELIST=你的IP1,你的IP2
```

未在白名单的 IP 访问后台将返回 403。

## 4. 登录失败锁定（已启用）

连续 8 次密码错误将封禁该 IP 15 分钟。

## 5. WebSocket 与数据库防护（防数据被窃取）

### 5.1 WebSocket 连接密钥

在 `.env` 中设置 `WS_SECRET`（建议 16 位以上随机字符串）：

```
WS_SECRET=你生成的随机密钥
```

**效果**：
- 设备通过 Ping 获取的 WebSocket URL 会自动带上 `?k=密钥`
- 前端需使用带密钥的 URL 连接（可从设备列表 API 的 `wsUrl` 字段获取）
- 未带正确密钥的连接将被拒绝

### 5.2 checkphone 需携带 token

WebSocket 的 `checkphone` 请求必须携带 `token`，否则不返回设备数据。前端需在发送 checkphone 时附带当前用户的 token，例如：

```json
{ "subc": "checkphone", "email": "加密后的邮箱", "token": "用户token", "page": 1, "pageSize": 10 }
```

设备列表 API（`EaodAllDevices`）的响应中已包含 `wsUrl`，前端应使用该 URL 建立 WebSocket 连接。

### 5.3 数据库不暴露外网

Docker 部署时，`docker-compose.yml` 已默认注释 MySQL 的 `ports: 3306:3306`，数据库仅可在容器内访问。若需从本机调试，可临时取消注释。

非 Docker 部署时，请确保 MySQL 仅监听 `127.0.0.1`，不对外网开放 3306 端口。

### 5.4 MQTT 备用通道

如果启用了 MQTT 设备通道，请不要把 1883 端口直接暴露到公网；优先保留为容器内服务或内网访问。

建议同时配置：

```
MQTT_ENABLE=1
MQTT_TOPIC_PREFIX=eaod
```

并在设备侧使用固定主题前缀，避免被其他客户端误订阅。

## 6. 其他建议

- 定期更换 `ADMIN_PATH`、`ADMIN_KEY`、`WS_SECRET`
- 使用 HTTPS
- 将 `.env` 放在 Web 根目录外或确保不可被访问
