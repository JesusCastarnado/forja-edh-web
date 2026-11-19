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
    while ($null -ne ($line = $p.StandardOutput.ReadLine())) {
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

$types = @{ '.html' = 'text/html; charset=utf-8'; '.js' = 'text/javascript; charset=utf-8'; '.css' = 'text/css; charset=utf-8'; '.json' = 'application/json'; '.svg' = 'image/svg+xml'; '.png' = 'image/png'; '.ico' = 'image/x-icon' }
$l = New-Object System.Net.HttpListener
$l.Prefixes.Add("http://localhost:$Port/")
$l.Start()
Write-Output "Forja EDH en http://localhost:$Port/  (Ctrl+C para parar)"
if (-not $claude) { Write-Output "IA: no encuentro claude.exe; la web funcionará sin IA." }
elseif (Test-ClaudeLogin) { Write-Output "IA: usando tu cuenta de Claude ($claude)" }
else { Write-Output "IA: Claude no tiene la sesión iniciada. Para activarla, en otra ventana ejecuta:`n  powershell -ExecutionPolicy Bypass -File `"$PSCommandPath`" -Login" }
if (-not $NoBrowser) { Start-Process "http://localhost:$Port/" }

while ($l.IsListening) {
  $ctx = $l.GetContext()
  $path = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath.TrimStart('/'))
  try {
    if ($path -eq 'api/claude') {
      if ($ctx.Request.HttpMethod -eq 'GET') {
        $ctx.Response.ContentType = 'application/json'
        Send-Json $ctx.Response @{ ok = $true; mode = 'local'; configured = (Test-ClaudeLogin); found = [bool]$claude; password = $false }
      } elseif ($ctx.Request.HttpMethod -eq 'POST' -and $claude) {
        Invoke-Claude $ctx
      } else { $ctx.Response.StatusCode = 404 }
    } else {
      if ($path -eq '') { $path = 'index.html' }
      $file = [IO.Path]::GetFullPath((Join-Path $root $path))
      if ($file.StartsWith($root) -and (Test-Path $file -PathType Leaf) -and -not $path.StartsWith('api/') -and -not $path.StartsWith('.')) {
        $bytes = [IO.File]::ReadAllBytes($file)
        $ext = [IO.Path]::GetExtension($file).ToLower()
        $ctx.Response.ContentType = if ($types[$ext]) { $types[$ext] } else { 'application/octet-stream' }
        $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
      } else { $ctx.Response.StatusCode = 404 }
    }
  } catch { Write-Output "Error: $($_.Exception.Message)" }
  try { $ctx.Response.Close() } catch {}
}
