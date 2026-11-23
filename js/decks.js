// «Mis mazos»: mazos guardados en este navegador (localStorage). Cada mazo guarda su lista en texto
// y una foto de sus estadísticas para pintar la galería sin consultar Scryfall.
import * as A from "./analysis.js";

const KEY = "forja-mazos";
const TOMBS = "forja-mazos-borrados"; // id -> cuándo se borró, para que el borrado llegue a la nube

const listeners = new Set();
export const onChange = cb => listeners.add(cb);
const notify = () => listeners.forEach(cb => { try { cb(); } catch {} });

function read() {
  try { const v = JSON.parse(localStorage.getItem(KEY) || "[]"); return Array.isArray(v) ? v.filter(d => d && d.id && typeof d.text === "string") : []; }
  catch { return []; }
}
function write(all, quiet = false) {
  try { localStorage.setItem(KEY, JSON.stringify(all)); }
  catch { return false; } // sin espacio o almacenamiento bloqueado
  if (!quiet) notify();
  return true;
}
export function tombs() { try { const t = JSON.parse(localStorage.getItem(TOMBS) || "{}"); return t && typeof t === "object" ? t : {}; } catch { return {}; } }
function addTomb(id) { const t = tombs(); t[id] = Date.now(); try { localStorage.setItem(TOMBS, JSON.stringify(t)); } catch {} }
export function clearTombs(ids) { const t = tombs(); ids.forEach(id => delete t[id]); try { localStorage.setItem(TOMBS, JSON.stringify(t)); } catch {} }

// Acceso directo para la sincronización: escribe sin avisar, para no provocar otra sincronización.
export const _all = read;
export const _save = all => write(all, true);
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export const list = () => read().sort((a, b) => (b.updated || 0) - (a.updated || 0));
export const get = id => read().find(d => d.id === id) || null;

const MAX_VERSIONS = 20;
// La versión de un mazo que se guarda en su historial (lo justo para verla, compararla y restaurarla).
const snapshot = d => ({ at: d.updated || Date.now(), name: d.name, cmds: d.cmds || [], text: d.text, stats: d.stats || {}, note: d.note || "" });

// Crea o actualiza un mazo. Devuelve su id, o null si el navegador no deja guardar.
// Si la lista cambia, la versión anterior pasa al historial del mazo (las últimas 20).
// `note`: qué cambió en esta versión («Sugerencias de Pablo», «Autorrelleno»…), opcional.
export function upsert({ id, name, cmds, cards, note = "" }) {
  const all = read(), s = A.analyze({ cmds, cards }), now = Date.now();
  const d = {
    id: id || newId(), name: String(name || "").trim().slice(0, 80) || cmds.map(c => c.name).join(" + ") || "Mazo sin nombre",
    cmds: cmds.map(c => c.name), text: A.deckToText({ cmds, cards }), updated: now,
    stats: { total: s.total, price: Math.round(s.usd), usd: Math.round(s.usd), eur: Math.round(s.eur), bracket: s.bracket, grade: s.grade, ci: s.ci, art: (cmds[0] && cmds[0].art) || "" },
  };
  if (note) d.note = String(note).slice(0, 80);
  const i = all.findIndex(x => x.id === d.id);
  if (i >= 0) {
    const prev = all[i];
    d.created = prev.created || now;
    d.history = prev.text !== d.text ? [snapshot(prev), ...(prev.history || [])].slice(0, MAX_VERSIONS) : (prev.history || []);
    all[i] = d;
  } else { d.created = now; d.history = []; all.push(d); }
  return write(all) ? d.id : null;
}
// Vuelve a una versión anterior. La versión actual pasa al historial, así que también se puede deshacer.
export function restore(id, index) {
  const all = read(), d = all.find(x => x.id === id), v = d && (d.history || [])[index];
  if (!v) return false;
  const now = Date.now();
  d.history = [snapshot(d), ...(d.history || [])].slice(0, MAX_VERSIONS);
  Object.assign(d, { name: v.name, cmds: v.cmds, text: v.text, stats: v.stats, note: `Restaurada la versión del ${new Date(v.at).toLocaleDateString("es-ES")}`, updated: now });
  return write(all);
}
// Diferencias entre dos listas en texto: { added: [{ name, q }], removed: [{ name, q }] }.
export function diff(oldText, newText) {
  const count = text => { const m = new Map(), p = A.parseList(text || ""); for (const e of [...p.cmd, ...p.main]) m.set(e.name, (m.get(e.name) || 0) + e.qty); return m; };
  const a = count(oldText), b = count(newText), added = [], removed = [];
  for (const [n, q] of b) { const d = q - (a.get(n) || 0); if (d > 0) added.push({ name: n, q: d }); }
  for (const [n, q] of a) { const d = q - (b.get(n) || 0); if (d > 0) removed.push({ name: n, q: d }); }
  return { added, removed };
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
export function remove(id) { addTomb(id); write(read().filter(d => d.id !== id)); }

// Copia de seguridad: los mazos viven en este navegador, así que se pueden llevar a otro con un .json.
export const exportJSON = () => JSON.stringify({ app: "forja-edh", version: 1, decks: read() }, null, 2);
export function importJSON(text) {
  const data = JSON.parse(text), incoming = Array.isArray(data) ? data : data && data.decks;
  if (!Array.isArray(incoming)) throw new Error("El archivo no es una copia de Mis mazos");
  const all = read(); let n = 0;
  for (const d of incoming) {
    if (!d || typeof d.text !== "string" || !d.text.trim()) continue;
    const clean = { id: String(d.id || newId()), name: String(d.name || "Mazo importado").slice(0, 80), cmds: Array.isArray(d.cmds) ? d.cmds.map(String) : [],
      text: d.text, created: +d.created || Date.now(), updated: +d.updated || Date.now(), stats: d.stats && typeof d.stats === "object" ? d.stats : {},
      history: Array.isArray(d.history) ? d.history.filter(v => v && typeof v.text === "string").slice(0, MAX_VERSIONS) : [] };
    const i = all.findIndex(x => x.id === clean.id);
    if (i >= 0) { if ((all[i].updated || 0) >= clean.updated) continue; all[i] = clean; } else all.push(clean);
    n++;
  }
  if (!write(all)) throw new Error("El navegador no deja guardar más datos");
  return n;
}
