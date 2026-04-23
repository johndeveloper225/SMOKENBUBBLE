# Generates Apple Pass Type ID CSR + private key next to your project (easy to find in "Choose File").
# Usage (PowerShell):
#   cd "C:\Users\HP\Desktop\smokenbubbles"
#   .\scripts\generate-apple-csr.ps1 -Email "you@example.com"

param(
  [Parameter(Mandatory = $true)]
  [string] $Email,

  [string] $CommonName = "Smoke n Bubbles Loyalty Pass"
)

$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$certsDir = Join-Path $root "certs"
New-Item -ItemType Directory -Path $certsDir -Force | Out-Null

$opensslCandidates = @(
  "C:\Program Files\OpenSSL-Win64\bin\openssl.exe",
  "C:\Program Files\OpenSSL\bin\openssl.exe"
)
$openssl = $opensslCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $openssl) {
  Write-Host "OpenSSL not found. Install with: winget install -e --id ShiningLight.OpenSSL.Light" -ForegroundColor Red
  exit 1
}

$csrPath = Join-Path $certsDir "pass.csr"
$keyPath = Join-Path $certsDir "pass_private.key"
if ((Test-Path $csrPath) -or (Test-Path $keyPath)) {
  Write-Host "Files already exist in certs folder:" -ForegroundColor Yellow
  Write-Host "  $csrPath"
  Write-Host "  $keyPath"
  Write-Host "Delete them first if you want a fresh CSR, or upload the existing CSR to Apple." -ForegroundColor Yellow
}

$subj = "/emailAddress=$Email/CN=$CommonName/O=Smoke n Bubbles/C=GB"
& $openssl req -new -newkey rsa:2048 -nodes -keyout $keyPath -out $csrPath -subj $subj

Write-Host ""
Write-Host "Created:" -ForegroundColor Green
Write-Host "  CSR (upload to Apple): $csrPath"
Write-Host "  Private key (keep secret): $keyPath"
Write-Host ""
Write-Host "Next: Apple portal -> Choose File -> pick pass.csr from this certs folder." -ForegroundColor Cyan

Start-Process explorer.exe $certsDir
