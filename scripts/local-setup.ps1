# 辙见 · 本地环境一键配置（Windows PowerShell）
# 用法：在项目根目录执行  powershell -ExecutionPolicy Bypass -File scripts/local-setup.ps1

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$Backend = Join-Path $Root "backend"

Write-Host "==> 1/4 检查 Node.js"
node -v
if ($LASTEXITCODE -ne 0) { throw "请先安装 Node.js 20+: https://nodejs.org" }

Write-Host "==> 2/4 启动本地 MySQL（Docker）"
Set-Location $Backend
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Write-Warning "未检测到 Docker。请安装 Docker Desktop，或在 backend/.env 里改成你本机 MySQL 的 DATABASE_URL"
} else {
  docker compose up -d
  Write-Host "等待 MySQL 就绪..."
  Start-Sleep -Seconds 8
}

Write-Host "==> 3/4 安装依赖"
npm install
if ($LASTEXITCODE -ne 0) { throw "npm install 失败" }

Write-Host "==> 4/4 建表 + 演示数据"
npm run db:setup
if ($LASTEXITCODE -ne 0) { throw "db:setup 失败，请检查 DATABASE_URL 与 MySQL 是否已启动" }

Write-Host ""
Write-Host "本地 API 已就绪。启动命令："
Write-Host "  cd backend"
Write-Host "  npm run dev"
Write-Host ""
Write-Host "浏览器测试： http://127.0.0.1:3000/api/v1/health"
Write-Host "小程序联调： services/config.js 设 mode='dev'，token=dev_user_token_change_me"
