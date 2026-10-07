@echo off
cd /d "%~dp0"
if not exist node_modules call npm install
start "Hunting in Darkness 3D" cmd /c "npm run dev -- --host 127.0.0.1"
timeout /t 3 /nobreak >nul
start http://127.0.0.1:5173
