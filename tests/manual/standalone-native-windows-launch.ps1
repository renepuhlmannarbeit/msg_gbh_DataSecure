param([string] $Archive = '', [switch] $ValidateIsolationOnly)

$ErrorActionPreference = 'Stop'

if ($env:OS -ne 'Windows_NT') {
    Write-Output 'STANDALONE NATIVE WINDOWS LAUNCH SKIP (non-Windows host)'
    exit 0
}

$repositoryRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..')).Path
. (Join-Path $PSScriptRoot 'standalone-native-cleanup.ps1')
$package = Get-Content -Raw -LiteralPath (Join-Path $repositoryRoot 'package.json') | ConvertFrom-Json
$productDirectory = "DataSecure-Standalone-$($package.version)-windows-x64"
$archivePath = if ($ValidateIsolationOnly) {
    ''
} elseif ($Archive) {
    (Resolve-Path -LiteralPath $Archive).Path
} else {
    (Resolve-Path -LiteralPath (Join-Path $repositoryRoot "dist\$productDirectory.zip")).Path
}
$cleanupContext = New-NativeCleanupContext $repositoryRoot
$testRoot = $cleanupContext.Root
$extractedRoot = Join-Path $testRoot 'candidate'
$executable = Join-Path $extractedRoot "$productDirectory\DataSecure Standalone.exe"
$isolatedTemp = Join-Path $testRoot 'temp'
$diagnosticRoot = Join-Path $isolatedTemp 'SecureDataMsg-Standalone'
$desktopLog = Join-Path $diagnosticRoot 'desktop-interactions.jsonl'
$sidecarLog = Join-Path $diagnosticRoot 'sidecar-interactions.jsonl'
$startedAt = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$process = $null
$passed = $false

function Get-CheckedTree([string] $Root) {
    if ($Root -ne $cleanupContext.Root) { throw 'STANDALONE_NATIVE_ROOT_UNSAFE' }
    # Every pre-start invocation is strict; the cache exception is cleanup-only.
    Get-CheckedNativeTree $cleanupContext
}

function New-IsolatedStartInfo([string] $FilePath) {
    $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = $FilePath
    $startInfo.WorkingDirectory = [System.IO.Path]::GetDirectoryName($FilePath)
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $false
    $startInfo.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Normal
    $startInfo.EnvironmentVariables.Clear()
    foreach ($key in @('SYSTEMROOT', 'WINDIR', 'COMSPEC', 'ProgramFiles', 'ProgramFiles(x86)', 'ProgramW6432')) {
        $value = [System.Environment]::GetEnvironmentVariable($key, 'Process')
        if ($value) { $startInfo.EnvironmentVariables[$key] = $value }
    }
    $expected = @{
        USERPROFILE = 'profile'; HOME = 'profile'; LOCALAPPDATA = 'profile\Local';
        APPDATA = 'profile\Roaming'; XDG_DATA_HOME = 'profile\Xdg';
        TEMP = 'temp'; TMP = 'temp'; TMPDIR = 'temp';
        DATASECURE_STANDALONE_DOCUMENTS_DIR = 'profile\Documents';
        WEBVIEW2_USER_DATA_FOLDER = 'webview'
    }
    foreach ($entry in $expected.GetEnumerator()) {
        $value = Join-Path $testRoot $entry.Value
        if (-not (Test-Path -LiteralPath $value -PathType Container)) { throw 'STANDALONE_NATIVE_ISOLATION_MISSING' }
        $startInfo.EnvironmentVariables[$entry.Key] = $value
    }
    $startInfo.EnvironmentVariables['DATASECURE_STANDALONE_NATIVE_SMOKE_ROOT'] = $testRoot
    return $startInfo
}

function Read-InteractionEvents([string] $Path) {
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return @() }
    return @(Get-Content -LiteralPath $Path | ForEach-Object {
        try { $_ | ConvertFrom-Json -ErrorAction Stop } catch { }
    } | Where-Object { $_.time_ms -ge $startedAt })
}

function Assert-NativeProcessRunning($CandidateProcess) {
    if ($CandidateProcess.HasExited) {
        throw "STANDALONE_NATIVE_APP_EXITED_$($CandidateProcess.ExitCode)"
    }
}

function Remove-TestRoot {
    # A launched process must actually have exited before accepting its one
    # known Windows cache junction. Failed setup retains strict link rejection.
    if ($null -ne $process -and -not $process.HasExited) { throw 'STANDALONE_NATIVE_CLEANUP_PROCESS_RUNNING' }
    Remove-NativeTestTree $cleanupContext -AllowCacheJunction:($null -ne $process -and $process.HasExited)
}

try {
    foreach ($relative in @('candidate', 'profile', 'profile\Local', 'profile\Roaming', 'profile\Xdg',
        'profile\Documents', 'temp', 'webview')) {
        New-Item -ItemType Directory -Path (Join-Path $testRoot $relative) -ErrorAction Stop | Out-Null
    }
    $startInfo = New-IsolatedStartInfo $executable
    Get-CheckedTree $testRoot | Out-Null
    if ($ValidateIsolationOnly) {
        # The test owns only this child environment. Never assign USERPROFILE,
        # HOME, TEMP or any data-root variable in the parent process/session.
        if ($startInfo.EnvironmentVariables['LOCALAPPDATA'] -eq $env:LOCALAPPDATA -or
            $startInfo.EnvironmentVariables['TEMP'] -eq $env:TEMP -or
            $startInfo.EnvironmentVariables.ContainsKey('EU_PRIVACY_ROOT') -or
            $startInfo.EnvironmentVariables.ContainsKey('NODE_OPTIONS')) {
            throw 'STANDALONE_NATIVE_ISOLATION_INVALID'
        }
        Assert-NativeProcessRunning ([pscustomobject]@{ HasExited = $false; ExitCode = 0 })
        $earlyExit = $null
        try { Assert-NativeProcessRunning ([pscustomobject]@{ HasExited = $true; ExitCode = 65 }) }
        catch { $earlyExit = $_.Exception.Message }
        if ($earlyExit -ne 'STANDALONE_NATIVE_APP_EXITED_65') { throw 'STANDALONE_NATIVE_EXIT_GUARD_INVALID' }
        Write-Output 'STANDALONE NATIVE WINDOWS ISOLATION CONTRACT PASS'
        return
    }
    Expand-Archive -LiteralPath $archivePath -DestinationPath $extractedRoot -Force
    if (-not (Test-Path -LiteralPath $executable -PathType Leaf)) {
        throw "STANDALONE_NATIVE_EXECUTABLE_MISSING: $executable"
    }
    Get-CheckedTree $testRoot | Out-Null
    # Never run an older artifact that ignores the isolation marker: it could
    # still resolve Windows Known Folders into real user Documents/AppData.
    $binary = [System.Text.Encoding]::ASCII.GetString([System.IO.File]::ReadAllBytes($executable))
    if (-not $binary.Contains('DATASECURE_STANDALONE_NATIVE_SMOKE_ROOT')) {
        throw 'STANDALONE_NATIVE_ISOLATION_UNSUPPORTED'
    }
    # WebView2 can defer page loading when the top-level Tauri window starts
    # hidden or minimized. A native acceptance smoke must therefore exercise
    # the same visible launch lifecycle as the end-user product.
    $process = [System.Diagnostics.Process]::Start($startInfo)
    $deadline = [DateTimeOffset]::UtcNow.AddSeconds(30)
    do {
        Start-Sleep -Milliseconds 100
        # Even a profile refusal before the first log event is an immediate
        # process failure, not a 30-second UI timeout.
        Assert-NativeProcessRunning $process
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
    } while ([DateTimeOffset]::UtcNow -lt $deadline)
    if (-not $passed) { throw 'STANDALONE_NATIVE_IPC_TIMEOUT' }
    if (-not (Test-Path -LiteralPath (Join-Path $testRoot 'profile\Local\SecureDataMsg-Standalone\workspace') -PathType Container)) {
        throw 'STANDALONE_NATIVE_ISOLATED_WORKSPACE_MISSING'
    }
    Write-Output 'STANDALONE NATIVE WINDOWS LAUNCH PASS'
} finally {
    if ($null -ne $process -and -not $process.HasExited) {
        # Closing the owned window lets Tauri drop/stop its sidecar. A forced
        # parent kill could orphan workers or WebView2 and lock the test root.
        $process.CloseMainWindow() | Out-Null
        if (-not $process.WaitForExit(35000)) {
            Stop-Process -Id $process.Id -ErrorAction Stop
            if (-not $process.WaitForExit(3000)) { throw 'STANDALONE_NATIVE_CLEANUP_PROCESS_RUNNING' }
        }
    }
    Remove-TestRoot
}
