param(
  [string]$AppDir = "C:\apps\nocomment-isp",
  [string]$Branch = "stable"
)

$ErrorActionPreference = "Stop"

function Ensure-Repo {
  if (!(Test-Path $AppDir)) { New-Item -ItemType Directory -Force -Path $AppDir | Out-Null }
  if (!(Test-Path (Join-Path $AppDir ".git"))) {
    Write-Host "Cloning repo into $AppDir ..."
    git clone $env:GITHUB_REPOSITORY_URL $AppDir
  }
}

function Git-Sync {
  Set-Location $AppDir
  git fetch origin
  git checkout $Branch
  git reset --hard "origin/$Branch"
}

function Deploy-Backend {
  Set-Location (Join-Path $AppDir "backend")
  if (Test-Path package-lock.json) { npm ci } else { npm install }
  # start/restart with pm2
  $name = "nocomment-backend"
  # try to read port from env or default
  if (-not $env:PORT) { $env:PORT = "3000" }

  # If your entry file differs, change server.js
  pm2 start server.js --name $name --update-env --time --silent --no-autorestart:$false 2>$null
  if ($LASTEXITCODE -ne 0) {
    pm2 restart $name --update-env
  }
  pm2 save
}

function Deploy-Frontend {
  # Vite build => output dist
  Set-Location (Join-Path $AppDir "frontend")
  if (Test-Path package-lock.json) { npm ci } else { npm install }
  npm run build

  $dist = Join-Path $AppDir "frontend\dist"
  if (!(Test-Path $dist)) {
    throw "Frontend build output not found at $dist (if using CRA it's build/ not dist/)."
  }

  # Serve frontend via a simple Node static server (no IIS needed)
  npm i -g serve | Out-Null
  $name = "nocomment-frontend"
  # frontend port (default 5173 -> we’ll use 8080)
  $frontPort = if ($env:FRONTEND_PORT) { $env:FRONTEND_PORT } else { "8080" }

  pm2 start "serve" --name $name -- -s "$dist" -l $frontPort 2>$null
  if ($LASTEXITCODE -ne 0) {
    pm2 restart $name
  }
  pm2 save
}

# Main
$env:GITHUB_REPOSITORY_URL = "https://github.com/$env:GITHUB_REPOSITORY.git"

Ensure-Repo
Git-Sync
Deploy-Backend
Deploy-Frontend

Write-Host "✅ Deploy finished."
