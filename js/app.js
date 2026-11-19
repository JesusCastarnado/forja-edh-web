import * as SF from "./scryfall.js";
import * as A from "./analysis.js";
import * as AI from "./ai.js";
import { initGuided, showGuided, editInGuided, newDeck } from "./guided.js";
import * as Decks from "./decks.js";
import * as Cloud from "./cloud.js";
import { initShared, showShared } from "./shared.js";
import * as Combos from "./combos.js";
import * as Edh from "./edhrec.js";
import { initCompare, showCompare } from "./compare.js";
import { initGoldfish, showGoldfish } from "./goldfish.js";
import { initCollection, showCollection, renderColDeck as colDeckHTML, deckMissingCount } from "./colview.js";
import { money, cardMoney, currency, symbol, setCurrency, currencyName } from "./currency.js";

const { F } = A;
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const store = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch {} } };
const today = new Date().toISOString().slice(0, 10);

/* ---------- pequeñas piezas de HTML ---------- */
function manaHTML(cost) {
  if (!cost) return "";
  const parts = cost.split(" // ")[0].match(/\{[^}]+\}/g) || [];
  return '<span class="cost">' + parts.map(p => {
    const s = p.slice(1, -1);
    if (/^[WUBRGC]$/.test(s)) return `<span class="ms ${s}">${s === "C" ? "◇" : ""}</span>`;
    const h = s.match(/^([WUBRG2C])\/([WUBRGP])$/);
    if (h) { const v = x => (x === "P" || x === "2" || x === "C") ? "var(--mC)" : `var(--m${x})`; return `<span class="ms hy" style="--a:${v(h[1])};--b:${v(h[2])}"></span>`; }
    return `<span class="ms">${esc(s)}</span>`;
  }).join("") + "</span>";
}
const pipsHTML = ci => '<span class="pips">' + (ci ? [...ci].map(c => `<span class="ms ${c}"></span>`).join("") : '<span class="ms C">◇</span>') + "</span>";
function tagsHTML(c) {
  const f = c.flags, t = [];
  if (f & F.RAMP) t.push("R"); if (f & F.DRAW) t.push("D"); if (f & F.REM) t.push("X"); if (f & F.WIPE) t.push("B"); if (f & F.TUTOR) t.push("T"); if (f & F.COUNTER) t.push("C");
  return '<span class="tags">' + t.map(x => `<span class="tag">${x}</span>`).join("") + (c.gc ? '<span class="tag gc">GC</span>' : "") + "</span>";
}
const nameBtn = c => `<button class="cn" data-name="${esc(c.name)}">${esc(c.name)}</button>`;
const vcard = (c, extra = "", cls = "") => `<button class="vcard ${cls}" data-name="${esc(c.name)}" aria-label="${esc(c.name)}">${c.img ? `<img src="${esc(c.img)}" alt="" loading="lazy">` : `<span class="noimg">${esc(c.name)}</span>`}${extra}</button>`;
const isPreview = c => c.released && c.released > today;
function toast(msg) { const d = document.createElement("div"); d.className = "toast"; d.textContent = msg; document.body.append(d); setTimeout(() => d.remove(), 2200); }
const thinking = label => `<div class="status"><span class="spin"></span><span class="msg">${esc(label)}</span></div>`;

/* ---------- vista previa de cartas ---------- */
const peek = $("#peek");
document.addEventListener("mouseover", e => {
  const el = e.target.closest("[data-name]"); if (!el) return;
  const c = SF.cached(el.dataset.name); if (!c || !c.img || el.classList.contains("vcard")) return;
  peek.src = c.img; peek.hidden = false;
});
document.addEventListener("mousemove", e => {
  if (peek.hidden) return;
  const w = 250, h = 350, pad = 18;
  let x = e.clientX + pad, y = e.clientY - h / 2;
  if (x + w > innerWidth - 8) x = e.clientX - w - pad;
  y = Math.max(8, Math.min(innerHeight - h - 8, y));
  peek.style.left = x + "px"; peek.style.top = y + "px";
});
document.addEventListener("mouseout", e => { if (e.target.closest("[data-name]")) peek.hidden = true; });

const zoom = $("#zoom");
function openZoom(c) {
  peek.hidden = true;
  zoom.innerHTML = `<div class="box">
    <div class="imgs">${c.img ? `<img src="${esc(c.img)}" alt="${esc(c.name)}">` : ""}${c.back ? `<img src="${esc(c.back)}" alt="Cara trasera">` : ""}</div>
    <div style="display:grid;gap:8px;align-content:start;min-width:0">
      <div class="row between"><h3>${esc(c.name)}</h3>${manaHTML(c.cost)}</div>
      <div class="typeline">${esc(c.type)}${c.sub ? " — " + esc(c.sub) : ""}</div>
      <div class="oracle">${esc(c.text)}</div>
      <div class="kv"><div><span>EDHREC</span><b>${c.rank >= 99999 ? "–" : "#" + c.rank}</b></div><div><span>Precio</span><b>${cardMoney(c)}</b></div><div><span>Edición</span><b style="font-family:var(--f-body)">${esc(c.set)}</b></div></div>
      <p class="small" style="margin:0">${c.legal ? '<span class="ok">Legal en Commander</span>' : isPreview(c) ? `<span class="lo">Preview: sale el ${esc(c.released)}</span>` : '<span class="no">No legal en Commander</span>'}${c.gc ? ' · <span class="tag gc">Game Changer</span>' : ""}</p>
      <div class="row">${$("#view-guiado").hidden && $("#view-compartido").hidden && deck.cmds.length && !deck.cards.has(A.key(c)) && !deck.cmds.some(x => x.name === c.name) ? `<button class="btn primary sm" data-addz="${esc(c.name)}">Añadir al mazo</button>` : ""}<a class="btn sm" href="${esc(c.uri)}" target="_blank" rel="noopener" style="text-decoration:none">Ver en Scryfall</a><button class="btn sm" data-close>Cerrar</button></div>
    </div></div>`;
  zoom.hidden = false;
  zoom.querySelector("[data-close]").focus();
}
zoom.addEventListener("click", e => {
  if (e.target === zoom || e.target.closest("[data-close]")) { zoom.hidden = true; return; }
  const a = e.target.closest("[data-addz]");
  if (a) { const c = SF.cached(a.dataset.addz); if (c) { addToDeck(c); syncText(); render(); toast(c.name + " añadida"); } zoom.hidden = true; }
});
document.addEventListener("keydown", e => { if (e.key === "Escape" && !zoom.hidden) zoom.hidden = true; });
document.addEventListener("click", e => {
  const el = e.target.closest(".cn,.vcard,.chip");
  if (!el || !el.dataset.name || el.closest("#newCmds")) return;
  const c = SF.cached(el.dataset.name); if (c) openZoom(c);
});

/* ---------- autocompletado con Scryfall ---------- */
function attachAC(input, { query, onPick }) {
  const ul = document.createElement("ul"); ul.hidden = true; ul.setAttribute("role", "listbox");
  input.closest(".ac").append(ul);
  let items = [], sel = -1, timer = null, seq = 0;
  const render = () => {
    ul.hidden = !items.length;
    ul.innerHTML = items.map((c, k) => `<li role="option" data-k="${k}" aria-selected="${k === sel}">${c.art ? `<img src="${esc(c.art)}" alt="">` : "<span></span>"}<span style="min-width:0">${esc(c.name)}<span class="t">${esc(c.type)}${c.sub ? " — " + esc(c.sub) : ""}</span></span>${pipsHTML(c.ci)}</li>`).join("");
  };
  const pick = c => { ul.hidden = true; items = []; onPick ? onPick(c, input) : (input.value = c.name); };
  input.addEventListener("input", () => {
    clearTimeout(timer);
    const q = input.value.trim();
    if (q.length < 2) { items = []; render(); return; }
    timer = setTimeout(async () => {
      const my = ++seq;
      try { const res = await SF.search(query(q)); if (my !== seq) return; items = res.slice(0, 8); sel = items.length ? 0 : -1; render(); }
      catch { /* sin resultados o sin red */ }
    }, 280);
  });
  input.addEventListener("keydown", e => {
    if (ul.hidden) return;
    if (e.key === "ArrowDown") { sel = Math.min(items.length - 1, sel + 1); render(); e.preventDefault(); }
    else if (e.key === "ArrowUp") { sel = Math.max(0, sel - 1); render(); e.preventDefault(); }
    else if (e.key === "Enter" && sel >= 0) { pick(items[sel]); e.preventDefault(); }
    else if (e.key === "Escape") ul.hidden = true;
  });
  ul.addEventListener("mousedown", e => { const li = e.target.closest("li"); if (li) { e.preventDefault(); pick(items[+li.dataset.k]); } });
  input.addEventListener("blur", () => setTimeout(() => { ul.hidden = true; }, 150));
}
const cmdQuery = q => `is:commander game:paper ${q}`;

/* ---------- estado del mazo ---------- */
let deck = { cmds: [], cards: new Map(), unknown: [], illegal: [] };
let viewMode = store.get("forja-view") === "visual" ? "visual" : "list";

async function loadFromText(text, overrideNames = []) {
  const n = new Set(A.parseList(text).main.map(e => e.name)).size;
  const st = $("#loadStatus");
  st.innerHTML = `<span class="spin"></span><span>Buscando ${n} cartas en Scryfall…</span>`;
  try {
    deck = await buildDeck(text, overrideNames);
    st.innerHTML = "";
  } catch (e) {
    st.innerHTML = `<span class="no">No se pudo consultar Scryfall: ${esc(e.message || e)}. Comprueba la conexión y vuelve a intentarlo.</span>`;
  }
}
// Lee una lista en texto y la convierte en mazo, sin tocar el de Analizar (también lo usa la importación de Mis mazos).
async function buildDeck(text, overrideNames = []) {
  const p = A.parseList(text);
  const names = [...p.main, ...p.cmd].map(e => e.name).concat(overrideNames);
  {
    const { found } = await SF.collection(names);
    const get = n => found.get(SF.norm(n)) || SF.cached(n);
    let cmds = (overrideNames.length ? overrideNames : p.cmd.map(e => e.name)).map(get).filter(Boolean);
    let main = p.main;
    if (!cmds.length && p.lastBlock && p.lastBlock.length <= 2) {
      const cs = p.lastBlock.map(e => get(e.name));
      if (cs.every(c => c && c.isCmd)) { cmds = cs; main = main.filter(e => !p.lastBlock.includes(e)); }
    }
    const cards = new Map(), unknown = [], illegal = [];
    p.cmd.forEach(e => { if (!get(e.name)) unknown.push(e.name); });
    for (const e of main) {
      const c = get(e.name);
      if (!c) { unknown.push(e.name); continue; }
      if (cmds.some(x => x.name === c.name)) continue;
      if (!c.legal && !A.isBasic(c)) illegal.push(c);
      const k = A.key(c), cur = cards.get(k);
      cards.set(k, { c, q: (cur ? cur.q : 0) + e.qty });
    }
    return { cmds: cmds.slice(0, 2), cards, unknown, illegal };
  }
}
function syncText() { $("#deckText").value = A.deckToText(deck); setCmdInputs(); }
function setCmdInputs() { $("#cmd1").value = deck.cmds[0] ? deck.cmds[0].name : ""; $("#cmd2").value = deck.cmds[1] ? deck.cmds[1].name : ""; }
function addToDeck(c, q = 1) { if (deck.cmds.some(x => x.name === c.name)) return; const k = A.key(c), e = deck.cards.get(k); deck.cards.set(k, { c, q: (e ? e.q : 0) + q }); }
function removeFromDeck(c) { const k = A.key(c), e = deck.cards.get(k); if (!e) return; if (e.q > 1 && A.isBasic(c)) e.q--; else deck.cards.delete(k); }

/* ---------- pintar el análisis ---------- */
function render() {
  const k = A.deckToText(deck);
  const s = A.analyze(deck, { combos: comboKey === k ? comboData : null });
  const cmd0 = deck.cmds[0];
  const cmdNames = deck.cmds.map(c => c.name).join(" + ") || "Sin comandante";
  $("#summary").innerHTML = `
    <div class="cmdcell" ${cmd0 && cmd0.art ? `style="background-image:url('${esc(cmd0.art)}')"` : ""}><div><div class="eyebrow">Comandante</div><div class="cmdname">${deck.cmds.length ? deck.cmds.map(nameBtn).join(" + ") : esc(cmdNames)}</div><div style="margin-top:4px">${deck.cmds.length ? pipsHTML(s.ci) : '<span class="muted small">Elige uno arriba para comprobar la identidad de color.</span>'}</div></div></div>
    <div><div class="eyebrow">Nota</div><div class="big grade">${s.grade}</div><div class="muted small">${s.level} · ${s.score}/100</div></div>
    <div><div class="eyebrow">Bracket estimado</div><div class="big">B${s.bracket}</div><div class="muted small">${A.BRK[s.bracket]} · ${s.gc.length} Game Changers${s.twoCard ? ` · ${s.twoCard} ${s.twoCard === 1 ? "combo" : "combos"} de 2 cartas` : ""}</div></div>
    <div><div class="eyebrow">Cartas</div><div class="big mono ${s.total === 100 ? "" : "no"}">${s.total}</div><div class="muted small">${s.total === 100 ? "Mazo completo" : s.total < 100 ? `Faltan ${100 - s.total}` : `Sobran ${s.total - 100}`}</div></div>
    <div><div class="eyebrow">Precio aprox.</div><div class="big mono">${money(s.price)}</div><div class="muted small">CMC medio ${s.avgCmc.toFixed(2)}</div></div>`;

  const groups = {};
  for (const e of deck.cards.values()) (groups[A.groupOf(e.c)] ||= []).push(e);
  const bad = new Set([...s.offColor, ...deck.illegal].map(c => c.name));
  let html = "";
  if (viewMode === "visual") {
    if (deck.cmds.length) html += `<div class="vgroup"><h4>Comandante</h4><div class="vgrid">${deck.cmds.map(c => vcard(c)).join("")}</div></div>`;
    for (const g of A.ORDER) { const arr = groups[g]; if (!arr) continue;
      arr.sort((a, b) => a.c.cmc - b.c.cmc || a.c.name.localeCompare(b.c.name));
      html += `<div class="vgroup"><h4>${g} · ${arr.reduce((n, e) => n + e.q, 0)}</h4><div class="vgrid">${arr.map(e => vcard(e.c, e.q > 1 ? `<span class="qb">${e.q}</span>` : "", bad.has(e.c.name) ? "bad" : "")).join("")}</div></div>`; }
  } else {
    html = '<div class="groups">';
    if (deck.cmds.length) html += `<div class="group"><h4><span>Comandante</span><span>${deck.cmds.length}</span></h4>${deck.cmds.map(c => rowHTML(c, 1, false, true)).join("")}</div>`;
    for (const g of A.ORDER) { const arr = groups[g]; if (!arr) continue;
      arr.sort((a, b) => a.c.cmc - b.c.cmc || a.c.name.localeCompare(b.c.name));
      html += `<div class="group"><h4><span>${g}</span><span>${arr.reduce((n, e) => n + e.q, 0)}</span></h4>${arr.map(e => rowHTML(e.c, e.q, bad.has(e.c.name))).join("")}</div>`; }
    html += "</div>";
  }
  $("#deckList").innerHTML = deck.cards.size || deck.cmds.length ? html : '<p class="muted">Pega una lista y pulsa «Analizar mazo».</p>';

  const max = Math.max(1, ...s.curve);
  $("#curve").innerHTML = s.curve.map((n, i) => `<div class="col"><span class="n">${n}</span><div class="bar" style="height:${n / max * 100}%"></div><span class="lb">${i === 7 ? "7+" : i}</span></div>`).join("");
  $("#curveNote").textContent = `${s.nonland} hechizos · ${s.lands} tierras · CMC medio ${s.avgCmc.toFixed(2)}`;

  $("#meters").innerHTML = A.TARGETS.map(t => {
    const v = s[t.k], scale = t.k === "lands" ? 45 : 16;
    const cls = t.hi ? (v >= t.lo && v <= t.hi ? "ok" : Math.abs(v - t.t) <= 5 ? "lo" : "no") : (v >= t.lo ? "ok" : v >= t.lo - 3 ? "lo" : "no");
    return `<div class="meter"><span>${t.label}${t.k === "interaction" ? ' <span class="muted" style="font-size:12px">+ counters</span>' : ""}</span><div class="track"><div class="fill ${cls}" style="width:${Math.min(100, v / scale * 100)}%"></div><div class="tgt" style="left:${t.t / scale * 100}%"></div></div><span class="v ${cls}">${v} / ${t.t}</span></div>`;
  }).join("") + `<div class="meter"><span>Tutores</span><div></div><span class="v">${s.tutors}</span></div>`;

  $("#types").innerHTML = A.ORDER.filter(g => s.types[g]).map(g => `<div><span>${g}</span><b>${s.types[g]}</b></div>`).join("");
  const pt = Object.values(s.pips).reduce((a, b) => a + b, 0) || 1;
  $("#colors").innerHTML = '<div class="eyebrow" style="margin-bottom:6px">Símbolos de maná en los costes</div>' +
    '<div style="display:flex;height:12px;border-radius:6px;overflow:hidden;border:1px solid var(--line)">' + Object.entries(s.pips).filter(([, v]) => v).map(([k2, v]) => `<div title="${k2}: ${v}" style="width:${v / pt * 100}%;background:var(--m${k2})"></div>`).join("") + "</div>" +
    '<div class="row small" style="margin-top:6px">' + Object.entries(s.pips).filter(([, v]) => v).map(([k2, v]) => `<span>${pipsHTML(k2)} <span class="mono">${v}</span></span>`).join("") + "</div>";

  const N = Math.max(1, s.total - deck.cmds.length), K = s.lands;
  const p2 = A.hyperAtLeast(N, K, 7, 2) - A.hyperAtLeast(N, K, 7, 5), p3 = A.hyperAtLeast(N, K, 7, 3);
  $("#handOdds").innerHTML = `<div class="kv"><div><span>Tierras esperadas</span><b>${(K / N * 7).toFixed(1)}</b></div><div><span>2 a 4 tierras</span><b>${Math.round(p2 * 100)} %</b></div><div><span>3 o más</span><b>${Math.round(p3 * 100)} %</b></div><div><span>Ramp en mano</span><b>${Math.round(A.hyperAtLeast(N, s.ramp, 7, 1) * 100)} %</b></div></div>`;

  const iss = [];
  if (!deck.cmds.length) iss.push("Sin comandante: no se puede comprobar la identidad de color.");
  if (s.total !== 100) iss.push(`El mazo tiene ${s.total} cartas; Commander pide exactamente 100.`);
  s.offColor.forEach(c => iss.push(`<span class="no">${esc(c.name)}</span> está fuera de la identidad de color.`));
  deck.illegal.forEach(c => iss.push(`<span class="no">${esc(c.name)}</span> ${isPreview(c) ? "aún no ha salido (preview)" : "está prohibida o no es legal en Commander"}.`));
  s.dupes.forEach(c => iss.push(`${esc(c.name)} aparece repetida; solo se permite una copia.`));
  if (deck.unknown.length) iss.push(`No encontradas en Scryfall (${deck.unknown.length}): ${deck.unknown.slice(0, 12).map(esc).join(", ")}${deck.unknown.length > 12 ? "…" : ""}. Revisa la ortografía y usa el nombre en inglés.`);
  A.TARGETS.forEach(t => { const v = s[t.k]; if (t.hi) { if (v < t.lo) iss.push(`Pocas tierras (${v}); lo normal son 35–38.`); else if (v > t.hi) iss.push(`Muchas tierras (${v}); podrías cambiar alguna por ramp.`); } else if (v < t.lo) iss.push(`${t.label}: ${v}, por debajo de ${t.t}.`); });
  if (s.avgCmc > 3.6) iss.push(`Curva alta (CMC medio ${s.avgCmc.toFixed(2)}); el mazo puede quedarse lento.`);
  if (s.twoCard) iss.push(`${s.twoCard === 1 ? "Hay un combo infinito" : `Hay ${s.twoCard} combos infinitos`} de dos cartas: el bracket sube a B${s.bracket} como mínimo (mira «Combos»).`);
  $("#issues").innerHTML = iss.length ? iss.map(x => `<li>${x}</li>`).join("") : '<li class="ok">Sin problemas de legalidad ni de esqueleto.</li>';
  store.set("forja-deck", k);
  renderSavedNote();
  renderNews(s.ci);
  renderCombos(k);
  renderColDeck();
}
function rowHTML(c, q, bad, isCmd) {
  return `<div class="card${bad ? " bad" : ""}"><span class="q">${q}</span>${nameBtn(c)}<span>${tagsHTML(c)} ${manaHTML(c.cost)}</span>${isCmd ? "<span></span>" : `<button class="x" data-rm="${esc(c.name)}" aria-label="Quitar ${esc(c.name)}">×</button>`}</div>`;
}
$("#deckList").addEventListener("click", e => {
  const b = e.target.closest("[data-rm]"); if (!b) return;
  const c = SF.cached(b.dataset.rm); if (c) { removeFromDeck(c); syncText(); render(); }
});
document.querySelectorAll("[data-mode]").forEach(b => b.addEventListener("click", () => {
  viewMode = b.dataset.mode; store.set("forja-view", viewMode);
  document.querySelectorAll("[data-mode]").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
  render();
}));
document.querySelectorAll("[data-mode]").forEach(x => x.setAttribute("aria-pressed", String(x.dataset.mode === viewMode)));

function renderColDeck() { colDeckHTML(deck); }

/* ---------- combos (Commander Spellbook) ---------- */
let comboKey = "", comboData = null, comboTimer = null;
function renderCombos(k) {
  const el = $("#combos");
  if (!deck.cards.size) { comboKey = ""; comboData = null; el.innerHTML = '<p class="muted small" style="margin:0">Analiza un mazo para buscar sus combos.</p>'; return; }
  if (k === comboKey) { if (comboData) paintCombos(comboData); return; }
  comboKey = k; comboData = null; clearTimeout(comboTimer);
  el.innerHTML = thinking("Buscando combos en Commander Spellbook…");
  // Espera un poco: si estás añadiendo o quitando cartas seguidas, solo se consulta al final.
  comboTimer = setTimeout(async () => {
    try {
      const data = await Combos.findCombos(deck);
      if (comboKey !== k) return;
      comboData = data; render();
    } catch (e) {
      if (comboKey === k) el.innerHTML = `<p class="no small" style="margin:0">No se pudieron buscar los combos: ${esc(e.message || e)}</p><button class="btn sm" id="comboRetry" style="margin-top:8px">Reintentar</button>`;
    }
  }, 900);
}
const tagHTML = v => { const t = Combos.TAGS[v.tag]; return t ? `<span class="verdict ${t[1]}" title="Etiqueta de Commander Spellbook">${t[0]}</span>` : ""; };
function comboHTML(v, missing) {
  const imgs = v.cards.map(c => `<img src="${esc((SF.cached(c.name) || {}).small || c.img)}" alt="" loading="lazy" class="${missing && SF.norm(missing.name) === SF.norm(c.name) ? "miss" : ""}">`).join("");
  const names = v.cards.map(c => missing && SF.norm(missing.name) === SF.norm(c.name) ? `<b class="lo">${esc(c.name)}</b>` : (SF.cached(c.name) ? nameBtn(SF.cached(c.name)) : esc(c.name))).join(" + ");
  return `<details class="combo"><summary><span class="cimgs">${imgs}</span><span class="cbody"><span class="cnames">${names}</span>
      <span class="small muted">${v.produces.slice(0, 3).map(esc).join(" · ")}${v.produces.length > 3 ? " · …" : ""}</span>
      <span class="row" style="gap:6px">${tagHTML(v)}${Combos.isInfinite(v) && v.cards.length <= 2 ? '<span class="tag gc">2 cartas</span>' : ""}${missing ? `<button class="btn sm" data-cadd="${esc(missing.name)}">Añadir ${esc(missing.name)}</button>` : ""}</span></span></summary>
    <div class="cdesc">${v.prereq ? `<p class="muted small">${esc(v.prereq)}</p>` : ""}<ol>${v.description.split(/\n+/).filter(Boolean).map(l => `<li>${esc(l)}</li>`).join("")}</ol>
      <a class="small" href="${esc(Combos.comboURL(v))}" target="_blank" rel="noopener">Ver en Commander Spellbook</a></div></details>`;
}
let comboAlmostShown = 8;
function paintCombos(d) {
  const el = $("#combos"), two = d.included.filter(v => v.cards.length <= 2 && Combos.isInfinite(v)).length;
  el.innerHTML = `<p class="small" style="margin:0 0 8px"><b>${d.included.length}</b> ${d.included.length === 1 ? "combo completo" : "combos completos"} · <b>${d.almost.length}</b> a una carta${two ? ` · <span class="lo">${two} infinito${two === 1 ? "" : "s"} de 2 cartas</span>` : ""}</p>`
    + (d.included.length ? d.included.map(v => comboHTML(v)).join("") : '<p class="muted small" style="margin:0">El mazo no tiene ningún combo conocido completo.</p>')
    + (d.almost.length ? `<div class="eyebrow" style="margin:14px 0 4px">Te falta una carta</div>${d.almost.slice(0, comboAlmostShown).map(v => comboHTML(v, v.missing[0])).join("")}`
      + (d.almost.length > comboAlmostShown ? `<button class="btn sm" id="comboMore" style="margin-top:8px">Ver más (${d.almost.length - comboAlmostShown})</button>` : "") : "");
}
$("#combos").addEventListener("click", async e => {
  if (e.target.closest("#comboRetry")) { comboKey = ""; render(); return; }
  if (e.target.closest("#comboMore")) { comboAlmostShown += 12; if (comboData) paintCombos(comboData); return; }
  const b = e.target.closest("[data-cadd]"); if (!b) return;
  e.preventDefault(); b.disabled = true;
  await SF.collection([b.dataset.cadd]).catch(() => {});
  const c = SF.cached(b.dataset.cadd), ci = A.ciUnion(deck.cmds);
  if (!c) { toast("No se encontró la carta en Scryfall"); b.disabled = false; return; }
  if (!c.legal || (deck.cmds.length && !A.subsetCI(c.ci, ci))) { toast(`${c.name} no es legal o no entra en tus colores`); return; }
  addToDeck(c); syncText(); render(); toast(c.name + " añadida");
});

/* ---------- novedades ---------- */
// Cartas de los últimos 5 meses en los colores del mazo, con las que encajan con el comandante primero:
// sinergia en EDHREC o su tema (tipo de criatura, fichas, contadores…) en el texto de la carta.
let newsKey = null;
const themedNews = new Map();
// Si el comandante es de una tribu (vampiros, elfos…), manda la tribu; los temas genéricos (fichas, contadores…)
// solo cuentan cuando no tiene tribu, para no llenar la lista de cartas que solo crean una ficha.
function newsReason(c, edh, tribal, themes) {
  const e = A.edhOf(edh, c);
  if (e && e.synergy >= 0.1) return `Sinergia +${pctTxt(e.synergy)}`;
  const hay = SF.norm(c.name + " " + c.type + " " + c.sub + " " + c.text);
  const w = tribal.length ? tribal.find(x => hay.includes(x)) : themes.find(x => hay.includes(x));
  return w ? `Tema «${w}»` : "";
}
async function renderNews(ci) {
  if (!deck.cmds.length) { newsKey = null; $("#news").innerHTML = '<p class="muted small">Elige un comandante para ver las cartas nuevas que encajan con él.</p>'; $("#newsLink").hidden = true; return; }
  const key = ci + "|" + deck.cmds.map(c => c.name).join("|");
  if (newsKey === key) { paintNewsButtons(); return; }
  newsKey = key;
  const since = SF.isoDaysAgo(150), q = `${SF.ciQuery(ci)} date>=${since} -t:basic game:paper not:reprint`;
  const words = A.synergyWords(deck.cmds).filter(w => /^[a-z]+$/.test(w)).slice(0, 5);
  $("#newsLink").href = SF.searchURL(words.length ? `${q} (${words.map(w => `t:${w} or o:${w}`).join(" or ")})` : q); $("#newsLink").hidden = false;
  $("#news").innerHTML = thinking("Buscando novedades para tu comandante…");
  // Novedades (no reimpresiones) en sus colores + novedades de su tema; EDHREC dice cuáles ya se juegan con él.
  const tq = words.length ? `${q} (${words.map(w => `t:${w} or o:${w}`).join(" or ")})` : "";
  if (tq && !themedNews.has(tq)) themedNews.set(tq, SF.search(tq, { order: "released", dir: "desc", pages: 1 }).catch(() => []));
  const [base, themed, edh] = await Promise.all([SF.newsFor(ci), tq ? themedNews.get(tq) : [], edhFor(deck.cmds)]);
  if (newsKey !== key) return;
  const cmdKeys = new Set(deck.cmds.map(A.key)), seen = new Set();
  const all = [...themed, ...base].filter(c => { const k = A.key(c); if (seen.has(k) || cmdKeys.has(k) || !A.subsetCI(c.ci, ci)) return false; seen.add(k); return true; });
  const tribal = A.themeWords(deck.cmds, "").filter(w => /^[a-z]+$/.test(w)), themes = words.filter(w => !tribal.includes(w));
  const em = edhMap(edh), items = all.map(c => ({ c, why: newsReason(c, em, tribal, themes) }));
  const fit = items.filter(x => x.why).sort((a, b) => A.fitScore(a.c, { edh: em, words: tribal.length ? tribal : themes }) - A.fitScore(b.c, { edh: em, words: tribal.length ? tribal : themes }));
  const rest = items.filter(x => !x.why).sort((a, b) => (b.c.released || "").localeCompare(a.c.released || ""));
  const list = [...fit, ...rest].slice(0, 18);
  $("#news").innerHTML = list.length ? list.map(({ c, why }) => `<div class="gc-item">${vcard(c)}
      <div class="meta"><span>${isPreview(c) ? '<span class="tag new">Preview</span>' : esc(c.released)}</span><button class="btn sm" data-addnews="${esc(c.name)}" ${deck.cards.has(A.key(c)) ? "disabled" : ""}>Añadir</button></div>
      ${why ? `<span class="tag syn newswhy" title="Por qué encaja con tu comandante">${esc(why)}</span>` : ""}</div>`).join("")
    : '<p class="muted small">No hay cartas nuevas en estos colores en los últimos meses.</p>';
  $("#newsNote").textContent = fit.length
    ? `${fit.length} ${fit.length === 1 ? "encaja" : "encajan"} con ${deck.cmds.map(c => c.name.split(",")[0]).join(" y ")} (primero las de más sinergia); después, el resto de novedades en tus colores.`
    : "Ninguna novedad encaja claramente con tu comandante; estas son las más recientes en tus colores.";
}
// Si añades o quitas cartas, solo se actualizan los botones (sin volver a buscar).
function paintNewsButtons() {
  document.querySelectorAll("#news [data-addnews]").forEach(b => { const c = SF.cached(b.dataset.addnews); b.disabled = !!c && deck.cards.has(A.key(c)); });
}
$("#news").addEventListener("click", e => {
  const b = e.target.closest("[data-addnews]"); if (!b) return;
  const c = SF.cached(b.dataset.addnews); if (!c) return;
  addToDeck(c); syncText(); render(); b.disabled = true; toast(c.name + " añadida");
});
async function newsBrief(ci) {
  const list = (await SF.newsFor(ci).catch(() => [])).filter(c => c.legal).slice(0, 30);
  if (!list.length) return "";
  return "\nCartas recientes dentro de esta identidad de color (pueden ser posteriores a tus conocimientos; considéralas si encajan):\n" +
    list.map(c => `- ${c.name} (${c.cost || "sin coste"}, ${c.type}${c.sub ? " — " + c.sub : ""}): ${c.text.replace(/\n/g, " ").slice(0, 220)}`).join("\n");
}

/* ---------- acciones de la pestaña Analizar ---------- */
$("#btnAnalyze").onclick = async () => {
  const ov = [$("#cmd1").value, $("#cmd2").value].map(v => v.trim()).filter(Boolean);
  await loadFromText($("#deckText").value, ov);
  setCmdInputs(); render(); $("#aiOut").innerHTML = "";
};
$("#btnCopy").onclick = async () => {
  const t = A.deckToText(deck);
  try { await navigator.clipboard.writeText(t); toast("Lista copiada"); }
  catch { const ta = $("#deckText"); ta.value = t; ta.focus(); ta.select(); toast("Selecciona y copia el texto"); }
};
$("#btnEditGuided").onclick = () => {
  if (!deck.cmds.length) { toast("Elige un comandante y pulsa «Analizar mazo» primero"); return; }
  editInGuided(deck.cmds, deck.cards, savedDeck() ? deckId : null);
};

/* ---------- Mis mazos ---------- */
let deckId = store.get("forja-deck-id") || null;
const sameCmds = (d, cmds) => d && d.cmds.join("|") === cmds.map(c => c.name).join("|");
// El mazo de Analizar está «guardado» si viene de Mis mazos y sigue teniendo el mismo comandante.
const savedDeck = () => { const d = deckId && Decks.get(deckId); return sameCmds(d, deck.cmds) ? d : null; };
function setDeckId(id) { deckId = id || null; store.set("forja-deck-id", deckId || ""); renderSavedNote(); }
function renderSavedNote() {
  const d = savedDeck(), p = $("#deckSaved");
  p.hidden = !d; if (d) p.textContent = `Guardado en Mis mazos como «${d.name}». Pulsa «Guardar cambios» para actualizarlo.`;
  $("#btnSaveDeck").textContent = d ? "Guardar cambios" : "Guardar en Mis mazos";
}
// Guarda (o actualiza, si ya existe con el mismo comandante) y devuelve el id, o null si se cancela.
async function saveDeckFlow(cmds, cards, id) {
  if (!cmds.length) { toast("Elige un comandante antes de guardar"); return null; }
  let d = id ? Decks.get(id) : null;
  if (!sameCmds(d, cmds)) d = null; // otro comandante: es otro mazo
  const name = d ? d.name : await askName("Guardar en Mis mazos", cmds.map(c => c.name).join(" + "));
  if (name === null) return null;
  const nid = Decks.upsert({ id: d && d.id, name, cmds, cards });
  if (!nid) { toast("El navegador no deja guardar (¿ventana privada o sin espacio?)"); return null; }
  toast(d ? `«${d.name}» actualizado` : "Guardado en Mis mazos");
  renderDecks();
  return nid;
}
$("#btnSaveDeck").onclick = async () => { const id = await saveDeckFlow(deck.cmds, deck.cards, deckId); if (id) setDeckId(id); };

// Precio guardado en la galería: los mazos antiguos solo tienen `price` (en dólares).
const deckPrice = s => { const v = currency() === "eur" ? s.eur : (s.usd ?? s.price); return v == null ? "?" : money(v); };
const ago = t => {
  const m = (Date.now() - t) / 6e4;
  if (m < 1) return "ahora mismo"; if (m < 60) return `hace ${Math.round(m)} min`;
  const h = m / 60; if (h < 24) return `hace ${Math.round(h)} h`;
  const dd = h / 24; if (dd < 7) return `hace ${Math.round(dd)} ${Math.round(dd) === 1 ? "día" : "días"}`;
  return "el " + new Date(t).toLocaleDateString("es-ES");
};
function renderDecks() {
  const el = $("#decksList"), all = Decks.list(), f = SF.norm($("#decksFilter").value || "");
  if (!all.length) { el.innerHTML = '<div class="panel"><p class="muted" style="margin:0">Aún no tienes mazos guardados. Analiza o construye uno y pulsa «Guardar en Mis mazos».</p></div>'; return; }
  const list = f ? all.filter(d => SF.norm(d.name + " " + d.cmds.join(" ")).includes(f)) : all;
  const sugg = Cloud.state().suggestions || [], pub = Cloud.state().published || new Set();
  el.innerHTML = list.map(d => {
    const s = d.stats || {}, miss = deckMissingCount(d.text), nNew = sugg.filter(x => x.deck_id === d.id && x.status === "new").length, nAll = sugg.filter(x => x.deck_id === d.id).length;
    return `<article class="deckcard" data-deck="${esc(d.id)}">
      <div class="dhead"${s.art ? ` style="background-image:url('${esc(s.art)}')"` : ""}><div><div class="dname">${esc(d.name)}</div><div class="small muted">${esc(d.cmds.join(" + ")) || "Sin comandante"}</div></div></div>
      <div class="dbody">
        <div class="dstats">${pipsHTML(s.ci || "")}<span class="mono${s.total === 100 ? "" : " lo"}">${s.total ?? "?"}/100</span><span class="mono">${deckPrice(s)}</span><span class="mono">B${s.bracket ?? "?"}</span>${s.grade ? `<span class="grade">${esc(s.grade)}</span>` : ""}${miss === null ? "" : `<span class="small ${miss ? "lo" : "ok"}">${miss ? `Te faltan ${miss}` : "Lo tienes todo"}</span>`}</div>
        <div class="small muted">Actualizado ${ago(d.updated)}</div>
        ${nAll ? `<button class="btn sm dsugg${nNew ? " new" : ""}" data-dact="sugg">${nNew ? `${nNew} ${nNew === 1 ? "sugerencia nueva" : "sugerencias nuevas"}` : `${nAll} ${nAll === 1 ? "sugerencia" : "sugerencias"}`}</button>` : ""}
        <div class="row"><button class="btn sm primary" data-dact="open">Abrir</button><button class="btn sm" data-dact="guided">Editar paso a paso</button><button class="btn sm" data-dact="share">Compartir</button>${pub.has(d.id) ? '<button class="btn sm pub" data-dact="pub" title="Está en la comunidad. Pulsa para quitarlo">✓ En la comunidad</button>' : '<button class="btn sm" data-dact="pub" title="Publícalo para que otros jugadores lo vean y te sugieran cambios">Publicar</button>'}</div>
        <div class="row dminor"><button class="btn sm" data-dact="copy">Copiar lista</button><button class="btn sm" data-dact="rename">Renombrar</button><button class="btn sm" data-dact="dup">Duplicar</button><button class="btn sm danger" data-dact="del">Borrar</button></div>
      </div></article>`;
  }).join("") || '<p class="muted">Ningún mazo coincide con la búsqueda.</p>';
}
$("#decksFilter").addEventListener("input", renderDecks);
$("#decksList").addEventListener("click", async e => {
  const b = e.target.closest("[data-dact]"); if (!b) return;
  const id = b.closest("[data-deck]").dataset.deck, d = Decks.get(id); if (!d) return;
  const act = b.dataset.dact;
  if (act === "open" || act === "guided") {
    $("#deckText").value = d.text; $("#cmd1").value = ""; $("#cmd2").value = "";
    if (act === "open") location.hash = "analizar";
    await loadFromText(d.text); setDeckId(id); setCmdInputs(); render(); $("#aiOut").innerHTML = "";
    if (act === "guided") { if (deck.cmds.length) editInGuided(deck.cmds, deck.cards, id); else { location.hash = "analizar"; toast("No se encontró el comandante de este mazo"); } }
  } else if (act === "copy") {
    navigator.clipboard.writeText(d.text).then(() => toast("Lista copiada"), () => toast("No se pudo copiar"));
  } else if (act === "share") {
    shareDeck(d);
  } else if (act === "pub") {
    publishDeck(d);
  } else if (act === "sugg") {
    openSuggestions(d);
  } else if (act === "rename") {
    const name = await askName("Renombrar mazo", d.name);
    if (name) { Decks.rename(id, name); renderDecks(); renderSavedNote(); }
  } else if (act === "dup") {
    if (Decks.duplicate(id)) { renderDecks(); toast("Mazo duplicado"); } else toast("El navegador no deja guardar más");
  } else if (act === "del") {
    if (!confirm(`¿Borrar «${d.name}» de Mis mazos? No se puede deshacer.`)) return;
    Decks.remove(id); if (deckId === id) setDeckId(null); renderDecks(); toast("Mazo borrado");
  }
});
/* ---------- comunidad ---------- */
async function publishDeck(d) {
  const st = $("#decksStatus"), cs = Cloud.state();
  if (!cs.configured) { st.innerHTML = '<span class="lo">Para publicar hace falta la nube (mira el README).</span>'; return; }
  if (!cs.user) { st.innerHTML = '<span class="lo">Para publicar un mazo en la comunidad, entra primero con tu cuenta en la caja de arriba.</span>'; $("#cloudBox").scrollIntoView({ block: "nearest" }); return; }
  if (cs.published.has(d.id)) {
    if (!confirm(`¿Quitar «${d.name}» de la comunidad? Las sugerencias que ya tengas se quedan.`)) return;
    try { await Cloud.unpublish(d.id); toast("Quitado de la comunidad"); st.innerHTML = ""; }
    catch (e) { st.innerHTML = `<span class="no">No se pudo quitar: ${esc(e.message || e)}</span>`; }
    renderDecks(); return;
  }
  const author = await askName(`Publicar «${d.name}» en la comunidad`, store.get("forja-autor") || Cloud.defaultAuthor(), "Tu nombre en la comunidad (lo verán los demás)");
  if (author === null) return;
  if (!author) { toast("Escribe un nombre para publicar"); return; }
  store.set("forja-autor", author);
  st.innerHTML = '<span class="spin"></span><span>Publicando…</span>';
  try {
    await Cloud.publish(d.id, author);
    st.innerHTML = `<span class="ok">«${esc(d.name)}» ya está en la <a href="#comunidad">comunidad</a>. Las sugerencias que te manden te llegarán aquí, en su tarjeta.</span>`;
  } catch (e) { st.innerHTML = `<span class="no">No se pudo publicar: ${esc(e.message || e)}</span>`; }
  renderDecks();
}

const comm = { q: "", offset: 0, items: [], seq: 0, done: true, timer: null };
async function loadCommunity(reset) {
  const st = $("#commStatus"), my = ++comm.seq;
  if (reset) { comm.offset = 0; comm.items = []; comm.done = true; $("#commList").innerHTML = ""; $("#commMore").hidden = true; }
  if (!Cloud.configured()) { st.innerHTML = '<span class="lo">La comunidad necesita la nube (mira el README).</span>'; return; }
  st.innerHTML = '<span class="spin"></span><span>Cargando la comunidad…</span>';
  try {
    const rows = await Cloud.communityDecks(comm.q, comm.offset, 30);
    if (my !== comm.seq) return;
    comm.items.push(...rows); comm.offset += rows.length; comm.done = rows.length < 30;
    st.innerHTML = ""; renderCommunity();
  } catch (e) { if (my === comm.seq) st.innerHTML = `<span class="no">No se pudo cargar la comunidad: ${esc(e.message || e)}</span>`; }
}
function renderCommunity() {
  $("#commList").innerHTML = comm.items.map(d => {
    const s = d.stats || {}, n = +d.suggestions || 0, when = d.published_at ? ago(Date.parse(d.published_at)) : ago(+d.updated);
    return `<article class="deckcard">
      <div class="dhead"${s.art ? ` style="background-image:url('${esc(s.art)}')"` : ""}><div><div class="dname">${esc(d.name)}</div><div class="small muted">${esc((d.cmds || []).join(" + ")) || "Sin comandante"}</div></div></div>
      <div class="dbody">
        <div class="dstats">${pipsHTML(s.ci || "")}<span class="mono${s.total === 100 ? "" : " lo"}">${s.total ?? "?"}/100</span><span class="mono">${deckPrice(s)}</span><span class="mono">B${s.bracket ?? "?"}</span>${s.grade ? `<span class="grade">${esc(s.grade)}</span>` : ""}</div>
        <div class="small muted">Por <b>${esc(d.author || "Anónimo")}</b>${d.mine ? ' <span class="tag gc">Tuyo</span>' : ""} · publicado ${when}${n ? ` · ${n} ${n === 1 ? "sugerencia" : "sugerencias"}` : ""}</div>
        <div class="row"><a class="btn sm primary" href="#compartido/${esc(d.share_id)}" style="text-decoration:none">${d.mine ? "Ver" : "Ver y sugerir"}</a><button class="btn sm" data-cact="copy" data-share="${esc(d.share_id)}">Guardar una copia</button></div>
      </div></article>`;
  }).join("") || (comm.q ? '<p class="muted">Ningún mazo coincide con la búsqueda.</p>'
    : '<div class="panel"><p class="muted" style="margin:0">Todavía no hay mazos publicados. Publica uno de los tuyos desde «Mis mazos» con el botón «Publicar».</p></div>');
  $("#commMore").hidden = comm.done;
}
$("#commFilter").addEventListener("input", () => {
  clearTimeout(comm.timer);
  comm.timer = setTimeout(() => { comm.q = $("#commFilter").value.trim(); loadCommunity(true); }, 350);
});
$("#commReload").onclick = () => loadCommunity(true);
$("#commMore").onclick = () => loadCommunity(false);
$("#commList").addEventListener("click", async e => {
  const b = e.target.closest('[data-cact="copy"]'); if (!b) return;
  b.disabled = true; const label = b.textContent; b.textContent = "Guardando…";
  try {
    const d = await Cloud.sharedDeck(b.dataset.share);
    if (!d) throw new Error("Este mazo ya no está publicado");
    const built = await buildDeck(d.text);
    if (!Decks.upsert({ name: `${d.name}${d.author ? ` (de ${d.author})` : ""}`, cmds: built.cmds, cards: built.cards })) throw new Error("el navegador no deja guardar");
    b.textContent = "Guardada en Mis mazos"; toast("Copia guardada en Mis mazos");
  } catch (err) { b.disabled = false; b.textContent = label; toast("No se pudo guardar: " + (err.message || err)); }
});
function setMazosTab(sub) {
  const isComm = sub === "comm";
  $("#mineHero").hidden = isComm; $("#mineBox").hidden = isComm;
  $("#commHero").hidden = !isComm; $("#commBox").hidden = !isComm;
  document.querySelectorAll("[data-mtab]").forEach(a => a.setAttribute("aria-selected", String((a.dataset.mtab === "comm") === isComm)));
  if (isComm) loadCommunity(true); else renderDecks();
}

/* ---------- compartir y sugerencias de amigos ---------- */
async function shareDeck(d) {
  const st = $("#decksStatus");
  if (!Cloud.state().configured) { st.innerHTML = '<span class="lo">Para compartir hace falta la nube (mira el README).</span>'; return; }
  if (!Cloud.state().user) { st.innerHTML = '<span class="lo">Para compartir un mazo, entra primero con tu cuenta en la caja de arriba.</span>'; $("#cloudBox").scrollIntoView({ block: "nearest" }); return; }
  st.innerHTML = '<span class="spin"></span><span>Preparando el enlace…</span>';
  try {
    const url = await Cloud.shareLink(d.id);
    st.innerHTML = `<div class="sharebox"><div><b>Enlace para compartir «${esc(d.name)}»</b><p class="muted small">Quien lo abra verá el mazo y podrá sugerirte cartas para quitar y añadir, sin necesidad de cuenta.</p></div>
      <div class="row"><input type="text" readonly value="${esc(url)}" id="shareUrl" aria-label="Enlace para compartir"><button class="btn sm primary" data-share="copy">Copiar</button><button class="btn sm" data-share="off" data-id="${esc(d.id)}">Dejar de compartir</button></div></div>`;
    navigator.clipboard.writeText(url).then(() => toast("Enlace copiado"), () => {});
  } catch (e) { st.innerHTML = `<span class="no">No se pudo crear el enlace: ${esc(e.message || e)}</span>`; }
}
$("#decksStatus").addEventListener("click", async e => {
  const b = e.target.closest("[data-share]"); if (!b) return;
  if (b.dataset.share === "copy") { const u = $("#shareUrl"); u.select(); navigator.clipboard.writeText(u.value).then(() => toast("Enlace copiado"), () => toast("Selecciónalo y cópialo")); }
  else if (b.dataset.share === "off" && confirm("¿Dejar de compartir este mazo? El enlace dejará de funcionar (las sugerencias que ya tengas se quedan).")) {
    try { await Cloud.unshare(b.dataset.id); $("#decksStatus").innerHTML = '<span class="ok">Ya no se comparte. Si lo vuelves a compartir, tendrá un enlace nuevo.</span>'; }
    catch (err) { toast("No se pudo: " + (err.message || err)); }
  }
});

const suggDlg = $("#suggDlg");
function openSuggestions(d) {
  const list = (Cloud.state().suggestions || []).filter(x => x.deck_id === d.id);
  const when = t => new Date(t).toLocaleString("es-ES", { dateStyle: "medium", timeStyle: "short" });
  const items = (arr, kind, sid) => (Array.isArray(arr) ? arr : []).map((x, i) => `<label class="sitem"><input type="checkbox" checked data-sid="${esc(sid)}" data-kind="${kind}" data-i="${i}"><span><b>${esc(x.name)}</b>${x.why ? `<span class="muted small"> — ${esc(x.why)}</span>` : ""}</span></label>`).join("");
  $("#suggBody").innerHTML = `<h3 style="margin:0">Sugerencias para «${esc(d.name)}»</h3>` + (list.map(s => `
    <div class="sbox" data-sbox="${esc(s.id)}">
      <div class="row between"><div><b>${esc(s.author || "Alguien")}</b> <span class="muted small">· ${when(s.created)}${s.status === "applied" ? " · aplicada" : ""}</span></div></div>
      ${s.message ? `<p class="smsg">${esc(s.message)}</p>` : ""}
      ${(s.cuts || []).length ? `<div class="eyebrow no">Quitaría</div>${items(s.cuts, "cuts", s.id)}` : ""}
      ${(s.adds || []).length ? `<div class="eyebrow ok">Añadiría</div>${items(s.adds, "adds", s.id)}` : ""}
      <div class="row"><button class="btn sm primary" data-sapply="${esc(s.id)}">Aplicar las marcadas</button><button class="btn sm" data-sdismiss="${esc(s.id)}">Descartar</button></div>
    </div>`).join("") || '<p class="muted">No hay sugerencias para este mazo.</p>') + '<div class="row" style="justify-content:flex-end"><button class="btn" data-sclose>Cerrar</button></div>';
  suggDlg.dataset.deck = d.id;
  suggDlg.showModal();
}
suggDlg.addEventListener("click", async e => {
  if (e.target === suggDlg || e.target.closest("[data-sclose]")) { suggDlg.close(); return; }
  const dis = e.target.closest("[data-sdismiss]");
  if (dis) {
    try { await Cloud.setSuggestionStatus(dis.dataset.sdismiss, "dismissed"); dis.closest(".sbox").remove(); renderDecks(); }
    catch (err) { toast("No se pudo: " + (err.message || err)); }
    return;
  }
  const ap = e.target.closest("[data-sapply]"); if (!ap) return;
  const sid = ap.dataset.sapply, s = (Cloud.state().suggestions || []).find(x => x.id === sid), d = Decks.get(suggDlg.dataset.deck);
  if (!s || !d) return;
  const pick = kind => [...suggDlg.querySelectorAll(`input[data-sid="${CSS.escape(sid)}"][data-kind="${kind}"]:checked`)].map(i => (s[kind] || [])[+i.dataset.i]).filter(Boolean).map(x => String(x.name));
  const cuts = pick("cuts"), adds = pick("adds");
  if (!cuts.length && !adds.length) { toast("Marca alguna carta"); return; }
  ap.disabled = true;
  // Abre el mazo guardado en Analizar con los cambios aplicados; el usuario revisa y pulsa «Guardar cambios».
  $("#deckText").value = d.text; $("#cmd1").value = ""; $("#cmd2").value = "";
  await loadFromText(d.text); setDeckId(d.id);
  await SF.collection([...cuts, ...adds]).catch(() => {});
  let done = 0;
  cuts.forEach(n => { const c = SF.cached(n); if (c && deck.cards.has(A.key(c))) { deck.cards.delete(A.key(c)); done++; } });
  adds.forEach(n => { const c = SF.cached(n); if (c && !deck.cards.has(A.key(c))) { addToDeck(c); done++; } });
  syncText(); render();
  $("#aiOut").innerHTML = `<p style="margin:0">Aplicadas ${done} sugerencias de <b>${esc(s.author || "tu amigo")}</b> (${cuts.length} quitadas, ${adds.length} añadidas). Revisa el mazo y pulsa <b>«Guardar cambios»</b> para guardarlo.</p>`;
  Cloud.setSuggestionStatus(sid, "applied").catch(() => {});
  suggDlg.close();
  location.hash = "analizar";
});

$("#decksExport").onclick = () => {
  if (!Decks.list().length) { toast("No hay mazos que exportar"); return; }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([Decks.exportJSON()], { type: "application/json" }));
  a.download = `forja-mis-mazos-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};
// Nube: caja de cuenta en Mis mazos (solo si config.js tiene los datos de Supabase).
function renderCloud(s = Cloud.state()) {
  const box = $("#cloudBox");
  if (!s.configured) { box.hidden = true; return; }
  box.hidden = false;
  if (!s.user) {
    const typed = $("#cloudEmail") ? $("#cloudEmail").value : "", note = $("#cloudStatus") ? $("#cloudStatus").innerHTML : "";
    box.innerHTML = `<div class="dcl"><div><b>Guarda tus mazos en la nube</b><p class="muted small">Entra y tus mazos se sincronizan entre tus dispositivos y entre la versión local y la publicada. Con GitHub entras al momento; con el email te llega un enlace (sin contraseña).</p></div>
      <div class="dlogin"><button type="button" class="btn primary sm" data-cloud="github" ${s.ready ? "" : "disabled"}>${s.ready ? "Entrar con GitHub" : "Conectando…"}</button>
      <form class="row" id="cloudForm"><input type="email" id="cloudEmail" required autocomplete="email" placeholder="o con tu email" aria-label="Tu email" style="width:min(220px,100%)"><button class="btn sm" ${s.ready ? "" : "disabled"}>Enviar enlace</button></form></div></div>
      <div class="status" id="cloudStatus">${note || (s.error ? `<span class="no">${esc(s.error)}</span>` : "")}</div>`;
    $("#cloudEmail").value = typed;
  } else {
    box.innerHTML = `<div class="dcl"><div><b>Mazos sincronizados en la nube</b><p class="muted small">Sesión iniciada como ${esc(s.user.email || "")} · ${s.syncing ? "sincronizando…" : s.lastSync ? "última sincronización " + ago(s.lastSync) : "pendiente de sincronizar"}</p>${s.error ? `<p class="no small">${esc(s.error)}</p>` : ""}</div>
      <div class="row"><button class="btn sm" data-cloud="sync" ${s.syncing ? "disabled" : ""}>Sincronizar ahora</button><button class="btn sm" data-cloud="out">Cerrar sesión</button></div></div>`;
  }
}
$("#cloudBox").addEventListener("submit", async e => {
  e.preventDefault();
  const email = $("#cloudEmail").value.trim(), st = $("#cloudStatus"), btn = e.target.querySelector("button");
  btn.disabled = true; st.innerHTML = '<span class="spin"></span><span>Enviando…</span>';
  try {
    await Cloud.signIn(email);
    st.innerHTML = `<span class="ok">Te hemos enviado un enlace a ${esc(email)}. Ábrelo en este mismo navegador para entrar (mira también en spam).</span>`;
  } catch (err) {
    st.innerHTML = `<span class="no">No se pudo enviar el enlace: ${esc(err.message || err)}</span>`;
  } finally { btn.disabled = false; }
});
$("#cloudBox").addEventListener("click", async e => {
  const b = e.target.closest("[data-cloud]"); if (!b) return;
  if (b.dataset.cloud === "github") {
    b.disabled = true;
    try { await Cloud.signInWithGitHub(); }
    catch (err) { b.disabled = false; $("#cloudStatus").innerHTML = `<span class="no">No se pudo entrar con GitHub: ${esc(err.message || err)}</span>`; }
  } else if (b.dataset.cloud === "sync") Cloud.sync();
  else if (b.dataset.cloud === "out" && confirm("¿Cerrar sesión? Los mazos se quedan en este navegador, pero dejarán de sincronizarse.")) Cloud.signOut();
});
Cloud.onState(s => {
  renderCloud(s);
  if (!$("#view-mazos").hidden) renderDecks();
  renderSavedNote();
});

const deckNotes = d => [
  ...(d.cmds.length ? [] : ["sin comandante detectado (ábrelo y elígelo en Analizar)"]),
  ...(d.unknown.length ? [`${d.unknown.length} ${d.unknown.length === 1 ? "carta no encontrada" : "cartas no encontradas"} (${d.unknown.slice(0, 5).join(", ")}${d.unknown.length > 5 ? "…" : ""})`] : []),
];

$("#decksNew").onclick = () => newDeck();

// Pegar una lista directamente en Mis mazos.
attachAC($("#pasteCmd"), { query: cmdQuery });
$("#decksPasteBtn").onclick = () => { $("#decksPaste").hidden = false; $("#decksStatus").innerHTML = ""; $("#pasteText").focus(); };
$("#pasteCancel").onclick = () => { $("#decksPaste").hidden = true; $("#pasteStatus").innerHTML = ""; };
$("#pasteSave").onclick = async () => {
  const st = $("#pasteStatus"), btn = $("#pasteSave"), text = $("#pasteText").value;
  if (!text.trim()) { st.innerHTML = '<span class="lo">Pega una lista primero.</span>'; $("#pasteText").focus(); return; }
  btn.disabled = true; st.innerHTML = '<span class="spin"></span><span>Buscando las cartas en Scryfall…</span>';
  try {
    const d = await buildDeck(text, [$("#pasteCmd").value.trim()].filter(Boolean));
    if (!d.cmds.length && !d.cards.size) { st.innerHTML = '<span class="no">No se ha encontrado ninguna carta. Revisa que los nombres estén en inglés.</span>'; return; }
    const name = $("#pasteName").value.trim() || d.cmds.map(c => c.name).join(" + ") || "Mazo pegado";
    if (!Decks.upsert({ name, cmds: d.cmds, cards: d.cards })) { st.innerHTML = '<span class="no">El navegador no deja guardar (¿ventana privada o sin espacio?).</span>'; return; }
    const notes = deckNotes(d);
    $("#pasteText").value = $("#pasteName").value = $("#pasteCmd").value = ""; st.innerHTML = "";
    $("#decksPaste").hidden = true; $("#decksFilter").value = ""; renderDecks();
    $("#decksStatus").innerHTML = `<span class="ok">Guardado «${esc(name)}».</span>` + (notes.length ? `<ul class="issues">${notes.map(x => `<li>${esc(x)}</li>`).join("")}</ul>` : "");
  } catch (e) {
    st.innerHTML = `<span class="no">No se pudo consultar Scryfall: ${esc(e.message || e)}.</span>`;
  } finally { btn.disabled = false; }
};

// Importa una copia .json de Mis mazos o listas en texto (.txt de Moxfield, Archidekt, ManaBox…), una o varias a la vez.
$("#decksImport").addEventListener("change", async e => {
  const files = [...e.target.files]; e.target.value = ""; if (!files.length) return;
  const st = $("#decksStatus"); let n = 0; const notes = [];
  for (const file of files) {
    st.innerHTML = `<span class="spin"></span><span>Importando ${esc(file.name)}…</span>`;
    try {
      const text = await file.text();
      let json = null; try { json = JSON.parse(text); } catch {}
      if (json !== null) { n += Decks.importJSON(text); continue; }
      const d = await buildDeck(text);
      const total = [...d.cards.values()].reduce((a, x) => a + x.q, 0) + d.cmds.length;
      if (!total) { notes.push(`${file.name}: no se encontró ninguna carta`); continue; }
      const name = file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
      if (!Decks.upsert({ name, cmds: d.cmds, cards: d.cards })) { notes.push(`${file.name}: el navegador no deja guardar más`); continue; }
      n++;
      notes.push(...deckNotes(d).map(x => `${file.name}: ${x}`));
    } catch (err) { notes.push(`${file.name}: ${err.message || "archivo no válido"}`); }
  }
  renderDecks();
  st.innerHTML = (n ? `<span class="ok">Importados ${n} ${n === 1 ? "mazo" : "mazos"}.</span>` : '<span class="lo">No se importó ningún mazo nuevo.</span>')
    + (notes.length ? `<ul class="issues">${notes.map(x => `<li>${esc(x)}</li>`).join("")}</ul>` : "");
});
attachAC($("#cmd1"), { query: cmdQuery });
attachAC($("#cmd2"), { query: cmdQuery });
attachAC($("#addCard"), {
  query: q => `${q} legal:commander game:paper${deck.cmds.length ? " " + SF.ciQuery(A.ciUnion(deck.cmds)) : ""}`,
  onPick: (c, inp) => { addToDeck(c); inp.value = ""; syncText(); render(); toast(c.name + " añadida"); },
});

/* ---------- IA ---------- */
async function aiReady(out) {
  const st = await AI.aiStatus();
  if (!st.ok || !st.configured) {
    const code = st.mode === "local" && st.found ? "not_logged_in" : "not_configured";
    out.innerHTML = `<p class="lo">${esc(AI.errMsg({ code }))} Mientras tanto, prueba «Sugerencias rápidas» o «Generar automático».</p>`; return false;
  }
  if (st.login && !Cloud.state().user) {
    out.innerHTML = `<p class="lo">${esc(AI.errMsg({ code: "login_required" }))} <a href="#mazos">Ir a Mis mazos</a></p>`; return false;
  }
  if (st.password && !AI.getPass()) { await askPass(); if (!AI.getPass()) { out.innerHTML = '<p class="lo">Hace falta la contraseña de la IA.</p>'; return false; } }
  return true;
}
function deckBrief(s) {
  const c0 = deck.cmds.map(c => `${c.name} (${c.type}${c.sub ? " — " + c.sub : ""}): ${c.text}`).join("\n");
  const list = [...deck.cards.values()].map(e => `${e.q} ${e.c.name}`).join("\n");
  return `Comandante(s):\n${c0 || "(sin comandante)"}\nIdentidad de color: ${s.ci || "incolora"}\nEstadísticas: ${s.total} cartas, ${s.lands} tierras, ${s.ramp} ramp, ${s.draw} robo, ${s.removal} removal, ${s.counters} contrahechizos, ${s.wipes} barridos, ${s.tutors} tutores, CMC medio ${s.avgCmc.toFixed(2)}, ${s.gc.length} Game Changers, bracket estimado B${s.bracket}.\nLista:\n${list}`;
}
/* ---------- sinergia con el comandante (EDHREC) ---------- */
// Datos de EDHREC del comandante, con sus cartas ya buscadas en Scryfall (precio, legalidad, colores). null si no hay.
async function edhFor(cmds) {
  const d = await Edh.forCommanders(cmds).catch(() => null);
  if (!d) return null;
  await SF.collection([...d.cards.values()].map(x => x.name), { fuzzyLimit: 0 }).catch(() => {});
  return d;
}
const edhMap = d => (d ? d.cards : null);
// Cartas de EDHREC que encajan con el comandante y aún no están en el mazo (para la IA y para sugerir).
function synergyCards(d, cmds, has, { maxPrice = 0 } = {}) {
  if (!d) return [];
  const ci = A.ciUnion(cmds), cmdKeys = new Set(cmds.map(A.key));
  return [...d.cards.values()].map(e => ({ e, c: SF.cached(e.name) }))
    .filter(x => x.c && x.c.legal && !A.isBasic(x.c) && A.subsetCI(x.c.ci, ci) && !cmdKeys.has(A.key(x.c)) && !has(x.c) && x.e.synergy >= 0.05
      && (!maxPrice || x.c.price <= maxPrice))
    .sort((a, b) => b.e.synergy - a.e.synergy);
}
const pctTxt = v => Math.round(v * 100) + " %";
// Texto para la IA: qué cartas con sinergia faltan y cuáles del mazo casi nadie juega con este comandante.
function synergyBrief(d, cmds, cards, { prices = false, maxPrice = 0, max = 40 } = {}) {
  if (!d) return "";
  const has = c => cards.has(A.key(c));
  const top = synergyCards(d, cmds, has, { maxPrice }).slice(0, max);
  const weak = [...cards.values()].map(x => x.c).filter(c => !A.isLand(c) && !A.isBasic(c))
    .filter(c => { const e = A.edhOf(d.cards, c); return !e || e.synergy < 0 || e.inclusion < 0.03; }).slice(0, 15);
  let t = `\nDatos de EDHREC de este comandante (${d.decks ? d.decks.toLocaleString("es-ES") + " mazos" : "mazos reales"}):`;
  if (top.length) t += `\nCartas con sinergia que NO están en la lista (sinergia = cuánto más se juegan con este comandante que con otros de sus colores):\n`
    + top.map(x => `- ${x.c.name} (sinergia +${pctTxt(x.e.synergy)}, en el ${pctTxt(x.e.inclusion)} de sus mazos${prices ? `, ${x.c.price.toFixed(2)}` : ""})`).join("\n");
  if (weak.length) t += `\nCartas de la lista que casi nadie juega con este comandante o con sinergia negativa: ${weak.map(c => c.name).join(", ")}.`;
  return t;
}
const SYN_RULE = "Prioriza la sinergia con el comandante (las cartas con sinergia de EDHREC y las que potencian su texto) por encima de los staples genéricos: añade un staple solo si cubre un hueco del esqueleto que ninguna carta con sinergia cubre.";

const chipList = names => (names || []).map(n => SF.cached(String(n))).filter(c => c && (deck.cards.has(A.key(c)) || deck.cmds.some(x => x.name === c.name)))
  .map(c => `<button class="chip" data-name="${esc(c.name)}">${esc(c.name)}</button>`).join("");

let diag = null;
$("#btnOpt").onclick = async () => {
  const out = $("#aiOut");
  if (!deck.cards.size) { out.innerHTML = '<p class="lo">Primero analiza un mazo.</p>'; return; }
  if (!(await aiReady(out))) return;
  const s = A.analyze(deck), btn = $("#btnOpt"); btn.disabled = true;
  out.innerHTML = thinking("Claude está leyendo cómo está montado el mazo…");
  const edh = await edhFor(deck.cmds);
  const prompt = `Lee este mazo de Commander y diagnostica cómo está montado.
${deckBrief(s)}
${synergyBrief(edh, deck.cmds, deck.cards, { max: 20 })}
Responde SOLO con JSON, con esta forma exacta:
{"comandante":"1-2 frases: qué quiere hacer este comandante y cómo se le saca partido","estilo_actual":{"nombre":"nombre corto del arquetipo (p. ej. Aristócratas, Fichas, Voltron, Control, Combo)","descripcion":"1-2 frases sobre cómo gana y juega el mazo tal como está","cartas_clave":["5-8 cartas de la lista que definen ese estilo"]},"fuera_de_estilo":["hasta 8 cartas de la lista que no encajan con el estilo ni con el comandante"],"opciones":[{"nombre":"nombre corto","descripcion":"1 frase: cómo jugaría y qué cambia respecto al actual"}]}
"opciones" son 3 estilos distintos y viables para este comandante; el primero es reforzar el estilo actual. En "fuera_de_estilo" incluye sobre todo staples genéricos sin sinergia con el comandante.`;
  try { diag = await AI.askJSON(prompt, { effort: "low" }); renderDiag(diag); }
  catch (e) { out.innerHTML = `<p class="no">${esc(AI.errMsg(e))}</p>`; }
  finally { btn.disabled = false; }
};
function renderDiag(d) {
  const out = $("#aiOut"), ea = d.estilo_actual || {};
  const opts = (Array.isArray(d.opciones) ? d.opciones : []).slice(0, 4);
  const off = chipList(d.fuera_de_estilo);
  out.innerHTML = `<div class="diag">
    <div><div class="eyebrow">El comandante</div><p>${esc(d.comandante)}</p></div>
    <div><div class="eyebrow">Cómo está montado ahora</div><p><strong>${esc(ea.nombre || "Sin estilo claro")}</strong>. ${esc(ea.descripcion)}</p>
      <div class="chips">${chipList(ea.cartas_clave)}</div>
      ${off ? `<div class="eyebrow" style="margin-top:10px">No encajan con ese plan</div><div class="chips off">${off}</div>` : ""}</div>
    <fieldset class="styles"><legend class="eyebrow">¿Cómo lo quieres jugar?</legend>
      ${opts.map((o, k) => `<label class="style"><input type="radio" name="estilo" value="${k}" ${k === 0 ? "checked" : ""}><span><strong>${esc(o.nombre)}${k === 0 ? ' <span class="tag">actual</span>' : ""}</strong><span class="muted">${esc(o.descripcion)}</span></span></label>`).join("")}
      <label class="style"><input type="radio" name="estilo" value="custom" ${opts.length ? "" : "checked"}><span><strong>A mi manera</strong><input type="text" id="customStyle" placeholder="Ej.: más control, menos combo, que sea divertido en mesa casual…"></span></label>
    </fieldset>
    <div class="row">
      <label class="f inline" for="optDepth">Cambios <select id="optDepth"><option value="8">Ligeros (6–8)</option><option value="14">Profundos (12–15)</option></select></label>
      <label class="f inline" for="optBudget" title="Lo máximo que quieres gastar sumando todas las cartas que se añadan">Presupuesto de la mejora <input type="number" id="optBudget" min="0" step="5" inputmode="decimal" placeholder="Sin límite" value="${esc(store.get("forja-opt-budget") || "")}" style="width:110px"> ${symbol()}</label>
      <button class="btn primary ai" id="btnOpt2">Proponer mejoras para este estilo</button>
    </div>
    <p class="muted small" style="margin:0">El presupuesto es lo que te gastarías en total en las cartas nuevas. Las propuestas que lo superen se descartan.</p></div>`;
  $("#customStyle").addEventListener("focus", () => { out.querySelector('input[value="custom"]').checked = true; });
  $("#btnOpt2").onclick = () => optimizeFor(d);
}
async function optimizeFor(d) {
  const out = $("#aiOut"); if (!(await aiReady(out))) return;
  const sel = out.querySelector('input[name="estilo"]:checked')?.value, ea = d.estilo_actual || {};
  const style = sel === "custom" ? { nombre: $("#customStyle").value.trim() || "el que mejor funcione con este comandante", descripcion: "" }
    : ((d.opciones || [])[+sel] || { nombre: ea.nombre || "", descripcion: ea.descripcion || "" });
  const depth = +$("#optDepth").value, s = A.analyze(deck), tb = $("#optBracket").value;
  const budget = Math.max(0, parseFloat(String($("#optBudget").value).replace(",", ".")) || 0);
  store.set("forja-opt-budget", budget ? String(budget) : "");
  out.innerHTML = thinking(`Buscando mejoras para jugar «${style.nombre}»…`);
  const edh = await edhFor(deck.cmds);
  const prompt = `Mejora este mazo de Commander para el estilo que quiere el jugador.
${deckBrief(s)}
${await newsBrief(s.ci)}
Diagnóstico previo. El comandante: ${d.comandante || ""}
Estilo actual del mazo: ${ea.nombre || ""}. ${ea.descripcion || ""} Cartas que lo definen: ${(ea.cartas_clave || []).join(", ")}.
Estilo que quiere el jugador: ${style.nombre}. ${style.descripcion || ""}
Nivel de poder: ${tb ? "llevarlo al bracket B" + tb : "mantener el bracket actual (B" + s.bracket + ")"}.
${budget ? `Presupuesto de la mejora: como máximo ${budget} ${currencyName()} SUMANDO todas las cartas añadidas. Elige cartas baratas cuando haga falta; al lado de cada carta con sinergia tienes su precio aproximado.` : ""}
${synergyBrief(edh, deck.cmds, deck.cards, { prices: !!budget })}
Cómo trabajar: primero piensa qué piezas necesita ese estilo con este comandante concreto (motores, sinergias, formas de ganar) y qué cartas de la lista no lo sirven o son las más flojas. Corta primero lo que no aporta al estilo ni al comandante, empezando por los staples genéricos sin sinergia. ${SYN_RULE} Mantén el esqueleto sano (tierras 35-38, ramp ~10, robo ~10, interacción ~9, 2-3 barridos) y no rompas lo que ya funciona.
Responde SOLO con JSON, con esta forma exacta:
{"resumen":"2-3 frases: cómo jugará el mazo después de los cambios","cortes":[{"carta":"Nombre exacto en inglés","motivo":"breve, por qué no sirve a ese estilo"}],"anadidos":[{"carta":"Nombre exacto en inglés","motivo":"breve, qué aporta a ese estilo y con el comandante","categoria":"motor|sinergia|remate|ramp|robo|removal|barrido|proteccion|tierra"}]}
Reglas: entre ${depth - 2} y ${depth} cortes y el mismo número de añadidos. Los cortes deben estar en la lista. Los añadidos deben ser legales en Commander, dentro de la identidad de color ${s.ci || "incolora"}, no estar ya en la lista, y usar el nombre oficial en inglés.`;
  try {
    const r = await AI.askJSON(prompt, { onText: ({ text }) => { const m = out.querySelector(".status .msg"); const n = (text.match(/"carta"/g) || []).length; if (m && n) m.textContent = `Escribiendo propuestas… (${n})`; } });
    await renderOpt(r, s, style.nombre, { budget, edh });
  } catch (e) {
    out.innerHTML = `<p class="no">${esc(AI.errMsg(e))}</p><div class="row"><button class="btn" id="backStyle">Volver a los estilos</button></div>`;
    $("#backStyle").onclick = () => renderDiag(d);
  }
}
async function renderOpt(r, s, styleName, { budget = 0, edh = null } = {}) {
  const out = $("#aiOut");
  const cutsRaw = Array.isArray(r.cortes) ? r.cortes : [], addsRaw = Array.isArray(r.anadidos) ? r.anadidos : (r["añadidos"] || []);
  await SF.collection([...cutsRaw, ...addsRaw].map(x => String(x.carta || "")), { fuzzyLimit: 10 }).catch(() => {});
  const cuts = cutsRaw.map(x => ({ ...x, c: SF.cached(String(x.carta || "")) })).filter(x => x.c && deck.cards.has(A.key(x.c)));
  const adds = addsRaw.map(x => ({ ...x, c: SF.cached(String(x.carta || "")) }));
  const seenAdd = new Set(); // si la IA repite una carta, solo se ofrece una vez (Commander es singleton)
  const valid = adds.filter(x => x.c && x.c.legal && !deck.cards.has(A.key(x.c)) && (!deck.cmds.length || A.subsetCI(x.c.ci, s.ci))
    && !seenAdd.has(A.key(x.c)) && seenAdd.add(A.key(x.c)));
  // Presupuesto: se aceptan en el orden de la IA mientras la suma no lo supere.
  let spent = 0, overBudget = 0;
  const okAdds = valid.filter(x => { if (!budget) return true; if (spent + x.c.price > budget) { overBudget++; return false; } spent += x.c.price; return true; });
  if (!budget) spent = okAdds.reduce((n, x) => n + x.c.price, 0);
  const dropped = adds.length - valid.length;
  // Etiqueta de sinergia en cada añadido, con los datos de EDHREC.
  okAdds.forEach(x => { const e = edh && A.edhOf(edh.cards, x.c); if (e && e.synergy >= 0.05) x.syn = `sinergia +${pctTxt(e.synergy)}`; });
  out.innerHTML = `${styleName ? `<div class="eyebrow">Estilo: ${esc(styleName)}</div>` : ""}<p style="margin:0">${esc(r.resumen)}</p>
    <div class="sugg"><div><div class="eyebrow">Cortar</div>${cuts.map(x => sugHTML(x, "cut")).join("") || '<p class="muted">Sin cortes.</p>'}</div>
    <div><div class="eyebrow">Añadir</div>${okAdds.map(x => sugHTML(x, "add")).join("") || '<p class="muted">Sin añadidos válidos.</p>'}</div></div>
    <p class="small" style="margin:0">Las cartas nuevas cuestan <b>${money(spent, 2)}</b>${budget ? ` de un presupuesto de ${money(budget)}` : ""}.</p>
    ${dropped ? `<p class="muted small" style="margin:0">${dropped} propuesta(s) descartadas por no existir, no ser legales, estar ya en el mazo o salirse de la identidad de color.</p>` : ""}
    ${overBudget ? `<p class="lo small" style="margin:0">${overBudget} propuesta(s) descartadas por pasarse del presupuesto.</p>` : ""}
    <div class="row"><button class="btn primary" id="applyAll">Aplicar todo</button>${diag && styleName ? '<button class="btn" id="backStyle">Elegir otro estilo</button>' : ""}</div>`;
  $("#applyAll").onclick = () => out.querySelectorAll(".sug:not(.done) button[data-cut],.sug:not(.done) button[data-add]").forEach(b => b.click());
  if ($("#backStyle")) $("#backStyle").onclick = () => renderDiag(diag);
}
function sugHTML(x, kind) {
  const c = x.c;
  return `<div class="sug">${c.small ? `<img class="th" src="${esc(c.small)}" alt="" loading="lazy">` : '<span class="th"></span>'}<span>${nameBtn(c)} ${manaHTML(c.cost)}${x.categoria ? ` <span class="tag">${esc(x.categoria)}</span>` : ""}${x.syn ? ` <span class="tag syn">${esc(x.syn)}</span>` : ""}${kind === "add" && c.price ? ` <span class="muted small mono">${cardMoney(c)}</span>` : ""}${isPreview(c) ? ' <span class="tag new">nueva</span>' : ""}</span><button class="btn sm" data-${kind}="${esc(c.name)}">${kind === "cut" ? "Quitar" : "Añadir"}</button><span class="why">${esc(x.motivo)}</span></div>`;
}
$("#aiOut").addEventListener("click", e => {
  const b = e.target.closest("[data-cut],[data-add]"); if (!b) return;
  const c = SF.cached(b.dataset.cut || b.dataset.add); if (!c) return;
  if (b.dataset.cut) removeFromDeck(c); else addToDeck(c);
  b.closest(".sug").classList.add("done"); b.disabled = true; syncText(); render();
});

$("#btnQuick").onclick = async () => {
  const out = $("#aiOut"); if (!deck.cards.size) { out.innerHTML = '<p class="lo">Primero analiza un mazo.</p>'; return; }
  const s = A.analyze(deck); out.innerHTML = thinking("Buscando las cartas que mejor encajan con tu comandante…");
  let pool; try { pool = [...await SF.poolFor(s.ci)]; } catch (e) { out.innerHTML = `<p class="no">No se pudo consultar Scryfall.</p>`; return; }
  const edh = await edhFor(deck.cmds), em = edhMap(edh), words = A.synergyWords(deck.cmds);
  if (edh) pool.push(...[...edh.cards.values()].map(e => SF.cached(e.name)).filter(Boolean));
  const fit = c => A.fitScore(c, { edh: em, words });
  const why = c => { const e = em && A.edhOf(em, c); return e ? `en el ${pctTxt(e.inclusion)} de los mazos de tu comandante${e.synergy >= 0.05 ? `, sinergia +${pctTxt(e.synergy)}` : ""}` : A.matchesWords(c, words) ? "encaja con el texto de tu comandante" : `#${c.rank} en EDHREC`; };
  const inDeck = c => deck.cards.has(A.key(c)) || deck.cmds.some(x => x.name === c.name);
  const seen = new Set(), cands = pool.filter(c => { const k = A.key(c); if (seen.has(k) || inDeck(c) || !c.legal || A.isBasic(c) || !A.subsetCI(c.ci, s.ci)) return false; seen.add(k); return true; }).sort((a, b) => fit(a) - fit(b));
  const sugg = [];
  for (const [k, flag, t, lab] of [["ramp", F.RAMP, 10, "Ramp"], ["draw", F.DRAW, 10, "Robo"], ["interaction", F.REM, 9, "Removal"], ["wipes", F.WIPE, 2, "Barrido"]]) {
    const miss = t - s[k]; if (miss <= 0) continue;
    cands.filter(c => (c.flags & flag) && !A.isLand(c) && !sugg.some(x => x.c === c)).slice(0, Math.min(miss, 5))
      .forEach(c => sugg.push({ c, categoria: lab, motivo: `Te faltan ${miss} de ${lab.toLowerCase()}; ${why(c)}.` }));
  }
  // Y las cartas con más sinergia que no tienes, aunque el esqueleto esté completo.
  if (edh) synergyCards(edh, deck.cmds, inDeck).filter(x => !sugg.some(y => y.c === x.c)).slice(0, 6)
    .forEach(x => sugg.push({ c: x.c, syn: `sinergia +${pctTxt(x.e.synergy)}`, motivo: `Se juega en el ${pctTxt(x.e.inclusion)} de los mazos de tu comandante, mucho más que con otros.` }));
  const weak = [...deck.cards.values()].map(e => e.c).filter(c => !A.isLand(c) && !A.isBasic(c)).sort((a, b) => fit(b) - fit(a)).slice(0, Math.max(4, sugg.length));
  const weakWhy = c => { const e = em && A.edhOf(em, c); return em ? (e ? `Solo en el ${pctTxt(e.inclusion)} de los mazos de tu comandante${e.synergy < 0 ? ", sinergia negativa" : ""}.` : "Casi nadie la juega con tu comandante.") : `Poco jugada en Commander (${c.rank >= 99999 ? "sin ranking" : "#" + c.rank}).`; };
  out.innerHTML = `<p style="margin:0">${edh ? `Sugerencias calculadas con el esqueleto del mazo y los datos de EDHREC de tu comandante: primero lo que encaja con él, no solo lo más popular.` : "Sugerencias calculadas con el esqueleto del mazo y la popularidad de cada carta (EDHREC no tiene datos de este comandante)."}</p>
    <div class="sugg"><div><div class="eyebrow">Candidatas a cortar</div>${weak.map(c => sugHTML({ c, motivo: weakWhy(c) }, "cut")).join("")}</div>
    <div><div class="eyebrow">Añadir</div>${sugg.map(x => sugHTML(x, "add")).join("") || '<p class="muted">El esqueleto ya cumple las cifras recomendadas.</p>'}</div></div>`;
};

/* ---------- mazo a presupuesto ---------- */
let swaps = [];
$("#btnBudget").onclick = () => {
  const out = $("#aiOut");
  if (!deck.cards.size) { out.innerHTML = '<p class="lo">Primero analiza un mazo.</p>'; return; }
  const s = A.analyze(deck), def = Math.max(10, Math.round(s.price * 0.5 / 10) * 10);
  out.innerHTML = `<div class="budget">
    <p style="margin:0">Ahora el mazo cuesta unos <b>${money(s.price)}</b>. ¿Hasta cuánto quieres gastar?</p>
    <div class="row">
      <label class="f inline" for="budgetMax">Precio máximo <input type="number" id="budgetMax" min="0" step="5" value="${def}" style="width:110px"> ${symbol()}</label>
      <button class="btn primary" id="budgetGo">Calcular cambios</button>
      <button class="btn ai" id="budgetAI">Con IA</button>
    </div>
    <p class="muted small" style="margin:0">Sin IA: cambia las cartas más caras por las más jugadas que cumplen la misma función (ramp, robo, removal…) y cuestan mucho menos. Con IA: Claude elige los cambios teniendo en cuenta la sinergia con tu comandante. Ningún cambio se aplica hasta que lo pulses.</p>
    <div id="budgetOut"></div></div>`;
  $("#budgetMax").focus();
};
const budgetTarget = () => { const v = parseFloat(String($("#budgetMax").value).replace(",", ".")); return isFinite(v) && v >= 0 ? v : null; };
async function budgetNoAI() {
  const bo = $("#budgetOut"), target = budgetTarget();
  if (target === null) { bo.innerHTML = '<p class="lo">Escribe un precio máximo.</p>'; return; }
  bo.innerHTML = thinking("Buscando alternativas baratas en tus colores…");
  const ci = A.ciUnion(deck.cmds), cap = Math.max(1, Math.round(target / 40));
  let pool;
  try {
    const base = `${SF.ciQuery(ci)} legal:commander -t:basic game:paper ${currency()}<=${cap}`, words = A.synergyWords(deck.cmds).filter(w => /^[a-z]+$/.test(w));
    pool = [...await SF.poolFor(ci), ...await SF.search(base, { pages: 3 }).catch(() => []),
      ...(words.length ? await SF.search(`${base} (${words.slice(0, 4).map(w => `t:${w} or o:${w}`).join(" or ")})`, { pages: 1 }).catch(() => []) : [])];
  } catch { bo.innerHTML = '<p class="no">No se pudo consultar Scryfall.</p>'; return; }
  const edh = await edhFor(deck.cmds);
  if (edh) pool.push(...[...edh.cards.values()].map(e => SF.cached(e.name)).filter(Boolean));
  const r = A.budgetSwaps(deck, pool, target, await getBasics().catch(() => ({})), { edh: edhMap(edh) });
  showSwaps(r, target);
}
async function budgetWithAI() {
  const bo = $("#budgetOut"), target = budgetTarget();
  if (target === null) { bo.innerHTML = '<p class="lo">Escribe un precio máximo.</p>'; return; }
  if (!(await aiReady(bo))) return;
  const s = A.analyze(deck), btn = $("#budgetAI"); btn.disabled = true;
  bo.innerHTML = thinking("Claude está buscando alternativas baratas…");
  const edh = await edhFor(deck.cmds);
  const exp = [...deck.cards.values()].map(e => e.c).filter(c => !A.isBasic(c) && c.price >= 0.5).sort((a, b) => b.price - a.price).slice(0, 40);
  const prompt = `Abarata este mazo de Commander sin perder su plan de juego.
Precio actual: ${Math.round(s.price)}; objetivo: ${Math.round(target)} como máximo (precios en ${currencyName()}).
${deckBrief(s)}
Cartas más caras (precio por unidad): ${exp.map(c => `${c.name} (${c.price.toFixed(2)})`).join(", ")}
${synergyBrief(edh, deck.cmds, deck.cards, { prices: true, maxPrice: Math.max(1, target / 50) })}
Propón cambios uno a uno: quita una carta cara y pon otra mucho más barata que cumpla la misma función en el mazo y encaje con el comandante. Empieza por las más caras y para cuando el total baje del objetivo. No toques las tierras básicas. Para sustituir, prefiere cartas baratas con sinergia con el comandante antes que staples genéricos.
Responde SOLO con JSON, con esta forma exacta:
{"resumen":"1-2 frases sobre cómo queda el mazo","cambios":[{"quitar":"Nombre exacto en inglés","poner":"Nombre exacto en inglés","motivo":"breve: qué función cumple igual"}]}
Reglas: "quitar" debe estar en la lista. "poner" debe ser legal en Commander, estar dentro de la identidad de color ${s.ci || "incolora"}, no estar ya en la lista y costar menos de la mitad que la carta que sustituye.`;
  try {
    const r = await AI.askJSON(prompt, { effort: "medium" });
    const raw = Array.isArray(r.cambios) ? r.cambios : [];
    await SF.collection(raw.flatMap(x => [String(x.quitar || ""), String(x.poner || "")]), { fuzzyLimit: 10 }).catch(() => {});
    const used = new Set(), list = []; let total = s.price, dropped = 0;
    for (const x of raw) {
      const o = SF.cached(String(x.quitar || "")), n = SF.cached(String(x.poner || ""));
      const ok = o && n && deck.cards.has(A.key(o)) && !used.has(A.key(o)) && n.legal && !deck.cards.has(A.key(n)) && !used.has(A.key(n))
        && (!deck.cmds.length || A.subsetCI(n.ci, s.ci)) && n.price > 0 && n.price < o.price;
      if (!ok) { dropped++; continue; }
      used.add(A.key(o)); used.add(A.key(n));
      list.push({ out: o, in: n, save: o.price - n.price, why: String(x.motivo || "") }); total -= o.price - n.price;
    }
    showSwaps({ swaps: list, from: s.price, to: total }, target, `<p style="margin:0">${esc(r.resumen || "")}</p>`
      + (dropped ? `<p class="muted small" style="margin:0">${dropped} propuesta(s) descartadas por no existir, no ser legales, salirse de tus colores o no ser más baratas.</p>` : ""));
  } catch (e) { bo.innerHTML = `<p class="no">${esc(AI.errMsg(e))}</p>`; }
  finally { btn.disabled = false; }
}
const thumb = c => c.small ? `<img class="th" src="${esc(c.small)}" alt="" loading="lazy">` : '<span class="th"></span>';
function showSwaps(r, target, intro = "") {
  swaps = r.swaps;
  const bo = $("#budgetOut");
  if (!swaps.length) {
    bo.innerHTML = intro + (r.from <= target ? `<p class="ok" style="margin:0">El mazo ya cuesta ${money(r.from)}, por debajo de ${money(target)}.</p>`
      : '<p class="lo" style="margin:0">No he encontrado alternativas baratas con la misma función. Prueba con un objetivo más alto o con la IA.</p>');
    return;
  }
  bo.innerHTML = `${intro}<p style="margin:0">${swaps.length} ${swaps.length === 1 ? "cambio" : "cambios"}: de <b>${money(r.from)}</b> a <b>${money(r.to)}</b> (objetivo ${money(target)}).${r.to > target ? ' <span class="lo">No llega al objetivo con cambios de la misma función; puedes quitar más a mano.</span>' : ""}</p>
    <div class="swaps">${swaps.map((x, i) => `<div class="swap">
      <div class="sw">${thumb(x.out)}<span class="sn">${nameBtn(x.out)}<span class="muted small mono">${cardMoney(x.out)}</span></span></div>
      <span class="arrow" aria-hidden="true">→</span>
      <div class="sw">${thumb(x.in)}<span class="sn">${nameBtn(x.in)}<span class="muted small mono">${cardMoney(x.in)}</span></span></div>
      <button class="btn sm" data-swap="${i}">Cambiar</button>
      ${x.why ? `<span class="why">${esc(x.why)}</span>` : `<span class="why">Ahorras ${money(x.save, 2)}${x.in.rank < 99999 ? ` · #${x.in.rank} en EDHREC` : ""}</span>`}</div>`).join("")}</div>
    <div class="row"><button class="btn primary" id="swapAll">Aplicar todos</button></div>`;
}
function applySwap(i) {
  const x = swaps[i]; if (!x) return false;
  if (!deck.cards.has(A.key(x.out))) return false;
  removeFromDeck(x.out); addToDeck(x.in); return true;
}
$("#aiOut").addEventListener("click", e => {
  if (e.target.closest("#budgetGo")) { budgetNoAI(); return; }
  if (e.target.closest("#budgetAI")) { budgetWithAI(); return; }
  const all = e.target.closest("#swapAll");
  const one = e.target.closest("[data-swap]");
  if (!all && !one) return;
  const btns = all ? [...$("#budgetOut").querySelectorAll("[data-swap]:not(:disabled)")] : [one];
  let n = 0;
  for (const b of btns) { if (applySwap(+b.dataset.swap)) n++; b.disabled = true; b.textContent = "Hecho"; b.closest(".swap").classList.add("done"); }
  if (all) all.disabled = true;
  syncText(); render(); if (n) toast(n === 1 ? "Cambio aplicado" : `${n} cambios aplicados`);
});
$("#aiOut").addEventListener("keydown", e => { if (e.key === "Enter" && e.target.id === "budgetMax") budgetNoAI(); });

function mdHTML(t) {
  const lines = esc(t).split(/\n/); let h = "", inUl = false;
  const inline = x => x.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/\*(.+?)\*/g, "<em>$1</em>");
  for (const l of lines) {
    if (/^\s*[-*•]\s+/.test(l)) { if (!inUl) { h += "<ul>"; inUl = true; } h += `<li>${inline(l.replace(/^\s*[-*•]\s+/, ""))}</li>`; continue; }
    if (inUl) { h += "</ul>"; inUl = false; }
    if (/^#{1,4}\s/.test(l)) h += `<h4>${inline(l.replace(/^#+\s*/, ""))}</h4>`; else if (l.trim()) h += `<p>${inline(l)}</p>`;
  }
  return h + (inUl ? "</ul>" : "");
}
$("#btnXray").onclick = async () => {
  const out = $("#aiOut"); if (!deck.cards.size) { out.innerHTML = '<p class="lo">Primero analiza un mazo.</p>'; return; }
  if (!(await aiReady(out))) return;
  const s = A.analyze(deck), ctl = new AbortController();
  out.innerHTML = thinking("Preparando la radiografía…") + '<div class="row"><button class="btn sm" id="stopX">Detener</button></div><div class="md" id="xmd"></div>';
  $("#stopX").onclick = () => ctl.abort();
  const prompt = `Escribe una radiografía de este mazo de Commander, con estos apartados como títulos "## ": Plan de juego, Cómo se juega (turnos 1-3, medio juego, cierre), Qué buscar en el mulligan, Puntos débiles, Contra qué mesas sufre, Combos y sinergias clave. Usa viñetas cortas y nombra cartas concretas de la lista. Sé directo y práctico, unas 400 palabras.\n\n${deckBrief(s)}`;
  try {
    await AI.ask(prompt, { signal: ctl.signal, effort: "low", onText: ({ text }) => { out.querySelector(".status")?.remove(); $("#xmd").innerHTML = mdHTML(text); } });
  } catch (e) {
    out.querySelector(".status")?.remove();
    if (e.code !== "cancelled") { if (e.text) $("#xmd").innerHTML = mdHTML(e.text); out.insertAdjacentHTML("afterbegin", `<p class="no">${esc(AI.errMsg(e))}</p>`); }
  }
  $("#stopX")?.parentElement.remove();
};

/* ---------- Construir ---------- */
let bCmds = [null, null];
function showCmdPreview() {
  const list = bCmds.filter(Boolean), el = $("#cmdPreview");
  if (!list.length) { el.innerHTML = '<h3>Comandante</h3><p class="muted">Busca un comandante para ver su carta y su identidad de color.</p>'; return; }
  el.innerHTML = list.map(c => `<div class="cmdprev" style="margin-bottom:14px">${c.img ? `<img src="${esc(c.img)}" alt="${esc(c.name)}">` : ""}<div><div class="row between"><h3 style="margin:0">${esc(c.name)}</h3>${manaHTML(c.cost)}</div><div class="typeline">${esc(c.type)}${c.sub ? " — " + esc(c.sub) : ""} · ${c.rank >= 99999 ? "sin ranking" : "#" + c.rank} en EDHREC</div><div class="oracle">${esc(c.text)}</div></div></div>`).join("") +
    `<div class="eyebrow">Identidad de color</div>${pipsHTML(A.ciUnion(list))}`;
}
attachAC($("#bCmd"), { query: cmdQuery, onPick: (c, inp) => { inp.value = c.name; bCmds[0] = c; showCmdPreview(); } });
attachAC($("#bCmd2"), { query: cmdQuery, onPick: (c, inp) => { inp.value = c.name; bCmds[1] = c; showCmdPreview(); } });
async function readBuilder() {
  const names = [$("#bCmd").value.trim(), $("#bCmd2").value.trim()];
  if (names.some(Boolean)) await SF.collection(names.filter(Boolean)).catch(() => {});
  bCmds = names.map(n => n ? SF.cached(n) || null : null);
  showCmdPreview();
  return { cmds: bCmds.filter(Boolean), theme: $("#bTheme").value.trim(), bracket: +$("#bBracket").value, budget: +$("#bBudget").value };
}
let basicsCache = null;
async function getBasics() {
  if (!basicsCache) { await SF.collection(Object.values(A.BASICS)); basicsCache = Object.fromEntries(Object.entries(A.BASICS).map(([k, n]) => [k, SF.cached(n)])); }
  return basicsCache;
}
async function autoFill(o, cards, st) {
  const ci = A.ciUnion(o.cmds);
  st.innerHTML = '<span class="spin"></span><span>Buscando las cartas más jugadas en estos colores…</span>';
  const pool = [...await SF.poolFor(ci)];
  st.innerHTML = '<span class="spin"></span><span>Buscando qué se juega con este comandante (EDHREC)…</span>';
  const edh = await edhFor(o.cmds);
  if (edh) pool.push(...[...edh.cards.values()].map(e => SF.cached(e.name)).filter(Boolean));
  const words = A.synergyWords(o.cmds, o.theme).filter(w => /^[a-z]+$/.test(w));
  const boosted = new Set();
  if (words.length) {
    const q = `${SF.ciQuery(ci)} legal:commander game:paper (${words.slice(0, 4).map(w => `t:${w} or o:${w}`).join(" or ")})`;
    (await SF.search(q, { pages: 2 }).catch(() => [])).forEach(c => { pool.push(c); boosted.add(A.key(c)); });
  }
  return A.fillDeck(o.cmds, cards, pool, await getBasics(), { ...o, boosted, edh: edhMap(edh) });
}
function loadBuilt(cmds, cards, note, id = null) {
  deck = { cmds, cards, unknown: [], illegal: [] }; setDeckId(id); syncText(); render();
  $("#aiOut").innerHTML = note ? `<div>${note}</div>` : "";
  location.hash = "analizar";
}
$("#btnGenAuto").onclick = async () => {
  const st = $("#genStatus"), o = await readBuilder();
  if (!o.cmds.length) { st.innerHTML = '<span class="no">Elige un comandante de la lista.</span>'; return; }
  try {
    const cards = await autoFill(o, new Map(), st); st.innerHTML = "";
    loadBuilt(o.cmds, cards, `<p class="muted" style="margin:0">Mazo generado automáticamente con lo que más se juega con este comandante (EDHREC) y las cuotas de ramp, robo e interacción${o.theme ? `, priorizando «${esc(o.theme)}»` : ""}. Usa «Optimizar con IA» para afinar la sinergia.</p>`);
  } catch (e) { st.innerHTML = `<span class="no">No se pudo consultar Scryfall: ${esc(e.message || e)}</span>`; }
};
$("#btnGenAI").onclick = async () => {
  const st = $("#genStatus"), o = await readBuilder();
  if (!o.cmds.length) { st.innerHTML = '<span class="no">Elige un comandante de la lista.</span>'; return; }
  if (!(await aiReady(st))) return;
  const ci = A.ciUnion(o.cmds), ctl = new AbortController(), btn = $("#btnGenAI");
  st.innerHTML = '<span class="spin"></span><span class="msg">Claude está pensando el mazo… suele tardar entre 30 y 90 segundos.</span><button class="btn sm" id="stopGen">Detener</button>';
  $("#stopGen").onclick = () => ctl.abort(); btn.disabled = true;
  const cmdTxt = o.cmds.map(c => `${c.name} (${c.type}${c.sub ? " — " + c.sub : ""}): ${c.text}`).join("\n");
  const brDesc = { 2: "B2 Core: nivel de mazo preconstruido, sin Game Changers, sin combos de dos cartas tempranos", 3: "B3 Upgraded: mejorado, como máximo 3 Game Changers, sin combos infinitos antes del turno 6", 4: "B4 Optimized: muy optimizado, Game Changers permitidos, tutores y combos permitidos", 5: "B5 cEDH: competitivo, máxima eficiencia, maná rápido, tutores y combos compactos" }[o.bracket];
  const prompt = `Construye un mazo de Commander completo para:
${cmdTxt}
Identidad de color: ${ci || "incolora"}.
Tema: ${o.theme || "la estrategia más fuerte y divertida para este comandante"}.
Nivel: ${brDesc}.
${o.budget ? `Presupuesto: cartas de hasta ${o.budget} ${currencyName()} cada una aproximadamente.` : ""}
${await newsBrief(ci)}
${synergyBrief(await edhFor(o.cmds), o.cmds, new Map(), { max: 50, maxPrice: o.budget || 0 })}
Esqueleto: 36-37 tierras en total, unas 10 piezas de ramp, 10 de robo, 8-10 de interacción y 2-3 barridos, más sinergia y formas de ganar. ${SYN_RULE}
Responde SOLO con JSON con esta forma exacta:
{"nombre":"nombre corto del mazo","estrategia":"2-3 frases","cartas":["Sol Ring","Command Tower","..."],"basicas":{"Forest":10}}
"cartas" son las cartas no básicas, cada una una sola vez, con el nombre oficial en inglés, sin el comandante. "basicas" son las tierras básicas y cuántas de cada una. cartas + basicas deben sumar exactamente ${100 - o.cmds.length}. Todas legales en Commander y dentro de la identidad de color.`;
  try {
    const r = await AI.askJSON(prompt, { signal: ctl.signal, effort: "medium", onText: ({ text }) => { const m = st.querySelector(".msg"); const n = (text.match(/",/g) || []).length; if (m && n > 2) m.textContent = `Escribiendo la lista… (${n} cartas)`; } });
    st.querySelector(".msg") && (st.querySelector(".msg").textContent = "Comprobando las cartas en Scryfall…");
    const names = (Array.isArray(r.cartas) ? r.cartas : []).map(String);
    const basicsObj = r.basicas && typeof r.basicas === "object" ? r.basicas : {};
    await SF.collection([...names, ...Object.keys(basicsObj)]);
    const cards = new Map(), rejected = [];
    for (const n of names) {
      const c = SF.cached(n);
      if (!c || !c.legal || o.cmds.some(x => x.name === c.name) || !A.subsetCI(c.ci, ci) || cards.has(A.key(c))) { rejected.push(n); continue; }
      cards.set(A.key(c), { c, q: 1 });
    }
    for (const [n, q] of Object.entries(basicsObj)) { const c = SF.cached(n), k = Math.max(0, Math.min(40, parseInt(q) || 0)); if (c && k && A.isBasic(c) && A.subsetCI(c.ci, ci)) cards.set(A.key(c), { c, q: k }); }
    const before = [...cards.values()].reduce((a, e) => a + e.q, 0);
    await autoFill(o, cards, st);
    const after = [...cards.values()].reduce((a, e) => a + e.q, 0);
    st.innerHTML = "";
    loadBuilt(o.cmds, cards, `<p style="margin:0"><strong class="grade" style="font-family:var(--f-display);font-weight:400;font-size:18px">${esc(r.nombre || "Mazo generado")}</strong></p><p style="margin:4px 0 0">${esc(r.estrategia)}</p>${rejected.length || after !== before ? `<p class="muted small" style="margin:6px 0 0">${rejected.length ? `Descartadas ${rejected.length} cartas no válidas (${rejected.slice(0, 6).map(esc).join(", ")}${rejected.length > 6 ? "…" : ""}). ` : ""}${after > before ? `Completado con ${after - before} cartas automáticas para llegar a ${100 - o.cmds.length}.` : ""}</p>` : ""}`);
  } catch (e) { st.innerHTML = e && e.code === "cancelled" ? '<span class="muted">Generación detenida.</span>' : `<span class="no">${esc(AI.errMsg(e))}</span>`; }
  finally { btn.disabled = false; }
};
async function renderNewCommanders() {
  const el = $("#newCmds"); el.innerHTML = thinking("Buscando comandantes nuevos…");
  const list = (await SF.newCommanders(120)).slice(0, 24);
  el.innerHTML = list.length ? list.map(c => `<div class="gc-item">${vcard(c)}<div class="meta"><span>${isPreview(c) ? '<span class="tag new">Preview</span>' : esc(c.released)}</span>${pipsHTML(c.ci)}</div></div>`).join("") : '<p class="muted small">No se han podido cargar.</p>';
}
$("#newCmds").addEventListener("click", e => {
  const b = e.target.closest("[data-name]"); if (!b) return;
  const c = SF.cached(b.dataset.name); if (!c) return;
  bCmds = [c, null]; $("#bCmd").value = c.name; $("#bCmd2").value = ""; showCmdPreview();
  $("#bCmd").scrollIntoView({ behavior: "smooth", block: "center" });
});

/* ---------- moneda ---------- */
const curSel = $("#currency");
curSel.value = currency();
curSel.onchange = () => setCurrency(curSel.value);
function updateBudgetLabels() { document.querySelectorAll("#bBudget option[data-cur]").forEach(o => { o.textContent = `Hasta ${o.value.replace(".", ",")} ${symbol()}`; }); }
updateBudgetLabels();
addEventListener("currencychange", () => {
  curSel.value = currency(); updateBudgetLabels(); render();
  if (!$("#view-mazos").hidden) { renderDecks(); if (!$("#commBox").hidden) renderCommunity(); }
});

/* ---------- contraseña de la IA ---------- */
const dlg = $("#passDlg");
function askPass() {
  return new Promise(res => {
    $("#passInput").value = AI.getPass(); dlg.showModal();
    dlg.addEventListener("close", () => { if (dlg.returnValue === "ok") AI.setPass($("#passInput").value.trim()); res(); }, { once: true });
  });
}
$("#btnPass").onclick = () => askPass();

const nameDlg = $("#nameDlg");
function askName(title, value, label = "Nombre del mazo") {
  return new Promise(res => {
    $("#nameTitle").textContent = title; $("#nameLabel").textContent = label; $("#nameInput").value = value || ""; nameDlg.returnValue = "";
    nameDlg.showModal(); $("#nameInput").select();
    // Se resuelve con el envío del formulario (inmediato) o, si se cierra con Esc, con cancel/close.
    let settled = false;
    const done = v => { if (settled) return; settled = true; res(v); };
    nameDlg.querySelector("form").addEventListener("submit", e => done(e.submitter && e.submitter.value === "ok" || !e.submitter ? $("#nameInput").value.trim() : null), { once: true });
    nameDlg.addEventListener("cancel", () => done(null), { once: true });
    nameDlg.addEventListener("close", () => done(nameDlg.returnValue === "ok" ? $("#nameInput").value.trim() : null), { once: true });
  });
}

/* ---------- navegación ---------- */
let cmdsLoaded = false;
function route() {
  const views = ["analizar", "construir", "guiado", "mazos", "comparar", "coleccion", "mano"];
  const h = location.hash.slice(1);
  // Enlace de un mazo compartido: #compartido/<id>
  const shared = /^compartido\/([0-9a-f-]{36})$/i.exec(h);
  $("#view-compartido").hidden = !shared;
  if (shared) {
    views.forEach(x => { $("#view-" + x).hidden = true; });
    document.querySelectorAll("nav.tabs a").forEach(a => a.setAttribute("aria-current", "false"));
    showShared(shared[1]); return;
  }
  // #comunidad es la segunda pestaña de «Mis mazos».
  const v = h === "comunidad" ? "mazos" : views.includes(h) ? h : "analizar";
  views.forEach(x => { $("#view-" + x).hidden = x !== v; });
  document.querySelectorAll("nav.tabs a").forEach(a => a.setAttribute("aria-current", a.dataset.view === v ? "page" : "false"));
  if (v === "mano") showGoldfish();
  if (v === "comparar") showCompare();
  if (v === "coleccion") showCollection();
  if (v === "construir" && !cmdsLoaded) { cmdsLoaded = true; renderNewCommanders(); }
  if (v === "guiado") showGuided();
  if (v === "mazos") { setMazosTab(h === "comunidad" ? "comm" : "mine"); renderCloud(); }
}
window.addEventListener("hashchange", route);

initShared({ esc, manaHTML, pipsHTML, toast, attachAC, thinking, buildDeck });
initGoldfish({ esc, toast, getDeck: () => deck });
initCompare({
  esc, pipsHTML, manaHTML, thinking, buildDeck,
  currentText: () => deck.cards.size || deck.cmds.length ? A.deckToText(deck) : $("#deckText").value,
  openInAnalyze: async text => {
    $("#deckText").value = text; $("#cmd1").value = ""; $("#cmd2").value = "";
    location.hash = "analizar";
    await loadFromText(text); setDeckId(null); setCmdInputs(); render(); $("#aiOut").innerHTML = "";
  },
});
initCollection({ esc, toast, attachAC, thinking, pipsHTML, getDeck: () => deck, onChange: () => { renderColDeck(); if (!$("#view-mazos").hidden) renderDecks(); } });

initGuided({
  esc, manaHTML, pipsHTML, toast, attachAC, thinking, cmdQuery, aiReady,
  onAnalyze: (cmds, cards, id) => loadBuilt(cmds, cards, '<p class="muted" style="margin:0">Mazo montado paso a paso. Usa «Optimizar con IA» para afinar la sinergia.</p>', id),
  saveDeck: saveDeckFlow,
});

/* ---------- arranque ---------- */
(async function boot() {
  route(); render(); showCmdPreview();
  Cloud.init(); // si hay sesión, trae los mazos de la nube en segundo plano
  AI.aiStatus().then(st => {
    $("#btnPass").hidden = !(st.ok && st.password);
    if (st.ok && st.mode === "local" && st.configured) $("#aiNote").textContent = "IA en modo local: usa tu cuenta de Claude a través de Claude Code en este ordenador.";
    else if (st.ok && st.configured && st.login) $("#aiNote").textContent = "La IA de esta web es privada: solo funciona con la cuenta del dueño, entrando en «Mis mazos».";
    else if (!st.ok || !st.configured) $("#aiNote").textContent = (st.mode === "local" && st.found ? AI.errMsg({ code: "not_logged_in" }) : AI.errMsg({ code: "not_configured" })) + " El análisis, las novedades y el generador automático funcionan igual.";
  });
  const saved = store.get("forja-deck");
  if (saved && saved.trim()) {
    $("#deckText").value = saved;
    await loadFromText(saved); setCmdInputs();
  } else {
    $("#loadStatus").innerHTML = '<span class="spin"></span><span>Preparando un mazo de ejemplo…</span>';
    try {
      await SF.collection(["Edgar Markov"]);
      const ex = SF.cached("Edgar Markov");
      if (ex) {
        const cards = await autoFill({ cmds: [ex], bracket: 3, budget: 0, theme: "" }, new Map(), $("#loadStatus"));
        deck = { cmds: [ex], cards, unknown: [], illegal: [] }; syncText();
        $("#aiOut").innerHTML = '<p class="muted" style="margin:0">Lista de ejemplo: un mazo automático de Edgar Markov. Pega la tuya arriba y pulsa «Analizar mazo».</p>';
      }
      $("#loadStatus").innerHTML = "";
    } catch (e) { $("#loadStatus").innerHTML = `<span class="no">No se pudo conectar con Scryfall. Comprueba tu conexión.</span>`; }
  }
  const ed = SF.cached("Edgar Markov");
  if (ed) { bCmds[0] = ed; $("#bCmd").value = ed.name; showCmdPreview(); }
  render(); route();
})();
