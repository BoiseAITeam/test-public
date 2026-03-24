cd 'c:\Users\myaccount\Desktop\PROJECTS\test-public'
$dt = Get-Date -Format 'yyyyMMdd-HHmmss'
$backup = Join-Path (Get-Location) ('backup-test-public-' + $dt)
New-Item -ItemType Directory -Path $backup | Out-Null
Get-ChildItem -Force | Where-Object { $_.Name -ne '.git' } | Move-Item -Destination $backup
Write-Output ('Backup created at: ' + $backup)
Get-ChildItem -Path $backup | Select-Object Name
