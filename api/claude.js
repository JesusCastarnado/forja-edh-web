// Función de Vercel: puente entre la web y la API de Claude.
// La clave (ANTHROPIC_API_KEY) vive solo aquí, en el servidor; el navegador nunca la ve.
// Respuesta en NDJSON: {"t":"texto"} por cada trozo, y al final {"done":true,"stop":"end_turn"} o {"error":"...","code":"..."}.
import Anthropic from "@anthropic-ai/sdk";
import { createHash, timingSafeEqual } from "node:crypto";

// Compara en tiempo constante (con hash para igualar longitudes) y no da pistas sobre la contraseña.
const sha = s => createHash("sha256").update(String(s ?? "")).digest();
const samePass = (a, b) => timingSafeEqual(sha(a), sha(b));

const client = new Anthropic(); // lee ANTHROPIC_API_KEY del entorno
const MODEL = process.env.CLAUDE_MODEL || "claude-opus-5-5";
const MAX_PROMPT = 120_000;

const SYSTEM = `Eres un jugador y constructor experto de Magic: The Gathering en formato Commander (EDH).
Conoces el Bracket System oficial (B1 Exhibition a B5 cEDH) y la lista de Game Changers.
Escribe siempre en español de España, claro y práctico. Los nombres de cartas van siempre con su nombre oficial en inglés.
Cuando te den cartas recientes con su texto, tenlas en cuenta aunque no las conozcas: pueden ser posteriores a tu entrenamiento.
Cuando te pidan JSON, responde solo con el JSON pedido, sin texto antes ni después.`;

export default async function handler(req, res) {
  const needPass = Boolean(process.env.APP_PASSWORD);

  if (req.method === "GET") {
    return res.status(200).json({ ok: true, configured: Boolean(process.env.ANTHROPIC_API_KEY), password: needPass, model: MODEL });
  }
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido" });
  if (needPass && !samePass(req.headers["x-app-password"], process.env.APP_PASSWORD)) {
    return res.status(401).json({ error: "Contraseña incorrecta", code: "auth" });
  }
  if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: "Falta ANTHROPIC_API_KEY en el servidor", code: "not_configured" });

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
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
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
