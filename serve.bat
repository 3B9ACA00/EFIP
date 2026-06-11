@echo off
REM === EF Industry — локальный веб-сервер (нужен http, не file://) ===
cd /d "%~dp0"
echo EF Industry  ->  http://localhost:8099
start "" http://localhost:8099
where python >nul 2>nul && (python -m http.server 8099) || (py -m http.server 8099)
