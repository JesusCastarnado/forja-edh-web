# Servidor local de Forja EDH, sin Node.
#   powershell -ExecutionPolicy Bypass -File dev\serve.ps1            -> abre http://localhost:8080
#   powershell -ExecutionPolicy Bypass -File dev\serve.ps1 -Login     -> inicia sesión en Claude (solo la primera vez)
#
# Sirve la web y responde a /api/claude usando la herramienta de línea de comandos de Claude Code
# (claude.exe) con TU cuenta de Claude: no hace falta clave de API. Desplegada en Vercel, la web usa
# en su lugar api/claude.js con ANTHROPIC_API_KEY.
param([int]$Port = 8080, [switch]$Login, [string]$ClaudePath = "", [switch]$NoBrowser)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
# Con la barra final, "forja-edh-web-copia" ya no pasa por dentro de "forja-edh-web".
$rootDir = $root.TrimEnd('\') + '\'

function Find-Claude {
  if ($ClaudePath -and (Test-Path $ClaudePath)) { return $ClaudePath }
  $cmd = Get-Command claude -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  $cands = @()
  $cands += Get-Item "$env:USERPROFILE\.local\bin\claude.exe" -ErrorAction SilentlyContinue
  $cands += Get-Item "$env:LOCALAPPDATA\Claude-Data\*\claude-code\*\*\claude.exe" -ErrorAction SilentlyContinue
  $cands = $cands | Where-Object { $_ } | Sort-Object LastWriteTime -Descending
  if ($cands) { return $cands[0].FullName }
  return $null
}
$claude = Find-Claude

if ($Login) {
  if (-not $claude) { Write-Output "No encuentro claude.exe. Instala Claude Code: https://code.claude.com"; exit 1 }
  & $claude auth login
  exit $LASTEXITCODE
}

function Test-ClaudeLogin {
  if (-not $claude) { return $false }
  try { $j = (& $claude auth status 2>$null) -join "`n" | ConvertFrom-Json; return [bool]$j.loggedIn } catch { return $false }
}

$workDir = Join-Path $env:TEMP 'forja-edh-claude'
New-Item -ItemType Directory -Force $workDir | Out-Null
$utf8 = New-Object System.Text.UTF8Encoding $false
$SYSTEM = 'Eres un jugador y constructor experto de Magic: The Gathering en formato Commander (EDH). Conoces el Bracket System oficial (B1 a B5) y la lista de Game Changers. Escribe en español de España, claro y práctico. Los nombres de cartas van siempre con su nombre oficial en inglés. Si te dan cartas recientes con su texto, tenlas en cuenta aunque no las conozcas. Si te piden JSON, responde solo con el JSON pedido.'

function Send-Json($res, $obj) {
  $b = $utf8.GetBytes(($obj | ConvertTo-Json -Compress -Depth 5) + "`n")
  $res.OutputStream.Write($b, 0, $b.Length); $res.OutputStream.Flush()
}

function Invoke-Claude($ctx) {
  $res = $ctx.Response
  $reader = New-Object IO.StreamReader($ctx.Request.InputStream, $utf8)
  $body = $reader.ReadToEnd() | ConvertFrom-Json
  $prompt = [string]$body.prompt
  if (-not $prompt.Trim() -or $prompt.Length -gt 120000) { $res.StatusCode = 400; Send-Json $res @{ error = 'Petición no válida'; code = 'bad_request' }; return }
  $effort = if (@('low', 'medium', 'high') -contains $body.effort) { $body.effort } else { 'medium' }

  $res.ContentType = 'application/x-ndjson; charset=utf-8'
  $res.SendChunked = $true
  $psi = New-Object Diagnostics.ProcessStartInfo $claude
  $psi.Arguments = "-p --tools """" --no-session-persistence --safe-mode --effort $effort --output-format stream-json --verbose --include-partial-messages --system-prompt ""$SYSTEM"""
  $psi.WorkingDirectory = $workDir
  $psi.UseShellExecute = $false
  $psi.RedirectStandardInput = $true
  $psi.RedirectStandardOutput = $true
  $psi.StandardOutputEncoding = $utf8
  $psi.CreateNoWindow = $true
  $p = [Diagnostics.Process]::Start($psi)
  try {
    $bytes = $utf8.GetBytes($prompt)
    $p.StandardInput.BaseStream.Write($bytes, 0, $bytes.Length)
    $p.StandardInput.Close()
    $finished = $false
    # Límite de 5 minutos por petición (como maxDuration en Vercel): si Claude se cuelga, no bloquea el servidor.
    $deadline = [DateTime]::UtcNow.AddMinutes(5)
    while ($true) {
      $task = $p.StandardOutput.ReadLineAsync()
      $left = [int][Math]::Max(0, ($deadline - [DateTime]::UtcNow).TotalMilliseconds)
      if (-not $task.Wait($left)) {
        if (-not $p.HasExited) { try { $p.Kill() } catch {} }
        Send-Json $res @{ error = 'Claude ha tardado demasiado en responder'; code = 'upstream' }
        $finished = $true
        break
      }
      $line = $task.Result
      if ($null -eq $line) { break }
      if (-not $line.StartsWith('{')) { continue }
      try { $j = $line | ConvertFrom-Json } catch { continue }
      if ($j.type -eq 'stream_event' -and $j.event.type -eq 'content_block_delta' -and $j.event.delta.type -eq 'text_delta') {
        Send-Json $res @{ t = $j.event.delta.text }
      } elseif ($j.type -eq 'result') {
        $finished = $true
        if ($j.is_error) {
          $msg = [string]$j.result
          $code = if ($msg -match 'log ?in|/login|auth') { 'not_logged_in' } elseif ($msg -match 'limit|usage') { 'rate_limited' } else { 'upstream' }
          Send-Json $res @{ error = $msg; code = $code }
        } else {
          Send-Json $res @{ done = $true; stop = 'end_turn' }
        }
      }
    }
    if (-not $finished) { Send-Json $res @{ error = 'Claude se cerró sin responder'; code = 'upstream' } }
  } catch {
    # El navegador canceló (botón Detener) o se cortó la conexión.
  } finally {
    if (-not $p.HasExited) { try { $p.Kill() } catch {} }
  }
}

# Combos: puente con Commander Spellbook, cuya API no admite peticiones desde el navegador (como api/combos.js en Vercel).
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
function Invoke-Combos($ctx) {
  $res = $ctx.Response
  $reader = New-Object IO.StreamReader($ctx.Request.InputStream, $utf8)
  $body = $reader.ReadToEnd()
  if ($body.Length -gt 60000) { $res.StatusCode = 400; Send-Json $res @{ error = 'Petición no válida' }; return }
  $res.ContentType = 'application/json; charset=utf-8'
  try {
    $wc = New-Object Net.WebClient
    $wc.Encoding = $utf8
    $wc.Headers['Content-Type'] = 'application/json'
    $wc.Headers['Accept'] = 'application/json'
    $txt = $wc.UploadString('https://backend.commanderspellbook.com/find-my-combos', 'POST', $body)
    $b = $utf8.GetBytes($txt)
    $res.OutputStream.Write($b, 0, $b.Length)
  } catch {
    $res.StatusCode = 502
    Send-Json $res @{ error = 'No se pudo conectar con Commander Spellbook' }
  }
}

# Archidekt: importar un mazo público por su número (como api/archidekt.js en Vercel). Solo lee archidekt.com.
function Invoke-Archidekt($ctx) {
  $res = $ctx.Response
  $id = [string]$ctx.Request.QueryString['id']
  $res.ContentType = 'application/json; charset=utf-8'
  if ($id -notmatch '^\d{1,12}$') { $res.StatusCode = 400; Send-Json $res @{ error = 'Enlace de Archidekt no válido' }; return }
  try {
    $wc = New-Object Net.WebClient
    $wc.Encoding = $utf8
    $wc.Headers.Add('User-Agent', 'ForjaEDH/1.0 (importador de mazos)')
    $wc.Headers.Add('Accept', 'application/json')
    $txt = $wc.DownloadString("https://archidekt.com/api/decks/$id/")
    $b = $utf8.GetBytes($txt)
    $res.OutputStream.Write($b, 0, $b.Length)
  } catch {
    $res.StatusCode = 404
    Send-Json $res @{ error = 'Ese mazo de Archidekt no existe o es privado' }
  }
}

# EDHREC: datos de cada comandante (como api/edhrec.js en Vercel). Solo lee json.edhrec.com.
function Invoke-Edhrec($ctx) {
  $res = $ctx.Response
  $slug = [string]$ctx.Request.QueryString['c']
  $res.ContentType = 'application/json; charset=utf-8'
  if ($slug -notmatch '^[a-z0-9-]{1,160}$') { $res.StatusCode = 400; Send-Json $res @{ error = 'Comandante no válido' }; return }
  try {
    $wc = New-Object Net.WebClient
    $wc.Encoding = $utf8
    $txt = $wc.DownloadString("https://json.edhrec.com/pages/commanders/$slug.json")
    $b = $utf8.GetBytes($txt)
    $res.OutputStream.Write($b, 0, $b.Length)
  } catch {
    $res.StatusCode = 404
    Send-Json $res @{ error = 'EDHREC no tiene datos de este comandante' }
  }
}

$types = @{ '.html' = 'text/html; charset=utf-8'; '.js' = 'text/javascript; charset=utf-8'; '.css' = 'text/css; charset=utf-8'; '.json' = 'application/json'; '.svg' = 'image/svg+xml'; '.png' = 'image/png'; '.ico' = 'image/x-icon' }
# Si el puerto está ocupado (otro servidor abierto, otro programa), prueba los siguientes.
$l = $null
foreach ($try in $Port..($Port + 20)) {
  $cand = New-Object System.Net.HttpListener
  $cand.Prefixes.Add("http://localhost:$try/")
  try { $cand.Start(); $l = $cand; $Port = $try; break } catch { $cand.Close() }
}
if (-not $l) { Write-Output "No hay ningún puerto libre entre $Port y $($Port + 20). Cierra otros servidores o usa -Port."; exit 1 }
Write-Output "Forja EDH en http://localhost:$Port/  (Ctrl+C para parar)"
if (-not $claude) { Write-Output "IA: no encuentro claude.exe; la web funcionará sin IA." }
elseif (Test-ClaudeLogin) { Write-Output "IA: usando tu cuenta de Claude ($claude)" }
else { Write-Output "IA: Claude no tiene la sesión iniciada. Para activarla, en otra ventana ejecuta:`n  powershell -ExecutionPolicy Bypass -File `"$PSCommandPath`" -Login" }
if (-not $NoBrowser) { Start-Process "http://localhost:$Port/" }

while ($l.IsListening) {
  $ctx = $l.GetContext()
  $path = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath.TrimStart('/'))
  try {
    if ($path -eq 'api/edhrec') {
      if ($ctx.Request.HttpMethod -eq 'GET') { Invoke-Edhrec $ctx } else { $ctx.Response.StatusCode = 405 }
    } elseif ($path -eq 'api/archidekt') {
      if ($ctx.Request.HttpMethod -eq 'GET') { Invoke-Archidekt $ctx } else { $ctx.Response.StatusCode = 405 }
    } elseif ($path -eq 'api/combos') {
      $origin = $ctx.Request.Headers['Origin']
      if ($ctx.Request.HttpMethod -ne 'POST') { $ctx.Response.StatusCode = 405 }
      elseif (($origin -and $origin -ne "http://localhost:$Port") -or $ctx.Request.ContentType -notlike 'application/json*') {
        $ctx.Response.StatusCode = 403
        Send-Json $ctx.Response @{ error = 'Origen no permitido'; code = 'forbidden' }
      } else { Invoke-Combos $ctx }
    } elseif ($path -eq 'api/claude') {
      if ($ctx.Request.HttpMethod -eq 'GET') {
        $ctx.Response.ContentType = 'application/json'
        Send-Json $ctx.Response @{ ok = $true; mode = 'local'; configured = (Test-ClaudeLogin); found = [bool]$claude; password = $false }
      } elseif ($ctx.Request.HttpMethod -eq 'POST' -and $claude) {
        # Solo la propia web puede usar la IA: cualquier otra página que visites podría enviar
        # peticiones a localhost y gastar tu cuenta de Claude.
        $origin = $ctx.Request.Headers['Origin']
        if (($origin -and $origin -ne "http://localhost:$Port") -or $ctx.Request.ContentType -notlike 'application/json*') {
          $ctx.Response.StatusCode = 403
          Send-Json $ctx.Response @{ error = 'Origen no permitido'; code = 'forbidden' }
        } else { Invoke-Claude $ctx }
      } else { $ctx.Response.StatusCode = 404 }
    } else {
      if ($path -eq '') { $path = 'index.html' }
      $file = [IO.Path]::GetFullPath((Join-Path $root $path))
      if ($file.StartsWith($rootDir, [StringComparison]::OrdinalIgnoreCase) -and (Test-Path $file -PathType Leaf) -and -not $path.StartsWith('api/') -and -not $path.StartsWith('.')) {
        $bytes = [IO.File]::ReadAllBytes($file)
        $ext = [IO.Path]::GetExtension($file).ToLower()
        $ctx.Response.ContentType = if ($types[$ext]) { $types[$ext] } else { 'application/octet-stream' }
        $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
      } else { $ctx.Response.StatusCode = 404 }
    }
  } catch { Write-Output "Error: $($_.Exception.Message)" }
  try { $ctx.Response.Close() } catch {}
}
