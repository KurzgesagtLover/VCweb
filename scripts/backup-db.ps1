param(
  [string]$OutputDirectory = (Join-Path $PSScriptRoot "..\backups")
)

$ErrorActionPreference = "Stop"
$resolvedOutput = [System.IO.Path]::GetFullPath($OutputDirectory)
New-Item -ItemType Directory -Path $resolvedOutput -Force | Out-Null
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupPath = Join-Path $resolvedOutput "virtual-nation-$stamp.dump"
$containerPath = "/tmp/virtual-nation-$stamp.dump"

docker exec vcweb-postgres-1 pg_dump -U virtual_nation -d virtual_nation -Fc -f $containerPath
if ($LASTEXITCODE -ne 0) { throw "Database backup failed." }
docker cp "vcweb-postgres-1:$containerPath" $backupPath
if ($LASTEXITCODE -ne 0) { throw "Copying the database backup failed." }

Write-Output $backupPath
