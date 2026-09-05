param([string] $Archive = '')

$ErrorActionPreference = 'Stop'

if ($env:OS -ne 'Windows_NT') {
    Write-Output 'STANDALONE NATIVE WINDOWS LAUNCH SKIP (non-Windows host)'
    exit 0
}

$repositoryRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..')).Path
$package = Get-Content -Raw -LiteralPath (Join-Path $repositoryRoot 'package.json') | ConvertFrom-Json
$productDirectory = "DataSecure-Standalone-$($package.version)-windows-x64"
$archivePath = if ($Archive) {
    (Resolve-Path -LiteralPath $Archive).Path
} else {
    (Resolve-Path -LiteralPath (Join-Path $repositoryRoot "dist\$productDirectory.zip")).Path
}
$testRoot = Join-Path $repositoryRoot ".tmp-standalone-native-$([Guid]::NewGuid().ToString('N'))"
$extractedRoot = Join-Path $testRoot 'candidate'
$executable = Join-Path $extractedRoot "$productDirectory\DataSecure Standalone.exe"
$diagnosticRoot = Join-Path ([System.IO.Path]::GetTempPath()) 'SecureDataMsg-Standalone'
$desktopLog = Join-Path $diagnosticRoot 'desktop-interactions.jsonl'
$sidecarLog = Join-Path $diagnosticRoot 'sidecar-interactions.jsonl'
$startedAt = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$process = $null
$passed = $false

function Read-InteractionEvents([string] $Path) {
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return @() }
    return @(Get-Content -LiteralPath $Path | ForEach-Object {
        try { $_ | ConvertFrom-Json -ErrorAction Stop } catch { }
    } | Where-Object { $_.time_ms -ge $startedAt })
}

function Remove-TestRoot {
    if (-not (Test-Path -LiteralPath $testRoot)) { return }
    $resolved = [System.IO.Path]::GetFullPath($testRoot)
    if ([System.IO.Path]::GetDirectoryName($resolved) -ne [System.IO.Path]::GetFullPath($repositoryRoot) -or
        -not [System.IO.Path]::GetFileName($resolved).StartsWith('.tmp-standalone-native-')) {
        throw 'STANDALONE_NATIVE_CLEANUP_UNSAFE'
    }
    $entries = @(Get-ChildItem -LiteralPath $resolved -Force -Recurse)
    if (@($entries | Where-Object { $_.Attributes -band [System.IO.FileAttributes]::ReparsePoint }).Count -gt 0) {
        throw 'STANDALONE_NATIVE_CLEANUP_REPARSE_POINT'
    }
    Remove-Item -LiteralPath $resolved -Recurse -Force -ErrorAction Stop
}

try {
    New-Item -ItemType Directory -Path $extractedRoot -Force | Out-Null
    Expand-Archive -LiteralPath $archivePath -DestinationPath $extractedRoot -Force
    if (-not (Test-Path -LiteralPath $executable -PathType Leaf)) {
        throw "STANDALONE_NATIVE_EXECUTABLE_MISSING: $executable"
    }
    # WebView2 can defer page loading when the top-level Tauri window starts
    # hidden or minimized. A native acceptance smoke must therefore exercise
    # the same visible launch lifecycle as the end-user product.
    $process = Start-Process -FilePath $executable -PassThru -ErrorAction Stop
    $deadline = [DateTimeOffset]::UtcNow.AddSeconds(30)
    do {
        Start-Sleep -Milliseconds 100
        $desktop = Read-InteractionEvents $desktopLog
        $application = @($desktop | Where-Object {
            $_.product_version -eq $package.version -and $_.event -eq 'application_started' -and
            $_.session_id -match '^[a-f0-9]{16,64}$'
        } | Select-Object -Last 1)
        if ($application.Count -eq 0) { continue }
        $session = $application[0].session_id
        $desktopSession = @($desktop | Where-Object { $_.session_id -eq $session })
        $sidecarSession = @(Read-InteractionEvents $sidecarLog | Where-Object { $_.session_id -eq $session })
        $publicState = @($desktopSession | Where-Object {
            $_.event -eq 'ipc_response_ok' -and $_.action -eq 'get_public_state'
        }).Count -gt 0
        $uiContext = @($desktopSession | Where-Object {
            $_.event -eq 'ipc_response_ok' -and $_.action -eq 'get_ui_context'
        }).Count -gt 0
        $pageLoaded = @($desktopSession | Where-Object { $_.event -eq 'page_loaded' }).Count -gt 0
        $frontendReady = @($desktopSession | Where-Object { $_.event -eq 'frontend_ready' }).Count -gt 0
        $sidecarStarted = @($sidecarSession | Where-Object { $_.event -eq 'sidecar_started' }).Count -gt 0
        $serviceInitialized = @($sidecarSession | Where-Object { $_.event -eq 'service_initialized' }).Count -gt 0
        if ($pageLoaded -and $frontendReady -and $publicState -and $uiContext -and $sidecarStarted -and $serviceInitialized) {
            $passed = $true
            break
        }
        if ($process.HasExited) { throw "STANDALONE_NATIVE_APP_EXITED_$($process.ExitCode)" }
    } while ([DateTimeOffset]::UtcNow -lt $deadline)
    if (-not $passed) { throw 'STANDALONE_NATIVE_IPC_TIMEOUT' }
    Write-Output 'STANDALONE NATIVE WINDOWS LAUNCH PASS'
} finally {
    if ($null -ne $process -and -not $process.HasExited) {
        Stop-Process -Id $process.Id -ErrorAction Stop
        $process.WaitForExit(3000) | Out-Null
    }
    Remove-TestRoot
}
