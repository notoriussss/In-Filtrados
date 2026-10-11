# check-network.ps1 — revisa la red entre las laptops del laboratorio.
# Automatiza las pruebas 2, 3 y 5 de docs/deployment-lab.md, sección 7:
# ping a cada nodo, puertos publicados abiertos, 5432 cerrado y WebSocket.
#
# Uso (desde la raíz del repo, en cualquier laptop):
#   powershell -ExecutionPolicy Bypass -File deploy/scripts/check-network.ps1
#   powershell -ExecutionPolicy Bypass -File deploy/scripts/check-network.ps1 `
#     -EnvFile deploy/lab.env -Nodes N1,N2
#
# Sale con código 0 si todo está en verde y 1 si algo falla.

param(
    [string]$EnvFile = "deploy/lab.env",
    # Nodos que se revisan; por defecto los 5.
    [string[]]$Nodes = @("N1", "N2", "N3", "N4", "N5"),
    [int]$TimeoutMs = 1500
)

$ErrorActionPreference = "Stop"

# Textos que ve el equipo (regla 9 de AGENTS.md: sin strings sueltos).
$Msg = @{
    EnvMissing    = "No existe {0}: copia deploy/lab.env.example a " +
        "deploy/lab.env y pon las IP del día."
    VarMissing    = "Falta {0} en {1}."
    Header        = "Revisando la red desde {0} con {1}"
    NodeHeader    = "{0} ({1}) {2}"
    PingOk        = "responde al ping"
    PingFail      = "no responde al ping (¿apagada, en otra red o el " +
        "firewall bloquea ICMP?)"
    PortOpen      = "puerto {0} ({1}) abierto"
    PortClosed    = "puerto {0} ({1}) cerrado: revisa el firewall de " +
        "Windows y que el nodo esté arriba"
    DbClosedOk    = "puerto 5432 cerrado desde fuera, como debe ser"
    DbOpenFail    = "puerto 5432 abierto desde fuera: la base no debe " +
        "publicarse"
    WsOk          = "WebSocket en /ws responde"
    WsFail        = "WebSocket en /ws no responde ({0})"
    NodeUnknown   = "nodo '{0}' desconocido en la topología (válidos: N1 a N5)."
    SummaryOk     = "Todo en verde."
    SummaryFail   = "{0} prueba(s) en rojo."
}

# Puertos publicados por nodo: docs/deployment-lab.md, sección 4.
$Topology = [ordered]@{
    N1 = @{
        HostVar = "EDGE_HOST"; Role = "edge"
        Ports = @(
            @{ Port = 8080; Name = "web" }
        )
    }
    N2 = @{
        HostVar = "MATCH_HOST"; Role = "match"; Db = $true
        Ports = @(
            @{ Port = 50051; Name = "gRPC" },
            @{ Port = 8081; Name = "/health" }
        )
    }
    N3 = @{
        HostVar = "PLAYERS_HOST"; Role = "players"; Db = $true
        Ports = @(
            @{ Port = 50052; Name = "gRPC" },
            @{ Port = 8082; Name = "/health" }
        )
    }
    N4 = @{
        HostVar = "BROKER_HOST"; Role = "broker"
        Ports = @(
            @{ Port = 5672; Name = "AMQP" },
            @{ Port = 15672; Name = "consola" }
        )
    }
    N5 = @{
        HostVar = "MONITOR_HOST"; Role = "monitor"
        Ports = @(
            @{ Port = 8000; Name = "panel" }
        )
    }
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

# Conexión TCP con timeout propio (Test-NetConnection tarda ~20 s al fallar).
function Test-Port([string]$HostName, [int]$Port) {
    $client = New-Object System.Net.Sockets.TcpClient
    try {
        $task = $client.ConnectAsync($HostName, $Port)
        if (-not $task.Wait($TimeoutMs)) { return $false }
        return $client.Connected
    } catch {
        return $false
    } finally {
        $client.Dispose()
    }
}

function Test-Ping([string]$HostName) {
    $ping = New-Object System.Net.NetworkInformation.Ping
    try {
        $reply = $ping.Send($HostName, $TimeoutMs)
        $success = [System.Net.NetworkInformation.IPStatus]::Success
        return $reply.Status -eq $success
    } catch {
        return $false
    } finally {
        $ping.Dispose()
    }
}

# Abre ws://<edge>:8080/ws sin token: el gateway responde y cierra con 4001.
# Recibir cualquier respuesta prueba que el WebSocket cruza la red.
function Test-WebSocket([string]$HostName) {
    $ws = New-Object System.Net.WebSockets.ClientWebSocket
    $cts = New-Object System.Threading.CancellationTokenSource
    $cts.CancelAfter(5000)
    try {
        $uri = [Uri]"ws://${HostName}:8080/ws"
        $ws.ConnectAsync($uri, $cts.Token).Wait()
        $buffer = New-Object byte[] 1024
        $segment = New-Object System.ArraySegment[byte] `
            -ArgumentList (, $buffer)
        $ws.ReceiveAsync($segment, $cts.Token).Wait()
        return @{ Ok = $true; Detail = "" }
    } catch {
        $reason = $_.Exception.GetBaseException().Message
        return @{ Ok = $false; Detail = $reason }
    } finally {
        $ws.Dispose()
        $cts.Dispose()
    }
}

$failures = 0
function Write-Result([bool]$Ok, [string]$Text) {
    if ($Ok) {
        Write-Host "  [OK]    $Text" -ForegroundColor Green
    } else {
        Write-Host "  [FALLA] $Text" -ForegroundColor Red
        $script:failures++
    }
}

if (-not (Test-Path -LiteralPath $EnvFile)) {
    Write-Host ($Msg.EnvMissing -f $EnvFile) -ForegroundColor Red
    exit 1
}
# Con -File, "-Nodes N1,N2" llega como un solo texto: se separa por comas.
$Nodes = @($Nodes | ForEach-Object { $_ -split "," } |
    ForEach-Object { $_.Trim().ToUpper() } | Where-Object { $_ -ne "" })

$envVars = Read-EnvFile $EnvFile
Write-Host ($Msg.Header -f [Environment]::MachineName, $EnvFile)

foreach ($node in $Nodes) {
    $info = $Topology[$node]
    if ($null -eq $info) {
        $text = $Msg.NodeUnknown -f $node
        Write-Host "  [FALLA] $text" -ForegroundColor Red
        $failures++
        continue
    }
    $hostName = $envVars[$info.HostVar]
    if ([string]::IsNullOrWhiteSpace($hostName)) {
        $text = $Msg.VarMissing -f $info.HostVar, $EnvFile
        Write-Host $text -ForegroundColor Red
        $failures++
        continue
    }

    Write-Host ""
    Write-Host ($Msg.NodeHeader -f $node, $info.Role, $hostName)
    $pingOk = Test-Ping $hostName
    if ($pingOk) {
        Write-Result $true $Msg.PingOk
    } else {
        Write-Host "  [AVISO] $($Msg.PingFail)" -ForegroundColor Yellow
    }

    foreach ($port in $info.Ports) {
        $open = Test-Port $hostName $port.Port
        $text = if ($open) { $Msg.PortOpen } else { $Msg.PortClosed }
        Write-Result $open ($text -f $port.Port, $port.Name)
    }

    if ($info.Db) {
        $dbOpen = Test-Port $hostName 5432
        $text = if ($dbOpen) { $Msg.DbOpenFail } else { $Msg.DbClosedOk }
        Write-Result (-not $dbOpen) $text
    }

    if ($node -eq "N1") {
        $ws = Test-WebSocket $hostName
        $text = if ($ws.Ok) { $Msg.WsOk } else { $Msg.WsFail -f $ws.Detail }
        Write-Result $ws.Ok $text
    }
}

Write-Host ""
if ($failures -eq 0) {
    Write-Host $Msg.SummaryOk -ForegroundColor Green
    exit 0
}
Write-Host ($Msg.SummaryFail -f $failures) -ForegroundColor Red
exit 1
