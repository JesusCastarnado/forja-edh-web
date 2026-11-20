// Función de Vercel: puente entre la web y la API de Claude.
// La clave (ANTHROPIC_API_KEY) vive solo aquí, en el servidor; el navegador nunca la ve.
// Respuesta en NDJSON: {"t":"texto"} por cada trozo, y al final {"done":true,"stop":"end_turn"} o {"error":"...","code":"..."}.
//
// Quién puede usarla (variables de entorno en Vercel):
//   ALLOWED_EMAILS  emails (o ids de usuario de Supabase) separados por comas. La web manda la sesión
//                   de «Mis mazos» y aquí se comprueba con Supabase que es una de esas cuentas.
//   APP_PASSWORD    alternativa: una contraseña que la web pide con el botón «Clave IA».
// Si no hay ninguna de las dos, la función se niega a usar la clave: así nadie puede gastar tu saldo
// por olvidar protegerla.
import Anthropic from "@anthropic-ai/sdk";
import { createHash, timingSafeEqual } from "node:crypto";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "../js/config.js";

// Compara en tiempo constante (con hash para igualar longitudes) y no da pistas sobre la contraseña.
const sha = s => createHash("sha256").update(String(s ?? "")).digest();
const samePass = (a, b) => timingSafeEqual(sha(a), sha(b));

const ALLOWED = (process.env.ALLOWED_EMAILS || "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);

// Pregunta a Supabase de quién es la sesión. Devuelve { id, email } o null si no es válida.
async function sessionUser(req) {
  const m = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || "");
  if (!m || !SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${m[1]}` } });
    if (!r.ok) return null;
    const u = await r.json();
    return u && u.id ? { id: String(u.id).toLowerCase(), email: String(u.email || "").toLowerCase() } : null;
  } catch { return null; }
}

// null si puede pasar; si no, { status, error, code }.
async function checkAccess(req) {
  if (ALLOWED.length) {
    const u = await sessionUser(req);
    if (u && (ALLOWED.includes(u.email) || ALLOWED.includes(u.id))) return null;
    if (!u && !process.env.APP_PASSWORD) return { status: 401, error: "Entra con tu cuenta en «Mis mazos» para usar la IA", code: "login_required" };
    if (u && !process.env.APP_PASSWORD) return { status: 403, error: "Esta cuenta no tiene acceso a la IA", code: "not_allowed" };
  }
  if (process.env.APP_PASSWORD) {
    return samePass(req.headers["x-app-password"], process.env.APP_PASSWORD) ? null : { status: 401, error: "Contraseña incorrecta", code: "auth" };
  }
  return ALLOWED.length ? null : { status: 503, error: "La IA no está protegida: añade ALLOWED_EMAILS (o APP_PASSWORD) en Vercel", code: "unprotected" };
}

const client = new Anthropic(); // lee ANTHROPIC_API_KEY del entorno
// Por defecto Haiku 5.5: el más barato (unas 40 veces menos que Opus). CLAUDE_MODEL en Vercel lo cambia.
const MODEL = process.env.CLAUDE_MODEL || "claude-haiku-5-5";
// Haiku no admite el reintento automático con otro modelo si rechaza la petición.
const FALLBACK = /haiku/.test(MODEL) ? {} : { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" };
const MAX_PROMPT = 120_000;

const SYSTEM = `Eres un jugador y constructor experto de Magic: The Gathering en formato Commander (EDH).
Conoces el Bracket System oficial (B1 Exhibition a B5 cEDH) y la lista de Game Changers.
Escribe siempre en español de España, claro y práctico. Los nombres de cartas van siempre con su nombre oficial en inglés.
Cuando te den cartas recientes con su texto, tenlas en cuenta aunque no las conozcas: pueden ser posteriores a tu entrenamiento.
Cuando te pidan JSON, responde solo con el JSON pedido, sin texto antes ni después.`;

export default async function handler(req, res) {
  const needPass = Boolean(process.env.APP_PASSWORD) && !ALLOWED.length;

  if (req.method === "GET") {
    return res.status(200).json({ ok: true, configured: Boolean(process.env.ANTHROPIC_API_KEY), password: needPass, login: ALLOWED.length > 0, model: MODEL });
  }
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido" });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: "Falta ANTHROPIC_API_KEY en el servidor", code: "not_configured" });
  const denied = await checkAccess(req);
  if (denied) return res.status(denied.status).json({ error: denied.error, code: denied.code });

  const { prompt, effort } = req.body || {};
  if (typeof prompt !== "string" || !prompt.trim() || prompt.length > MAX_PROMPT) {
    return res.status(400).json({ error: "Petición no válida", code: "bad_request" });
  }

  res.writeHead(200, { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" });
  const send = obj => res.write(JSON.stringify(obj) + "\n");

  // Si el navegador cancela (botón Detener) o se va, cortamos el stream para no pagar tokens que nadie leerá.
  let stream = null, gone = false;
  res.on("close", () => { if (!res.writableFinished) { gone = true; stream?.abort(); } });

  try {
    stream = client.beta.messages.stream({
      model: MODEL,
      max_tokens: 32000,
      thinking: { type: "adaptive" },
      output_config: { effort: ["low", "medium", "high"].includes(effort) ? effort : "medium" },
      // Si un clasificador de seguridad rechaza la petición, el servidor reintenta con otro modelo.
      ...FALLBACK,
      system: SYSTEM,
      messages: [{ role: "user", content: prompt }],
    });
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") send({ t: event.delta.text });
    }
    const msg = await stream.finalMessage();
    send({ done: true, stop: msg.stop_reason });
  } catch (err) {
    if (gone) return;
    let code = "upstream", error = "Error al hablar con Claude";
    if (err instanceof Anthropic.RateLimitError) { code = "rate_limited"; error = "Límite de uso de la API alcanzado"; }
    else if (err instanceof Anthropic.AuthenticationError) { code = "server_key"; error = "La clave de la API no es válida"; }
    else if (err instanceof Anthropic.BadRequestError) { code = "bad_request"; error = err.message; }
    else if (err instanceof Anthropic.APIConnectionError) { code = "upstream"; error = "No se pudo conectar con la API"; }
    console.error(err);
    send({ error, code });
  }
  res.end();
}
