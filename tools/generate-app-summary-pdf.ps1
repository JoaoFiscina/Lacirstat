$ErrorActionPreference = 'Stop'

function Escape-PdfText {
  param([string]$Text)

  if ($null -eq $Text) { return '' }

  return $Text.Replace('\', '\\').Replace('(', '\(').Replace(')', '\)')
}

function Wrap-Text {
  param(
    [string]$Text,
    [int]$MaxChars = 90
  )

  $source = ($Text -replace '\s+', ' ').Trim()
  if (-not $source) { return @('') }

  $words = $source -split ' '
  $lines = New-Object System.Collections.Generic.List[string]
  $current = ''

  foreach ($word in $words) {
    if (-not $current) {
      $current = $word
      continue
    }

    if (($current.Length + 1 + $word.Length) -le $MaxChars) {
      $current = "$current $word"
    } else {
      $lines.Add($current)
      $current = $word
    }
  }

  if ($current) {
    $lines.Add($current)
  }

  return $lines.ToArray()
}

function Add-Line {
  param(
    [System.Collections.Generic.List[string]]$Commands,
    [string]$Font,
    [double]$FontSize,
    [double]$X,
    [double]$Y,
    [string]$Text
  )

  $safe = Escape-PdfText $Text
  $Commands.Add("BT /$Font $FontSize Tf 1 0 0 1 $X $Y Tm ($safe) Tj ET")
}

function Add-WrappedBlock {
  param(
    [System.Collections.Generic.List[string]]$Commands,
    [string]$Font,
    [double]$FontSize,
    [double]$X,
    [double]$Y,
    [string]$Text,
    [int]$MaxChars,
    [double]$LineHeight
  )

  $cursorY = $Y
  foreach ($line in (Wrap-Text -Text $Text -MaxChars $MaxChars)) {
    Add-Line -Commands $Commands -Font $Font -FontSize $FontSize -X $X -Y $cursorY -Text $line
    $cursorY -= $LineHeight
  }

  return $cursorY
}

$outputDir = Join-Path $PSScriptRoot '..\deliverables'
$outputPath = Join-Path $outputDir 'lacirstat-app-summary.pdf'
[System.IO.Directory]::CreateDirectory($outputDir) | Out-Null

$commands = New-Object System.Collections.Generic.List[string]

$pageWidth = 595
$pageHeight = 842
$left = 42
$right = 553
$y = 806

$commands.Add('0.20 0.33 0.54 rg')
Add-Line -Commands $commands -Font 'F2' -FontSize 18 -X $left -Y $y -Text 'Lacirstat App Summary'
$y -= 18
$commands.Add('0.65 G 42 782 m 553 782 l S')
$y -= 18
$commands.Add('0 g')

Add-Line -Commands $commands -Font 'F2' -FontSize 11.5 -X $left -Y $y -Text 'What it is'
$y -= 14
$y = Add-WrappedBlock -Commands $commands -Font 'F1' -FontSize 9.8 -X $left -Y $y -MaxChars 98 -LineHeight 11.5 -Text 'Static, browser-based biostatistics toolkit for LACIR training. It loads statistical tests as independent front-end modules and helps users analyze spreadsheet-style or DATASUS-derived data with guided interpretation.'
$y -= 8

Add-Line -Commands $commands -Font 'F2' -FontSize 11.5 -X $left -Y $y -Text "Who it's for"
$y -= 14
$y = Add-WrappedBlock -Commands $commands -Font 'F1' -FontSize 9.8 -X $left -Y $y -MaxChars 98 -LineHeight 11.5 -Text 'Primary persona: LACIR researchers, trainees, or health-study analysts who need a didactic interface to run common statistical tests from spreadsheets, Excel pastes, or DATASUS exports without a backend setup.'
$y -= 8

Add-Line -Commands $commands -Font 'F2' -FontSize 11.5 -X $left -Y $y -Text 'What it does'
$y -= 14
$featureBullets = @(
  'Manifest-driven menu loads three test modules: Student''s t, Pearson/Spearman correlation, and Prais-Winsten trend analysis.',
  'Accepts local tabular inputs including pasted Excel ranges, delimited text, and parser support for workbook tables in XLSX.',
  'Normalizes PT-BR numeric formats, decimal commas, delimiter/header patterns, and suspected mojibake/encoding issues.',
  'Provides empty/example templates and guided entry flows for supported analyses.',
  'Includes a DATASUS import/normalization wizard and reuses the last confirmed DATASUS session across modules.',
  'Runs calculations in the browser and renders previews, metrics, confidence intervals, classifications, and interpretation cards.'
)
foreach ($bullet in $featureBullets) {
  $y = Add-WrappedBlock -Commands $commands -Font 'F1' -FontSize 9.6 -X ($left + 10) -Y $y -MaxChars 92 -LineHeight 10.8 -Text "- $bullet"
}
$y -= 6

Add-Line -Commands $commands -Font 'F2' -FontSize 11.5 -X $left -Y $y -Text 'How it works'
$y -= 14
$archBullets = @(
  'UI shell: index.html loads assets/css/styles.css and assets/js/app.js.',
  'Loader flow: app.js fetches tests-manifest.json, builds navigation, fetches each module config.json, validates module.js, and dynamic-imports the selected module.',
  'Shared logic: app.js supplies browser-side utils, statistical functions, and shared DATASUS session state on window.__LACIR_SHARED__.',
  'Data helpers: tabular-data-input.js parses delimited text/XLSX; datasus-importer.js, datasus-normalizer.js, and datasus-wizard.js prepare DATASUS data.',
  'Feature modules live under tests/t-student, tests/correlacao, and tests/prais-winsten, each with local config and module code.',
  'Backend/services/API endpoints: Not found in repo.'
)
foreach ($bullet in $archBullets) {
  $y = Add-WrappedBlock -Commands $commands -Font 'F1' -FontSize 9.4 -X ($left + 10) -Y $y -MaxChars 92 -LineHeight 10.4 -Text "- $bullet"
}
$y -= 6

Add-Line -Commands $commands -Font 'F2' -FontSize 11.5 -X $left -Y $y -Text 'How to run'
$y -= 14
$runBullets = @(
  'Serve the repo over HTTP/HTTPS; app.js blocks direct file:// loading and suggests GitHub Pages or a simple local server.',
  'Open the served index.html page in a browser.',
  'Pick a test from the left nav; the app then loads its local config.json and module.js files.',
  'Upload, paste, or sample-load data and run the analysis.',
  'Exact local start command or package script: Not found in repo.'
)
foreach ($bullet in $runBullets) {
  $y = Add-WrappedBlock -Commands $commands -Font 'F1' -FontSize 9.4 -X ($left + 10) -Y $y -MaxChars 92 -LineHeight 10.4 -Text "- $bullet"
}

$content = ($commands -join "`n") + "`n"
$contentBytes = [System.Text.Encoding]::ASCII.GetBytes($content)

$objects = New-Object System.Collections.Generic.List[byte[]]

function Add-ObjectBytes {
  param([string]$Value)
  $objects.Add([System.Text.Encoding]::ASCII.GetBytes($Value))
}

Add-ObjectBytes "1 0 obj`n<< /Type /Catalog /Pages 2 0 R >>`nendobj`n"
Add-ObjectBytes "2 0 obj`n<< /Type /Pages /Count 1 /Kids [3 0 R] >>`nendobj`n"
Add-ObjectBytes "3 0 obj`n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 $pageWidth $pageHeight] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>`nendobj`n"
Add-ObjectBytes ("4 0 obj`n<< /Length {0} >>`nstream`n" -f $contentBytes.Length)
$objects.Add($contentBytes)
Add-ObjectBytes "`nendstream`nendobj`n"
Add-ObjectBytes "5 0 obj`n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`nendobj`n"
Add-ObjectBytes "6 0 obj`n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>`nendobj`n"

$stream = New-Object System.IO.MemoryStream
$writer = New-Object System.IO.BinaryWriter($stream)

$header = [System.Text.Encoding]::ASCII.GetBytes("%PDF-1.4`n")
$writer.Write($header)

$offsets = New-Object System.Collections.Generic.List[int]
$offsets.Add(0)

foreach ($obj in $objects) {
  $offsets.Add([int]$stream.Position)
  $writer.Write($obj)
}

$xrefStart = [int]$stream.Position
$writer.Write([System.Text.Encoding]::ASCII.GetBytes("xref`n0 7`n"))
$writer.Write([System.Text.Encoding]::ASCII.GetBytes("0000000000 65535 f `n"))

for ($i = 1; $i -le 6; $i += 1) {
  $writer.Write([System.Text.Encoding]::ASCII.GetBytes(("{0:0000000000} 00000 n `n" -f $offsets[$i])))
}

$trailer = "trailer`n<< /Size 7 /Root 1 0 R >>`nstartxref`n$xrefStart`n%%EOF"
$writer.Write([System.Text.Encoding]::ASCII.GetBytes($trailer))
$writer.Flush()

[System.IO.File]::WriteAllBytes($outputPath, $stream.ToArray())
$writer.Dispose()
$stream.Dispose()

Write-Output $outputPath
