# Docker 一键部署（完整版）

> 一条命令启动，包含 APK 构建能力，适合任何系统。

## 前置要求

- 已安装 [Docker](https://docs.docker.com/get-docker/) 和 [Docker Compose](https://docs.docker.com/compose/install/)

## 四步部署

### 1. 复制环境配置

```bash
cp docker/.env.example .env
```

（可选）编辑 `.env` 修改数据库密码、管理员密码。

### 2. 准备 APK 模板（构建 APK 必需）

将 `apkstub.zip` 和 `apkstubg.zip` 放入 `private/apkstub/` 目录。

> 这两个文件是 APK 构建的模板，需自行准备。若无模板，Web/API/设备管理功能仍可正常使用，仅无法构建 APK。

### 3. 启动

```bash
docker compose up -d --build
```

首次构建需下载 Java、Android SDK 等，约 5–10 分钟。

### 4. 访问

- **前端**：http://localhost
- **后台**：若设置了 `ADMIN_PATH`，使用  
  `http://localhost/private/login.php?key=你的ADMIN_PATH`  
  否则使用 `http://localhost/private/login.php`  
  - 密码：`.env` 中的 `ADMIN_KEY`（默认 `admin123`）

首次登录后台后，在「账号管理」中创建第一个用户，用于前端登录。

---

## 常用命令

| 命令 | 说明 |
|------|------|
| `docker compose up -d --build` | 构建并启动 |
| `docker compose down` | 停止并删除容器 |
| `docker compose logs -f php` | 查看 PHP 日志 |
| `docker compose ps` | 查看运行状态 |

---

## 端口说明

| 端口 | 服务 |
|------|------|
| 80 | 网站（Nginx） |
| 3306 | MySQL（默认不对外暴露，仅容器内访问） |
| 8080 | WebSocket（默认不对外暴露，通过 Nginx 代理 /api/ws/） |
| 1883 | MQTT（默认仅容器内访问，用于设备备用通道） |

**安全建议**：在 `.env` 中设置 `WS_SECRET`，防止未授权连接 WebSocket 窃取设备数据。详见 `SECURITY.md`。

如需启用 MQTT 设备通道，在 `.env` 中设置：

```env
MQTT_ENABLE=1
MQTT_TOPIC_PREFIX=eaod
MQTT_URL=mqtt://mqtt:1883
```

设备上报主题示例：`eaod/device/<phone_id>/ping`，状态回执主题：`eaod/device/<phone_id>/status`。

---

## 数据持久化

以下数据通过 Docker Volume 持久化：

- `mysql_data`：数据库
- `user_data`：用户文件
- `php_logs` / `php_errors`：日志

---

## APK 构建说明

Docker 镜像已包含：

- PHP 8.1 + 扩展
- Java 11
- Android SDK build-tools（apksigner、zipalign）
- apktool.jar（启动时自动复制到 private/tools/）

**仍需准备**：`private/apkstub/apkstub.zip` 和 `apkstubg.zip` 模板文件。
