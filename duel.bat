@echo off
chcp 65001 > nul
title duel
cd /d "%~dp0"

echo ============================================
echo   duel · 正在启动...
echo ============================================
echo.

REM ---------- 检测 Python ----------
where python >nul 2>&1
if %errorlevel%==0 (
  echo [√] 检测到 Python，启动服务器...
  echo.
  echo 浏览器即将自动打开，请勿关闭本窗口。
  echo 关闭本窗口 = 结束游戏。
  echo.
  start "" "http://localhost:8080"
  python -m http.server 8080
  goto :end
)

REM ---------- 检测 Python3 ----------
where python3 >nul 2>&1
if %errorlevel%==0 (
  echo [√] 检测到 Python3，启动服务器...
  start "" "http://localhost:8080"
  python3 -m http.server 8080
  goto :end
)

REM ---------- 检测 Node.js ----------
where npx >nul 2>&1
if %errorlevel%==0 (
  echo [√] 检测到 Node.js，启动服务器...
  start "" "http://localhost:8080"
  npx --yes serve -l 8080 .
  goto :end
)

REM ---------- 都没装 ----------
echo [X] 未检测到 Python 或 Node.js
echo.
echo 请任选一个安装后重试：
echo.
echo    Python:  https://www.python.org/downloads/
echo             (安装时务必勾选 "Add Python to PATH")
echo.
echo    Node.js: https://nodejs.org/
echo             (下载 LTS 版本，一路 Next 即可)
echo.
pause
exit /b 1

:end