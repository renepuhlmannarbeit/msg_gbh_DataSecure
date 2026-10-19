param(
    [string] $Archive = '',
    [switch] $ValidateIsolationOnly,
    [switch] $ValidateReadinessOnly,
    [switch] $LegacyProfileContract,
    [switch] $EmitEvidence,
    [switch] $AssertNoListeners,
    [switch] $AssertReviewWindow,
    [switch] $AssertWorkspace,
    [string] $ExpectedSha256 = ''
)

$ErrorActionPreference = 'Stop'

function Test-NativeOpaqueId($Value) {
    return ($Value -is [string] -and $Value -cmatch '^[a-f0-9]{16,64}$')
}

function Get-NativeCurrentSession($Events) {
    $records = @($Events)
    $start = -1
    for ($index = 0; $index -lt $records.Count; $index++) {
        if ($records[$index].event -ceq 'application_started') { $start = $index }
    }
    if ($start -ge 0) {
        $session = $records[$start].session_id
        if (-not (Test-NativeOpaqueId $session)) { return }
        for ($index = $start; $index -lt $records.Count; $index++) {
            if ((Test-NativeOpaqueId $records[$index].session_id) -and $records[$index].session_id -ceq $session) {
                $records[$index]
            }
        }
        return
    }
    $tagged = @($records | Where-Object { $null -ne $_.PSObject.Properties['session_id'] })
    if ($tagged.Count -eq 0) { return $records }
    $session = $tagged[0].session_id
    if (-not (Test-NativeOpaqueId $session)) { return }
    if (@($tagged | Where-Object { -not (Test-NativeOpaqueId $_.session_id) -or $_.session_id -cne $session }).Count -gt 0) { return }
    return @($records | Where-Object { $_.session_id -ceq $session })
}

function Test-NativeActionReadiness($Events, [string] $Action) {
    $records = @(Get-NativeCurrentSession $Events)
    $start = -1
    for ($index = 0; $index -lt $records.Count; $index++) {
        if ($records[$index].event -ceq 'ipc_request_started' -and $records[$index].action -ceq $Action) {
            $start = $index
        }
    }
    if ($start -lt 0) { return $false }
    $requestId = $records[$start].request_id
    if (-not (Test-NativeOpaqueId $requestId)) { return $false }
    $response = $null
    for ($index = $start + 1; $index -lt $records.Count; $index++) {
        $record = $records[$index]
        if ($record.action -cne $Action) { continue }
        if (-not (Test-NativeOpaqueId $record.request_id)) { return $false }
        if ($record.request_id -ceq $requestId) { $response = $record }
    }
    # A late response to A cannot prove readiness of the newer request B.
    return ($null -ne $response -and $response.event -ceq 'ipc_response_ok')
}

function Test-NativeReviewReadiness($Events) {
    $Events = @(Get-NativeCurrentSession $Events)
    $page = @($Events | Where-Object { $_.event -eq 'review_page_loaded' }).Count -gt 0
    return ($page -and (Test-NativeActionReadiness $Events 'get_review_session'))
}

function Test-NativeMainReadiness($Events) {
    $Events = @(Get-NativeCurrentSession $Events)
    $page = @($Events | Where-Object { $_.event -eq 'page_loaded' }).Count -gt 0
    $frontend = @($Events | Where-Object { $_.event -eq 'frontend_ready' }).Count -gt 0
    return ($page -and $frontend -and (Test-NativeActionReadiness $Events 'get_public_state') -and
        (Test-NativeActionReadiness $Events 'get_ui_context'))
}

function Read-NativeSidecarReadiness([string] $Directory, [string] $DesktopLog,
    [switch] $RequireReview, [switch] $RequireWorkspace) {
    try {
        $reader = Join-Path $PSScriptRoot '..\helpers\native-review-readiness.js'
        $readerArguments = @($reader, $Directory, '--sidecar', $DesktopLog, '--report')
        if ($RequireReview) { $readerArguments += '--review' }
        if ($RequireWorkspace) { $readerArguments += '--workspace' }
        $json = & node @readerArguments 2>$null
        $report = ($json -join "`n") | ConvertFrom-Json
        if ($report.schema -cne 'datasecure-native-smoke-readiness/1') { throw 'INVALID_REPORT' }
        return $report
    } catch {
        return [pscustomobject]@{ schema = 'datasecure-native-smoke-readiness/1'; ready = $false;
            session_id = $null; product_version = $null; application_started_ms = $null;
            conditions = [pscustomobject]@{}; bootstrap_error = $null;
            error_codes = @('NATIVE_SMOKE_LOG_UNAVAILABLE') }
    }
}

function Get-NativeWebViewProfile([string] $CommandLine) {
    $arguments = [regex]::Matches($CommandLine,
        '(?i)(?:^|\s)--user-data-dir(?:=|\s+)(?:"([^"]+)"|([^\s"]+))')
    if ($arguments.Count -ne 1) { return '' }
    $argument = if ($arguments[0].Groups[1].Success) { $arguments[0].Groups[1].Value } else { $arguments[0].Groups[2].Value }
    return [System.IO.Path]::GetFullPath($argument)
}

function Wait-NativeWebViewProfileExit([string] $ExpectedProfile, [DateTime] $NotBeforeUtc) {
    $profile = [System.IO.Path]::GetFullPath($ExpectedProfile)
    $deadline = [DateTimeOffset]::UtcNow.AddSeconds(20)
    do {
        $owned = @(Get-CimInstance -ClassName Win32_Process -Filter "Name = 'msedgewebview2.exe'" -ErrorAction Stop |
            Where-Object { (Get-NativeWebViewProfile ([string] $_.CommandLine)) -ieq $profile })
        if ($owned.Count -eq 0) { return }
        foreach ($entry in $owned) {
            $created = ([DateTime] $entry.CreationDate).ToUniversalTime()
            if ($created -lt $NotBeforeUtc) { throw 'STANDALONE_NATIVE_WEBVIEW_INSTANCE_UNSAFE' }
            $held = $null
            try {
                try { $held = [System.Diagnostics.Process]::GetProcessById([int] $entry.ProcessId) }
                catch [System.ArgumentException] {
                    # The process exited between enumeration and handle acquisition.
                    # A fresh enumeration below must still prove profile quiescence.
                    continue
                }
                if ($held.HasExited) { continue }
                if ([Math]::Abs(($held.StartTime.ToUniversalTime() - $created).TotalMilliseconds) -gt 250) {
                    throw 'STANDALONE_NATIVE_WEBVIEW_INSTANCE_UNSAFE'
                }
                $remaining = [int] ($deadline - [DateTimeOffset]::UtcNow).TotalMilliseconds
                if ($remaining -le 0) { throw 'STANDALONE_NATIVE_WEBVIEW_EXIT_TIMEOUT' }
                $null = $held.WaitForExit([Math]::Min(1000, $remaining))
            } finally { if ($null -ne $held) { $held.Dispose() } }
        }
    } while ([DateTimeOffset]::UtcNow -lt $deadline)
    throw 'STANDALONE_NATIVE_WEBVIEW_EXIT_TIMEOUT'
}

if ($ValidateReadinessOnly) {
    $groups = 0
    $profile = [System.IO.Path]::GetFullPath('C:\synthetic owned\webview\main')
    foreach ($line in @('webview --user-data-dir="C:\synthetic owned\webview\main" --type=renderer',
        'webview --user-data-dir "C:\synthetic owned\webview\main"')) {
        if ((Get-NativeWebViewProfile $line) -ine $profile) { throw 'STANDALONE_NATIVE_WEBVIEW_PROFILE_PARSE_INVALID' }
        $groups++
    }
    foreach ($line in @('webview --other="C:\synthetic owned\webview\main"',
        'webview --user-data-dir=C:\other --user-data-dir=C:\synthetic')) {
        if (Get-NativeWebViewProfile $line) { throw 'STANDALONE_NATIVE_WEBVIEW_PROFILE_FALSE_POSITIVE' }
        $groups++
    }
    $requestA = 'a' * 35
    $requestB = 'b' * 35
    $page = [pscustomobject]@{ event = 'review_page_loaded' }
    $request = [pscustomobject]@{ event = 'ipc_request_started'; action = 'get_review_session'; request_id = $requestA }
    $requestNext = [pscustomobject]@{ event = 'ipc_request_started'; action = 'get_review_session'; request_id = $requestB }
    $failed = [pscustomobject]@{ event = 'ipc_response_error'; action = 'get_review_session'; request_id = $requestA }
    $failedNext = [pscustomobject]@{ event = 'ipc_response_error'; action = 'get_review_session'; request_id = $requestB }
    $passedResponse = [pscustomobject]@{ event = 'ipc_response_ok'; action = 'get_review_session'; request_id = $requestA }
    $passedNext = [pscustomobject]@{ event = 'ipc_response_ok'; action = 'get_review_session'; request_id = $requestB }
    $unrelated = [pscustomobject]@{ event = 'ipc_response_ok'; action = 'get_public_state'; request_id = $requestA }
    $invalid = [pscustomobject]@{ event = 'ipc_response_invalid'; action = 'get_review_session'; request_id = $requestA }
    $transportFailed = [pscustomobject]@{ event = 'ipc_request_failed'; action = 'get_review_session'; request_id = $requestA }
    $sidecarExited = [pscustomobject]@{ event = 'sidecar_exited_before_response'; action = 'get_review_session'; request_id = $requestA }
    foreach ($events in @(@($page, $request), @($page, $request, $failed),
        @($page, $request, $unrelated), @($page, $request, $passedResponse, $failed),
        @($page, $request, $passedResponse, $invalid), @($page, $request, $passedResponse, $transportFailed),
        @($page, $request, $passedResponse, $sidecarExited), @($page, $request, $passedResponse, $request),
        @($page, $request, $requestNext, $passedResponse),
        @($page, $request, $requestNext, $failedNext, $passedResponse),
        @($page, $request, $requestNext, $passedResponse, $failedNext),
        @($page, $request, [pscustomobject]@{ event = 'ipc_response_ok'; action = 'get_review_session' }),
        @($page, [pscustomobject]@{ event = 'ipc_request_started'; action = 'get_review_session' }, $passedResponse))) {
        if (Test-NativeReviewReadiness $events) { throw 'STANDALONE_NATIVE_REVIEW_FALSE_POSITIVE' }
        $groups++
    }
    foreach ($events in @(@($page, $request, $failed, $passedResponse),
        @($page, $request, $requestNext, $passedResponse, $passedNext),
        @($page, $request, $requestNext, $passedNext, $failed))) {
        if (-not (Test-NativeReviewReadiness $events)) { throw 'STANDALONE_NATIVE_REVIEW_SUCCESS_NOT_OBSERVED' }
        $groups++
    }
    foreach ($id in @('', ('x' * 35), ('a' * 15), ('a' * 65), 1234567890123456)) {
        $start = [pscustomobject]@{ event = 'ipc_request_started'; action = 'get_review_session'; request_id = $id }
        $end = [pscustomobject]@{ event = 'ipc_response_ok'; action = 'get_review_session'; request_id = $id }
        if (Test-NativeReviewReadiness @($page, $start, $end)) { throw 'STANDALONE_NATIVE_REQUEST_ID_INVALID' }
        $groups++
    }
    foreach ($size in @(16, 35, 64)) {
        $id = 'c' * $size
        $start = [pscustomobject]@{ event = 'ipc_request_started'; action = 'get_review_session'; request_id = $id }
        $end = [pscustomobject]@{ event = 'ipc_response_ok'; action = 'get_review_session'; request_id = $id }
        if (-not (Test-NativeReviewReadiness @($page, $start, $end))) { throw 'STANDALONE_NATIVE_REQUEST_ID_REFUSED' }
        $groups++
    }
    $mainEvents = @([pscustomobject]@{ event = 'page_loaded' }, [pscustomobject]@{ event = 'frontend_ready' })
    foreach ($action in @('get_public_state', 'get_ui_context')) {
        $mainEvents += [pscustomobject]@{ event = 'ipc_request_started'; action = $action; request_id = $requestA }
        $mainEvents += [pscustomobject]@{ event = 'ipc_response_ok'; action = $action; request_id = $requestA }
    }
    if (-not (Test-NativeMainReadiness $mainEvents)) { throw 'STANDALONE_NATIVE_MAIN_SUCCESS_NOT_OBSERVED' }
    $groups++
    foreach ($action in @('get_public_state', 'get_ui_context')) {
        foreach ($event in @('ipc_response_error', 'ipc_response_invalid', 'ipc_request_started', 'ipc_request_failed')) {
            if (Test-NativeMainReadiness @($mainEvents + [pscustomobject]@{ event = $event; action = $action; request_id = $requestA })) {
                throw 'STANDALONE_NATIVE_MAIN_FALSE_POSITIVE'
            }
            $groups++
        }
        $next = @($mainEvents + [pscustomobject]@{ event = 'ipc_request_started'; action = $action; request_id = $requestB })
        $oldResponse = [pscustomobject]@{ event = 'ipc_response_ok'; action = $action; request_id = $requestA }
        $newResponse = [pscustomobject]@{ event = 'ipc_response_ok'; action = $action; request_id = $requestB }
        if (Test-NativeMainReadiness @($next + $oldResponse)) { throw 'STANDALONE_NATIVE_MAIN_OLD_RESPONSE_ACCEPTED' }
        $groups++
        if (-not (Test-NativeMainReadiness @($next + $oldResponse + $newResponse))) {
            throw 'STANDALONE_NATIVE_MAIN_LATEST_RESPONSE_REFUSED'
        }
        $groups++
    }
    $sessionA = '1' * 32
    $sessionB = '2' * 32
    $first = @([pscustomobject]@{ event = 'application_started'; session_id = $sessionA })
    foreach ($record in @($page, $request, $passedResponse)) {
        $tagged = [pscustomobject]@{ event = $record.event; action = $record.action; request_id = $record.request_id; session_id = $sessionA }
        $first += $tagged
    }
    $second = @([pscustomobject]@{ event = 'application_started'; session_id = $sessionB })
    foreach ($record in @($page, $request)) {
        $second += [pscustomobject]@{ event = $record.event; action = $record.action; request_id = $record.request_id; session_id = $sessionB }
    }
    $oldSuccess = [pscustomobject]@{ event = $passedResponse.event; action = $passedResponse.action; request_id = $requestA; session_id = $sessionA }
    $newSuccess = [pscustomobject]@{ event = $passedResponse.event; action = $passedResponse.action; request_id = $requestA; session_id = $sessionB }
    if (Test-NativeReviewReadiness @($first + $second + $oldSuccess)) { throw 'STANDALONE_NATIVE_OLD_SESSION_ACCEPTED' }
    $groups++
    if (-not (Test-NativeReviewReadiness @($first + $second + $newSuccess + $oldSuccess))) {
        throw 'STANDALONE_NATIVE_CURRENT_SESSION_REFUSED'
    }
    $groups++
    if (Test-NativeReviewReadiness @($first + [pscustomobject]@{ event = 'application_started' } + $page + $request + $passedResponse)) {
        throw 'STANDALONE_NATIVE_MISSING_SESSION_ACCEPTED'
    }
    $groups++
    if (Test-NativeReviewReadiness @($second[1..2] + $oldSuccess)) { throw 'STANDALONE_NATIVE_MIXED_SESSIONS_ACCEPTED' }
    $groups++
    Write-Output "STANDALONE NATIVE READINESS CONTRACT PASS ($groups groups; no native app launch)"
    exit 0
}

if ($env:OS -ne 'Windows_NT') {
    Write-Output 'STANDALONE NATIVE WINDOWS LAUNCH SKIP (non-Windows host)'
    # 77 is an explicit not-applicable verdict, never a successful native gate.
    exit 77
}

$repositoryRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..')).Path
. (Join-Path $PSScriptRoot 'standalone-native-cleanup.ps1')
. (Join-Path $PSScriptRoot 'standalone-native-host.ps1')
$package = Get-Content -Raw -LiteralPath (Join-Path $repositoryRoot 'package.json') | ConvertFrom-Json
$archivePath = if ($ValidateIsolationOnly) {
    ''
} elseif ($Archive) {
    (Resolve-Path -LiteralPath $Archive).Path
} else {
    (Resolve-Path -LiteralPath (Join-Path $repositoryRoot "dist\DataSecure-Standalone-$($package.version)-windows-x64.zip")).Path
}
$archiveIdentity = Resolve-StandaloneArchiveIdentity $archivePath ([string] $package.version)
if (-not $ValidateIsolationOnly -and $ExpectedSha256) {
    $actualArchiveSha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $archivePath).Hash.ToLowerInvariant()
    if ($actualArchiveSha256 -cne $ExpectedSha256.ToLowerInvariant()) {
        throw 'STANDALONE_NATIVE_ARCHIVE_IDENTITY_MISMATCH'
    }
}
$expectedVersion = $archiveIdentity.Version
$productDirectory = $archiveIdentity.ProductDirectory
# Keep the NEW, handle-bound smoke profile in the operating-system temporary
# namespace. Some Windows hosts return STATUS_REPARSE_POINT_ENCOUNTERED for
# relative native opens of a direct child of LocalAppData, even when Win32
# metadata reports no link. Do not weaken OBJ_DONT_REPARSE to bypass that.
$nativeProfileParent = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath()).TrimEnd('\')
$cleanupContext = New-NativeCleanupContext $nativeProfileParent
$testRoot = $cleanupContext.Root
$extractedRoot = Join-Path $testRoot 'candidate'
$executable = Join-Path $extractedRoot "$productDirectory\DataSecure Standalone.exe"
$isolatedTemp = Join-Path $testRoot 'temp'
$diagnosticRoot = Join-Path $isolatedTemp 'SecureDataMsg-Standalone'
$desktopLog = Join-Path $diagnosticRoot 'desktop-interactions.jsonl'
$startedAt = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$process = $null
$passed = $false
$startupStopwatch = $null
$startupMilliseconds = $null
$networkEvidence = $null

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
    Remove-StandaloneDesktopEnvironmentOverrides $startInfo
    $expected = if ($LegacyProfileContract) {
        @{
            USERPROFILE = 'profile'; HOME = 'profile'; LOCALAPPDATA = 'profile\Local';
            APPDATA = 'profile\Roaming'; XDG_DATA_HOME = 'profile\Xdg';
            TEMP = 'temp'; TMP = 'temp'; TMPDIR = 'temp';
            DATASECURE_STANDALONE_DOCUMENTS_DIR = 'profile\Documents';
            WEBVIEW2_USER_DATA_FOLDER = 'webview'
        }
    } else {
        @{ WEBVIEW2_USER_DATA_FOLDER = 'webview\main' }
    }
    foreach ($entry in $expected.GetEnumerator()) {
        $value = Join-Path $testRoot $entry.Value
        if (-not (Test-Path -LiteralPath $value -PathType Container)) { throw 'STANDALONE_NATIVE_ISOLATION_MISSING' }
        $startInfo.EnvironmentVariables[$entry.Key] = $value
    }
    $startInfo.EnvironmentVariables['DATASECURE_STANDALONE_NATIVE_SMOKE_ROOT'] = $testRoot
    if ($AssertReviewWindow) {
        $startInfo.EnvironmentVariables['DATASECURE_STANDALONE_NATIVE_SMOKE_REVIEW'] = '1'
    }
    return $startInfo
}

function Assert-NativeProcessRunning($CandidateProcess) {
    if ($CandidateProcess.HasExited) {
        throw "STANDALONE_NATIVE_APP_EXITED_$($CandidateProcess.ExitCode)"
    }
}

function Get-NativeProcessTree([int] $RootProcessId, [DateTime] $ExpectedRootStartUtc,
    [string] $ExpectedRootExecutable) {
    $all = @(Get-CimInstance -ClassName Win32_Process -ErrorAction Stop)
    $root = @($all | Where-Object { [int] $_.ProcessId -eq $RootProcessId })
    if ($root.Count -ne 1) { throw 'STANDALONE_NATIVE_PROCESS_ROOT_MISSING' }
    $rootCreatedUtc = ([DateTime] $root[0].CreationDate).ToUniversalTime()
    if ([Math]::Abs(($rootCreatedUtc - $ExpectedRootStartUtc).TotalMilliseconds) -gt 250 -or
        -not $root[0].ExecutablePath -or
        [System.IO.Path]::GetFullPath([string] $root[0].ExecutablePath) -ine
            [System.IO.Path]::GetFullPath($ExpectedRootExecutable)) {
        throw 'STANDALONE_NATIVE_PROCESS_ROOT_REUSED'
    }
    $owned = [System.Collections.Generic.HashSet[int]]::new()
    $created = [System.Collections.Generic.Dictionary[int, DateTime]]::new()
    $owned.Add($RootProcessId) | Out-Null
    $created[$RootProcessId] = $rootCreatedUtc
    do {
        $changed = $false
        foreach ($candidate in $all) {
            $parentId = [int] $candidate.ParentProcessId
            $candidateId = [int] $candidate.ProcessId
            if (-not $owned.Contains($parentId) -or $owned.Contains($candidateId)) { continue }
            $candidateCreatedUtc = ([DateTime] $candidate.CreationDate).ToUniversalTime()
            # Win32_Process retains only numeric ParentProcessId. Reject an
            # older process whose parent PID was reused by this fresh app.
            if ($candidateCreatedUtc -lt $created[$parentId]) { continue }
            if ($owned.Add($candidateId)) {
                $created[$candidateId] = $candidateCreatedUtc
                $changed = $true
            }
        }
    } while ($changed)
    return @($all | Where-Object { $owned.Contains([int] $_.ProcessId) })
}

function Assert-NativeNetworkObserver {
    if (-not (Get-Command Get-NetTCPConnection -ErrorAction SilentlyContinue) -or
        -not (Get-Command Get-NetUDPEndpoint -ErrorAction SilentlyContinue)) {
        throw 'STANDALONE_NATIVE_NETWORK_OBSERVER_UNAVAILABLE'
    }
    # A local positive control proves that the observer can see a real listener
    # before a zero-result is accepted as evidence for the product process tree.
    $control = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
    try {
        $control.Start()
        $controlPort = ([System.Net.IPEndPoint] $control.LocalEndpoint).Port
        $observed = @(Get-NetTCPConnection -State Listen -ErrorAction Stop | Where-Object {
            $_.OwningProcess -eq $PID -and $_.LocalPort -eq $controlPort
        })
        if ($observed.Count -ne 1) { throw 'STANDALONE_NATIVE_NETWORK_OBSERVER_INVALID' }
    } finally {
        $control.Stop()
    }
    $udpControl = [System.Net.Sockets.UdpClient]::new([System.Net.Sockets.AddressFamily]::InterNetwork)
    try {
        $udpControl.Client.Bind([System.Net.IPEndPoint]::new([System.Net.IPAddress]::Loopback, 0))
        $udpControlPort = ([System.Net.IPEndPoint] $udpControl.Client.LocalEndPoint).Port
        $udpObserved = @(Get-NetUDPEndpoint -ErrorAction Stop | Where-Object {
            $_.OwningProcess -eq $PID -and $_.LocalPort -eq $udpControlPort
        })
        if ($udpObserved.Count -ne 1) { throw 'STANDALONE_NATIVE_UDP_OBSERVER_INVALID' }
    } finally {
        $udpControl.Dispose()
    }
}

function Get-NativeNetworkObservation([int] $RootProcessId, [DateTime] $ExpectedRootStartUtc,
    [string] $ExpectedRootExecutable, [string] $ExpectedWebViewRoot) {
    $tree = @(Get-NativeProcessTree $RootProcessId $ExpectedRootStartUtc $ExpectedRootExecutable)
    $processIds = @($tree | ForEach-Object { [int] $_.ProcessId })
    $tcp = @(Get-NetTCPConnection -State Listen -ErrorAction Stop | Where-Object {
        $processIds -contains [int] $_.OwningProcess
    })
    $udp = @(Get-NetUDPEndpoint -ErrorAction Stop | Where-Object {
        $processIds -contains [int] $_.OwningProcess
    })
    if ($tcp.Count -gt 0) {
        $details = @($tcp | ForEach-Object {
            $ownerId = [int] $_.OwningProcess
            $owner = @($tree | Where-Object { [int] $_.ProcessId -eq $ownerId } | Select-Object -First 1)
            [ordered]@{ process = if ($owner.Count -eq 1) { [string] $owner[0].Name } else { 'unknown' };
                address = [string] $_.LocalAddress; port = [int] $_.LocalPort }
        })
        throw ('STANDALONE_NATIVE_NETWORK_LISTENER_DETECTED:' + ($details | ConvertTo-Json -Compress))
    }
    # A UDP endpoint is not a listening HTTP/WebSocket server. Only a securely
    # attributed Microsoft WebView2 descendant for this isolated profile is a
    # platform observation. Any DataSecure or unattributed UDP owner fails.
    $udpProcesses = [System.Collections.Generic.List[string]]::new()
    foreach ($endpoint in $udp) {
        $ownerId = [int] $endpoint.OwningProcess
        $owner = @($tree | Where-Object { [int] $_.ProcessId -eq $ownerId } | Select-Object -First 1)
        $freshOwner = @(Get-CimInstance -ClassName Win32_Process -Filter "ProcessId = $ownerId" -ErrorAction Stop)
        if ($owner.Count -ne 1 -or $freshOwner.Count -ne 1 -or
            ([DateTime] $owner[0].CreationDate).ToUniversalTime() -ne
                ([DateTime] $freshOwner[0].CreationDate).ToUniversalTime()) {
            throw 'STANDALONE_NATIVE_NETWORK_ENDPOINT_UNATTRIBUTED'
        }
        if ([string] $freshOwner[0].Name -ine 'msedgewebview2.exe' -or
            -not $freshOwner[0].ExecutablePath -or -not $freshOwner[0].CommandLine) {
            throw 'STANDALONE_NATIVE_NETWORK_ENDPOINT_UNATTRIBUTED'
        }
        $commandLine = [string] $freshOwner[0].CommandLine
        $profileMarker = [System.IO.Path]::GetFullPath($ExpectedWebViewRoot)
        $profileMatch = [regex]::Match($commandLine,
            '(?i)(?:^|\s)--user-data-dir(?:=|\s+)(?:"([^"]+)"|([^\s"]+))')
        $profileArgument = if ($profileMatch.Success -and $profileMatch.Groups[1].Success) {
            $profileMatch.Groups[1].Value
        } elseif ($profileMatch.Success) { $profileMatch.Groups[2].Value } else { '' }
        $isOwnProfile = $profileArgument -and
            [System.IO.Path]::GetFullPath($profileArgument) -ieq $profileMarker
        $isWebView = $commandLine.Contains('--embedded-browser-webview=1') -or
            ($commandLine.Contains('--type=utility') -and $commandLine.Contains('NetworkService'))
        $signature = Get-AuthenticodeSignature -LiteralPath ([string] $freshOwner[0].ExecutablePath)
        $isMicrosoft = $signature.Status -eq [System.Management.Automation.SignatureStatus]::Valid -and
            $signature.SignerCertificate -and
            $signature.SignerCertificate.Subject -match '(?:^|,\s*)O=Microsoft Corporation(?:,|$)'
        if (-not $isOwnProfile -or -not $isWebView -or -not $isMicrosoft) {
            # A failed observation is not product-network evidence. Keep its
            # cause diagnosable without exposing paths, command lines or ports.
            $classification = [ordered]@{ own_profile = [bool] $isOwnProfile;
                webview_process = [bool] $isWebView; microsoft_signature = [bool] $isMicrosoft;
                signature_status = [string] $signature.Status }
            Write-Output ('STANDALONE NATIVE ENDPOINT CLASSIFICATION ' + ($classification | ConvertTo-Json -Compress))
            throw 'STANDALONE_NATIVE_NETWORK_ENDPOINT_UNATTRIBUTED'
        }
        $udpProcesses.Add('msedgewebview2.exe')
    }
    $udpProcessNames = @($udpProcesses | Sort-Object -Unique)
    <#
      Keep the evidence content-free: no executable path, command line,
      address or user profile is emitted.
    #>
    return [ordered]@{ process_count = $processIds.Count; tcp_listeners = 0;
        udp_endpoints = $udp.Count; udp_processes = $udpProcessNames }
}

function Merge-NativeNetworkEvidence($Current, $Observation) {
    if ($null -eq $Current) {
        return [ordered]@{ process_count = [int] $Observation.process_count; tcp_listeners = 0;
            udp_endpoints = [int] $Observation.udp_endpoints; udp_processes = @($Observation.udp_processes) }
    }
    $names = [System.Collections.Generic.List[string]]::new()
    foreach ($name in @($Current.udp_processes + $Observation.udp_processes | Sort-Object -Unique)) {
        if ($name) { $names.Add([string] $name) }
    }
    return [ordered]@{
        process_count = [Math]::Max([int] $Current.process_count, [int] $Observation.process_count)
        tcp_listeners = 0
        udp_endpoints = [Math]::Max([int] $Current.udp_endpoints, [int] $Observation.udp_endpoints)
        udp_processes = $names
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
        'profile\Documents', 'temp', 'temp\SecureDataMsg-Standalone', 'webview', 'webview\main')) {
        New-Item -ItemType Directory -Path (Join-Path $testRoot $relative) -ErrorAction Stop | Out-Null
    }
    $startInfo = New-IsolatedStartInfo $executable
    Get-CheckedTree $testRoot | Out-Null
    if ($ValidateIsolationOnly) {
        if ($LegacyProfileContract) { throw 'STANDALONE_NATIVE_ISOLATION_INVALID' }
        # The test owns only this child environment. Never assign USERPROFILE,
        # HOME, TEMP or any data-root variable in the parent process/session.
        if ($startInfo.EnvironmentVariables['LOCALAPPDATA'] -ne $env:LOCALAPPDATA -or
            $startInfo.EnvironmentVariables['TEMP'] -ne $env:TEMP -or
            $startInfo.EnvironmentVariables.ContainsKey('EU_PRIVACY_ROOT') -or
            $startInfo.EnvironmentVariables.ContainsKey('NODE_OPTIONS') -or
            $startInfo.EnvironmentVariables['WEBVIEW2_USER_DATA_FOLDER'] -ne (Join-Path $testRoot 'webview\main')) {
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
    $productDirectory = Resolve-StandaloneProductDirectory $extractedRoot $expectedVersion
    $executable = Join-Path $extractedRoot "$productDirectory\DataSecure Standalone.exe"
    $startInfo = New-IsolatedStartInfo $executable
    if (-not (Test-Path -LiteralPath $executable -PathType Leaf)) {
        throw "STANDALONE_NATIVE_EXECUTABLE_MISSING: $executable"
    }
    $shellBytes = (Get-Item -LiteralPath $executable -ErrorAction Stop).Length
    if ($shellBytes -gt 20MB) { throw "STANDALONE_NATIVE_SHELL_TOO_LARGE:$shellBytes" }
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
    if ($AssertNoListeners) { Assert-NativeNetworkObserver }
    $startupStopwatch = [System.Diagnostics.Stopwatch]::StartNew()
    $process = [System.Diagnostics.Process]::Start($startInfo)
    $rootStartedUtc = $process.StartTime.ToUniversalTime()
    $deadline = [DateTimeOffset]::UtcNow.AddSeconds(30)
    do {
        # Even a profile refusal before the first log event is an immediate
        # process failure, not a 30-second UI timeout.
        Assert-NativeProcessRunning $process
        if ($AssertNoListeners) {
            $observation = Get-NativeNetworkObservation $process.Id $rootStartedUtc $executable `
                (Join-Path $testRoot 'webview\main')
            $networkEvidence = Merge-NativeNetworkEvidence $networkEvidence $observation
        }
        Start-Sleep -Milliseconds 100
        $sidecarStatus = Read-NativeSidecarReadiness $diagnosticRoot $desktopLog `
            -RequireReview:$AssertReviewWindow -RequireWorkspace:$AssertWorkspace
        $application = [bool] ($sidecarStatus.conditions.application_session -and
            $null -ne $sidecarStatus.application_started_ms -and $sidecarStatus.application_started_ms -ge $startedAt -and
            $sidecarStatus.product_version -ceq $expectedVersion)
        $publicState = [bool] $sidecarStatus.conditions.public_state_ipc
        $uiContext = [bool] $sidecarStatus.conditions.ui_context_ipc
        $pageLoaded = [bool] $sidecarStatus.conditions.page_loaded
        $workspaceLoaded = [bool] $sidecarStatus.conditions.workspace_page_loaded
        $reviewPageLoaded = [bool] $sidecarStatus.conditions.review_page_loaded
        $reviewScriptStarted = [bool] $sidecarStatus.conditions.review_script_started
        $reviewReady = [bool] ($sidecarStatus.conditions.review_ipc -and $sidecarStatus.conditions.current_owner_review_ipc)
        $frontendReady = [bool] $sidecarStatus.conditions.frontend_ready
        $setupStarted = [bool] $sidecarStatus.conditions.setup_started
        $setupCompleted = [bool] $sidecarStatus.conditions.setup_completed
        $sidecarStarted = [bool] $sidecarStatus.conditions.sidecar_started
        $serviceInitialized = [bool] $sidecarStatus.conditions.service_initialized
        if ($application -and $sidecarStatus.ready) {
            $startupStopwatch.Stop()
            $startupMilliseconds = [Math]::Round($startupStopwatch.Elapsed.TotalMilliseconds, 3)
            $passed = $true
            break
        }
    } while ([DateTimeOffset]::UtcNow -lt $deadline)
    if (-not $passed) {
        # Preserve bounded content-free evidence before the owned test profile is
        # cleaned. A timeout alone cannot distinguish page loading from IPC failure.
        $checkpoint = [ordered]@{ application = $application; setup_started = $setupStarted;
            setup_completed = $setupCompleted; page_loaded = $pageLoaded;
            review_page_loaded = $reviewPageLoaded; review_script_started = $reviewScriptStarted;
            review_session_response_ok = $reviewReady;
            frontend_ready = $frontendReady; public_state = $publicState; ui_context = $uiContext;
            sidecar_started = $sidecarStarted; service_initialized = $serviceInitialized }
        Write-Output ('STANDALONE NATIVE CHECKPOINT ' + ($checkpoint | ConvertTo-Json -Compress))
        if ($null -ne $sidecarStatus) {
            Write-Output ('STANDALONE NATIVE SIDECAR CHECKPOINT ' + ($sidecarStatus | ConvertTo-Json -Depth 4 -Compress))
        }
        Write-Output ('STANDALONE NATIVE HOST ' + ((Get-StandaloneWebViewHostFacts) | ConvertTo-Json -Compress))
        if (-not $setupStarted) { throw 'STANDALONE_NATIVE_WEBVIEW_INITIALIZATION_TIMEOUT' }
        if (-not $setupCompleted) { throw 'STANDALONE_NATIVE_SETUP_TIMEOUT' }
        if (-not $pageLoaded) { throw 'STANDALONE_NATIVE_PAGE_LOAD_TIMEOUT' }
        if ($AssertWorkspace -and -not $workspaceLoaded) { throw 'STANDALONE_NATIVE_WORKSPACE_LOAD_TIMEOUT' }
        if (-not $frontendReady) { throw 'STANDALONE_NATIVE_FRONTEND_READY_TIMEOUT' }
        if ($AssertReviewWindow -and -not $reviewReady) {
            throw 'STANDALONE_NATIVE_REVIEW_WINDOW_TIMEOUT'
        }
        throw 'STANDALONE_NATIVE_IPC_TIMEOUT'
    }
    if (-not (Test-Path -LiteralPath (Join-Path $testRoot 'profile\Local\SecureDataMsg-Standalone\workspace') -PathType Container)) {
        throw 'STANDALONE_NATIVE_ISOLATED_WORKSPACE_MISSING'
    }
    if ($EmitEvidence) {
        $facts = Get-StandaloneWebViewHostFacts
        $evidence = [ordered]@{
            schema = 'datasecure-standalone-native-windows-evidence/2'
            version = $expectedVersion
            startup_ms = $startupMilliseconds
            shell_bytes = $shellBytes
            shell_limit_bytes = 20MB
            network_observed = [bool] $AssertNoListeners
            process_count = if ($null -ne $networkEvidence) { $networkEvidence.process_count } else { $null }
            tcp_listeners = if ($null -ne $networkEvidence) { $networkEvidence.tcp_listeners } else { $null }
            udp_endpoints = if ($null -ne $networkEvidence) { $networkEvidence.udp_endpoints } else { $null }
            udp_processes = if ($null -ne $networkEvidence) { $networkEvidence.udp_processes } else { $null }
            os_build = $facts.os_build
            process_architecture = $facts.process_architecture
            webview2_version = $facts.webview2_version
            webview2_scope = $facts.webview2_scope
        }
        Write-Output ('STANDALONE NATIVE EVIDENCE ' + ($evidence | ConvertTo-Json -Compress))
    }
    Write-Output 'STANDALONE NATIVE WINDOWS LAUNCH PASS (load + successful IPC only; no review decisions)'
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
    # Tauri exit alone does not mean Chromium has finished removing profile
    # lockfiles. Prove the exact isolated profile is quiescent BEFORE inventory;
    # never hide vanished paths during deletion or kill unrelated WebViews.
    if ($null -ne $process) {
        Wait-NativeWebViewProfileExit (Join-Path $testRoot 'webview\main') $rootStartedUtc
    }
    Remove-TestRoot
}
