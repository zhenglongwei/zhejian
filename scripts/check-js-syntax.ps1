$root = Split-Path -Parent $PSScriptRoot
$bad = @()
Get-ChildItem -Path $root -Recurse -Filter *.js |
  Where-Object { $_.FullName -notmatch 'node_modules|\\backend\\' } |
  ForEach-Object {
    $out = & node --check $_.FullName 2>&1
    if ($LASTEXITCODE -ne 0) { $bad += "$($_.FullName): $out" }
  }
if ($bad.Count -eq 0) { Write-Output 'ALL OK' } else { $bad | ForEach-Object { Write-Output $_ } }
