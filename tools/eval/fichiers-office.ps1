# Fabrique les fichiers de mesure de l'extraction à partir de data/eval/fichiers-office/corpus.json
# (écrit par `pnpm eval:extraction corpus`). Requiert Microsoft Word, Excel et PowerPoint.
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools/eval/fichiers-office.ps1
$ErrorActionPreference = "Stop"
$dir = Join-Path (Get-Location) "data\eval\fichiers-office"
$corpus = Get-Content -Raw -Encoding UTF8 (Join-Path $dir "corpus.json") | ConvertFrom-Json
$images = Join-Path $dir "images"
New-Item -ItemType Directory -Force $images | Out-Null

# --- Images PNG (rendu net, Arial 26 px, retour à la ligne automatique) ---
Add-Type -AssemblyName System.Drawing
foreach ($s in $corpus) {
  $width = 1400
  $font = New-Object System.Drawing.Font("Arial", 26, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
  $probe = New-Object System.Drawing.Bitmap(1, 1)
  $g0 = [System.Drawing.Graphics]::FromImage($probe)
  $size = $g0.MeasureString($s.text, $font, $width - 80)
  $g0.Dispose(); $probe.Dispose()
  $height = [int]$size.Height + 80
  $bmp = New-Object System.Drawing.Bitmap($width, $height)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.Clear([System.Drawing.Color]::White)
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
  $rect = New-Object System.Drawing.RectangleF(40, 40, ($width - 80), ($height - 40))
  $g.DrawString($s.text, $font, [System.Drawing.Brushes]::Black, $rect)
  $bmp.Save((Join-Path $images "$($s.id).png"), [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose(); $font.Dispose()
}
Write-Output "images : $($corpus.Count)"

# --- Word : DOCX, PDF texte, PDF scanné (10 premières images seules) ---
$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0  # wdAlertsNone : aucune boîte de dialogue invisible ne bloque l'automatisation
try {
  $doc = $word.Documents.Add()
  foreach ($s in $corpus) { $doc.Content.InsertAfter($s.text); $doc.Content.InsertParagraphAfter() }
  $doc.SaveAs2((Join-Path $dir "corpus.docx"), 16)      # wdFormatDocumentDefault
  $doc.SaveAs2((Join-Path $dir "corpus-word.pdf"), 17)  # wdFormatPDF
  $doc.Close($false)

  $scan = $word.Documents.Add()
  foreach ($s in ($corpus | Select-Object -First 10)) {
    $range = $scan.Content
    $range.Collapse(0)
    $pic = $scan.InlineShapes.AddPicture((Join-Path $images "$($s.id).png"), $false, $true, $range)
    $pic.Width = 450
    $scan.Content.InsertParagraphAfter()
  }
  $scan.SaveAs2((Join-Path $dir "corpus-scanne.pdf"), 17)
  $scan.Close($false)
} finally { $word.Quit() }
Write-Output "word : corpus.docx, corpus-word.pdf, corpus-scanne.pdf"

# --- Excel : une ligne par prompt ---
$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false
try {
  $wb = $excel.Workbooks.Add()
  $ws = $wb.Worksheets.Item(1)
  $ws.Cells.Item(1, 1).Value2 = "id"
  $ws.Cells.Item(1, 2).Value2 = "demande"
  $row = 2
  foreach ($s in $corpus) {
    $ws.Cells.Item($row, 1).Value2 = $s.id
    $ws.Cells.Item($row, 2).NumberFormat = "@"
    $ws.Cells.Item($row, 2).Value2 = $s.text
    $row++
  }
  $wb.SaveAs((Join-Path $dir "corpus.xlsx"), 51)  # xlOpenXMLWorkbook
  $wb.Close($false)
} finally { $excel.Quit() }
Write-Output "excel : corpus.xlsx"

# --- PowerPoint : une diapositive par prompt ---
$ppt = New-Object -ComObject PowerPoint.Application
try {
  $pres = $ppt.Presentations.Add(0)  # sans fenêtre
  $i = 1
  foreach ($s in $corpus) {
    $slide = $pres.Slides.Add($i, 12)  # ppLayoutBlank
    $box = $slide.Shapes.AddTextbox(1, 40, 40, 640, 400)
    $box.TextFrame.TextRange.Text = $s.text
    $box.TextFrame.TextRange.Font.Size = 20
    $i++
  }
  $pres.SaveAs((Join-Path $dir "corpus.pptx"), 24)  # ppSaveAsOpenXMLPresentation
  $pres.Close()
} finally { $ppt.Quit() }
Write-Output "powerpoint : corpus.pptx"
