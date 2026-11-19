// Combos del mazo con los datos gratuitos de Commander Spellbook (https://commanderspellbook.com).
// Su API no admite peticiones desde el navegador (CORS), así que pasa por /api/combos:
// api/combos.js en Vercel y dev/serve.ps1 en local.
import { norm } from "./scryfall.js";

const ENDPOINT = "/api/combos";
const cache = new Map();

// Etiquetas de Commander Spellbook sobre lo fuerte que es un combo (para el bracket).
export const TAGS = {
  R: ["Despiadado", "no"], S: ["Picante", "lo"], P: ["Potente", "lo"],
  O: ["Peculiar", ""], C: ["Core", "ok"], E: ["Exhibición", "ok"], B: ["Con carta prohibida", "no"],
};

const pack = v => ({
  id: String(v.id || ""),
  cards: (v.uses || []).map(u => ({ name: (u.card && u.card.name) || "", img: (u.card && u.card.imageUriFrontSmall) || "" })).filter(x => x.name),
  produces: (v.produces || []).map(p => p.feature && p.feature.name).filter(Boolean),
  description: String(v.description || ""),
  prereq: [v.easyPrerequisites, v.notablePrerequisites].filter(Boolean).join("\n"),
  tag: String(v.bracketTag || ""),
  popularity: +v.popularity || 0,
});
// Combo infinito o que gana la partida (lo que cuenta para el bracket).
export const isInfinite = v => v.produces.some(p => /infinite|win the game|lose the game/i.test(p));
export const comboURL = v => `https://commanderspellbook.com/combo/${encodeURIComponent(v.id)}/`;

// Devuelve { included: [...], almost: [...] } (almost: combos a los que les falta una sola carta).
export function findCombos(d) {
  const cmds = d.cmds.map(c => c.name);
  const main = [...d.cards.values()].map(e => e.c.name);
  const key = cmds.join("|") + "#" + main.slice().sort().join("|");
  if (cache.has(key)) return cache.get(key);
  const p = (async () => {
    let r;
    try {
      r = await fetch(ENDPOINT, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commanders: cmds.map(card => ({ card })), main: main.map(card => ({ card })) }),
      });
    } catch { throw new Error("Sin conexión con el servidor"); }
    if (!r.ok) {
      let b = {}; try { b = await r.json(); } catch {}
      throw new Error(b.error || (r.status === 404 ? "El buscador de combos no está en este servidor (arranca la web con dev\\serve.ps1 o publícala en Vercel)" : "Error " + r.status));
    }
    const j = await r.json(), res = j.results || {};
    const have = new Set([...cmds, ...main].map(norm));
    const included = (res.included || []).map(pack).sort((a, b) => b.popularity - a.popularity);
    const almost = (res.almostIncluded || []).map(pack)
      .map(v => ({ ...v, missing: v.cards.filter(c => !have.has(norm(c.name))) }))
      .filter(v => v.missing.length === 1)
      .sort((a, b) => b.popularity - a.popularity);
    return { included, almost };
  })();
  cache.set(key, p);
  p.catch(() => { if (cache.get(key) === p) cache.delete(key); });
  return p;
}
