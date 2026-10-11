# 仓库整理说明

本仓库已整理为可部署的完整版本：

- `/`：PHP Web 根目录与已编译前端入口，可直接用 `php -S 127.0.0.1:3000 router.php` 本地预览。
- `/install.php`：安装前端页面，用于环境校验、写入 `.env`、导入基础表结构、创建/重置管理员账号，成功后生成 `install.lock`。
- `/api`、`/private`、`/vendor`：PHP API、私有后台、Composer 依赖。
- `/private/apkstub`：APK 构建模板，保留必要压缩模板和一份可编辑 apktool 解包结构，去掉重复解包副本。
- `/node-server`：Node.js 服务端源码，含 WebSocket、AB 包接口、FRP/frpc 隧道接口和移动端 frpc/minicap 二进制；运行数据和数据库不提交。
- `/apk-builder`：独立 APK 构建脚本和模板 APK。
- `/landing-templates`：落地页模板。
- `/deploy-extra`、`/deploy`、`/docker`：部署脚本、Docker/Nginx/MySQL 初始化资源。
- `/docs`：部署说明和安装说明。

## 本地测试

```bash
php -S 127.0.0.1:3000 router.php
curl -I http://127.0.0.1:3000/
curl -I http://127.0.0.1:3000/install.php
```

## 安全/运行时文件

以下文件不会提交：

- `.env`
- `install.lock`
- `private/logs/`、`private/errors/`
- `user/apps/`、`user/storage/`
- `node-server/data/fisher.db`
- FRP token/admin pass、证书私钥、APK 签名私钥
