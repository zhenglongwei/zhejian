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

Write-Host "==> 线索 API 冒烟 (M-LEAD-07): $BaseUrl"
Push-Location $Backend
$env:SMOKE_BASE_URL = $BaseUrl
node scripts/merchant-leads-smoke.js
if ($LASTEXITCODE -ne 0) {
  Pop-Location
  exit 1
}
Pop-Location

Write-Host "==> 公开案例入库验收 (H5-A-01): $BaseUrl"
Push-Location $Backend
$env:SMOKE_BASE_URL = $BaseUrl
node scripts/public-case-prod-check.js
if ($LASTEXITCODE -ne 0) {
  Pop-Location
  Write-Host ""
  Write-Host "H5-A-01 未通过：需在运营台审核通过至少 1 条公开案例，见 backend/scripts/public-case-prod-check.js 输出。"
  exit 1
}
Pop-Location

Write-Host "==> 通过"
