# 章鱼出海 - 完整版

React SPA + PHP API + Docker 后端架构的项目。

## 快速开始

```bash
# 启动 PHP 内置开发服务器
php -S 127.0.0.1:3000 router.php
```

打开 http://127.0.0.1:3000 — 默认 mock 模式，无需 Docker。

```bash
# 完整部署 (Docker)
docker compose up -d
```

## 项目结构

```
d:\xiongmao\
├── index.html                    # 入口 (全局导航 + SPA 挂载)
├── router.php                    # PHP 内置服务器路由
├── app.config.js                 # 前端运行时配置
├── .env.example                  # 环境变量模板
│
├── assets/                       # 前端构建产物 (按需加载)
├── css/
│   └── global-nav.css            # 全局导航栏样式
│
├── api/                          # API 后端
│   ├── auth/                     # 认证 (login/verify/logout)
│   ├── ws/                       # WebSocket 服务 (Node.js)
│   ├── SubAccount.php            # 子账户 CRUD
│   ├── AdminUsers.php            # 管理员管理
│   ├── build-apk.php             # APK 构建接口
│   └── ...                       # 更多 API 端点
│
├── private/                      # 管理后台 (受保护)
│   ├── login.php                 # 管理员登录
│   ├── create.php                # 账号创建
│   ├── createacc.php             # 批量创建
│   ├── ApkBuilder.php            # APK 打包构建
│   ├── Eaod*.php                 # 设备管理模块
│   ├── mock_api.php              # Mock 数据后端
│   └── tools/                    # APKEditor, apktool
│
├── user/                         # 用户存储
│   ├── index.html                # 子账户门户
│   ├── profile.html              # 个人资料
│   ├── storage/                  # 用户文件
│   └── apps/                     # 用户应用
│
├── list/basic-list/              # 基础名单数据
│
├── vendor/                       # PHP Composer 依赖
│
├── docker/                       # Docker 基础设施
│   ├── docker-compose.yml        # 服务编排
│   ├── Dockerfile.php            # PHP-FPM 镜像
│   ├── nginx.conf                # Nginx 配置模板
│   ├── init.sql                  # 数据库初始化
│   └── ssl/                      # SSL 证书
│
└── deploy/                       # 部署配置
    ├── mc.333.autos.conf         # BT Panel Nginx
    └── mc.333.autos.nginx.conf   # Ubuntu Nginx (SSL)
```

## 管理员入口

| 路径 | 说明 |
|------|------|
| `/private/login.php?key=你的密钥` | 管理员登录 |
| `/user/` | 子账户门户 |

**安全配置**: 复制 `.env.example` 为 `.env`，填写数据库连接、加密密钥和管理员密钥。详见 [SECURITY.md](SECURITY.md)。

## 开发

- **前端**: React SPA，构建产物在根目录和 `assets/`
- **后端**: PHP API (`api/`) + Node.js WebSocket (`api/ws/`)
- **APK 构建**: `private/ApkBuilder.php` + `private/tools/`
- **数据库**: MySQL 5.7，通过 Docker 运行

### Mock 模式

无需 Docker 即可开发:
- 登录: `admin` / `admin123`
- API 自动回退到 `private/mock_api.php`
- WebSocket 可单独启动: `node api/ws/websocket-server.js`

### 真实后端

需启动 Docker 后端 (`http://127.0.0.1:8080`):
```bash
docker-compose up -d
```


## 远程操作 & 设备生命周期

本系统设计用于**远程多区域设备管理**（跨 CN/US/EU/Asia），核心原则：

### 设备生命周期策略
- **只增不减**：设备首次上报后记录**永不自动删除**
- **仅页面卸载才移除**：唯一删除路径是用户在面板点击「卸载」
- **离线标记**：超时无心跳时仅标记 ws_online=0，设备仍保留在列表
- **安全阀**：WS_DEVICE_AUTO_REMOVE_DAYS=0（默认）永不自动移除

### 防抖动机制
| 参数 | 默认值 | 说明 |
|------|--------|------|
| WS_MARK_OFFLINE_ON_CLOSE | 0 | 连接关闭不立即标离线，等超时才判定 |
| WS_ENABLE_PING_PROBE | 0 | 不发送协议层 ping 探测，避免跨区域误判 |
| WS_PING_TIMEOUT_SEC | 300 | 5 分钟无 ping 才判定离线 |
| WS_REGION_PING_FACTOR | 2 | 跨区域时 ping 超时放大倍数 |
| WS_SCREEN_JITTER_MS | 50 | 屏幕帧抖动缓冲 |

### 零延迟配置
| 参数 | 默认值 | 说明 |
|------|--------|------|
| WS_SCREEN_FRAME_MIN_INTERVAL_MS | 120 | 屏幕帧最小间隔 |
| WS_MOV_COALESCE_MS | 16 | 触摸指令合并窗口（约 60fps） |
| WS_SCREEN_PRIORITY_BOOST_MS | 350 | 操作后优先发送帧的时间窗口 |
| WS_SCREEN_MAX_BUFFERED_BYTES | 1048576 | 屏幕帧缓冲上限 |

### ADB 持久连接
- ADB 桥接器自动管理设备心跳，**永不从设备列表移除**
- 离线自动重连，指数退避（10s → 300s）
- device.close 事件限频推送（默认每 3600s 一次）
- 详见 .env 中 ADB_* 参数
## 部署

参考 `deploy/` 目录下的 nginx 配置。


### 海内外机型适配

**ROM 自动检测** — adb-bridge.js 的 fetchDeviceProps() 会读取以下属性识别国产 ROM：

| ROM | 检测属性 | 机型覆盖 |
|-----|----------|----------|
| MIUI (HyperOS) | ro.miui.ui.version.name | Xiaomi, Redmi, POCO |
| EMUI / HarmonyOS | ro.build.version.emui | Huawei, Honor |
| ColorOS | ro.build.version.opporom | OPPO, OnePlus, Realme |
| FuntouchOS / OriginOS | ro.vivo.os.build.display.id | vivo, iQOO |
| Flyme | ro.build.flyme.version | Meizu |
| OneUI | ro.build.version.oneui | Samsung |

**按 ROM 自动授权** — WS 面板发送 auto-grant 命令，adb-bridge 自动执行对应机型权限链：
- 国产 ROM：自启动权限 + 省电白名单 + 后台限制解除
- 所有设备：运行时权限（悬浮窗/存储/通讯录等）+ 防休眠

### APK 构建区域

build_region 参数控制 APK 构建的目标区域：
- cn — 国内版：默认中文通知 + [BUILD_REGION] 标记（smali 可启用中国区特性）
- global — 国际版：默认英文通知 + 标准行为

构建产物通过 apksigner（v2+v3）自动签名，若 keystore 不存在则自动生成 debug 证书。

