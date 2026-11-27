param(
    [Parameter(Mandatory=$true)][string]$RepoPath,
    [string]$BlenderPath = ''
)
$ErrorActionPreference = 'Stop'
$RepoPath = [System.IO.Path]::GetFullPath($RepoPath)
if (-not $BlenderPath) {
    $cmd = Get-Command blender.exe -ErrorAction SilentlyContinue
    if ($cmd) { $BlenderPath = $cmd.Source }
}
if (-not $BlenderPath) {
    $candidates = @(
        "$env:ProgramFiles\Blender Foundation\Blender 4.5\blender.exe",
        "$env:ProgramFiles\Blender Foundation\Blender 4.4\blender.exe",
        "$env:ProgramFiles\Blender Foundation\Blender 4.3\blender.exe",
        "$env:ProgramFiles\Blender Foundation\Blender 4.2\blender.exe",
        "$env:ProgramFiles\Blender Foundation\Blender\blender.exe"
    )
    $BlenderPath = $candidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
}
if (-not $BlenderPath -or -not (Test-Path -LiteralPath $BlenderPath)) {
    throw 'No se encontró Blender. Instala Blender 4.x desde blender.org y vuelve a ejecutar este script. El Aula y el video ya funcionarán sin Blender; solo se necesita para combinar las animaciones FBX.'
}
$script = Join-Path $PSScriptRoot 'crear_panteraglb_animada.py'
if (-not (Test-Path -LiteralPath $script)) { throw "No existe el script de Blender: $script" }
& $BlenderPath --background --python $script -- --repo $RepoPath
if ($LASTEXITCODE -ne 0) { throw "Blender terminó con código $LASTEXITCODE. No se activó el nuevo modelo." }
$output = Join-Path $RepoPath 'mod_avatar_accesibilidad\models\panteraups_animada.glb'
if (-not (Test-Path -LiteralPath $output) -or (Get-Item $output).Length -lt 100000) { throw 'No se generó panteraups_animada.glb correctamente.' }
Write-Host "Animaciones compiladas correctamente: $output" -ForegroundColor Green
Write-Host 'Siguiente paso: ejecutar activar-animaciones.ps1.' -ForegroundColor Cyan
