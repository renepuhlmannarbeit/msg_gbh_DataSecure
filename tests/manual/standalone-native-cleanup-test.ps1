$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'standalone-native-cleanup.ps1')
$repository = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..')).Path

function Assert-Test($Condition, [string] $Message) {
    if (-not $Condition) { throw "NATIVE_CLEANUP_TEST_FAILED:$Message" }
}
function Assert-Refused([scriptblock] $Action, [string] $Code) {
    $observed = $null
    try { & $Action | Out-Null } catch { $observed = $_.Exception.Message }
    Assert-Test ($observed -eq $Code) "expected $Code, got $observed"
}
function New-Fixture {
    $context = New-NativeCleanupContext $repository
    $cache = Join-Path $context.Root 'profile\AppData\Local\Microsoft\Windows\INetCache'
    $target = Join-Path $cache 'IE'
    New-Item -ItemType Directory -Path $target -ErrorAction Stop | Out-Null
    $sentinel = Join-Path $target 'synthetic-sentinel.txt'
    [System.IO.File]::WriteAllText($sentinel, 'synthetic-owned-content')
    [pscustomobject]@{ Context = $context; Cache = $cache; Target = $target;
        Link = (Join-Path $cache 'Content.IE5'); Sentinel = $sentinel }
}
function New-FixtureLink($Fixture, [string] $Path, [string] $Target) {
    Assert-NativePathParents $Fixture.Context $Path
    New-Item -ItemType Junction -Path $Path -Target $Target -ErrorAction Stop | Out-Null
    [pscustomobject]@{ Path = $Path; Target = $Target; Identity = [DataSecure.NativeTestIdentity]::Read($Path) }
}
function Remove-FixtureLink($Fixture, $CreatedLink) {
    # Test-fixture teardown, NOT a fallback to a failed cleanup operation.
    # Every negative case below invokes validation only, never failed deletion.
    Assert-NativePathParents $Fixture.Context $CreatedLink.Path
    $item = Get-Item -LiteralPath $CreatedLink.Path -Force -ErrorAction Stop
    Assert-Test ($item.LinkType -ceq 'Junction' -and @($item.Target).Count -eq 1 -and
        $item.Target[0] -eq $CreatedLink.Target -and
        [DataSecure.NativeTestIdentity]::Read($CreatedLink.Path) -eq $CreatedLink.Identity) 'fixture link identity'
    [System.IO.Directory]::Delete($CreatedLink.Path)
}

$fixture = New-Fixture
$null = New-FixtureLink $fixture $fixture.Link $fixture.Target
Assert-Refused { Get-CheckedNativeTree $fixture.Context } 'STANDALONE_NATIVE_CLEANUP_REPARSE_POINT'
$entries = @(Get-CheckedNativeTree $fixture.Context -AllowCacheJunction)
$links = @($entries | Where-Object Reparse)
Assert-Test ($links.Count -eq 1) 'one exact allowed leaf'
Assert-Test (@($entries | Where-Object { $_.Path.StartsWith($fixture.Link + '\') }).Count -eq 0) 'junction never traversed'
Remove-NativeCacheJunction $fixture.Context $links[0]
Assert-Test ([System.IO.File]::ReadAllText($fixture.Sentinel) -eq 'synthetic-owned-content') 'target survives unlink'
Remove-NativeTestTree $fixture.Context
Write-Output 'PASS exact cache leaf; pre-start rejection; sentinel survives unlink'

foreach ($case in @('wrong-name', 'wrong-target', 'outside-root')) {
    $fixture = New-Fixture
    $outside = $null
    if ($case -eq 'outside-root') {
        $outside = New-Fixture
        $target = $outside.Target
    } elseif ($case -eq 'wrong-target') {
        $target = Join-Path $fixture.Context.Root 'other-synthetic-target'
        New-Item -ItemType Directory -Path $target -ErrorAction Stop | Out-Null
    } else { $target = $fixture.Target }
    $link = if ($case -eq 'wrong-name') { Join-Path $fixture.Cache 'UnexpectedAlias' } else { $fixture.Link }
    $createdLink = New-FixtureLink $fixture $link $target
    Assert-Refused { Get-CheckedNativeTree $fixture.Context -AllowCacheJunction } 'STANDALONE_NATIVE_CLEANUP_REPARSE_POINT'
    Assert-Test (Test-Path -LiteralPath $fixture.Sentinel -PathType Leaf) 'validation deletes nothing'
    if ($outside) { Assert-Test (Test-Path -LiteralPath $outside.Sentinel -PathType Leaf) 'outside sentinel remains' }
    Remove-FixtureLink $fixture $createdLink
    Remove-NativeTestTree $fixture.Context
    if ($outside) { Remove-NativeTestTree $outside.Context }
    Write-Output "PASS reject $case before deletion"
}

$fixture = New-Fixture
$createdLink = New-FixtureLink $fixture $fixture.Link $fixture.Target
$stamp = @(Get-CheckedNativeTree $fixture.Context -AllowCacheJunction | Where-Object Reparse)[0]
# Rename retains the old object. A replacement at the same pathname, with the
# same target and even an equal creation-time stamp, must still be refused.
$held = Join-Path $fixture.Cache 'Content.IE5-held'
Assert-Test (-not (Test-Path -LiteralPath $held)) 'fresh held name'
Assert-NativePathParents $fixture.Context $fixture.Link
Rename-Item -LiteralPath $fixture.Link -NewName 'Content.IE5-held' -ErrorAction Stop
$replacement = New-FixtureLink $fixture $fixture.Link $fixture.Target
$stamp.Created = (Get-Item -LiteralPath $fixture.Link -Force).CreationTimeUtc.Ticks
Assert-Test ($replacement.Identity -ne $stamp.Identity) 'replacement has distinct native identity'
Assert-Refused { Remove-NativeCacheJunction $fixture.Context $stamp } 'STANDALONE_NATIVE_CLEANUP_CHANGED'
Assert-Test (Test-Path -LiteralPath $fixture.Sentinel -PathType Leaf) 'replacement refusal preserves target'
Remove-FixtureLink $fixture $replacement
Assert-NativePathParents $fixture.Context $held
Assert-Test ([DataSecure.NativeTestIdentity]::Read($held) -eq $createdLink.Identity) 'held link still owned'
Rename-Item -LiteralPath $held -NewName 'Content.IE5' -ErrorAction Stop
Remove-NativeTestTree $fixture.Context -AllowCacheJunction
Write-Output 'PASS replaced link at same pathname and same target'

$fixture = New-Fixture
$null = New-FixtureLink $fixture $fixture.Link $fixture.Target
Get-CheckedNativeTree $fixture.Context -AllowCacheJunction | Out-Null
$heldCache = Join-Path ([System.IO.Path]::GetDirectoryName($fixture.Cache)) 'INetCache-held'
Assert-Test (-not (Test-Path -LiteralPath $heldCache)) 'fresh held parent name'
Assert-NativePathParents $fixture.Context $fixture.Cache
$cacheIdentity = [DataSecure.NativeTestIdentity]::Read($fixture.Cache)
Rename-Item -LiteralPath $fixture.Cache -NewName 'INetCache-held' -ErrorAction Stop
$replacementCache = New-Item -ItemType Directory -Path $fixture.Cache -ErrorAction Stop
$replacementIdentity = [DataSecure.NativeTestIdentity]::Read($replacementCache.FullName)
Assert-Refused { Get-CheckedNativeTree $fixture.Context -AllowCacheJunction } 'STANDALONE_NATIVE_CLEANUP_PARENT_CHANGED'
Assert-NativePathParents $fixture.Context $fixture.Cache
Assert-Test ([DataSecure.NativeTestIdentity]::Read($fixture.Cache) -eq $replacementIdentity -and
    @(Get-ChildItem -LiteralPath $fixture.Cache -Force).Count -eq 0) 'owned empty replacement parent'
Remove-Item -LiteralPath $fixture.Cache -ErrorAction Stop
Assert-NativePathParents $fixture.Context $heldCache
Assert-Test ([DataSecure.NativeTestIdentity]::Read($heldCache) -eq $cacheIdentity) 'held parent still owned'
Rename-Item -LiteralPath $heldCache -NewName 'INetCache' -ErrorAction Stop
Remove-NativeTestTree $fixture.Context -AllowCacheJunction
Write-Output 'PASS replaced regular parent rejected before traversal'

$fixture = New-Fixture
$null = New-FixtureLink $fixture $fixture.Link $fixture.Target
Get-CheckedNativeTree $fixture.Context -AllowCacheJunction | Out-Null
$heldCache = Join-Path ([System.IO.Path]::GetDirectoryName($fixture.Cache)) 'INetCache-held'
Assert-Test (-not (Test-Path -LiteralPath $heldCache)) 'fresh held junction parent name'
Assert-NativePathParents $fixture.Context $fixture.Cache
$cacheIdentity = [DataSecure.NativeTestIdentity]::Read($fixture.Cache)
Rename-Item -LiteralPath $fixture.Cache -NewName 'INetCache-held' -ErrorAction Stop
$parentLink = New-FixtureLink $fixture $fixture.Cache $heldCache
Assert-Refused { Get-CheckedNativeTree $fixture.Context -AllowCacheJunction } 'STANDALONE_NATIVE_CLEANUP_REPARSE_POINT'
Remove-FixtureLink $fixture $parentLink
Assert-NativePathParents $fixture.Context $heldCache
Assert-Test ([DataSecure.NativeTestIdentity]::Read($heldCache) -eq $cacheIdentity) 'junction-held parent still owned'
Rename-Item -LiteralPath $heldCache -NewName 'INetCache' -ErrorAction Stop
Remove-NativeTestTree $fixture.Context -AllowCacheJunction
Write-Output 'PASS junction parent rejected without traversal'

$fixture = New-Fixture
$null = New-FixtureLink $fixture $fixture.Link $fixture.Target
$actual = Get-Item -LiteralPath $fixture.Link -Force -ErrorAction Stop
$nullProvider = [pscustomobject]@{ FullName = $actual.FullName; PSIsContainer = $actual.PSIsContainer;
    Attributes = $actual.Attributes; CreationTimeUtc = $actual.CreationTimeUtc; LinkType = $null; Target = $null }
$native = [DataSecure.NativeTestIdentity]::ReadMountPoint($fixture.Link)
Assert-Test ($native.Tag -eq [uint32] 2684354563 -and $native.Target -eq $fixture.Target) 'native tag and substitute target'
$bound = Get-NativeCacheJunction $fixture.Context $nullProvider
Assert-Test ($bound.Identity -eq $native.Identity -and $bound.Target -eq $fixture.Target) 'null provider properties use native proof'
Assert-Refused { Get-CheckedNativeTree $fixture.Context } 'STANDALONE_NATIVE_CLEANUP_REPARSE_POINT'

# Windows-created cache junctions need not have a PrintName. Exercise the exact
# native buffer decoder with empty PrintName, with and without null termination.
$substitute = [System.Text.Encoding]::Unicode.GetBytes(('\??\' + $fixture.Target))
foreach ($trailingNullBytes in @(0, 2)) {
    $bytes = [byte[]]::new(16 + $substitute.Length + $trailingNullBytes)
    [BitConverter]::GetBytes([uint32] 2684354563).CopyTo($bytes, 0)
    [BitConverter]::GetBytes([uint16] ($bytes.Length - 8)).CopyTo($bytes, 4)
    [BitConverter]::GetBytes([uint16] $substitute.Length).CopyTo($bytes, 10)
    $substitute.CopyTo($bytes, 16)
    Assert-Test ([DataSecure.NativeTestIdentity]::DecodeMountPoint($bytes, $bytes.Length) -eq $fixture.Target) 'empty PrintName decoder'
}
foreach ($case in @('wrong-tag', 'wrong-length', 'odd-offset', 'odd-print-length', 'empty-target', 'bad-utf16', 'bad-prefix', 'truncated')) {
    $invalid = [byte[]] $bytes.Clone()
    $returned = $invalid.Length
    switch ($case) {
        'wrong-tag' { [BitConverter]::GetBytes([uint32] 2684354572).CopyTo($invalid, 0) }
        'wrong-length' { [BitConverter]::GetBytes([uint16] 65534).CopyTo($invalid, 10) }
        'odd-offset' { $invalid[8] = 1 }
        'odd-print-length' { $invalid[14] = 1 }
        'empty-target' { $invalid[10] = 0; $invalid[11] = 0 }
        'bad-utf16' { $invalid[16] = 0; $invalid[17] = 216 }
        'bad-prefix' { $invalid[16] = 65 }
        'truncated' { $returned = 15 }
    }
    $failed = $false
    try { [DataSecure.NativeTestIdentity]::DecodeMountPoint($invalid, $returned) | Out-Null }
    catch { $failed = $_.Exception.ToString().Contains('STANDALONE_NATIVE_REPARSE_INVALID') }
    Assert-Test $failed "native decoder rejects $case"
}
Remove-NativeCacheJunction $fixture.Context $bound
Assert-Test ([System.IO.File]::ReadAllText($fixture.Sentinel) -eq 'synthetic-owned-content') 'null-provider unlink preserves sentinel'
Remove-NativeTestTree $fixture.Context
Write-Output 'PASS null provider metadata; native tag/target; empty PrintName; malformed native buffers rejected'

$fixture = New-Fixture
$vanishedPath = Join-Path $fixture.Context.Root 'vanished-after-enumeration.txt'
[System.IO.File]::WriteAllText($vanishedPath, 'ephemeral')
$staleItem = Get-Item -LiteralPath $vanishedPath -Force -ErrorAction Stop
Remove-Item -LiteralPath $vanishedPath -Force -ErrorAction Stop
$vanishedStamp = Get-NativeEntryStamp $staleItem -AllowVanished
Assert-Test ($null -eq $vanishedStamp) 'vanished entry is not stamped for deletion'
$null = [System.IO.File]::WriteAllText($vanishedPath, 'replacement-must-survive')
$observed = $null
try { Get-NativeEntryStamp $staleItem -AllowVanished | Out-Null } catch { $observed = $_.Exception.Message }
Assert-Test ($null -eq $observed) 'existing replacement remains an ordinary stamped entry'
$null = Get-NativeEntryStamp (Get-Item -LiteralPath $vanishedPath -Force -ErrorAction Stop)
Assert-Test ([System.IO.File]::ReadAllText($vanishedPath) -eq 'replacement-must-survive') 'stamping never deletes replacement'
Remove-NativeTestTree $fixture.Context
Write-Output 'PASS vanished inventory entry skipped; existing pathname never treated as absent'
Write-Output 'STANDALONE NATIVE CLEANUP CONTRACT PASS (9 groups)'
