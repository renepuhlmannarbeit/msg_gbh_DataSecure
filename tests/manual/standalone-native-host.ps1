param([switch] $ValidateContract)

function Resolve-StandaloneArchiveIdentity([string] $ArchivePath, [string] $FallbackVersion) {
    if (-not $ArchivePath) {
        if ($FallbackVersion -cnotmatch '^[0-9A-Za-z.-]+$') {
            throw 'STANDALONE_NATIVE_ARCHIVE_NAME_INVALID'
        }
        return [pscustomobject]@{
            Version = $FallbackVersion
            ProductDirectory = 'DataSecure'
            HistoricalProductDirectory = "DataSecure-Standalone-$FallbackVersion-windows-x64"
        }
    }
    $baseName = [System.IO.Path]::GetFileNameWithoutExtension($ArchivePath)
    $match = [System.Text.RegularExpressions.Regex]::Match(
        $baseName,
        '^DataSecure-Standalone-(?<version>[0-9A-Za-z.-]+)-windows-x64$',
        [System.Text.RegularExpressions.RegexOptions]::CultureInvariant
    )
    if (-not $match.Success) { throw 'STANDALONE_NATIVE_ARCHIVE_NAME_INVALID' }
    $version = $match.Groups['version'].Value
    [pscustomobject]@{
        Version = $version
        ProductDirectory = 'DataSecure'
        HistoricalProductDirectory = "DataSecure-Standalone-$version-windows-x64"
    }
}

function Resolve-StandaloneProductDirectory([string] $ExpandedRoot, [string] $Version) {
    $identity = Resolve-StandaloneArchiveIdentity '' $Version
    $root = Get-Item -LiteralPath $ExpandedRoot -Force -ErrorAction Stop
    if (-not $root.PSIsContainer -or ($root.Attributes -band [System.IO.FileAttributes]::ReparsePoint)) {
        throw 'STANDALONE_NATIVE_PACKAGE_ROOT_INVALID'
    }
    $children = @(Get-ChildItem -LiteralPath $ExpandedRoot -Force -ErrorAction Stop)
    if ($children.Count -ne 1 -or -not $children[0].PSIsContainer -or
        ($children[0].Attributes -band [System.IO.FileAttributes]::ReparsePoint) -or
        @($identity.ProductDirectory, $identity.HistoricalProductDirectory) -cnotcontains $children[0].Name) {
        throw 'STANDALONE_NATIVE_PACKAGE_ROOT_INVALID'
    }
    $manifestFile = Get-Item -LiteralPath (Join-Path $children[0].FullName 'STANDALONE-MANIFEST.json') -Force -ErrorAction Stop
    if ($manifestFile.PSIsContainer -or ($manifestFile.Attributes -band [System.IO.FileAttributes]::ReparsePoint)) {
        throw 'STANDALONE_NATIVE_PACKAGE_ROOT_INVALID'
    }
    $manifest = Get-Content -Raw -LiteralPath $manifestFile.FullName -ErrorAction Stop | ConvertFrom-Json -ErrorAction Stop
    if ($manifest.schema -cne 'datasecure-standalone-package/1' -or
        $manifest.version -cne $Version -or $manifest.target -cne 'windows-x64') {
        throw 'STANDALONE_NATIVE_PACKAGE_ROOT_INVALID'
    }
    return $children[0].Name
}

function Remove-StandaloneDesktopEnvironmentOverrides($StartInfo) {
    # The desktop must behave like a normal Windows process. Remove only
    # variables that can redirect DataSecure, Node, Tauri or WebView2; the real
    # sidecar independently starts with env_clear() in Rust.
    foreach ($key in @($StartInfo.EnvironmentVariables.Keys)) {
        if ($key -match '^(?:DATASECURE(?:_|$)|EU_PRIVACY(?:_|$)|NODE_(?:OPTIONS|PATH)$|TAURI_|WEBVIEW2_|RUST_|CARGO_|(?:HTTP|HTTPS|ALL|NO)_PROXY$)') {
            $StartInfo.EnvironmentVariables.Remove($key)
        }
    }
}

function Get-StandaloneWebViewHostFacts {
    $registrations = [System.Collections.Generic.List[object]]::new()
    $roots = @(
        [pscustomobject]@{ Scope = 'machine'; Root = [System.Environment]::GetEnvironmentVariable('ProgramFiles(x86)', 'Process') },
        [pscustomobject]@{ Scope = 'user'; Root = [System.Environment]::GetEnvironmentVariable('LOCALAPPDATA', 'Process') }
    )
    foreach ($candidate in $roots) {
        if (-not $candidate.Root) { continue }
        $application = if ($candidate.Scope -eq 'machine') {
            Join-Path $candidate.Root 'Microsoft\EdgeWebView\Application'
        } else {
            Join-Path $candidate.Root 'Microsoft\EdgeWebView\Application'
        }
        if (-not (Test-Path -LiteralPath $application -PathType Container)) { continue }
        foreach ($directory in @(Get-ChildItem -LiteralPath $application -Directory -ErrorAction SilentlyContinue)) {
            try { $parsed = [System.Version] $directory.Name } catch { continue }
            $binary = Join-Path $directory.FullName 'msedgewebview2.exe'
            if (Test-Path -LiteralPath $binary -PathType Leaf) {
                $registrations.Add([pscustomobject]@{ Scope = $candidate.Scope; Version = $parsed })
            }
        }
    }
    $selected = @($registrations | Sort-Object Version -Descending | Select-Object -First 1)
    [ordered]@{
        os_build = [System.Environment]::OSVersion.Version.ToString()
        process_architecture = [System.Runtime.InteropServices.RuntimeInformation]::ProcessArchitecture.ToString().ToLowerInvariant()
        webview2_available = ($selected.Count -eq 1)
        webview2_version = if ($selected.Count -eq 1) { $selected[0].Version.ToString() } else { 'unavailable' }
        webview2_scope = if ($selected.Count -eq 1) { $selected[0].Scope } else { 'unavailable' }
    }
}

if ($ValidateContract) {
    $historical = Resolve-StandaloneArchiveIdentity 'C:\evidence\DataSecure-Standalone-3.2.0-rc109-windows-x64.zip' 'ignored'
    $current = Resolve-StandaloneArchiveIdentity '' '3.2.0-rc111'
    if ($historical.Version -ne '3.2.0-rc109' -or
        $historical.HistoricalProductDirectory -ne 'DataSecure-Standalone-3.2.0-rc109-windows-x64' -or
        $current.ProductDirectory -ne 'DataSecure' -or
        $current.HistoricalProductDirectory -ne 'DataSecure-Standalone-3.2.0-rc111-windows-x64') {
        throw 'STANDALONE_NATIVE_ARCHIVE_CONTRACT_INVALID'
    }
    $invalid = $null
    try { Resolve-StandaloneArchiveIdentity 'C:\evidence\invalid.zip' 'ignored' | Out-Null }
    catch { $invalid = $_.Exception.Message }
    if ($invalid -ne 'STANDALONE_NATIVE_ARCHIVE_NAME_INVALID') {
        throw 'STANDALONE_NATIVE_ARCHIVE_CONTRACT_INVALID'
    }
    $environment = [System.Diagnostics.ProcessStartInfo]::new()
    foreach ($key in @('webview2_user_data_folder', 'TaUrI_Test', 'eu_privacy_root', 'Node_Options')) {
        $environment.EnvironmentVariables[$key] = 'synthetic-test-value'
    }
    Remove-StandaloneDesktopEnvironmentOverrides $environment
    foreach ($key in @('webview2_user_data_folder', 'TaUrI_Test', 'eu_privacy_root', 'Node_Options')) {
        if ($environment.EnvironmentVariables.ContainsKey($key)) {
            throw 'STANDALONE_NATIVE_ENVIRONMENT_CONTRACT_INVALID'
        }
    }
    Write-Output 'STANDALONE NATIVE HOST CONTRACT PASS'
}
