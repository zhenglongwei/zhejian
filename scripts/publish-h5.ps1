# 【历史脚本 · 2026-11 未随域名收口更新】geo.simplewin.cn 已废弃，
# 现行生产 H5 由 Nginx 直接映射 /var/www/zhejian/h5，无需单独发布目录。
# 将 h5/ 公开页复制到本地预览目录（结构与服务器 /var/www 一致）
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$Target = Join-Path $Root "dist-www\geo.simplewin.cn\public"

New-Item -ItemType Directory -Force -Path $Target | Out-Null
Copy-Item -Path (Join-Path $Root "h5\*") -Destination $Target -Recurse -Force

Write-Host "H5 已复制到: $Target"
Write-Host "服务器对应目录: /var/www/geo.simplewin.cn/public"
