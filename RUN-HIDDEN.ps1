$ErrorActionPreference="Stop"

$root="C:\nocomment-isp\nocomment-isp"
$backend="$root\backend"
$frontend="$root\frontend"

$node="C:\Program Files\nodejs\node.exe"
$viteJs="$frontend\node_modules\vite\bin\vite.js"

$logDir="$root\logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null


# ensure log files exist
New-Item -ItemType File -Force -Path "$logDir\backend.out.log","$logDir\backend.err.log","$logDir\frontend.out.log","$logDir\frontend.err.log" | Out-Null
function Kill-Port($port){
  $pids=@(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique)
  foreach($pid in $pids){
    Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
  }
}

# sanity
if(!(Test-Path $node)){ throw "node missing: $node" }
if(!(Test-Path "$backend\server.js")){ throw "backend server.js missing" }
if(!(Test-Path $viteJs)){ throw "vite missing (did you run npm install?): $viteJs" }

# free ports
Kill-Port 8080
Kill-Port 8888

# start backend (hidden)
Start-Process -FilePath $node `
  -ArgumentList "`"$backend\server.js`"" `
  -WorkingDirectory $backend `
  -WindowStyle Hidden `
  -RedirectStandardOutput "$logDir\backend.out.log" `
  -RedirectStandardError  "$logDir\backend.err.log"

# start frontend vite (hidden) - no npm/cmd involved
Start-Process -FilePath $node `
  -ArgumentList "`"$viteJs`" --host 0.0.0.0 --port 8888 --strictPort" `
  -WorkingDirectory $frontend `
  -WindowStyle Hidden `
  -RedirectStandardOutput "$logDir\frontend.out.log" `
  -RedirectStandardError  "$logDir\frontend.err.log"

