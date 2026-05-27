# B-INF-04 · 从 Windows 验证生产/staging API（PowerShell）
# 用法：powershell -ExecutionPolicy Bypass -File scripts/verify-prod-api.ps1
#       powershell -ExecutionPolicy Bypass -File scripts/verify-prod-api.ps1 -BaseUrl http://127.0.0.1:3000

param(
  [string]$BaseUrl = "https://geo.simplewin.cn"
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$Backend = Join-Path $Root "backend"

Write-Host "==> 健康检查: $BaseUrl"
Push-Location $Backend
node scripts/verify-health.js $BaseUrl
if ($LASTEXITCODE -ne 0) {
  Pop-Location
  Write-Host ""
  Write-Host "若生产返回 HTML 404：说明 /api/ 尚未反代到 Node，请按 docs/12_测试验收部署与安全合规/B-INF_生产与真机联调.md 配置 Nginx。"
  exit 1
}
Pop-Location
Write-Host "==> 通过"
