// Datos de EDHREC de cada comandante: qué cartas se juegan con él y cuánta sinergia tienen
// (cuánto más se juegan con ESTE comandante que con cualquier otro de sus colores).
// EDHREC no admite peticiones desde el navegador (CORS), así que pasa por /api/edhrec:
// api/edhrec.js en Vercel y dev/serve.ps1 en local.
import { norm } from "./scryfall.js";

const cache = new Map();

// «Atraxa, Praetors' Voice» → «atraxa-praetors-voice». Con dos comandantes, por orden alfabético.
export const slugOf = name => norm(String(name).split(" // ")[0]).replace(/[^a-z0-9\s-]/g, "").trim().replace(/\s+/g, "-").replace(/-+/g, "-");
const pageOf = cmds => cmds.map(c => slugOf(c.name)).sort().join("-");

async function fetchPage(slug, hops = 0) {
  const r = await fetch("/api/edhrec?c=" + encodeURIComponent(slug));
  if (!r.ok) return null;
  const j = await r.json();
  if (j && j.redirect && hops < 2) return fetchPage(String(j.redirect).replace(/^\/?commanders\//, ""), hops + 1);
  return j && j.container ? j : null;
}

// Devuelve { cards: Map(clave → { name, synergy, inclusion, decks }), decks } o null si EDHREC no tiene a ese comandante.
// Nunca lanza: si falla la red, la web sigue funcionando sin estos datos.
export function forCommanders(cmds) {
  if (!cmds || !cmds.length) return Promise.resolve(null);
  const slug = pageOf(cmds);
  if (!cache.has(slug)) {
    const p = (async () => {
      let j = await fetchPage(slug).catch(() => null);
      if (!j && cmds.length > 1) j = await fetchPage(slugOf(cmds[0].name)).catch(() => null);
      if (!j) return null;
      const cards = new Map(); let decks = 0;
      for (const list of (j.container.json_dict && j.container.json_dict.cardlists) || []) {
        for (const v of list.cardviews || []) {
          if (!v || !v.name) continue;
          const k = norm(v.name);
          decks = Math.max(decks, +v.potential_decks || 0); // mazos de este comandante en EDHREC
          if (cards.has(k)) continue;
          const inclusion = v.potential_decks ? (v.num_decks || 0) / v.potential_decks : 0;
          cards.set(k, { name: v.name, synergy: +v.synergy || 0, inclusion, decks: v.num_decks || 0 });
        }
      }
      return cards.size ? { cards, decks } : null;
    })();
    cache.set(slug, p);
    p.then(v => { if (!v) cache.delete(slug); });
  }
  return cache.get(slug);
}
