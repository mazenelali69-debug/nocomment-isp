@echo off
setlocal

set ROOT=C:\nocomment-isp\nocomment-isp
set NODE=C:\Program Files\nodejs\node.exe
set NPM=C:\Program Files\nodejs\npm.cmd
set LOG=%ROOT%\autostart.log

echo ===== %DATE% %TIME% START =====> "%LOG%"
echo ROOT=%ROOT%>> "%LOG%"
echo NODE=%NODE%>> "%LOG%"
echo NPM=%NPM%>> "%LOG%"

cd /d "%ROOT%" || (echo cd ROOT failed>> "%LOG%" & exit /b 20)

echo Killing ports...>> "%LOG%"
for %%P in (8080 8888) do (
  for /f "tokens=5" %%a in ('netstat -ano ^| findstr /R /C:":%%P .*LISTENING"') do (
    echo taskkill %%a on %%P>> "%LOG%"
    taskkill /PID %%a /F >> "%LOG%" 2>&1
  )
)

echo [backend] start...>> "%LOG%"
cd /d "%ROOT%\backend" || (echo cd backend failed>> "%LOG%" & exit /b 21)
start "backend" /MIN "%NODE%" "%ROOT%\backend\server.js" >> "%LOG%" 2>&1

echo [frontend] npm install...>> "%LOG%"
cd /d "%ROOT%\frontend" || (echo cd frontend failed>> "%LOG%" & exit /b 22)
"%NPM%" install >> "%LOG%" 2>&1

echo [frontend] npm run dev (foreground for 8s)...>> "%LOG%"
rem ?????? ???? foreground ?????? ??? 8 ????? ?? ????? ??? ????? ?? ????? error
start "" /B cmd.exe /c ""%NPM%" run dev" >> "%LOG%" 2>&1
timeout /t 8 /nobreak >nul
echo [frontend] done waiting 8s>> "%LOG%"

exit /b 0
