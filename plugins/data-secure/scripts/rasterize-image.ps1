param([Parameter(Mandatory=$true)][string]$InputPath,[Parameter(Mandatory=$true)][string]$OutputPath)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
$ext=[IO.Path]::GetExtension($InputPath).ToLowerInvariant()
if($ext -eq '.svg'){ throw 'SVG rasterization is not available in the bundled Windows bridge. Export SVG to PNG manually for review.' }
$img=[System.Drawing.Image]::FromFile($InputPath)
try {
  $bmp=New-Object System.Drawing.Bitmap $img.Width,$img.Height,[System.Drawing.Imaging.PixelFormat]::Format32bppArgb
  try {
    $g=[System.Drawing.Graphics]::FromImage($bmp)
    try { $g.Clear([System.Drawing.Color]::White); $g.DrawImage($img,0,0,$img.Width,$img.Height) } finally { $g.Dispose() }
    $bmp.Save($OutputPath,[System.Drawing.Imaging.ImageFormat]::Png)
  } finally { $bmp.Dispose() }
} finally { $img.Dispose() }
