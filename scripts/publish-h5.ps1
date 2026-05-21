# 将 h5/ 公开页复制到本地预览目录（结构与服务器 /var/www 一致）
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$Target = Join-Path $Root "dist-www\geo.simplewin.cn\public"

New-Item -ItemType Directory -Force -Path $Target | Out-Null
Copy-Item -Path (Join-Path $Root "h5\*") -Destination $Target -Recurse -Force

Write-Host "H5 已复制到: $Target"
Write-Host "服务器对应目录: /var/www/geo.simplewin.cn/public"
