// Función de Vercel: puente con Commander Spellbook (su API no admite peticiones desde el navegador).
// Recibe { commanders: [{card}], main: [{card}] } y devuelve los combos del mazo, solo con los campos que usa la web.
const API = "https://backend.commanderspellbook.com/find-my-combos";

const clean = a => (Array.isArray(a) ? a : []).slice(0, 150)
  .map(x => ({ card: String((x && x.card) || "").slice(0, 200) })).filter(x => x.card);

const slim = v => ({
  id: v.id,
  uses: (v.uses || []).map(u => ({ card: { name: u.card && u.card.name, imageUriFrontSmall: u.card && u.card.imageUriFrontSmall } })),
  produces: (v.produces || []).map(p => ({ feature: { name: p.feature && p.feature.name } })),
  description: v.description, easyPrerequisites: v.easyPrerequisites, notablePrerequisites: v.notablePrerequisites,
  bracketTag: v.bracketTag, popularity: v.popularity,
});

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido" });
  const body = req.body || {};
  const commanders = clean(body.commanders), main = clean(body.main);
  if (!commanders.length && !main.length) return res.status(400).json({ error: "Mazo vacío" });
  try {
    const r = await fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ commanders, main }),
      signal: AbortSignal.timeout(25000),
    });
    if (!r.ok) return res.status(502).json({ error: `Commander Spellbook respondió ${r.status}` });
    const x = (await r.json()).results || {};
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ results: {
      identity: x.identity,
      included: (x.included || []).map(slim),
      almostIncluded: (x.almostIncluded || []).slice(0, 80).map(slim),
    } });
  } catch {
    return res.status(502).json({ error: "No se pudo conectar con Commander Spellbook" });
  }
}
