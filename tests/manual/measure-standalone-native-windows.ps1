param(
    [Parameter(Mandatory = $true)]
    [string] $Archive,
    [ValidateRange(3, 50)]
    [int] $Iterations = 30,
    [switch] $AssertNoListeners,
    [string] $ExpectedSha256 = ''
)

$ErrorActionPreference = 'Stop'

if ($env:OS -ne 'Windows_NT') {
    Write-Output 'STANDALONE NATIVE WINDOWS MEASUREMENT SKIP (non-Windows host)'
    exit 0
}

$archivePath = (Resolve-Path -LiteralPath $Archive -ErrorAction Stop).Path
$launcher = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot 'standalone-native-windows-launch.ps1')).Path
$samples = [System.Collections.Generic.List[double]]::new()
$lastEvidence = $null
$maxUdpEndpoints = 0
$udpProcesses = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)

for ($iteration = 1; $iteration -le $Iterations; $iteration += 1) {
    $arguments = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $launcher,
        '-Archive', $archivePath, '-EmitEvidence')
    if ($AssertNoListeners) { $arguments += '-AssertNoListeners' }
    if ($ExpectedSha256) { $arguments += @('-ExpectedSha256', $ExpectedSha256) }
    $output = @(& powershell.exe @arguments 2>&1)
    if ($LASTEXITCODE -ne 0) {
        throw "STANDALONE_NATIVE_MEASUREMENT_FAILED:$iteration`n$($output -join [Environment]::NewLine)"
    }
    $line = @($output | Where-Object { $_ -like 'STANDALONE NATIVE EVIDENCE *' } | Select-Object -Last 1)
    if ($line.Count -ne 1) { throw "STANDALONE_NATIVE_MEASUREMENT_MISSING:$iteration" }
    $evidence = ($line[0].Substring('STANDALONE NATIVE EVIDENCE '.Length) | ConvertFrom-Json -ErrorAction Stop)
    if (-not ($evidence.startup_ms -is [ValueType]) -or [double] $evidence.startup_ms -le 0) {
        throw "STANDALONE_NATIVE_MEASUREMENT_INVALID:$iteration"
    }
    $samples.Add([double] $evidence.startup_ms)
    if ($AssertNoListeners) {
        if ($evidence.network_observed -ne $true) { throw "STANDALONE_NATIVE_NETWORK_EVIDENCE_MISSING:$iteration" }
        $maxUdpEndpoints = [Math]::Max($maxUdpEndpoints, [int] $evidence.udp_endpoints)
        foreach ($name in @($evidence.udp_processes)) {
            if ($name) { $udpProcesses.Add([string] $name) | Out-Null }
        }
    }
    $lastEvidence = $evidence
    Write-Output "STANDALONE NATIVE SAMPLE $iteration/$Iterations $($evidence.startup_ms) ms"
}

$sorted = @($samples | Sort-Object)
function Get-NearestRank([double] $Quantile) {
    $index = [Math]::Max(0, [Math]::Ceiling($Quantile * $sorted.Count) - 1)
    return [Math]::Round([double] $sorted[$index], 3)
}

$summary = [ordered]@{
    schema = 'datasecure-standalone-native-windows-summary/2'
    archive_sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $archivePath).Hash.ToLowerInvariant()
    iterations = $Iterations
    startup_definition = 'fresh_profile_Process.Start_to_frontend_ready_public_state_ui_context_sidecar_ready'
    p50_ms = Get-NearestRank 0.50
    p95_ms = Get-NearestRank 0.95
    max_ms = [Math]::Round([double] $sorted[-1], 3)
    shell_bytes = [long] $lastEvidence.shell_bytes
    shell_limit_bytes = [long] $lastEvidence.shell_limit_bytes
    network_observed = [bool] $AssertNoListeners
    tcp_listeners = if ($AssertNoListeners) { [int] $lastEvidence.tcp_listeners } else { $null }
    observed_udp_endpoints_max = if ($AssertNoListeners) { $maxUdpEndpoints } else { $null }
    observed_udp_processes = if ($AssertNoListeners -and $udpProcesses.Count -gt 0) {
        @($udpProcesses | Sort-Object)
    } elseif ($AssertNoListeners) { [System.Collections.Generic.List[string]]::new() } else { $null }
    os_build = [string] $lastEvidence.os_build
    process_architecture = [string] $lastEvidence.process_architecture
    webview2_version = [string] $lastEvidence.webview2_version
    webview2_scope = [string] $lastEvidence.webview2_scope
}
Write-Output ('STANDALONE NATIVE WINDOWS SUMMARY ' + ($summary | ConvertTo-Json -Compress))
