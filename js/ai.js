// Cliente de /api/claude (ver api/claude.js). Lee la respuesta en streaming (NDJSON).
import { accessToken } from "./cloud.js";
const ENDPOINT = "/api/claude";
let statusPromise = null;

export function aiStatus() {
  if (!statusPromise) statusPromise = fetch(ENDPOINT).then(r => r.ok ? r.json() : { ok: false }).catch(() => ({ ok: false }))
    // Solo se recuerda si la IA está lista; si no, se vuelve a preguntar (p. ej. arrancaste el servidor o iniciaste sesión después).
    .then(st => { if (!st.ok || !st.configured) statusPromise = null; return st; });
  return statusPromise;
}

export const getPass = () => { try { return localStorage.getItem("forja-pass") || ""; } catch { return ""; } };
export const setPass = p => { try { localStorage.setItem("forja-pass", p); } catch {} };

// `action`: qué función de la web la usa (para el panel de consumo): optimizar, encaja, autorrellenar…
export async function ask(prompt, { onText, signal, effort, action } = {}) {
  let r;
  // En la web publicada, la sesión de «Mis mazos» demuestra al servidor que eres tú.
  const token = await accessToken();
  const headers = { "Content-Type": "application/json", "x-app-password": getPass() };
  if (token) headers.Authorization = "Bearer " + token;
  try {
    r = await fetch(ENDPOINT, {
      method: "POST", signal, headers,
      body: JSON.stringify({ prompt, effort, action }),
    });
  } catch (e) {
    if (e && e.name === "AbortError") throw { code: "cancelled" };
    throw { code: "network", message: "Sin conexión con el servidor" };
  }
  if (!r.ok) {
    let body = {}; try { body = await r.json(); } catch {}
    throw { code: body.code || (r.status === 404 ? "not_configured" : "http"), message: body.error || "Error " + r.status };
  }
  const reader = r.body.getReader(), dec = new TextDecoder();
  let buf = "", text = "", stop = null;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 1);
        if (!line.trim()) continue;
        const ev = JSON.parse(line);
        if (ev.t) { text += ev.t; onText && onText({ text, delta: ev.t }); }
        else if (ev.error) throw { code: ev.code || "upstream", message: ev.error, text };
        else if (ev.done) stop = ev.stop;
      }
    }
  } catch (e) {
    if (e && e.name === "AbortError") throw { code: "cancelled", text };
    throw e;
  }
  if (stop === "refusal") throw { code: "refused", message: "Claude ha rechazado la petición" };
  return { text, truncated: stop === "max_tokens" };
}

export async function askJSON(prompt, opts) {
  const { text } = await ask(prompt + "\n\nResponde únicamente con el JSON, sin texto antes ni después.", opts);
  try { return JSON.parse(text); } catch {}
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) { try { return JSON.parse(fence[1]); } catch {} }
  const a = text.indexOf("{"), b = text.lastIndexOf("}");
  if (a >= 0 && b > a) { try { return JSON.parse(text.slice(a, b + 1)); } catch {} }
  throw { code: "invalid_json", message: "Respuesta sin JSON válido", text };
}

const ERR = {
  auth: "La contraseña de la IA no es correcta. Pulsa «Clave IA» arriba y escríbela.",
  login_required: "Para usar la IA, entra con tu cuenta en la pestaña «Mis mazos».",
  not_allowed: "Esta cuenta no tiene acceso a la IA de esta web.",
  unprotected: "La IA está desactivada hasta que se proteja: falta ALLOWED_EMAILS en Vercel (mira el README).",
  rate_limited: "Se ha alcanzado el límite de uso de la API (o se ha acabado el saldo). Prueba en un rato.",
  not_configured: "La IA no está activa. En local, arranca la web con dev\\serve.ps1; publicada, añade ANTHROPIC_API_KEY en Vercel (mira el README).",
  not_logged_in: "Claude no tiene tu sesión iniciada en este ordenador. En PowerShell ejecuta una vez: powershell -ExecutionPolicy Bypass -File dev\\serve.ps1 -Login",
  server_key: "La clave de la API configurada en el servidor no es válida.",
  refused: "Claude no ha querido responder a esta petición.",
  invalid_json: "La respuesta no venía en el formato esperado. Vuelve a intentarlo.",
  network: "No hay conexión con el servidor.",
};
export const errMsg = e => ERR[e && e.code] || (e && e.message) || "Algo ha fallado al hablar con Claude.";
