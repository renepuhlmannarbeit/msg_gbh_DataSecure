param([Parameter(Mandatory = $true)][string] $Archive)

# Launch the exact local engineering archive for an operator/Computer Use
# campaign. This is not an acceptance verdict and never uses product storage.
# Retain this NEW isolated profile for evidence; no cleanup or global settings.
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'standalone-native-host.ps1')
$resolvedArchive = (Resolve-Path -LiteralPath $Archive -ErrorAction Stop).Path
$identity = Resolve-StandaloneArchiveIdentity $resolvedArchive ''
$archiveHash = (Get-FileHash -LiteralPath $resolvedArchive -Algorithm SHA256).Hash.ToLowerInvariant()
$campaignRoot = Join-Path ([System.IO.Path]::GetTempPath()) ('.tmp-standalone-native-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $campaignRoot -ErrorAction Stop | Out-Null
foreach ($relative in @('candidate', 'profile', 'profile\Local', 'profile\Roaming', 'profile\Xdg',
    'profile\Documents', 'temp', 'temp\SecureDataMsg-Standalone', 'webview', 'webview\main', 'results')) {
    New-Item -ItemType Directory -Path (Join-Path $campaignRoot $relative) -ErrorAction Stop | Out-Null
}
Expand-Archive -LiteralPath $resolvedArchive -DestinationPath (Join-Path $campaignRoot 'candidate')
$executable = Join-Path $campaignRoot ('candidate\' + $identity.ProductDirectory + '\DataSecure Standalone.exe')
$binary = [System.Text.Encoding]::ASCII.GetString([System.IO.File]::ReadAllBytes($executable))
if (-not $binary.Contains('DATASECURE_STANDALONE_NATIVE_SMOKE_ROOT')) {
    throw 'STANDALONE_NATIVE_ISOLATION_UNSUPPORTED'
}
$startInfo = [System.Diagnostics.ProcessStartInfo]::new()
$startInfo.FileName = $executable
$startInfo.WorkingDirectory = [System.IO.Path]::GetDirectoryName($executable)
$startInfo.UseShellExecute = $false
$startInfo.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Normal
Remove-StandaloneDesktopEnvironmentOverrides $startInfo
$startInfo.EnvironmentVariables['DATASECURE_STANDALONE_NATIVE_SMOKE_ROOT'] = $campaignRoot
$startInfo.EnvironmentVariables['WEBVIEW2_USER_DATA_FOLDER'] = Join-Path $campaignRoot 'webview\main'
$campaignProcess = [System.Diagnostics.Process]::Start($startInfo)
[pscustomobject]@{
    schema = 'datasecure-native-workspace-gui-launch/1'
    verdict = 'LAUNCHED_NOT_ACCEPTED'
    root = $campaignRoot
    pid = $campaignProcess.Id
    executable = $executable
    archive_sha256 = $archiveHash
    result_folder = (Join-Path $campaignRoot 'results')
    diagnostics = (Join-Path $campaignRoot 'temp\SecureDataMsg-Standalone')
} | ConvertTo-Json -Compress
