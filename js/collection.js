// Colección y lista de deseos. Viven en este navegador (localStorage) y, con sesión, también en la nube
// (tabla `collections` de supabase/schema.sql), sincronizadas carta a carta: gana el cambio más reciente.
import { norm } from "./scryfall.js";
import { isBasic } from "./analysis.js";

const KEY = "forja-coleccion";
// items: { clave: { n: nombre, q: copias, w: en la lista de deseos, u: última modificación en ms } }
// Una carta con q = 0 y w = false se queda como «borrada» para que el borrado también se sincronice.
let items = load();
const listeners = new Set();
export const onChange = cb => listeners.add(cb);

function load() {
  try { const v = JSON.parse(localStorage.getItem(KEY) || "{}"); return v && typeof v === "object" && !Array.isArray(v) ? v : {}; }
  catch { return {}; }
}
function persist(source = "local") {
  try { localStorage.setItem(KEY, JSON.stringify(items)); } catch {}
  listeners.forEach(cb => { try { cb(source); } catch {} });
}
const isBasicName = name => isBasic({ name: String(name) });
const touch = (name, f) => {
  const k = norm(name), it = items[k] ? { ...items[k] } : { n: String(name), q: 0, w: false };
  it.n = String(name); f(it); it.u = Date.now(); items[k] = it;
};

export const qty = name => (items[norm(name)] || {}).q || 0;
// Las tierras básicas cuentan siempre como tuyas.
export const owns = name => isBasicName(name) || qty(name) > 0;
export const wished = name => !!(items[norm(name)] || {}).w;
export const owned = () => Object.values(items).filter(x => x.q > 0);
export const wishlist = () => Object.values(items).filter(x => x.w);
export const isEmpty = () => !owned().length;

export function setQty(name, q) { touch(name, it => { it.q = Math.max(0, Math.min(9999, Math.round(+q || 0))); if (it.q > 0) it.w = false; }); persist(); }
export const add = (name, n = 1) => setQty(name, qty(name) + n);
export function setWish(name, on) { touch(name, it => { it.w = !!on; }); persist(); }
// Varias cartas de golpe: list = [{ name, qty }], mode = "add" (sumar) o "set" (poner esa cantidad).
export function bulk(list, mode = "add") {
  for (const { name, qty: n } of list) touch(name, it => { it.q = Math.max(0, Math.min(9999, mode === "set" ? n : it.q + n)); if (it.q > 0) it.w = false; });
  persist();
}
export function addWishes(names) { for (const n of names) if (!owns(n)) touch(n, it => { it.w = true; }); persist(); }
export function clearOwned() { for (const it of owned()) touch(it.n, x => { x.q = 0; }); persist(); }

// Para la sincronización (cloud.js).
export const _raw = () => items;
// Mezcla lo que hay en la nube. Devuelve { changed: cambió algo aquí, push: hay que subir lo de aquí }.
export function merge(remote) {
  remote = remote && typeof remote === "object" ? remote : {};
  let changed = false, push = false;
  const out = { ...items };
  for (const [k, r] of Object.entries(remote)) {
    if (!r || typeof r !== "object") continue;
    const l = out[k];
    if (!l || (+r.u || 0) > (+l.u || 0)) { out[k] = { n: String(r.n || k), q: Math.max(0, +r.q || 0), w: !!r.w, u: +r.u || 0 }; changed = true; }
    else if ((+l.u || 0) > (+r.u || 0)) push = true;
  }
  for (const k of Object.keys(out)) if (!remote[k]) push = true;
  items = out;
  if (changed) persist("sync");
  return { changed, push };
}
