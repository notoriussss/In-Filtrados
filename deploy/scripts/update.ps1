# update.ps1 — deja corriendo en esta laptop lo último que publicó el CD.
# El CD (.github/workflows/cd.yml) sube una imagen por servicio a GHCR cuando
# el CI de main sale en verde; aquí solo se descargan y se reinician, sin
# compilar nada (docs/tasks.md, S2-13).
#
# Uso (en cada laptop, desde cualquier carpeta):
#   .\deploy\scripts\update.ps1
#   .\deploy\scripts\update.ps1 -Nodes N1,N5      # forzar o agrupar nodos
#   .\deploy\scripts\update.ps1 -SkipGitPull      # no tocar el repo
#
# Sin -Nodes, el nodo se detecta comparando las IP de esta laptop con las de
# deploy/lab.env (EDGE_HOST, MATCH_HOST, ...). Si dos nodos comparten IP
# (plan B de docs/deployment-lab.md, sección 8) se actualizan los dos.
#
# Sale con código 0 si todo quedó arriba y 1 si algo falla.

param(
    [string]$EnvFile = "deploy/lab.env",
    [string[]]$Nodes = @(),
    [switch]$SkipGitPull
)

$ErrorActionPreference = "Stop"

# Textos que ve el equipo (regla 9 de AGENTS.md: sin strings sueltos).
$Msg = @{
    EnvMissing     = "No existe {0}: copia deploy/lab.env.example a " +
        "deploy/lab.env y pon las IP del día."
    NodeUnknown    = "Nodo '{0}' desconocido (válidos: N1 a N5)."
    NodeNotFound   = "Ninguna IP de esta laptop ({0}) aparece en {1}. " +
        "Indica el nodo a mano, por ejemplo: -Nodes N2"
    NodesDetected  = "Nodos de esta laptop: {0}"
    GitPull        = "Trayendo los últimos compose del repo (git pull)…"
    GitPullFail    = "git pull falló; se sigue con los compose que hay."
    GitNotMain     = "Esta laptop está en la rama '{0}', no en main: " +
        "se salta git pull para no mezclar sus compose con las " +
        "imágenes de main (git checkout main para alinearla)."
    Pull           = "Descargando las imágenes nuevas de GHCR…"
    PullFail       = "docker compose pull falló: ¿hay red y sesión en " +
        "ghcr.io? (docker login ghcr.io)"
    Up             = "Reiniciando los contenedores con las imágenes nuevas…"
    UpFail         = "docker compose up -d falló."
    Done           = "Listo: {0} actualizado(s)."
}

# Variable de lab.env con la IP de cada nodo
# (docs/deployment-lab.md, sección 5).
$NodeHosts = [ordered]@{
    N1 = "EDGE_HOST"
    N2 = "MATCH_HOST"
    N3 = "PLAYERS_HOST"
    N4 = "BROKER_HOST"
    N5 = "MONITOR_HOST"
}

# Lee KEY=VALUE del lab.env; ignora comentarios y líneas vacías.
function Read-EnvFile([string]$Path) {
    $vars = @{}
    foreach ($line in Get-Content -LiteralPath $Path) {
        $trimmed = $line.Trim()
        if ($trimmed -eq "" -or $trimmed.StartsWith("#")) { continue }
        $parts = $trimmed.Split("=", 2)
        if ($parts.Count -eq 2) {
            $vars[$parts[0].Trim()] = $parts[1].Trim()
        }
    }
    return $vars
}

function Get-LocalAddresses {
    return @(
        Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
            ForEach-Object { $_.IPAddress }
    )
}

function Fail([string]$Text) {
    Write-Host $Text -ForegroundColor Red
    exit 1
}

# Los compose y lab.env se resuelven desde la raíz del repo.
Set-Location -LiteralPath (Join-Path $PSScriptRoot "..\..")

if (-not (Test-Path -LiteralPath $EnvFile)) {
    Fail ($Msg.EnvMissing -f $EnvFile)
}

# Con -File, "-Nodes N1,N2" llega como un solo texto: se separa por comas.
$Nodes = @($Nodes | ForEach-Object { $_ -split "," } |
    ForEach-Object { $_.Trim().ToUpper() } | Where-Object { $_ -ne "" })

if ($Nodes.Count -eq 0) {
    $envVars = Read-EnvFile $EnvFile
    $local = Get-LocalAddresses
    $Nodes = @($NodeHosts.Keys | Where-Object {
        $local -contains $envVars[$NodeHosts[$_]]
    })
    if ($Nodes.Count -eq 0) {
        Fail ($Msg.NodeNotFound -f ($local -join ", "), $EnvFile)
    }
}

$composeArgs = @("compose", "--env-file", $EnvFile)
foreach ($node in $Nodes) {
    if (-not $NodeHosts.Contains($node)) {
        Fail ($Msg.NodeUnknown -f $node)
    }
    $composeArgs += @("-f", "deploy/compose/$($node.ToLower()).yml")
}
Write-Host ($Msg.NodesDetected -f ($Nodes -join ", "))

if (-not $SkipGitPull) {
    # Las imágenes son las de main (latest): los compose también deben
    # venir de main, o pueden no coincidir.
    $branch = git rev-parse --abbrev-ref HEAD
    if ($LASTEXITCODE -ne 0 -or $branch -ne "main") {
        Write-Host ($Msg.GitNotMain -f $branch) -ForegroundColor Yellow
    } else {
        Write-Host $Msg.GitPull
        git pull --ff-only
        if ($LASTEXITCODE -ne 0) {
            Write-Host $Msg.GitPullFail -ForegroundColor Yellow
        }
    }
}

Write-Host $Msg.Pull
docker @composeArgs pull
if ($LASTEXITCODE -ne 0) { Fail $Msg.PullFail }

Write-Host $Msg.Up
# Sin --remove-orphans: todos los nodos comparten el proyecto
# in-filtrados-lab y borraría los de otro nodo agrupado en esta laptop.
docker @composeArgs up -d
if ($LASTEXITCODE -ne 0) { Fail $Msg.UpFail }

docker @composeArgs ps
Write-Host ($Msg.Done -f ($Nodes -join ", ")) -ForegroundColor Green
exit 0
