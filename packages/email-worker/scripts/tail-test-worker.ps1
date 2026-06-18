param(
    [ValidateSet('pretty', 'json')]
    [string]$Format = 'json',
    [string]$Search = 'SUBJECT_DIAG',
    [string]$VersionId = ''
)

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$workerDir = Split-Path -Parent $scriptDir

$args = @(
    'wrangler',
    'tail',
    'email-filter-forwarder-test',
    '--config',
    'wrangler-test.toml',
    '--format',
    $Format
)

if ($Search) {
    $args += @('--search', $Search)
}

if ($VersionId) {
    $args += @('--version-id', $VersionId)
}

Push-Location $workerDir
try {
    npx @args
}
finally {
    Pop-Location
}
