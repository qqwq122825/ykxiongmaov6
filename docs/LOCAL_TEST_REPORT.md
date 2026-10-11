# Local Test Report

Date: 2026-10-11 Asia/Shanghai

## Commands run

```bash
find . -type f -name '*.php' -not -path './vendor/*' -not -path './private/apkstub/*' -print0 | xargs -0 -n1 php -l
node --check node-server/server.js
node --check node-server/server_remote.js
php -S 127.0.0.1:3010 router.php
curl -I http://127.0.0.1:3010/
curl http://127.0.0.1:3010/ | grep -o '<title>[^<]*</title>'
curl -I http://127.0.0.1:3010/install.php
curl http://127.0.0.1:3010/install.php | grep -Eo 'Fisher / Panda V6 安装器|环境校验|install.lock'
```

## Results

- PHP lint: 62 project PHP files checked; no syntax errors.
- Node syntax: `node-server/server.js` and `node-server/server_remote.js` passed `node --check`.
- Web root: `HTTP/1.1 200 OK`, title `<title>章鱼出海</title>`.
- Installer: `HTTP/1.1 200 OK`; page contains `Fisher / Panda V6 安装器`, `环境校验`, and `install.lock`.

## Notes

- `.env`, `install.lock`, runtime logs, user data, DB files, FRP credentials, and private SSL directories are ignored.
- `install.php` creates `install.lock` only after a successful DB/admin reset.
