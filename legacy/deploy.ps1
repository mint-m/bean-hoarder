# Bean-Hoarder 웹앱 배포 (Cloudflare Pages 직접 업로드)
# 사용: powershell -File tools\deploy.ps1
# 웹앱에 필요한 파일만 스테이징해서 올린다 (라벨/도구 파일은 비공개 유지).
$root = Split-Path $PSScriptRoot -Parent
$stage = Join-Path $env:TEMP "bnhd-deploy"
if (Test-Path $stage) { Remove-Item -Recurse -Force $stage }
New-Item -ItemType Directory $stage | Out-Null
Copy-Item (Join-Path $root "index.html") $stage
Copy-Item (Join-Path $root "admin.html") $stage
Copy-Item (Join-Path $root "bean_sheet_template.csv") $stage
Set-Location $root
npx --yes wrangler pages deploy $stage --project-name bnhd --branch main --commit-dirty=true
