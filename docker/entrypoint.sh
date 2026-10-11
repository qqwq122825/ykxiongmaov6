#!/bin/bash
# 确保 private/tools 有 apktool（Docker 挂载会覆盖，需每次启动时复制）
TOOLS_DIR="/var/www/html/private/tools"
if [ ! -f "$TOOLS_DIR/apktool.jar" ] && [ -f "/opt/apk-tools/apktool.jar" ]; then
    mkdir -p "$TOOLS_DIR"
    cp /opt/apk-tools/apktool.jar "$TOOLS_DIR/"
fi

# 确保 PHP (www-data) 有写入权限
for dir in /var/www/html/private/logs \
           /var/www/html/private/errors \
           /var/www/html/user \
           /var/www/html/screens; do
    if [ -d "$dir" ]; then
        chown -R www-data:www-data "$dir" 2>/dev/null
        chmod -R 775 "$dir" 2>/dev/null
    fi
done

# apkstub 和 tools 也需要写权限
for dir in /var/www/html/private/apkstub \
           /var/www/html/private/tools; do
    if [ -d "$dir" ]; then
        chown -R www-data:www-data "$dir" 2>/dev/null
        chmod -R 775 "$dir" 2>/dev/null
    fi
done

exec "$@"
