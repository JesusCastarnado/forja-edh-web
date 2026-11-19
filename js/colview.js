// Pestaña «Colección» (cartas que tienes y lista de deseos) y el panel «Tu colección» de Analizar.
import * as SF from "./scryfall.js";
import * as A from "./analysis.js";
import * as Coll from "./collection.js";
import * as Cloud from "./cloud.js";
import { money, cardMoney } from "./currency.js";

const $ = s => document.querySelector(s);
let H = null; // utilidades de app.js: esc, toast, attachAC, thinking, pipsHTML, getDeck, onChange
let shown = 60, loading = null;

/* ---------- leer listas ---------- */
// CSV de ManaBox, Moxfield, Deckbox…: busca las columnas de nombre y cantidad en la cabecera.
function parseCSV(text) {
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const cells = []; let cur = "", q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (q) { if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
      else if (ch === '"') q = true; else if (ch === "," || ch === ";") { cells.push(cur); cur = ""; } else cur += ch;
    }
    cells.push(cur); rows.push(cells.map(x => x.trim()));
  }
  if (rows.length < 2) return null;
  const head = rows[0].map(x => x.toLowerCase());
  const ni = head.findIndex(x => x === "name" || x === "card name" || x === "card" || x === "nombre");
  const qi = head.findIndex(x => ["quantity", "count", "qty", "cantidad", "amount"].includes(x));
  if (ni < 0) return null;
  return rows.slice(1).map(r => ({ name: r[ni], qty: qi >= 0 ? parseInt(r[qi]) || 1 : 1 })).filter(x => x.name);
}
function parseText(text) {
  const firstLine = (text.split(/\r?\n/).find(l => l.trim()) || "").toLowerCase();
  if (/(^|[,;"])\s*(name|card name|nombre)\s*("?)([,;]|$)/.test(firstLine)) { const csv = parseCSV(text); if (csv) return csv; }
  const p = A.parseList(text);
  return [...p.cmd, ...p.main].map(e => ({ name: e.name, qty: e.qty }));
}

async function importText(text) {
  const st = $("#colImportStatus"), mode = $("#colMode").value;
  const raw = parseText(text);
  if (!raw.length) { st.innerHTML = '<span class="lo">No he encontrado ninguna carta en el texto.</span>'; return; }
  st.innerHTML = `<span class="spin"></span><span>Buscando ${raw.length} cartas en Scryfall…</span>`;
  try {
    const { found, notFound } = await SF.collection(raw.map(x => x.name), { fuzzyLimit: 10 });
    const sum = new Map();
    for (const x of raw) { const c = found.get(SF.norm(x.name)); if (!c) continue; sum.set(c.name, (sum.get(c.name) || 0) + x.qty); }
    Coll.bulk([...sum].map(([name, qty]) => ({ name, qty })), mode);
    const n = [...sum.values()].reduce((a, b) => a + b, 0);
    st.innerHTML = `<span class="ok">Importadas ${n} cartas (${sum.size} distintas).</span>` + (notFound.length ? ` <span class="lo">No encontradas (${notFound.length}): ${notFound.slice(0, 8).map(H.esc).join(", ")}${notFound.length > 8 ? "…" : ""}</span>` : "");
    $("#colText").value = "";
  } catch (e) { st.innerHTML = `<span class="no">No se pudo consultar Scryfall: ${H.esc(e.message || e)}</span>`; }
}

/* ---------- precios (las cartas se buscan en Scryfall al abrir la pestaña) ---------- */
function ensureCards() {
  const names = [...Coll.owned(), ...Coll.wishlist()].map(x => x.n).filter(n => !SF.cached(n));
  if (!names.length) return Promise.resolve();
  if (!loading) loading = SF.collection(names, { fuzzyLimit: 0 }).catch(() => {}).finally(() => { loading = null; });
  return loading;
}

/* ---------- pestaña Colección ---------- */
function renderStats() {
  const own = Coll.owned(), wish = Coll.wishlist();
  const copies = own.reduce((n, x) => n + x.q, 0);
  const value = own.reduce((n, x) => { const c = SF.cached(x.n); return n + (c ? c.price * x.q : 0); }, 0);
  const wishCost = wish.reduce((n, x) => { const c = SF.cached(x.n); return n + (c ? c.price : 0); }, 0);
  const cs = Cloud.state();
  $("#colStats").innerHTML = `<div class="gstats">
      <div><span class="eyebrow">Cartas distintas</span><b>${own.length.toLocaleString("es-ES")}</b></div>
      <div><span class="eyebrow">Copias</span><b>${copies.toLocaleString("es-ES")}</b></div>
      <div><span class="eyebrow">Valor aprox.</span><b>${money(value)}</b></div>
      <div><span class="eyebrow">Lista de deseos</span><b>${wish.length} · ${money(wishCost)}</b></div>
    </div>
    <p class="muted small" style="margin:8px 0 0">${!cs.configured ? "Se guarda en este navegador." : cs.user ? (cs.colError ? `<span class="lo">${H.esc(cs.colError)}</span>` : "Sincronizada en la nube con tu cuenta.") : 'Se guarda en este navegador. <a href="#mazos">Entra con tu cuenta</a> para tenerla en la nube.'}${loading ? " · Cargando precios…" : ""}</p>`;
  $("#wishTotal").textContent = wish.length ? `${wish.length} · ${money(wishCost)}` : "";
}
function renderList() {
  const e = H.esc, f = SF.norm($("#colFilter").value || ""), sort = $("#colSort").value;
  let list = Coll.owned();
  if (f) list = list.filter(x => { const c = SF.cached(x.n); return SF.norm(x.n + " " + (c ? c.type + " " + c.sub : "")).includes(f); });
  const price = x => { const c = SF.cached(x.n); return c ? c.price : 0; };
  list.sort(sort === "price" ? (a, b) => price(b) - price(a) : sort === "recent" ? (a, b) => (b.u || 0) - (a.u || 0) : (a, b) => a.n.localeCompare(b.n));
  $("#colList").innerHTML = list.slice(0, shown).map(x => {
    const c = SF.cached(x.n);
    return `<div class="colrow">
      <span class="qty"><button class="x" data-cq="${e(x.n)}|-1" aria-label="Una copia menos de ${e(x.n)}">−</button><b class="mono">${x.q}</b><button class="x" data-cq="${e(x.n)}|1" aria-label="Una copia más de ${e(x.n)}">+</button></span>
      <span style="min-width:0"><button class="cn" data-name="${e(x.n)}">${e(x.n)}</button>${c ? `<span class="t muted small">${e(c.type)}</span>` : ""}</span>
      <span class="mono small">${c ? cardMoney(c) : ""}</span>
      <button class="x" data-cdel="${e(x.n)}" aria-label="Quitar ${e(x.n)} de la colección">×</button></div>`;
  }).join("") || `<p class="muted" style="margin:0">${Coll.isEmpty() ? "Tu colección está vacía. Añade cartas con el buscador o importa una lista." : "Ninguna carta coincide con el filtro."}</p>`;
  $("#colMore").hidden = list.length <= shown;
}
function renderWish() {
  const e = H.esc, list = Coll.wishlist().sort((a, b) => a.n.localeCompare(b.n));
  $("#wishList").innerHTML = list.map(x => {
    const c = SF.cached(x.n);
    return `<div class="colrow wish"><span style="min-width:0"><button class="cn" data-name="${e(x.n)}">${e(x.n)}</button></span><span class="mono small">${c ? cardMoney(c) : ""}</span>
      <button class="btn sm" data-cgot="${e(x.n)}">Ya la tengo</button><button class="x" data-cunwish="${e(x.n)}" aria-label="Quitar ${e(x.n)} de la lista de deseos">×</button></div>`;
  }).join("") || '<p class="muted small" style="margin:0">Vacía. Añade cartas aquí o desde Analizar con «Añadir a la lista de deseos».</p>';
}
function renderAll() { renderStats(); renderList(); renderWish(); }

export async function showCollection() {
  renderAll();
  if ([...Coll.owned(), ...Coll.wishlist()].some(x => !SF.cached(x.n))) { renderStats(); await ensureCards(); renderAll(); }
}

/* ---------- panel «Tu colección» en Analizar ---------- */
export function renderColDeck(d) {
  const el = $("#colDeck"), e = H.esc;
  if (!d.cards.size && !d.cmds.length) { el.innerHTML = '<p class="muted small" style="margin:0">Analiza un mazo para ver qué cartas te faltan.</p>'; return; }
  if (Coll.isEmpty()) { el.innerHTML = '<p class="muted small" style="margin:0">Marca en la pestaña <a href="#coleccion">Colección</a> las cartas que tienes y aquí verás cuáles te faltan para este mazo y cuánto cuestan.</p>'; return; }
  const all = [...d.cmds.map(c => ({ c, q: 1 })), ...d.cards.values()].filter(x => !A.isBasic(x.c));
  let need = 0, have = 0; const miss = [];
  for (const { c, q } of all) { const h = Math.min(q, Coll.qty(c.name)); need += q; have += h; if (h < q) miss.push({ c, n: q - h }); }
  const cost = miss.reduce((n, x) => n + x.c.price * x.n, 0);
  miss.sort((a, b) => b.c.price - a.c.price);
  const pct = need ? Math.round(have / need * 100) : 100;
  el.innerHTML = `<div class="kv"><div><span>Tienes</span><b>${have} / ${need}</b></div><div><span>Te faltan</span><b class="${miss.length ? "lo" : "ok"}">${need - have}</b></div><div><span>Cuestan</span><b>${money(cost)}</b></div></div>
    <div class="gtrack" style="margin:10px 0"><span style="width:${pct}%"></span></div>
    ${miss.length ? `<div class="chips">${miss.slice(0, 14).map(x => `<button class="chip" data-name="${e(x.c.name)}">${x.n > 1 ? x.n + " " : ""}${e(x.c.name)} <span class="muted mono">${cardMoney(x.c)}</span>${Coll.wished(x.c.name) ? " ★" : ""}</button>`).join("")}${miss.length > 14 ? `<span class="muted small">y ${miss.length - 14} más</span>` : ""}</div>
      <div class="row" style="margin-top:10px"><button class="btn sm" data-colact="copy">Copiar lista de la compra</button><button class="btn sm" data-colact="wish">Añadir a la lista de deseos</button></div>`
      : '<p class="ok small" style="margin:0">Tienes todas las cartas de este mazo.</p>'}
    <p class="muted small" style="margin:8px 0 0">Las tierras básicas no cuentan.</p>`;
  el.dataset.miss = JSON.stringify(miss.map(x => [x.n, x.c.name]));
}
// Cuántas cartas (no básicas) de una lista en texto te faltan; null si la colección está vacía.
export function deckMissingCount(text) {
  if (Coll.isEmpty()) return null;
  const p = A.parseList(text), need = new Map();
  for (const x of [...p.cmd, ...p.main]) { if (A.isBasic({ name: x.name })) continue; const k = SF.norm(x.name); need.set(k, { n: x.name, q: (need.get(k)?.q || 0) + x.qty }); }
  let miss = 0;
  for (const { n, q } of need.values()) miss += Math.max(0, q - Coll.qty(n));
  return miss;
}

/* ---------- arranque ---------- */
export function initCollection(helpers) {
  H = helpers;
  H.attachAC($("#colAdd"), { query: q => `${q} game:paper`, onPick: (c, inp) => { inp.value = ""; Coll.add(c.name, 1); H.toast(`${c.name}: ${Coll.qty(c.name)} en tu colección`); } });
  H.attachAC($("#wishAdd"), { query: q => `${q} game:paper`, onPick: (c, inp) => { inp.value = ""; if (Coll.owns(c.name)) { H.toast(`Ya tienes ${c.name}`); return; } Coll.setWish(c.name, true); H.toast(`${c.name} añadida a la lista de deseos`); } });
  $("#colFilter").addEventListener("input", () => { shown = 60; renderList(); });
  $("#colSort").addEventListener("change", renderList);
  $("#colMore").onclick = () => { shown += 120; renderList(); };
  $("#colImport").onclick = () => importText($("#colText").value);
  $("#colFile").addEventListener("change", async e => { const f = e.target.files[0]; e.target.value = ""; if (f) importText(await f.text()); });
  $("#colExport").onclick = () => {
    const own = Coll.owned().sort((a, b) => a.n.localeCompare(b.n));
    if (!own.length) { H.toast("La colección está vacía"); return; }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([own.map(x => `${x.q} ${x.n}`).join("\n")], { type: "text/plain" }));
    a.download = `forja-coleccion-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  $("#colClear").onclick = () => { if (!Coll.isEmpty() && confirm("¿Vaciar tu colección? Se quitan todas las cartas (la lista de deseos se queda). Descarga antes una copia si la quieres guardar.")) Coll.clearOwned(); };
  const copy = text => navigator.clipboard.writeText(text).then(() => H.toast("Lista copiada"), () => H.toast("No se pudo copiar"));
  $("#wishCopy").onclick = () => { const w = Coll.wishlist(); if (!w.length) { H.toast("La lista de deseos está vacía"); return; } copy(w.map(x => "1 " + x.n).join("\n")); };
  $("#view-coleccion").addEventListener("click", e => {
    const q = e.target.closest("[data-cq]"), del = e.target.closest("[data-cdel]"), got = e.target.closest("[data-cgot]"), un = e.target.closest("[data-cunwish]");
    if (q) { const [n, d] = q.dataset.cq.split("|"); Coll.setQty(n, Coll.qty(n) + +d); }
    else if (del) Coll.setQty(del.dataset.cdel, 0);
    else if (got) { Coll.add(got.dataset.cgot, 1); H.toast(`${got.dataset.cgot} pasa a tu colección`); }
    else if (un) Coll.setWish(un.dataset.cunwish, false);
  });
  $("#colDeck").addEventListener("click", e => {
    const b = e.target.closest("[data-colact]"); if (!b) return;
    let miss = []; try { miss = JSON.parse($("#colDeck").dataset.miss || "[]"); } catch {}
    if (!miss.length) return;
    if (b.dataset.colact === "copy") copy(miss.map(([n, name]) => `${n} ${name}`).join("\n"));
    else { Coll.addWishes(miss.map(x => x[1])); H.toast(`${miss.length} ${miss.length === 1 ? "carta añadida" : "cartas añadidas"} a la lista de deseos`); }
  });
  Coll.onChange(() => { if (!$("#view-coleccion").hidden) renderAll(); H.onChange(); });
  Cloud.onState(() => { if (!$("#view-coleccion").hidden) renderStats(); });
  addEventListener("currencychange", () => { if (!$("#view-coleccion").hidden) renderAll(); });
}
