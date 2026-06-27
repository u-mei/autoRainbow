#!/bin/zsh
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"
echo "=== autoRainbow Agent ==="
echo "服务启动中..."
python3 pipeline/python/agent/server.py
echo ""
echo "服务已关闭。按 Enter 退出。"
read