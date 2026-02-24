$ErrorActionPreference = "Stop"

$root = (Get-Location).Path
$stamp = Get-Date -Format "yyyyMMdd_HHmmss"
$apiExpr = '${window.location.protocol}//${window.location.hostname}:8080'

Write-Host "== Fix LAN API URLs ==" -ForegroundColor Cyan
Write-Host "Project: $root"
Write-Host "Backup suffix: .$stamp.bak"

function Backup-Once([string]$path) {
  $bak = "$path.$stamp.bak"
  if (-not (Test-Path $bak)) { Copy-Item $path $bak -Force }
}

function Fix-File([string]$path) {
  $raw = Get-Content $path -Raw

  $orig = $raw

  # 1) Fix any previous bad replacements that left ${...} inside quotes
  $raw = $raw -replace '"\$\{window\.location\.protocol\}//\$\{window\.location\.hostname\}:8080', "``$apiExpr``"
  $raw = $raw -replace "'\$\{window\.location\.protocol\}//\$\{window\.location\.hostname\}:8080", "``$apiExpr``"

  # 2) Replace hardcoded localhost:8080 inside quotes with template literal (backticks)
  #    Example: fetch("http://localhost:8080/auth/login" -> fetch(`${...}:8080/auth/login`
  $raw = $raw -replace '"http://localhost:8080', "``$apiExpr"
  $raw = $raw -replace "'http://localhost:8080", "``$apiExpr"

  # 3) Fix broken API const lines like: const API = '${...}:8080";
  #    Replace ANY line starting with const API = ...:8080...;  -> correct template literal
  $raw = $raw -replace 'const\s+API\s*=\s*.*?:8080.*?;', "const API = ``$apiExpr``;"

  if ($raw -ne $orig) {
    Backup-Once $path
    Set-Content -Path $path -Value $raw -Encoding UTF8
    return $true
  }
  return $false
}

# ---- Fix api.js specifically: enforce API_BASE line
$apiFile = Join-Path $root "src\api.js"
if (Test-Path $apiFile) {
  $raw = Get-Content $apiFile -Raw
  $new = $raw -replace 'const\s+API_BASE\s*=\s*.*?;', "const API_BASE = ``$apiExpr``;"
  if ($new -ne $raw) {
    Backup-Once $apiFile
    Set-Content -Path $apiFile -Value $new -Encoding UTF8
    Write-Host "Fixed: src\api.js (API_BASE)" -ForegroundColor Green
  } else {
    Write-Host "OK: src\api.js (no change needed)" -ForegroundColor DarkGreen
  }
} else {
  Write-Host "WARN: src\api.js not found" -ForegroundColor Yellow
}

# ---- Fix all src js/jsx files
$changed = 0
Get-ChildItem .\src -Recurse -File -Include *.js,*.jsx | ForEach-Object {
  if (Fix-File $_.FullName) { $changed++ }
}

Write-Host "Done. Files changed: $changed" -ForegroundColor Cyan
Write-Host "Now restart Vite (Ctrl+C then npm run dev -- --host) and refresh." -ForegroundColor Cyan
