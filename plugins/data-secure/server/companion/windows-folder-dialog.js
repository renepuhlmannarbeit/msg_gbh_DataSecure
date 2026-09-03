'use strict';

// Modern Windows folder dialog for the two local folder choices (source folder
// and visible result folder). Windows PowerShell 5.1 runs on the .NET Framework,
// whose System.Windows.Forms.FolderBrowserDialog is the legacy "Ordner suchen"
// tree. The Explorer-style folder picker is the COM IFileOpenDialog with the
// FOS_PICKFOLDERS option; this module compiles a minimal interop wrapper at run
// time. If that compilation is unavailable on a device, the script falls back to
// the legacy dialog so the local choice never disappears. Only the selected
// path or the fixed cancellation token reach stdout, as before.

const INTEROP_SOURCE = String.raw`using System;
using System.Runtime.InteropServices;
namespace DataSecureDialog {
  [ComImport, Guid("42f85136-db7e-439c-85f1-e4075d135fc8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface IFileOpenDialog {
    [PreserveSig] int Show(IntPtr parent);
    void SetFileTypes(uint cFileTypes, IntPtr rgFilterSpec);
    void SetFileTypeIndex(uint iFileType);
    void GetFileTypeIndex(out uint piFileType);
    void Advise(IntPtr pfde, out uint pdwCookie);
    void Unadvise(uint dwCookie);
    void SetOptions(uint fos);
    void GetOptions(out uint pfos);
    void SetDefaultFolder(IntPtr psi);
    void SetFolder(IntPtr psi);
    void GetFolder(out IShellItem ppsi);
    void GetCurrentSelection(out IShellItem ppsi);
    void SetFileName([MarshalAs(UnmanagedType.LPWStr)] string pszName);
    void GetFileName([MarshalAs(UnmanagedType.LPWStr)] out string pszName);
    void SetTitle([MarshalAs(UnmanagedType.LPWStr)] string pszTitle);
    void SetOkButtonLabel([MarshalAs(UnmanagedType.LPWStr)] string pszText);
    void SetFileNameLabel([MarshalAs(UnmanagedType.LPWStr)] string pszLabel);
    void GetResult(out IShellItem ppsi);
    void AddPlace(IntPtr psi, int fdap);
    void SetDefaultExtension([MarshalAs(UnmanagedType.LPWStr)] string pszDefaultExtension);
    void Close(int hr);
    void SetClientGuid(ref Guid guid);
    void ClearClientData();
    void SetFilter(IntPtr pFilter);
    void GetResults(out IntPtr ppenum);
    void GetSelectedItems(out IntPtr ppsai);
  }
  [ComImport, Guid("43826d1e-e718-42ee-bc55-a1e261c37bfe"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface IShellItem {
    void BindToHandler(IntPtr pbc, ref Guid bhid, ref Guid riid, out IntPtr ppv);
    void GetParent(out IShellItem ppsi);
    void GetDisplayName(uint sigdnName, [MarshalAs(UnmanagedType.LPWStr)] out string ppszName);
    void GetAttributes(uint sfgaoMask, out uint psfgaoAttribs);
    void Compare(IShellItem psi, uint hint, out int piOrder);
  }
  [ComImport, Guid("DC1C5A9C-E88A-4dde-A5A1-60F82A20AEF7")]
  public class FileOpenDialogRCW { }
  public static class FolderPicker {
    // FOS_PICKFOLDERS | FOS_FORCEFILESYSTEM | FOS_NOCHANGEDIR | FOS_PATHMUSTEXIST
    const uint Options = 0x20 | 0x40 | 0x8 | 0x800;
    const uint SigdnFileSysPath = 0x80058000;
    public static string Pick(string title, string okLabel) {
      var dialog = (IFileOpenDialog)new FileOpenDialogRCW();
      uint current; dialog.GetOptions(out current);
      dialog.SetOptions(current | Options);
      dialog.SetTitle(title);
      dialog.SetOkButtonLabel(okLabel);
      if (dialog.Show(IntPtr.Zero) != 0) return null;
      IShellItem item; dialog.GetResult(out item);
      string selected; item.GetDisplayName(SigdnFileSysPath, out selected);
      return selected;
    }
  }
}`;

function quote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

// Returns the PowerShell command text. `preamble` is prepended verbatim (the
// UTF-8 console preamble of the pickers), so callers keep one shared prefix
// that tests can run without any dialog.
function windowsFolderDialogScript({ preamble, title, okLabel = 'Ordner auswählen', cancelledToken, showNewFolderButton = false }) {
  if (!title || !cancelledToken) throw new Error('WINDOWS_FOLDER_DIALOG_ARGUMENTS');
  const legacy = [
    '$dialog = New-Object System.Windows.Forms.FolderBrowserDialog',
    `$dialog.Description = ${quote(title)}`,
    `$dialog.ShowNewFolderButton = ${showNewFolderButton ? '$true' : '$false'}`,
    `try { $result = $dialog.ShowDialog(); if ($result -eq [System.Windows.Forms.DialogResult]::OK) { $selected = $dialog.SelectedPath } else { $selected = $null } } finally { $dialog.Dispose() }`
  ].join('; ');
  return [
    preamble,
    'Add-Type -AssemblyName System.Windows.Forms',
    `$modern = $true; try { Add-Type -TypeDefinition @'\n${INTEROP_SOURCE}\n'@ -ErrorAction Stop } catch { $modern = $false }`,
    `$dialog = $null; $selected = $null`,
    `if ($modern) { $selected = [DataSecureDialog.FolderPicker]::Pick(${quote(title)}, ${quote(okLabel)}) } else { ${legacy} }`,
    `if ($null -ne $selected -and $selected -ne '') { [Console]::Out.Write($selected) } else { [Console]::Out.Write(${quote(cancelledToken)}) }`
  ].join('; ');
}

module.exports = { windowsFolderDialogScript, INTEROP_SOURCE };
