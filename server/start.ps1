# Cohort Ledger — Automation Server Launcher
# Run this file to start the Topin publishing server.
# Prerequisites: Node.js 18+ installed.

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

if (-not (Test-Path "node_modules")) {
  Write-Host "Installing dependencies..." -ForegroundColor Cyan
  npm install
  Write-Host "Installing Playwright Chromium browser..." -ForegroundColor Cyan
  npx playwright install chromium
}

Write-Host ""
Write-Host "Starting Cohort Ledger Automation Server..." -ForegroundColor Green
node index.js
