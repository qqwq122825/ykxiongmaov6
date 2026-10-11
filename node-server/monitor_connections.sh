#!/bin/bash
# 监控 8443 端口的所有连接和日志

echo "========================================"
echo "实时监控设备连接"
echo "目标设备: ebde1d405b59d409"
echo "========================================"

echo ""
echo "[1] 当前8443端口的TCP连接："
ss -tnp | grep :8443 | head -10

echo ""
echo "[2] 监控进程输出（通过proc）："
# 尝试读取进程的标准输出
if [ -f /proc/1709629/fd/1 ]; then
    tail -20 /proc/1709629/fd/1 2>/dev/null || echo "无法读取进程stdout"
else
    echo "进程输出已重定向，无法直接读取"
fi

echo ""
echo "[3] 检查防火墙规则："
iptables -L INPUT -n | grep 8443 || echo "无特定8443规则"

echo ""
echo "[4] 测试本地连接："
timeout 3 bash -c "echo test | nc -w 2 127.0.0.1 8443" && echo "✅ 本地连接成功" || echo "❌ 本地连接失败"

echo ""
echo "[5] 测试WebSocket升级："
timeout 5 curl -i -N \
  -H "Connection: Upgrade" \
  -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Version: 13" \
  -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
  "https://ts5025.cc:8443/ws/device?sessionId=ebde1d405b59d409" 2>&1 | head -20

echo ""
echo "========================================"
echo "如果设备在手边，请在APK中："
echo "1. 查看'服务器地址'设置"
echo "2. 查看'设备ID'显示"
echo "3. 尝试手动'重新连接'"
echo "========================================"
