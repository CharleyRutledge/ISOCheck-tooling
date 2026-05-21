param(
  [Parameter(Mandatory = $true)][string]$ProjectRoot,
  [string]$Profile = 'isocheck'
)

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$audit = Join-Path $scriptDir 'iso-local-audit.mjs'
$max = 8

for ($i = 1; $i -le $max; $i++) {
  Write-Host "`n=== Audit pass $i : $ProjectRoot ==="
  node $audit $ProjectRoot --apply --profile=$Profile 2>&1
  node $audit $ProjectRoot 2>&1
  if ($LASTEXITCODE -eq 0) {
    Write-Host "Compliant after $i pass(es)."
    exit 0
  }
}

Write-Host "Failed to reach full compliance in $max passes."
exit 1
