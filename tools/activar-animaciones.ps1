param([Parameter(Mandatory=$true)][string]$RepoPath)
$ErrorActionPreference = 'Stop'
$RepoPath = [System.IO.Path]::GetFullPath($RepoPath)
$model = Join-Path $RepoPath 'mod_avatar_accesibilidad\models\panteraups_animada.glb'
$avatar = Join-Path $RepoPath 'mod_avatar_accesibilidad\avatar_asistente.js'
if (-not (Test-Path -LiteralPath $model)) { throw 'Primero ejecuta tools\generar-animaciones.ps1 para crear panteraups_animada.glb.' }
$verifier = Join-Path $PSScriptRoot 'verificar_panteraglb.py'
if (-not (Test-Path -LiteralPath $verifier)) { throw 'No se encontró el verificador del GLB.' }
python $verifier $model
if ($LASTEXITCODE -ne 0) { throw 'El GLB no contiene todos los clips esperados. No se cambió el avatar.' }
if (-not (Test-Path -LiteralPath $avatar)) { throw 'No se encontró avatar_asistente.js.' }
$text = [System.IO.File]::ReadAllText($avatar)
if ($text -match 'panteraups_animada\.glb') {
    Write-Host 'El avatar ya está configurado para el GLB con animaciones.' -ForegroundColor Yellow
    exit 0
}
$pattern = "var MODEL_URL = '([^']*panteraups\.glb[^']*)';"
$regex = [regex]::new($pattern)
if ($regex.Matches($text).Count -ne 1) { throw 'No se encontró exactamente una línea MODEL_URL con panteraups.glb. No se modificó nada.' }
$animationPattern = "setAttribute\('animation-name',\s*'mixamo\.com'\)"
$animationRegex = [regex]::new($animationPattern)
if ($animationRegex.Matches($text).Count -ne 1) { throw 'No se encontró exactamente el nombre inicial mixamo.com. No se modificó nada.' }
$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backup = Join-Path $RepoPath ("_backups\pantera-animaciones-$timestamp\avatar_asistente.js")
New-Item -ItemType Directory -Path (Split-Path -Parent $backup) -Force | Out-Null
Copy-Item -LiteralPath $avatar -Destination $backup -Force
$newText = $regex.Replace($text, "var MODEL_URL = '/accesibilidad/models/panteraups_animada.glb?v=20261127-aula-animaciones';", 1)
$newText = $animationRegex.Replace($newText, "setAttribute('animation-name', 'Vigia_IdleOriginal')", 1)
[System.IO.File]::WriteAllText($avatar, $newText, [System.Text.UTF8Encoding]::new($false))
Write-Host 'Pantera configurada para usar el GLB animado.' -ForegroundColor Green
Write-Host "Respaldo: $backup" -ForegroundColor Cyan
