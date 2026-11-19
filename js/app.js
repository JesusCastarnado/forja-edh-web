import * as SF from "./scryfall.js";
import * as A from "./analysis.js";
import * as AI from "./ai.js";
import { initGuided, showGuided } from "./guided.js";

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
      <div class="kv"><div><span>EDHREC</span><b>${c.rank >= 99999 ? "–" : "#" + c.rank}</b></div><div><span>Precio</span><b>${c.price ? c.price.toFixed(2) + " $" : "–"}</b></div><div><span>Edición</span><b style="font-family:var(--f-body)">${esc(c.set)}</b></div></div>
      <p class="small" style="margin:0">${c.legal ? '<span class="ok">Legal en Commander</span>' : isPreview(c) ? `<span class="lo">Preview: sale el ${esc(c.released)}</span>` : '<span class="no">No legal en Commander</span>'}${c.gc ? ' · <span class="tag gc">Game Changer</span>' : ""}</p>
      <div class="row">${$("#view-guiado").hidden && deck.cmds.length && !deck.cards.has(A.key(c)) && !deck.cmds.some(x => x.name === c.name) ? `<button class="btn primary sm" data-addz="${esc(c.name)}">Añadir al mazo</button>` : ""}<a class="btn sm" href="${esc(c.uri)}" target="_blank" rel="noopener" style="text-decoration:none">Ver en Scryfall</a><button class="btn sm" data-close>Cerrar</button></div>
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
let deckKey = "", library = [], hand = [], mulls = 0;
let viewMode = store.get("forja-view") === "visual" ? "visual" : "list";

async function loadFromText(text, overrideNames = []) {
  const p = A.parseList(text);
  const names = [...p.main, ...p.cmd].map(e => e.name).concat(overrideNames);
  const st = $("#loadStatus");
  st.innerHTML = `<span class="spin"></span><span>Buscando ${new Set(names).size} cartas en Scryfall…</span>`;
  try {
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
    deck = { cmds: cmds.slice(0, 2), cards, unknown, illegal };
    st.innerHTML = "";
  } catch (e) {
    st.innerHTML = `<span class="no">No se pudo consultar Scryfall: ${esc(e.message || e)}. Comprueba la conexión y vuelve a intentarlo.</span>`;
  }
}
function syncText() { $("#deckText").value = A.deckToText(deck); setCmdInputs(); }
function setCmdInputs() { $("#cmd1").value = deck.cmds[0] ? deck.cmds[0].name : ""; $("#cmd2").value = deck.cmds[1] ? deck.cmds[1].name : ""; }
function addToDeck(c, q = 1) { if (deck.cmds.some(x => x.name === c.name)) return; const k = A.key(c), e = deck.cards.get(k); deck.cards.set(k, { c, q: (e ? e.q : 0) + q }); }
function removeFromDeck(c) { const k = A.key(c), e = deck.cards.get(k); if (!e) return; if (e.q > 1 && A.isBasic(c)) e.q--; else deck.cards.delete(k); }

/* ---------- pintar el análisis ---------- */
function render() {
  const s = A.analyze(deck);
  const k = A.deckToText(deck);
  if (k !== deckKey) { hand = []; library = []; deckKey = k; }
  const cmd0 = deck.cmds[0];
  const cmdNames = deck.cmds.map(c => c.name).join(" + ") || "Sin comandante";
  $("#summary").innerHTML = `
    <div class="cmdcell" ${cmd0 && cmd0.art ? `style="background-image:url('${esc(cmd0.art)}')"` : ""}><div><div class="eyebrow">Comandante</div><div class="cmdname">${deck.cmds.length ? deck.cmds.map(nameBtn).join(" + ") : esc(cmdNames)}</div><div style="margin-top:4px">${deck.cmds.length ? pipsHTML(s.ci) : '<span class="muted small">Elige uno arriba para comprobar la identidad de color.</span>'}</div></div></div>
    <div><div class="eyebrow">Nota</div><div class="big grade">${s.grade}</div><div class="muted small">${s.level} · ${s.score}/100</div></div>
    <div><div class="eyebrow">Bracket estimado</div><div class="big">B${s.bracket}</div><div class="muted small">${A.BRK[s.bracket]} · ${s.gc.length} Game Changers</div></div>
    <div><div class="eyebrow">Cartas</div><div class="big mono ${s.total === 100 ? "" : "no"}">${s.total}</div><div class="muted small">${s.total === 100 ? "Mazo completo" : s.total < 100 ? `Faltan ${100 - s.total}` : `Sobran ${s.total - 100}`}</div></div>
    <div><div class="eyebrow">Precio aprox.</div><div class="big mono">${Math.round(s.price)} $</div><div class="muted small">CMC medio ${s.avgCmc.toFixed(2)}</div></div>`;

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
  $("#issues").innerHTML = iss.length ? iss.map(x => `<li>${x}</li>`).join("") : '<li class="ok">Sin problemas de legalidad ni de esqueleto.</li>';
  store.set("forja-deck", k);
  renderNews(s.ci);
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

/* ---------- novedades ---------- */
let newsCI = null;
async function renderNews(ci) {
  if (!deck.cmds.length) { newsCI = null; $("#news").innerHTML = '<p class="muted small">Elige un comandante para ver las cartas nuevas en sus colores.</p>'; $("#newsLink").hidden = true; return; }
  if (newsCI === ci) return; newsCI = ci;
  const q = `${SF.ciQuery(ci)} date>=${SF.isoDaysAgo(150)} -t:basic game:paper`;
  $("#newsLink").href = SF.searchURL(q); $("#newsLink").hidden = false;
  $("#news").innerHTML = thinking("Buscando novedades…");
  const list = (await SF.newsFor(ci)).filter(c => !c.isCmd || ci.length > 0).slice(0, 18);
  if (newsCI !== ci) return;
  $("#news").innerHTML = list.length ? list.map(c => `<div class="gc-item">${vcard(c)}<div class="meta"><span>${isPreview(c) ? '<span class="tag new">Preview</span>' : esc(c.released)}</span><button class="btn sm" data-addnews="${esc(c.name)}" ${deck.cards.has(A.key(c)) ? "disabled" : ""}>Añadir</button></div></div>`).join("")
    : '<p class="muted small">No hay cartas nuevas en estos colores en los últimos meses.</p>';
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
  if (st.password && !AI.getPass()) { await askPass(); if (!AI.getPass()) { out.innerHTML = '<p class="lo">Hace falta la contraseña de la IA.</p>'; return false; } }
  return true;
}
function deckBrief(s) {
  const c0 = deck.cmds.map(c => `${c.name} (${c.type}${c.sub ? " — " + c.sub : ""}): ${c.text}`).join("\n");
  const list = [...deck.cards.values()].map(e => `${e.q} ${e.c.name}`).join("\n");
  return `Comandante(s):\n${c0 || "(sin comandante)"}\nIdentidad de color: ${s.ci || "incolora"}\nEstadísticas: ${s.total} cartas, ${s.lands} tierras, ${s.ramp} ramp, ${s.draw} robo, ${s.removal} removal, ${s.counters} contrahechizos, ${s.wipes} barridos, ${s.tutors} tutores, CMC medio ${s.avgCmc.toFixed(2)}, ${s.gc.length} Game Changers, bracket estimado B${s.bracket}.\nLista:\n${list}`;
}
const chipList = names => (names || []).map(n => SF.cached(String(n))).filter(c => c && (deck.cards.has(A.key(c)) || deck.cmds.some(x => x.name === c.name)))
  .map(c => `<button class="chip" data-name="${esc(c.name)}">${esc(c.name)}</button>`).join("");

let diag = null;
$("#btnOpt").onclick = async () => {
  const out = $("#aiOut");
  if (!deck.cards.size) { out.innerHTML = '<p class="lo">Primero analiza un mazo.</p>'; return; }
  if (!(await aiReady(out))) return;
  const s = A.analyze(deck), btn = $("#btnOpt"); btn.disabled = true;
  out.innerHTML = thinking("Claude está leyendo cómo está montado el mazo…");
  const prompt = `Lee este mazo de Commander y diagnostica cómo está montado.
${deckBrief(s)}
Responde SOLO con JSON, con esta forma exacta:
{"comandante":"1-2 frases: qué quiere hacer este comandante y cómo se le saca partido","estilo_actual":{"nombre":"nombre corto del arquetipo (p. ej. Aristócratas, Fichas, Voltron, Control, Combo)","descripcion":"1-2 frases sobre cómo gana y juega el mazo tal como está","cartas_clave":["5-8 cartas de la lista que definen ese estilo"]},"fuera_de_estilo":["hasta 8 cartas de la lista que no encajan con el estilo ni con el comandante"],"opciones":[{"nombre":"nombre corto","descripcion":"1 frase: cómo jugaría y qué cambia respecto al actual"}]}
"opciones" son 3 estilos distintos y viables para este comandante; el primero es reforzar el estilo actual.`;
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
      <button class="btn primary ai" id="btnOpt2">Proponer mejoras para este estilo</button>
    </div></div>`;
  $("#customStyle").addEventListener("focus", () => { out.querySelector('input[value="custom"]').checked = true; });
  $("#btnOpt2").onclick = () => optimizeFor(d);
}
async function optimizeFor(d) {
  const out = $("#aiOut"); if (!(await aiReady(out))) return;
  const sel = out.querySelector('input[name="estilo"]:checked')?.value, ea = d.estilo_actual || {};
  const style = sel === "custom" ? { nombre: $("#customStyle").value.trim() || "el que mejor funcione con este comandante", descripcion: "" }
    : ((d.opciones || [])[+sel] || { nombre: ea.nombre || "", descripcion: ea.descripcion || "" });
  const depth = +$("#optDepth").value, s = A.analyze(deck), tb = $("#optBracket").value;
  out.innerHTML = thinking(`Buscando mejoras para jugar «${style.nombre}»…`);
  const prompt = `Mejora este mazo de Commander para el estilo que quiere el jugador.
${deckBrief(s)}
${await newsBrief(s.ci)}
Diagnóstico previo. El comandante: ${d.comandante || ""}
Estilo actual del mazo: ${ea.nombre || ""}. ${ea.descripcion || ""} Cartas que lo definen: ${(ea.cartas_clave || []).join(", ")}.
Estilo que quiere el jugador: ${style.nombre}. ${style.descripcion || ""}
Nivel de poder: ${tb ? "llevarlo al bracket B" + tb : "mantener el bracket actual (B" + s.bracket + ")"}.
Cómo trabajar: primero piensa qué piezas necesita ese estilo con este comandante concreto (motores, sinergias, formas de ganar) y qué cartas de la lista no lo sirven o son las más flojas. Corta primero lo que no aporta al estilo. Mantén el esqueleto sano (tierras 35-38, ramp ~10, robo ~10, interacción ~9, 2-3 barridos) y no rompas lo que ya funciona.
Responde SOLO con JSON, con esta forma exacta:
{"resumen":"2-3 frases: cómo jugará el mazo después de los cambios","cortes":[{"carta":"Nombre exacto en inglés","motivo":"breve, por qué no sirve a ese estilo"}],"anadidos":[{"carta":"Nombre exacto en inglés","motivo":"breve, qué aporta a ese estilo y con el comandante","categoria":"motor|sinergia|remate|ramp|robo|removal|barrido|proteccion|tierra"}]}
Reglas: entre ${depth - 2} y ${depth} cortes y el mismo número de añadidos. Los cortes deben estar en la lista. Los añadidos deben ser legales en Commander, dentro de la identidad de color ${s.ci || "incolora"}, no estar ya en la lista, y usar el nombre oficial en inglés.`;
  try {
    const r = await AI.askJSON(prompt, { onText: ({ text }) => { const m = out.querySelector(".status .msg"); const n = (text.match(/"carta"/g) || []).length; if (m && n) m.textContent = `Escribiendo propuestas… (${n})`; } });
    await renderOpt(r, s, style.nombre);
  } catch (e) {
    out.innerHTML = `<p class="no">${esc(AI.errMsg(e))}</p><div class="row"><button class="btn" id="backStyle">Volver a los estilos</button></div>`;
    $("#backStyle").onclick = () => renderDiag(d);
  }
}
async function renderOpt(r, s, styleName) {
  const out = $("#aiOut");
  const cutsRaw = Array.isArray(r.cortes) ? r.cortes : [], addsRaw = Array.isArray(r.anadidos) ? r.anadidos : (r["añadidos"] || []);
  await SF.collection([...cutsRaw, ...addsRaw].map(x => String(x.carta || "")), { fuzzyLimit: 10 }).catch(() => {});
  const cuts = cutsRaw.map(x => ({ ...x, c: SF.cached(String(x.carta || "")) })).filter(x => x.c && deck.cards.has(A.key(x.c)));
  const adds = addsRaw.map(x => ({ ...x, c: SF.cached(String(x.carta || "")) }));
  const seenAdd = new Set(); // si la IA repite una carta, solo se ofrece una vez (Commander es singleton)
  const okAdds = adds.filter(x => x.c && x.c.legal && !deck.cards.has(A.key(x.c)) && (!deck.cmds.length || A.subsetCI(x.c.ci, s.ci))
    && !seenAdd.has(A.key(x.c)) && seenAdd.add(A.key(x.c)));
  const dropped = adds.length - okAdds.length;
  out.innerHTML = `${styleName ? `<div class="eyebrow">Estilo: ${esc(styleName)}</div>` : ""}<p style="margin:0">${esc(r.resumen)}</p>
    <div class="sugg"><div><div class="eyebrow">Cortar</div>${cuts.map(x => sugHTML(x, "cut")).join("") || '<p class="muted">Sin cortes.</p>'}</div>
    <div><div class="eyebrow">Añadir</div>${okAdds.map(x => sugHTML(x, "add")).join("") || '<p class="muted">Sin añadidos válidos.</p>'}</div></div>
    ${dropped ? `<p class="muted small" style="margin:0">${dropped} propuesta(s) descartadas por no existir, no ser legales, estar ya en el mazo o salirse de la identidad de color.</p>` : ""}
    <div class="row"><button class="btn primary" id="applyAll">Aplicar todo</button>${diag && styleName ? '<button class="btn" id="backStyle">Elegir otro estilo</button>' : ""}</div>`;
  $("#applyAll").onclick = () => out.querySelectorAll(".sug:not(.done) button[data-cut],.sug:not(.done) button[data-add]").forEach(b => b.click());
  if ($("#backStyle")) $("#backStyle").onclick = () => renderDiag(diag);
}
function sugHTML(x, kind) {
  const c = x.c;
  return `<div class="sug">${c.small ? `<img class="th" src="${esc(c.small)}" alt="" loading="lazy">` : '<span class="th"></span>'}<span>${nameBtn(c)} ${manaHTML(c.cost)}${x.categoria ? ` <span class="tag">${esc(x.categoria)}</span>` : ""}${isPreview(c) ? ' <span class="tag new">nueva</span>' : ""}</span><button class="btn sm" data-${kind}="${esc(c.name)}">${kind === "cut" ? "Quitar" : "Añadir"}</button><span class="why">${esc(x.motivo)}</span></div>`;
}
$("#aiOut").addEventListener("click", e => {
  const b = e.target.closest("[data-cut],[data-add]"); if (!b) return;
  const c = SF.cached(b.dataset.cut || b.dataset.add); if (!c) return;
  if (b.dataset.cut) removeFromDeck(c); else addToDeck(c);
  b.closest(".sug").classList.add("done"); b.disabled = true; syncText(); render();
});

$("#btnQuick").onclick = async () => {
  const out = $("#aiOut"); if (!deck.cards.size) { out.innerHTML = '<p class="lo">Primero analiza un mazo.</p>'; return; }
  const s = A.analyze(deck); out.innerHTML = thinking("Buscando las cartas más jugadas en tus colores…");
  let pool; try { pool = await SF.poolFor(s.ci); } catch (e) { out.innerHTML = `<p class="no">No se pudo consultar Scryfall.</p>`; return; }
  const inDeck = c => deck.cards.has(A.key(c)) || deck.cmds.some(x => x.name === c.name);
  const sugg = [];
  for (const [k, flag, t, lab] of [["ramp", F.RAMP, 10, "Ramp"], ["draw", F.DRAW, 10, "Robo"], ["interaction", F.REM, 9, "Removal"], ["wipes", F.WIPE, 2, "Barrido"]]) {
    const miss = t - s[k]; if (miss <= 0) continue;
    pool.filter(c => (c.flags & flag) && !A.isLand(c) && !inDeck(c) && c.legal && !sugg.some(x => x.c === c)).slice(0, Math.min(miss, 5))
      .forEach(c => sugg.push({ c, categoria: lab, motivo: `Te faltan ${miss} de ${lab.toLowerCase()}; es de las más jugadas en tus colores (#${c.rank} en EDHREC).` }));
  }
  const weak = [...deck.cards.values()].map(e => e.c).filter(c => !A.isLand(c) && !A.isBasic(c)).sort((a, b) => b.rank - a.rank).slice(0, Math.max(4, sugg.length));
  out.innerHTML = `<p style="margin:0">Sugerencias calculadas con el esqueleto del mazo y la popularidad de cada carta. No tienen en cuenta la sinergia con el comandante.</p>
    <div class="sugg"><div><div class="eyebrow">Candidatas a cortar</div>${weak.map(c => sugHTML({ c, motivo: `Poco jugada en Commander (${c.rank >= 99999 ? "sin ranking" : "#" + c.rank}).` }, "cut")).join("")}</div>
    <div><div class="eyebrow">Añadir</div>${sugg.map(x => sugHTML(x, "add")).join("") || '<p class="muted">El esqueleto ya cumple las cifras recomendadas.</p>'}</div></div>`;
};

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
  const words = A.themeWords(o.cmds, o.theme);
  const boosted = new Set();
  if (words.length) {
    const q = `${SF.ciQuery(ci)} legal:commander game:paper (${words.slice(0, 4).map(w => `t:${w} or o:${w}`).join(" or ")})`;
    (await SF.search(q, { pages: 2 }).catch(() => [])).forEach(c => { pool.push(c); boosted.add(A.key(c)); });
  }
  return A.fillDeck(o.cmds, cards, pool, await getBasics(), { ...o, boosted });
}
function loadBuilt(cmds, cards, note) {
  deck = { cmds, cards, unknown: [], illegal: [] }; syncText(); render();
  $("#aiOut").innerHTML = note ? `<div>${note}</div>` : "";
  location.hash = "analizar";
}
$("#btnGenAuto").onclick = async () => {
  const st = $("#genStatus"), o = await readBuilder();
  if (!o.cmds.length) { st.innerHTML = '<span class="no">Elige un comandante de la lista.</span>'; return; }
  try {
    const cards = await autoFill(o, new Map(), st); st.innerHTML = "";
    loadBuilt(o.cmds, cards, `<p class="muted" style="margin:0">Mazo generado automáticamente con las cartas más jugadas en estos colores y las cuotas de ramp, robo e interacción${o.theme ? `, priorizando «${esc(o.theme)}»` : ""}. Usa «Optimizar con IA» para afinar la sinergia.</p>`);
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
${o.budget ? `Presupuesto: cartas de hasta ${o.budget} dólares cada una aproximadamente.` : ""}
${await newsBrief(ci)}
Esqueleto: 36-37 tierras en total, unas 10 piezas de ramp, 10 de robo, 8-10 de interacción y 2-3 barridos, más sinergia y formas de ganar.
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

/* ---------- Probar mano ---------- */
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function newGame(keepMull) {
  library = []; for (const { c, q } of deck.cards.values()) for (let k = 0; k < q; k++) library.push(c);
  shuffle(library); hand = library.splice(0, 7).map(c => ({ c, isNew: false })); if (!keepMull) mulls = 0; renderHand();
}
function renderHand() {
  const lands = hand.filter(h => A.isLand(h.c)).length, bottom = Math.max(0, mulls - 1);
  $("#handInfo").textContent = library.length + hand.length ? `${hand.length} en mano · ${lands} tierras · ${library.length} en la biblioteca${mulls ? ` · mulligan ${mulls}${bottom ? ` (pon ${bottom} al fondo)` : " (gratis)"}` : ""}` : "Analiza o genera un mazo primero.";
  $("#hand").innerHTML = hand.map(h => vcard(h.c, "", h.isNew ? "new" : "")).join("");
}
$("#btnNewHand").onclick = () => newGame(false);
$("#btnMull").onclick = () => { mulls++; newGame(true); };
$("#btnDraw").onclick = () => { if (!library.length) return; hand.forEach(h => h.isNew = false); hand.push({ c: library.shift(), isNew: true }); renderHand(); };

/* ---------- contraseña de la IA ---------- */
const dlg = $("#passDlg");
function askPass() {
  return new Promise(res => {
    $("#passInput").value = AI.getPass(); dlg.showModal();
    dlg.addEventListener("close", () => { if (dlg.returnValue === "ok") AI.setPass($("#passInput").value.trim()); res(); }, { once: true });
  });
}
$("#btnPass").onclick = () => askPass();

/* ---------- navegación ---------- */
let cmdsLoaded = false;
function route() {
  const views = ["analizar", "construir", "guiado", "mano"];
  const v = views.includes(location.hash.slice(1)) ? location.hash.slice(1) : "analizar";
  views.forEach(x => { $("#view-" + x).hidden = x !== v; });
  document.querySelectorAll("nav.tabs a").forEach(a => a.setAttribute("aria-current", a.dataset.view === v ? "page" : "false"));
  if (v === "mano" && !hand.length && deck.cards.size) newGame(false); else if (v === "mano") renderHand();
  if (v === "construir" && !cmdsLoaded) { cmdsLoaded = true; renderNewCommanders(); }
  if (v === "guiado") showGuided();
}
window.addEventListener("hashchange", route);

initGuided({
  esc, manaHTML, pipsHTML, toast, attachAC, thinking, cmdQuery,
  onAnalyze: (cmds, cards) => loadBuilt(cmds, cards, '<p class="muted" style="margin:0">Mazo montado paso a paso. Usa «Optimizar con IA» para afinar la sinergia.</p>'),
});

/* ---------- arranque ---------- */
(async function boot() {
  route(); render(); showCmdPreview();
  AI.aiStatus().then(st => {
    $("#btnPass").hidden = !(st.ok && st.password);
    if (st.ok && st.mode === "local" && st.configured) $("#aiNote").textContent = "IA en modo local: usa tu cuenta de Claude a través de Claude Code en este ordenador.";
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
