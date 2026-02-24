@echo off
setlocal
set ROOT=C:\nocomment-isp\nocomment-isp
set LOG=%ROOT%\task-run.log

echo ===== %DATE% %TIME% START =====> "%LOG%"
echo running as: %USERNAME%>> "%LOG%"

rem kill ports
for %%P in (8080 8888) do (
  for /f "tokens=5" %%a in ('netstat -ano ^| findstr /R /C:":%%P .*LISTENING"') do (
    echo taskkill %%a on %%P>> "%LOG%"
    taskkill /PID %%a /F >> "%LOG%" 2>&1
  )
)

echo start backend...>> "%LOG%"
start "backend" /MIN "%ROOT%\START-BACKEND.cmd"

echo start frontend...>> "%LOG%"
start "frontend" /MIN "%ROOT%\START-FRONTEND.cmd"

echo ===== %DATE% %TIME% END =====>> "%LOG%"
exit /b 0
