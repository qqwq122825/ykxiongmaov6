#!/bin/bash
# 下载 APK 构建所需工具（若 Docker 构建时网络失败可手动运行）
set -e
TOOLS_DIR="$(dirname "$0")/../private/tools"
mkdir -p "$TOOLS_DIR"
cd "$TOOLS_DIR"

if [ ! -f apktool.jar ]; then
    echo "下载 apktool..."
    wget -q -O apktool.jar https://github.com/iBotPeaches/Apktool/releases/download/v2.9.3/apktool_2.9.3.jar
    echo "apktool.jar 已下载"
else
    echo "apktool.jar 已存在"
fi
