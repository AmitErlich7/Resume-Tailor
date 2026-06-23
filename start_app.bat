@echo off
echo Starting Resume Tailor...

start "Backend" cmd /k "cd /d %~dp0backend && uvicorn main:app --reload --host 127.0.0.1 --port 8000"
ping 127.0.0.1 -n 3 > nul
start "Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"
ping 127.0.0.1 -n 4 > nul
start http://localhost:5173
