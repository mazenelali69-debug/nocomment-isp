$ErrorActionPreference="SilentlyContinue"

function Kill-Port($port){
  $pids=@(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique)
  foreach($x in $pids){ Stop-Process -Id $x -Force -ErrorAction SilentlyContinue }
}

Write-Host "== Stop project ports ==" -ForegroundColor Yellow
Kill-Port 8080
Kill-Port 5173
Kill-Port 5174
Kill-Port 5175

Write-Host "== Kill node/esbuild ==" -ForegroundColor Yellow
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Get-Process esbuild -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

Write-Host "== Close PowerShell windows (except this one) ==" -ForegroundColor Red
$me=$PID
Get-Process powershell -ErrorAction SilentlyContinue |
  Where-Object { $_.Id -ne $me } |
  Stop-Process -Force -ErrorAction SilentlyContinue

Write-Host "DONE " -ForegroundColor Green
