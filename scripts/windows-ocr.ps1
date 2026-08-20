param([Parameter(Mandatory=$true)][string]$InputPath,[Parameter(Mandatory=$true)][string]$OutputPath,[string]$Language='de-DE')
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
[Windows.Storage.StorageFile,Windows.Storage,ContentType=WindowsRuntime] > $null
[Windows.Graphics.Imaging.BitmapDecoder,Windows.Graphics.Imaging,ContentType=WindowsRuntime] > $null
[Windows.Media.Ocr.OcrEngine,Windows.Media.Ocr,ContentType=WindowsRuntime] > $null
[Windows.Globalization.Language,Windows.Globalization,ContentType=WindowsRuntime] > $null
function Await($Op,$Type){
  $method=[System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 } | Select-Object -First 1
  $task=$method.MakeGenericMethod($Type).Invoke($null,@($Op)); $task.Wait(); return $task.Result
}
$file=Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync((Resolve-Path $InputPath).Path)) ([Windows.Storage.StorageFile])
$stream=Await ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
try {
  $decoder=Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
  $bitmap=Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
  $lang=New-Object Windows.Globalization.Language($Language)
  $engine=[Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage($lang)
  if($null -eq $engine){ $engine=[Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages() }
  if($null -eq $engine){ throw 'Windows OCR engine is not available.' }
  $result=Await ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
  $words=@(); foreach($line in $result.Lines){ foreach($w in $line.Words){ $r=$w.BoundingRect; $words += [pscustomobject]@{ text=$w.Text; bbox=[pscustomobject]@{x0=[double]$r.X;y0=[double]$r.Y;x1=[double]($r.X+$r.Width);y1=[double]($r.Y+$r.Height)} } } }
  $obj=[pscustomobject]@{ text=$result.Text; words=$words }
  [IO.File]::WriteAllText($OutputPath,($obj|ConvertTo-Json -Depth 6),[Text.UTF8Encoding]::new($false))
} finally { if($stream){$stream.Dispose()} }
