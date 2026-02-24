$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "backend")
node server.js

