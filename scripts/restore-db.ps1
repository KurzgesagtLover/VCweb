param(
  [Parameter(Mandatory = $true)][string]$BackupFile,
  [switch]$ConfirmRestore
)

$ErrorActionPreference = "Stop"
if (-not $ConfirmRestore) { throw "Restore replaces the current database. Pass -ConfirmRestore to continue." }
$resolvedBackup = [System.IO.Path]::GetFullPath($BackupFile)
if (-not (Test-Path -LiteralPath $resolvedBackup -PathType Leaf)) { throw "Backup file not found: $resolvedBackup" }
$containerPath = "/tmp/virtual-nation-restore.dump"

docker cp $resolvedBackup "vcweb-postgres-1:$containerPath"
if ($LASTEXITCODE -ne 0) { throw "Copying the backup into PostgreSQL failed." }
docker exec vcweb-postgres-1 pg_restore -U virtual_nation -d virtual_nation --clean --if-exists --no-owner $containerPath
if ($LASTEXITCODE -ne 0) { throw "Database restore failed." }
docker exec vcweb-postgres-1 psql -U virtual_nation -d virtual_nation -c "SELECT PostGIS_Version();"
