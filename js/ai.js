// Cliente de /api/claude (ver api/claude.js). Lee la respuesta en streaming (NDJSON).
const ENDPOINT = "/api/claude";
let statusPromise = null;

export function aiStatus() {
  if (!statusPromise) statusPromise = fetch(ENDPOINT).then(r => r.ok ? r.json() : { ok: false }).catch(() => ({ ok: false }));
  return statusPromise;
}

export const getPass = () => { try { return localStorage.getItem("forja-pass") || ""; } catch { return ""; } };
export const setPass = p => { try { localStorage.setItem("forja-pass", p); } catch {} };

export async function ask(prompt, { onText, signal, effort } = {}) {
  let r;
  try {
    r = await fetch(ENDPOINT, {
      method: "POST", signal,
      headers: { "Content-Type": "application/json", "x-app-password": getPass() },
      body: JSON.stringify({ prompt, effort }),
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
  not_configured: "La IA no está configurada en este servidor. Añade ANTHROPIC_API_KEY en Vercel (mira el README).",
  server_key: "La clave de la API configurada en el servidor no es válida.",
  rate_limited: "Se ha alcanzado el límite de uso de la API. Prueba en un rato.",
  refused: "Claude no ha querido responder a esta petición.",
  invalid_json: "La respuesta no venía en el formato esperado. Vuelve a intentarlo.",
  network: "No hay conexión con el servidor.",
};
export const errMsg = e => ERR[e && e.code] || (e && e.message) || "Algo ha fallado al hablar con Claude.";
