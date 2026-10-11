#!/bin/bash
# 实时监控设备 ebde1d405b59d409 的连接状态

DEVICE_ID="ebde1d405b59d409"
DB_PATH="/opt/fisher-node/data/fisher.db"

echo "========================================"
echo "实时监控设备: $DEVICE_ID"
echo "========================================"
echo ""

echo "按 Ctrl+C 停止监控"
echo ""

# 显示当前状态
check_status() {
    local status=$(sqlite3 "$DB_PATH" "SELECT is_connected, datetime(last_seen, 'unixepoch', 'localtime') FROM devices WHERE device_id='$DEVICE_ID';")
    local is_online=$(echo "$status" | cut -d'|' -f1)
    local last_seen=$(echo "$status" | cut -d'|' -f2)

    if [ "$is_online" = "1" ]; then
        echo -e "\033[32m🟢 在线\033[0m - 最后心跳: $last_seen"
    else
        echo -e "\033[31m🔴 离线\033[0m - 最后心跳: $last_seen"
    fi
}

echo "初始状态:"
check_status
echo ""
echo "监控日志（实时）:"
echo "----------------------------------------"

# 持续监控日志
tail -f /root/.pm2/logs/fisher-node-out.log /proc/1727537/fd/1 2>/dev/null | grep --line-buffered -E "$DEVICE_ID|设备上线|设备断开|WS.*连接|OFFLINE|device_online|device_offline" &
TAIL_PID=$!

# 定期显示状态（每10秒）
while true; do
    sleep 10
    echo ""
    echo "----------------------------------------"
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] 当前状态:"
    check_status
    echo "----------------------------------------"
done

# 清理
trap "kill $TAIL_PID 2>/dev/null; exit" INT TERM
