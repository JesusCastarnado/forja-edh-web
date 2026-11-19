// «Mis mazos»: mazos guardados en este navegador (localStorage). Cada mazo guarda su lista en texto
// y una foto de sus estadísticas para pintar la galería sin consultar Scryfall.
import * as A from "./analysis.js";

const KEY = "forja-mazos";

function read() {
  try { const v = JSON.parse(localStorage.getItem(KEY) || "[]"); return Array.isArray(v) ? v.filter(d => d && d.id && typeof d.text === "string") : []; }
  catch { return []; }
}
function write(all) {
  try { localStorage.setItem(KEY, JSON.stringify(all)); return true; }
  catch { return false; } // sin espacio o almacenamiento bloqueado
}
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export const list = () => read().sort((a, b) => (b.updated || 0) - (a.updated || 0));
export const get = id => read().find(d => d.id === id) || null;

// Crea o actualiza un mazo. Devuelve su id, o null si el navegador no deja guardar.
export function upsert({ id, name, cmds, cards }) {
  const all = read(), s = A.analyze({ cmds, cards }), now = Date.now();
  const d = {
    id: id || newId(), name: String(name || "").trim().slice(0, 80) || cmds.map(c => c.name).join(" + ") || "Mazo sin nombre",
    cmds: cmds.map(c => c.name), text: A.deckToText({ cmds, cards }), updated: now,
    stats: { total: s.total, price: Math.round(s.price), bracket: s.bracket, grade: s.grade, ci: s.ci, art: (cmds[0] && cmds[0].art) || "" },
  };
  const i = all.findIndex(x => x.id === d.id);
  if (i >= 0) { d.created = all[i].created || now; all[i] = d; } else { d.created = now; all.push(d); }
  return write(all) ? d.id : null;
}
export function rename(id, name) {
  const all = read(), d = all.find(x => x.id === id); if (!d) return;
  d.name = String(name).trim().slice(0, 80) || d.name; d.updated = Date.now(); write(all);
}
export function duplicate(id) {
  const all = read(), d = all.find(x => x.id === id); if (!d) return null;
  const copy = { ...d, id: newId(), name: (d.name + " (copia)").slice(0, 80), created: Date.now(), updated: Date.now() };
  all.push(copy); return write(all) ? copy.id : null;
}
export function remove(id) { write(read().filter(d => d.id !== id)); }

// Copia de seguridad: los mazos viven en este navegador, así que se pueden llevar a otro con un .json.
export const exportJSON = () => JSON.stringify({ app: "forja-edh", version: 1, decks: read() }, null, 2);
export function importJSON(text) {
  const data = JSON.parse(text), incoming = Array.isArray(data) ? data : data && data.decks;
  if (!Array.isArray(incoming)) throw new Error("El archivo no es una copia de Mis mazos");
  const all = read(); let n = 0;
  for (const d of incoming) {
    if (!d || typeof d.text !== "string" || !d.text.trim()) continue;
    const clean = { id: String(d.id || newId()), name: String(d.name || "Mazo importado").slice(0, 80), cmds: Array.isArray(d.cmds) ? d.cmds.map(String) : [],
      text: d.text, created: +d.created || Date.now(), updated: +d.updated || Date.now(), stats: d.stats && typeof d.stats === "object" ? d.stats : {} };
    const i = all.findIndex(x => x.id === clean.id);
    if (i >= 0) { if ((all[i].updated || 0) >= clean.updated) continue; all[i] = clean; } else all.push(clean);
    n++;
  }
  if (!write(all)) throw new Error("El navegador no deja guardar más datos");
  return n;
}
