// Función de Vercel: puente con la API pública de Archidekt para importar un mazo por su enlace
// (Archidekt no admite peticiones desde otras webs). GET /api/archidekt?id=<número del mazo>
// Devuelve solo lo que usa la web: nombre, categorías y cartas (cantidad, categorías y nombre).
export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Método no permitido" });
  const id = String((req.query && req.query.id) || "");
  if (!/^\d{1,12}$/.test(id)) return res.status(400).json({ error: "Enlace de Archidekt no válido" });
  try {
    const r = await fetch(`https://archidekt.com/api/decks/${id}/`, {
      headers: { Accept: "application/json", "User-Agent": "ForjaEDH/1.0 (importador de mazos)" },
      signal: AbortSignal.timeout(15000),
    });
    if (r.status === 404) return res.status(404).json({ error: "Ese mazo de Archidekt no existe o es privado" });
    if (!r.ok) return res.status(502).json({ error: "Archidekt no ha respondido bien" });
    const d = await r.json();
    res.setHeader("Cache-Control", "public, s-maxage=300");
    return res.status(200).json({
      name: d.name || "",
      categories: (d.categories || []).map(c => ({ name: c.name, includedInDeck: c.includedInDeck !== false })),
      cards: (d.cards || []).slice(0, 400).map(c => ({
        quantity: c.quantity || 1, categories: c.categories || [],
        card: { oracleCard: { name: c.card && c.card.oracleCard && c.card.oracleCard.name } },
      })).filter(c => c.card.oracleCard.name),
    });
  } catch {
    return res.status(502).json({ error: "No se pudo conectar con Archidekt" });
  }
}
