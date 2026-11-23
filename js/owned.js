// Construir con tu colección: lo comparten Construir y Paso a paso.
// Modo: "" (no tenerla en cuenta), "prio" (primero las que tengo) u "only" (solo las que tengo).
import * as SF from "./scryfall.js";
import * as A from "./analysis.js";
import * as Coll from "./collection.js";

const KEY = "forja-modo-coleccion";
export const getMode = () => { try { const v = localStorage.getItem(KEY) || ""; return ["prio", "only"].includes(v) ? v : ""; } catch { return ""; } };
export const setMode = v => { try { localStorage.setItem(KEY, ["prio", "only"].includes(v) ? v : ""); } catch {} };
export const hasCollection = () => !Coll.isEmpty();
export const owns = c => Coll.owns(c.name);
export const MODES = { "": "No tenerla en cuenta", prio: "Primero las que tengo", only: "Solo las que tengo" };

// Tus cartas (no básicas) legales y dentro de la identidad de color `ci`, ya buscadas en Scryfall.
// La primera vez puede tardar unos segundos con colecciones grandes; luego queda en memoria.
export async function ownedCards(ci, { max = 3000 } = {}) {
  const names = Coll.owned().map(x => x.n).slice(0, max);
  if (!names.length) return [];
  await SF.collection(names, { fuzzyLimit: 0 }).catch(() => {});
  const seen = new Set();
  return names.map(n => SF.cached(n)).filter(c => {
    if (!c || !c.legal || A.isBasic(c) || !A.subsetCI(c.ci, ci)) return false;
    const k = A.key(c); if (seen.has(k)) return false; seen.add(k); return true;
  });
}

// Cuántas cartas del mazo tienes y qué te falta comprar (las básicas no cuentan).
export function summary(cards) {
  let have = 0; const missing = [];
  for (const { c, q } of cards.values()) {
    if (A.isBasic(c)) continue;
    const got = Math.min(q, Coll.qty(c.name));
    have += got;
    if (got < q) missing.push({ c, q: q - got });
  }
  return { have, missing, price: missing.reduce((a, m) => a + (m.c.price || 0) * m.q, 0) };
}
