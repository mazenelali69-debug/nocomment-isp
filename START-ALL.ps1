$ErrorActionPreference="Stop"

$root = Split-Path -Parent $PSCommandPath
$backend="$root\backend"
$frontend="$root\frontend"
$npm="C:\Program Files\nodejs\npm.cmd"

function Kill-Port($port){
  $pids=@(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique)
  foreach($x in $pids){ Stop-Process -Id $x -Force -ErrorAction SilentlyContinue }
}

if(!(Test-Path $backend)){ throw "backend missing" }
if(!(Test-Path $frontend)){ throw "frontend missing" }
if(!(Test-Path $npm)){ throw "npm.cmd missing" }

Write-Host "== Kill ports ==" -ForegroundColor Yellow
Kill-Port 8080
Kill-Port 8888

Write-Host "== Start Backend (8080) ==" -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit","-Command","cd '$backend'; node server.js"

Write-Host "== Wait for backend health ==" -ForegroundColor Cyan
$ok=$false
for($i=0;$i -lt 80;$i++){
  Start-Sleep -Milliseconds 750
  try{
    $h=Invoke-RestMethod "http://localhost:8080/health" -TimeoutSec 1
    $ok=$true; break
  }catch{}
}
if(-not $ok){ Write-Host "Backend not responding on 8080" -ForegroundColor Red }

Write-Host "== Start Frontend (Vite) ==" -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit","-Command","cd '$frontend'; & '$npm' run dev"

Write-Host ""
Write-Host "READY " -ForegroundColor Green
Write-Host "Backend (Local):  http://localhost:8080/health" -ForegroundColor Yellow
Write-Host "Backend (LAN):    http://80.80.80.111:8080/health" -ForegroundColor Yellow
Write-Host "Frontend (Local): http://localhost:8888/" -ForegroundColor Yellow
Write-Host "Frontend (LAN):   http://80.80.80.111:8888/" -ForegroundColor Yellow
Write-Host "Login path: /login" -ForegroundColor Yellow
Write-Host "User: nocomment   Pass: 123456" -ForegroundColor Yellow




