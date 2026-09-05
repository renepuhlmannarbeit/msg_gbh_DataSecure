# Test-only cleanup. Contexts are created here for a NEW random root; this file
# has no entry point for resuming cleanup of an existing test directory.
function Initialize-NativeTestIdentity([string] $FreshRoot) {
    if ('DataSecure.NativeTestIdentity' -as [type]) { return }
    $source = @'
using System;
using System.Runtime.InteropServices;
using System.Text;
using Microsoft.Win32.SafeHandles;
namespace DataSecure {
  public sealed class NativeTestMountPoint {
    public uint Tag;
    public string Target, Identity;
    public int PrintNameLength;
  }
  public static class NativeTestIdentity {
    [StructLayout(LayoutKind.Sequential)]
    private struct Info {
      public uint Attributes, CreationLow, CreationHigh, AccessLow, AccessHigh,
        WriteLow, WriteHigh, Volume, SizeHigh, SizeLow, Links, IndexHigh, IndexLow;
    }
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
    private static extern SafeFileHandle CreateFile(string path, uint access,
      uint share, IntPtr security, uint creation, uint flags, IntPtr template);
    [DllImport("kernel32.dll", SetLastError=true)]
    private static extern bool GetFileInformationByHandle(SafeFileHandle handle, out Info info);
    [DllImport("kernel32.dll", SetLastError=true)]
    private static extern bool DeviceIoControl(SafeFileHandle handle, uint control,
      IntPtr input, uint inputLength, byte[] output, uint outputLength,
      out uint returned, IntPtr overlapped);
    private static string Identity(Info info) {
      return info.Volume.ToString("x8") + ":" + info.IndexHigh.ToString("x8") + info.IndexLow.ToString("x8");
    }
    public static string Read(string path) {
      // Metadata-only handle to the link itself, never its target.
      using (var handle = CreateFile(path, 0, 7, IntPtr.Zero, 3, 0x02200000, IntPtr.Zero)) {
        if (handle.IsInvalid) throw new InvalidOperationException("STANDALONE_NATIVE_IDENTITY_FAILED:" + Marshal.GetLastWin32Error());
        Info info;
        if (!GetFileInformationByHandle(handle, out info)) throw new InvalidOperationException("STANDALONE_NATIVE_IDENTITY_FAILED:" + Marshal.GetLastWin32Error());
        return Identity(info);
      }
    }
    public static string DecodeMountPoint(byte[] buffer, int returned) {
      // REPARSE_DATA_BUFFER: common header 8 bytes, mount-point fields 8 bytes,
      // then UTF-16 PathBuffer. Offset/length fields count BYTES, not chars.
      if (buffer == null || returned < 16 || returned > 16384 || returned > buffer.Length ||
          BitConverter.ToUInt32(buffer, 0) != 0xa0000003u ||
          BitConverter.ToUInt16(buffer, 4) != returned - 8) {
        throw new InvalidOperationException("STANDALONE_NATIVE_REPARSE_INVALID");
      }
      int offset = BitConverter.ToUInt16(buffer, 8), length = BitConverter.ToUInt16(buffer, 10);
      int printOffset = BitConverter.ToUInt16(buffer, 12), printLength = BitConverter.ToUInt16(buffer, 14);
      int available = returned - 16;
      if ((offset | length | printOffset | printLength) % 2 != 0 || length == 0 ||
          offset + length > available || printOffset + printLength > available) {
        throw new InvalidOperationException("STANDALONE_NATIVE_REPARSE_INVALID");
      }
      var utf16 = new UnicodeEncoding(false, false, true);
      string substitute;
      // PrintName is display-only and legitimately empty for Windows cache
      // junctions. Validate its encoding/bounds but never use it as the target.
      try {
        substitute = utf16.GetString(buffer, 16 + offset, length);
        utf16.GetString(buffer, 16 + printOffset, printLength);
      } catch (ArgumentException) {
        throw new InvalidOperationException("STANDALONE_NATIVE_REPARSE_INVALID");
      }
      if (!substitute.StartsWith(@"\??\", StringComparison.Ordinal) || substitute.IndexOf('\0') >= 0) {
        throw new InvalidOperationException("STANDALONE_NATIVE_REPARSE_INVALID");
      }
      return substitute.Substring(4);
    }
    public static NativeTestMountPoint ReadMountPoint(string path) {
      using (var handle = CreateFile(path, 0, 7, IntPtr.Zero, 3, 0x02200000, IntPtr.Zero)) {
        if (handle.IsInvalid) throw new InvalidOperationException("STANDALONE_NATIVE_REPARSE_READ_FAILED");
        Info info;
        if (!GetFileInformationByHandle(handle, out info) || (info.Attributes & 0x410) != 0x410) {
          throw new InvalidOperationException("STANDALONE_NATIVE_REPARSE_INVALID");
        }
        var bytes = new byte[16384];
        uint returned;
        // FSCTL_GET_REPARSE_POINT is read-only and the handle is no-follow.
        if (!DeviceIoControl(handle, 0x000900a8, IntPtr.Zero, 0, bytes,
            (uint)bytes.Length, out returned, IntPtr.Zero)) {
          throw new InvalidOperationException("STANDALONE_NATIVE_REPARSE_READ_FAILED");
        }
        return new NativeTestMountPoint { Tag = BitConverter.ToUInt32(bytes, 0),
          Target = DecodeMountPoint(bytes, (int)returned), Identity = Identity(info),
          PrintNameLength = BitConverter.ToUInt16(bytes, 14) };
      }
    }
  }
}
'@
    if ($PSVersionTable.PSVersion.Major -lt 6) {
        # Windows PowerShell's compiler scratch files also belong to this NEW
        # test root, not the user's normal temporary/profile directories.
        $compilerRoot = Join-Path $FreshRoot 'identity-compiler'
        New-Item -ItemType Directory -Path $compilerRoot -ErrorAction Stop | Out-Null
        $parameters = [System.CodeDom.Compiler.CompilerParameters]::new()
        $parameters.GenerateInMemory = $true
        $parameters.TempFiles = [System.CodeDom.Compiler.TempFileCollection]::new($compilerRoot, $false)
        Add-Type -TypeDefinition $source -Language CSharp -CompilerParameters $parameters -ErrorAction Stop
    } else {
        Add-Type -TypeDefinition $source -Language CSharp -ErrorAction Stop
    }
}

function Get-NativeEntryStamp($Item, [switch] $MetadataOnly) {
    [pscustomobject]@{
        Path = $Item.FullName
        Directory = [bool] $Item.PSIsContainer
        Created = $Item.CreationTimeUtc.Ticks
        Reparse = [bool] ($Item.Attributes -band [System.IO.FileAttributes]::ReparsePoint)
        Identity = if ($MetadataOnly) { $null } else { [DataSecure.NativeTestIdentity]::Read($Item.FullName) }
    }
}

function Assert-NativeRoot($Context) {
    $root = [System.IO.Path]::GetFullPath($Context.Root)
    if ([System.IO.Path]::GetDirectoryName($root) -ne $Context.Parent -or
        [System.IO.Path]::GetFileName($root) -cnotmatch '^\.tmp-standalone-native-[a-f0-9]{32}$') {
        throw 'STANDALONE_NATIVE_CLEANUP_UNSAFE'
    }
    foreach ($stamp in $Context.Ancestors) {
        $item = Get-Item -LiteralPath $stamp.Path -Force -ErrorAction Stop
        if (-not $item.PSIsContainer -or ($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -or
            $item.CreationTimeUtc.Ticks -ne $stamp.Created -or
            ($stamp.Identity -and [DataSecure.NativeTestIdentity]::Read($stamp.Path) -ne $stamp.Identity)) {
            throw 'STANDALONE_NATIVE_CLEANUP_PARENT_CHANGED'
        }
    }
}

function New-NativeCleanupContext([string] $Parent) {
    $parentPath = [System.IO.Path]::GetFullPath($Parent)
    $ancestors = [System.Collections.Generic.List[object]]::new()
    for ($current = $parentPath; $current; $current = [System.IO.Path]::GetDirectoryName($current)) {
        $item = Get-Item -LiteralPath $current -Force -ErrorAction Stop
        if (-not $item.PSIsContainer -or ($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint)) {
            throw 'STANDALONE_NATIVE_ROOT_UNSAFE'
        }
        $ancestors.Add([pscustomobject]@{ Path = $item.FullName; Created = $item.CreationTimeUtc.Ticks })
    }
    $root = Join-Path $parentPath ".tmp-standalone-native-$([Guid]::NewGuid().ToString('N'))"
    $created = New-Item -ItemType Directory -Path $root -ErrorAction Stop
    $ancestors.Add([pscustomobject]@{ Path = $created.FullName; Created = $created.CreationTimeUtc.Ticks })
    Initialize-NativeTestIdentity $root
    $bound = foreach ($stamp in $ancestors) {
        $item = Get-Item -LiteralPath $stamp.Path -Force -ErrorAction Stop
        if (-not $item.PSIsContainer -or ($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -or
            $item.CreationTimeUtc.Ticks -ne $stamp.Created) { throw 'STANDALONE_NATIVE_ROOT_UNSAFE' }
        # Bind file IDs for the repository and every owned object. Higher user/
        # system ancestors require no additional handle access; all are still
        # checked for replacement metadata and reparse points on every action.
        Get-NativeEntryStamp $item -MetadataOnly:($stamp.Path -ne $parentPath -and $stamp.Path -ne $root)
    }
    [pscustomobject]@{ Root = $root; Parent = $parentPath; Ancestors = @($bound); Directories = @{} }
}

function Assert-NativePathParents($Context, [string] $Path) {
    Assert-NativeRoot $Context
    $full = [System.IO.Path]::GetFullPath($Path)
    if (-not $full.StartsWith($Context.Root + '\', [System.StringComparison]::OrdinalIgnoreCase)) {
        throw 'STANDALONE_NATIVE_CLEANUP_UNSAFE'
    }
    for ($directory = [System.IO.Path]::GetDirectoryName($full); $directory -ne $Context.Root;
        $directory = [System.IO.Path]::GetDirectoryName($directory)) {
        if (-not $directory) { throw 'STANDALONE_NATIVE_CLEANUP_UNSAFE' }
        $item = Get-Item -LiteralPath $directory -Force -ErrorAction Stop
        if (-not $item.PSIsContainer -or ($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint)) {
            throw 'STANDALONE_NATIVE_CLEANUP_PARENT_CHANGED'
        }
        $identity = [DataSecure.NativeTestIdentity]::Read($directory)
        if ($Context.Directories.ContainsKey($directory) -and $Context.Directories[$directory] -ne $identity) {
            throw 'STANDALONE_NATIVE_CLEANUP_PARENT_CHANGED'
        }
        $Context.Directories[$directory] = $identity
    }
}

function Get-NativeCacheJunction($Context, $Item) {
    Assert-NativePathParents $Context $Item.FullName
    $expectedLink = Join-Path $Context.Root 'profile\AppData\Local\Microsoft\Windows\INetCache\Content.IE5'
    $expectedTarget = Join-Path ([System.IO.Path]::GetDirectoryName($expectedLink)) 'IE'
    if ($Item.FullName -ne $expectedLink -or -not $Item.PSIsContainer -or
        -not ($Item.Attributes -band [System.IO.FileAttributes]::ReparsePoint)) {
        throw 'STANDALONE_NATIVE_CLEANUP_REPARSE_POINT'
    }
    # Windows PowerShell 5 can report null LinkType/Target for real OS-created
    # cache junctions. Provider display properties are not a safety boundary.
    try { $native = [DataSecure.NativeTestIdentity]::ReadMountPoint($Item.FullName) }
    catch { throw 'STANDALONE_NATIVE_CLEANUP_REPARSE_POINT' }
    if ($native.Tag -ne [uint32] 2684354563 -or $native.Target -ne $expectedTarget) {
        throw 'STANDALONE_NATIVE_CLEANUP_REPARSE_POINT'
    }
    Assert-NativePathParents $Context $expectedTarget
    $target = Get-Item -LiteralPath $expectedTarget -Force -ErrorAction Stop
    if (-not $target.PSIsContainer -or ($target.Attributes -band [System.IO.FileAttributes]::ReparsePoint)) {
        throw 'STANDALONE_NATIVE_CLEANUP_REPARSE_POINT'
    }
    [pscustomobject]@{
        Path = $Item.FullName; Directory = $true; Created = $Item.CreationTimeUtc.Ticks
        Reparse = $true; Target = $expectedTarget; TargetCreated = $target.CreationTimeUtc.Ticks
        Identity = $native.Identity
        TargetIdentity = [DataSecure.NativeTestIdentity]::Read($expectedTarget)
    }
}

function Get-CheckedNativeTree($Context, [switch] $AllowCacheJunction) {
    Assert-NativeRoot $Context
    $entries = [System.Collections.Generic.List[object]]::new()
    $directories = [System.Collections.Generic.Queue[string]]::new()
    $directories.Enqueue($Context.Root)
    while ($directories.Count -gt 0) {
        $directory = $directories.Dequeue()
        if ($directory -ne $Context.Root) { Assert-NativePathParents $Context (Join-Path $directory '.entry') }
        foreach ($entry in @(Get-ChildItem -LiteralPath $directory -Force -ErrorAction Stop)) {
            Assert-NativePathParents $Context $entry.FullName
            if ($entry.Attributes -band [System.IO.FileAttributes]::ReparsePoint) {
                if (-not $AllowCacheJunction) { throw 'STANDALONE_NATIVE_CLEANUP_REPARSE_POINT' }
                $entries.Add((Get-NativeCacheJunction $Context $entry))
                continue # The junction is a leaf, NEVER a directory to visit.
            }
            $entries.Add((Get-NativeEntryStamp $entry))
            if ($entry.PSIsContainer) { $directories.Enqueue($entry.FullName) }
        }
    }
    return $entries.ToArray()
}

function Remove-NativeCacheJunction($Context, $Stamp) {
    Assert-NativePathParents $Context $Stamp.Path
    $now = Get-NativeCacheJunction $Context (Get-Item -LiteralPath $Stamp.Path -Force -ErrorAction Stop)
    if ($now.Created -ne $Stamp.Created -or $now.Target -ne $Stamp.Target -or
        $now.TargetCreated -ne $Stamp.TargetCreated -or $now.Identity -ne $Stamp.Identity -or
        $now.TargetIdentity -ne $Stamp.TargetIdentity) { throw 'STANDALONE_NATIVE_CLEANUP_CHANGED' }
    # Delete(String), not Delete(String, true): unlink only. No shell, traversal,
    # retry, ACL change or alternative primitive if Windows refuses deletion.
    [System.IO.Directory]::Delete($Stamp.Path)
    Assert-NativePathParents $Context $Stamp.Target
    $target = Get-Item -LiteralPath $Stamp.Target -Force -ErrorAction Stop
    if (-not $target.PSIsContainer -or ($target.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -or
        $target.CreationTimeUtc.Ticks -ne $Stamp.TargetCreated -or
        [DataSecure.NativeTestIdentity]::Read($Stamp.Target) -ne $Stamp.TargetIdentity) {
        throw 'STANDALONE_NATIVE_CLEANUP_CHANGED'
    }
}

function Remove-NativeTestTree($Context, [switch] $AllowCacheJunction) {
    # Enumerate and validate the complete tree BEFORE removing any entry.
    $entries = @(Get-CheckedNativeTree $Context -AllowCacheJunction:$AllowCacheJunction)
    Write-Output "STANDALONE NATIVE CLEANUP: $($entries.Count) owned entries"
    foreach ($link in @($entries | Where-Object { $_.Reparse })) {
        Remove-NativeCacheJunction $Context $link
    }
    foreach ($stamp in @($entries | Where-Object { -not $_.Reparse } | Sort-Object { $_.Path.Length } -Descending)) {
        Assert-NativePathParents $Context $stamp.Path
        $item = Get-Item -LiteralPath $stamp.Path -Force -ErrorAction Stop
        if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -or
            $item.PSIsContainer -ne $stamp.Directory -or $item.CreationTimeUtc.Ticks -ne $stamp.Created -or
            [DataSecure.NativeTestIdentity]::Read($stamp.Path) -ne $stamp.Identity) {
            throw 'STANDALONE_NATIVE_CLEANUP_CHANGED'
        }
        if ($item.PSIsContainer -and @(Get-ChildItem -LiteralPath $stamp.Path -Force -ErrorAction Stop).Count -gt 0) {
            throw 'STANDALONE_NATIVE_CLEANUP_DIRECTORY_BUSY'
        }
        Remove-Item -LiteralPath $stamp.Path -Force -ErrorAction Stop
    }
    Assert-NativeRoot $Context
    if (@(Get-ChildItem -LiteralPath $Context.Root -Force -ErrorAction Stop).Count -gt 0) {
        throw 'STANDALONE_NATIVE_CLEANUP_DIRECTORY_BUSY'
    }
    Remove-Item -LiteralPath $Context.Root -Force -ErrorAction Stop
}
