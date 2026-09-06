param([string] $ExpectedCommit = '')

$ErrorActionPreference = 'Stop'
$repositoryRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
Set-Location -LiteralPath $repositoryRoot

function Invoke-Checked([string] $Program, [string[]] $Arguments) {
    & $Program @Arguments
    if ($LASTEXITCODE -ne 0) { throw "PKG04_COMMAND_FAILED:${Program}:$LASTEXITCODE" }
}

function Write-JsonUtf8NoBom([string] $Path, $Value, [int] $Depth) {
    $json = $Value | ConvertTo-Json -Depth $Depth
    $encoding = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($Path, "$json`r`n", $encoding)
}

function Get-Sha256File([string] $Path) {
    # Do not depend on Get-FileHash: minimal/offline Windows PowerShell hosts
    # may not auto-load Microsoft.PowerShell.Utility after the native smoke.
    # The framework SHA-256 implementation is present on every supported
    # Windows build host and keeps the release receipt PowerShell-5.1-safe.
    $stream = [System.IO.File]::Open(
        $Path,
        [System.IO.FileMode]::Open,
        [System.IO.FileAccess]::Read,
        [System.IO.FileShare]::Read
    )
    $sha = $null
    try {
        $sha = [System.Security.Cryptography.SHA256]::Create()
        $digest = $sha.ComputeHash($stream)
        return ([System.BitConverter]::ToString($digest)).Replace('-', '').ToLowerInvariant()
    } finally {
        if ($sha -ne $null) { $sha.Dispose() }
        $stream.Dispose()
    }
}

$branch = (& git branch --show-current).Trim()
$commit = (& git rev-parse HEAD).Trim()
$tree = (& git rev-parse 'HEAD^{tree}').Trim()
$dirty = @(& git status --porcelain=v1 --untracked-files=all)
if ($branch -ne 'main') { throw 'PKG04_BRANCH_NOT_MAIN' }
if ($ExpectedCommit -and $commit -ne $ExpectedCommit) { throw 'PKG04_COMMIT_MISMATCH' }
if ($dirty.Count -gt 0) { throw 'PKG04_WORKTREE_NOT_CLEAN' }

$cargoDirectory = Join-Path $env:USERPROFILE '.cargo\bin'
$cargo = Join-Path $cargoDirectory 'cargo.exe'
$rustc = Join-Path $cargoDirectory 'rustc.exe'
if (-not (Test-Path -LiteralPath $cargo -PathType Leaf) -or -not (Test-Path -LiteralPath $rustc -PathType Leaf)) {
    throw 'PKG04_RUST_TOOLCHAIN_MISSING'
}
$env:Path = "$cargoDirectory;$env:Path"
$package = Get-Content -Raw -LiteralPath (Join-Path $repositoryRoot 'package.json') | ConvertFrom-Json
$archiveName = "DataSecure-Standalone-$($package.version)-windows-x64.zip"
$sourceArchive = Join-Path $repositoryRoot "dist\$archiveName"
$evidenceRoot = Join-Path $repositoryRoot "dist\pkg-04\$commit"
if (Test-Path -LiteralPath $evidenceRoot) { throw 'PKG04_EVIDENCE_ALREADY_EXISTS' }
New-Item -ItemType Directory -Path $evidenceRoot | Out-Null

$candidates = @()
Invoke-Checked 'npm.cmd' @('run', 'test:standalone:conversion')
Invoke-Checked 'powershell.exe' @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File',
    'tests/manual/standalone-native-windows-launch.ps1', '-ValidateIsolationOnly')
foreach ($label in @('candidate-a', 'candidate-b')) {
    Invoke-Checked $cargo @('clean', '--manifest-path', 'apps/datasecure-standalone/tauri-contract/Cargo.toml')
    Invoke-Checked 'npm.cmd' @('run', 'build:standalone:windows:portable')
    $candidateDirectory = Join-Path $evidenceRoot $label
    New-Item -ItemType Directory -Path $candidateDirectory | Out-Null
    $candidateArchive = Join-Path $candidateDirectory $archiveName
    Copy-Item -LiteralPath $sourceArchive -Destination $candidateArchive
    Copy-Item -LiteralPath "$sourceArchive.sha256" -Destination "$candidateArchive.sha256"
    Invoke-Checked 'node.exe' @('scripts/verify-standalone-package.mjs', $candidateArchive)
    Invoke-Checked 'node.exe' @('tests/test-standalone-package-smoke.mjs', $candidateArchive)
    Invoke-Checked 'powershell.exe' @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File',
        'tests/manual/standalone-native-windows-launch.ps1', '-Archive', $candidateArchive)
    $expanded = Join-Path $candidateDirectory 'expanded'
    Expand-Archive -LiteralPath $candidateArchive -DestinationPath $expanded
    $productRoot = Join-Path $expanded "DataSecure-Standalone-$($package.version)-windows-x64"
    $candidates += [ordered]@{
        label = $label
        archive = $candidateArchive
        archive_sha256 = Get-Sha256File $candidateArchive
        desktop_sha256 = Get-Sha256File (Join-Path $productRoot 'DataSecure Standalone.exe')
        core_sha256 = Get-Sha256File (Join-Path $productRoot 'datasecure-core-x86_64-pc-windows-msvc.exe')
        package_smoke = 'passed'
        worker_handoff_smoke = 'passed'
        native_binary_smoke = 'passed'
        native_smoke_isolation = 'fresh-private-profile-documents-temp-webview'
    }
}

foreach ($field in @('archive_sha256', 'desktop_sha256', 'core_sha256')) {
    if ($candidates[0][$field] -ne $candidates[1][$field]) { throw "PKG04_NOT_BYTE_IDENTICAL:$field" }
}
$receipt = [ordered]@{
    schema = 'datasecure-pkg-04-receipt/1'
    acceptance = 'PKG-04'
    scope = 'same-host-same-toolchain-clean-build'
    source = [ordered]@{ branch = $branch; commit = $commit; tree = $tree; clean = $true }
    target = 'windows-x64'
    product_version = $package.version
    toolchain = [ordered]@{
        node = (& node.exe --version).Trim()
        npm = (& npm.cmd --version).Trim()
        rustc = (& $rustc --version).Trim()
        cargo = (& $cargo --version).Trim()
    }
    candidates = $candidates
    byte_identical = $true
}
$receiptPath = Join-Path $evidenceRoot 'PKG-04-RECEIPT.json'
Write-JsonUtf8NoBom $receiptPath $receipt 8
$receiptHash = Get-Sha256File $receiptPath
$binding = [ordered]@{
    schema = 'datasecure-int-13-binding/1'
    acceptance = 'INT-13'
    source_commit = $commit
    product_version = $package.version
    target = 'windows-x64'
    candidate = 'candidate-a'
    archive_sha256 = $candidates[0].archive_sha256
    pkg_04_receipt_sha256 = $receiptHash
    package_smoke = 'passed'
    worker_handoff_smoke = 'passed'
    native_binary_smoke = 'passed'
}
$bindingPath = Join-Path $evidenceRoot 'INT-13-BINDING.json'
Write-JsonUtf8NoBom $bindingPath $binding 5
Write-Output "PKG-04 PASS: $receiptPath"
Write-Output "INT-13 BOUND: $bindingPath"
