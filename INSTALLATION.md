# 📦 章鱼出海系统安装完成

## ✅ 安装状态

### 系统服务
- ✅ Nginx (端口 80/443)
- ✅ PHP 8.3-FPM
- ✅ MySQL 数据库
- ✅ WebSocket 服务 (端口 8080/3000)

### 目录结构
```
/var/www/ts5025.cc/
├── index.html              # 前端入口
├── *.js, *.css            # 前端资源文件
├── .env                   # 环境配置（已配置）
├── api/                   # PHP API 接口
├── private/               # 后台管理
├── user/                  # 用户数据目录
└── vendor/                # PHP 依赖
```

## 🔑 重要信息

### 数据库
- 主机: 127.0.0.1
- 数据库: dy_804ks03_sbs
- 用户名: dy_804ks03_sbs
- 密码: b9x53DTfZfGk6kit

### 管理员访问
- 后台地址: https://ts5025.cc/private/login.php?key=edc978fe9c69d9e1d5282b49f6dac3a68af5d6c2
- 管理员密钥: 3c45863e7d6cb401ce0b45e26081b81e

### 加密密钥（已配置）
- SECRIT_KEY: Zf8k3P9xM2wN7qR5tV1yB6uA4hG0jL
- SIV: H7m!v2$X.Q+rFp/;
- SIV_JEC: W4fJ1hZ7kL3nX9oB2pT4sE6rG8vI0c

## 🌐 访问地址
- 前端: https://ts5025.cc/
- API: https://ts5025.cc/api/
- WebSocket: wss://ts5025.cc/api/ws

## 🔧 服务管理命令

### 查看服务状态
```bash
systemctl status nginx
systemctl status php8.3-fpm
systemctl status ts5025-websocket.service
```

### 重启服务
```bash
systemctl restart nginx
systemctl restart php8.3-fpm
systemctl restart ts5025-websocket.service
```

### 查看日志
```bash
# Nginx 日志
tail -f /var/log/nginx/ts5025.cc.log
tail -f /var/log/nginx/ts5025.cc.error.log

# WebSocket 日志
tail -f /var/log/ts5025-websocket.log
tail -f /var/log/ts5025-websocket.error.log
```

## 📝 后续配置

### 1. 邮件配置（可选）
编辑 `/var/www/ts5025.cc/private/Eaod85401.php` 中的邮件设置：
- Email_Host
- Email_Name
- Email_Pass

### 2. Telegram 通知（可选）
在 `.env` 中配置：
```env
TG_BOT_TOKEN=你的机器人token
TG_CHAT_ID=你的聊天ID
```

### 3. ADB 调试（可选）
如需使用 ADB Bridge 功能：
1. 安装 Android SDK Platform Tools
2. 在 `.env` 中设置 `ADB_BRIDGE_ENABLE=1`

## ⚠️ 安全建议

1. **定期备份数据库**
```bash
mysqldump -udy_804ks03_sbs -pb9x53DTfZfGk6kit dy_804ks03_sbs > backup_$(date +%Y%m%d).sql
```

2. **保护 .env 文件**
```bash
chmod 600 /var/www/ts5025.cc/.env
```

3. **定期更新系统**
```bash
apt update && apt upgrade
```

## 📖 参考文档
- README: /var/www/ts5025.cc/README.md
- 部署配置: /var/www/ts5025.cc/deploy/

---
安装时间: 2026-09-25
系统版本: Ubuntu (Linux 6.8.0)
