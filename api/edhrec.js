// Función de Vercel: puente con los datos públicos de EDHREC de cada comandante
// (su web no admite peticiones desde el navegador). GET /api/edhrec?c=<nombre-del-comandante>
export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Método no permitido" });
  const slug = String((req.query && req.query.c) || "");
  if (!/^[a-z0-9-]{1,160}$/.test(slug)) return res.status(400).json({ error: "Comandante no válido" });
  try {
    const r = await fetch(`https://json.edhrec.com/pages/commanders/${slug}.json`, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(15000) });
    if (!r.ok) return res.status(404).json({ error: "EDHREC no tiene datos de este comandante" });
    const j = await r.json();
    // Se guarda un día en la caché de Vercel: los datos de EDHREC cambian poco.
    res.setHeader("Cache-Control", "public, s-maxage=86400, stale-while-revalidate=3600");
    if (j.redirect) return res.status(200).json({ redirect: j.redirect });
    const lists = ((j.container && j.container.json_dict && j.container.json_dict.cardlists) || []).map(l => ({
      header: l.header, tag: l.tag,
      cardviews: (l.cardviews || []).map(v => ({ name: v.name, synergy: v.synergy, num_decks: v.num_decks, potential_decks: v.potential_decks })),
    }));
    return res.status(200).json({ container: { json_dict: { cardlists: lists } } });
  } catch {
    return res.status(502).json({ error: "No se pudo conectar con EDHREC" });
  }
}
