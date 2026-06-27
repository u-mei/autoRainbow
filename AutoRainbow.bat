@echo off
cd /d "%~dp0"
echo === autoRainbow Agent ===
python pipeline\python\agent\server.py
echo.
echo 服务已关闭。按任意键退出。
pause >nul