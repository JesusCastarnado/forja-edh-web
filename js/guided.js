// Constructor paso a paso: eliges comandante y vas llenando el mazo por categorías
// (aceleración, robo, interacción…) con sugerencias de Scryfall dentro de tu identidad de color.
import * as SF from "./scryfall.js";
import * as A from "./analysis.js";
import * as AI from "./ai.js";
import * as Edh from "./edhrec.js";
import { money, cardMoney, symbol, currencyName } from "./currency.js";

const { F } = A;
const $ = s => document.querySelector(s);
const SAVE = "forja-guiado";
const PRICE = "forja-guiado-precio"; // precio máximo por carta (0 = sin límite), en la moneda elegida
let H = null; // utilidades de app.js: esc, manaHTML, pipsHTML, toast, attachAC, thinking, cmdQuery, onAnalyze

/* ---------- categorías ---------- */
const low = c => c.text.toLowerCase();
const PROT = /(gains?|have|has|gets?) [^.]{0,40}(hexproof|indestructible|shroud|protection from)|phases? out|can't be countered/;
const RECUR = /from your graveyard to (your hand|the battlefield)|return [^.]{0,60}from your graveyard|cast [^.]{0,40}from your graveyard/;
const nonland = c => !A.isLand(c);
const is = {
  ramp: c => nonland(c) && !!(c.flags & F.RAMP),
  draw: c => nonland(c) && !!(c.flags & F.DRAW),
  removal: c => nonland(c) && !!(c.flags & (F.REM | F.COUNTER)),
  wipes: c => nonland(c) && !!(c.flags & F.WIPE),
  prot: c => nonland(c) && PROT.test(low(c)),
  recur: c => nonland(c) && RECUR.test(low(c)),
  tutors: c => nonland(c) && !!(c.flags & F.TUTOR),
  plan: c => nonland(c),
  lands: c => A.isLand(c),
};
const STEPS = [
  { k: "ramp", label: "Aceleración", t: 10, c: "var(--mG)", desc: "Maná extra desde los primeros turnos: piedras de maná, criaturas que añaden maná y hechizos que buscan tierras. Te deja jugar antes que la mesa." },
  { k: "draw", label: "Robo de cartas", t: 10, c: "var(--mU)", desc: "Motores y hechizos que roban. En Commander las partidas son largas: quien se queda sin cartas, pierde." },
  { k: "removal", label: "Removal puntual", t: 8, c: "var(--mR)", desc: "Respuestas a una amenaza concreta: destruir, exiliar, devolver o contrarrestar. Prioriza las baratas e instantáneas." },
  { k: "wipes", label: "Barridos", t: 3, c: "var(--warn)", desc: "Limpian la mesa cuando te quedas atrás. Elige los que te hagan menos daño a ti." },
  { k: "prot", label: "Protección", t: 4, c: "var(--mW)", desc: "Mantienen vivo a tu comandante y a tus piezas clave: antimaleficio, indestructible, fases o contrahechizos baratos." },
  { k: "recur", label: "Recursión", t: 3, c: "var(--s-purple)", desc: "Recuperan cartas del cementerio para no quedarte sin gasolina tras un barrido." },
  { k: "tutors", label: "Tutores", t: 2, c: "var(--accent)", desc: "Buscan la carta que necesitas. Suben el nivel de poder: pocos en mesas casuales." },
  { k: "plan", label: "Plan del comandante", t: 23, c: "var(--s-pink)", desc: "Las cartas que hacen que tu comandante brille: sinergias, motores y formas de ganar. Las marcadas con «Sinergia» se juegan mucho más con este comandante que con otros (EDHREC) o encajan con su texto." },
  { k: "lands", label: "Tierras", t: 36, c: "var(--mC)", desc: "Tierras que entran en tus colores sin perder tiempo. Al final, «Completar con básicas» rellena el resto según tus símbolos de maná." },
];
const catOf = c => A.isLand(c) ? "lands" : (STEPS.find(s => s.k !== "plan" && s.k !== "lands" && is[s.k](c)) || { k: "plan" }).k;

/* ---------- elegir comandante: estilos ---------- */
const ARCH = [
  ["", "Los más jugados", "Lo que más monta la gente"],
  ["o:token o:create", "Fichas", "Muchas criaturas pequeñas"],
  ['o:"+1/+1 counter"', "Contadores +1/+1", "Criaturas que crecen"],
  ['(o:haste or o:"double strike" or o:"additional combat" or o:"whenever you attack")', "Agresivo", "Atacar pronto y sin parar"],
  ["o:sacrifice", "Aristócratas", "Sacrificar y drenar"],
  ["o:graveyard", "Cementerio", "Reanimar y reciclar"],
  ["o:artifact", "Artefactos", "Artefactos por todas partes"],
  ['(o:instant or o:sorcery or o:"noncreature spell")', "Hechizos", "Instantáneos y conjuros"],
  ['(o:landfall or o:"lands you control" or o:"additional land")', "Tierras", "Cada tierra cuenta"],
  ["(o:equip or o:equipped or o:aura or o:enchanted)", "Voltron", "Un comandante enorme"],
  ['(o:"gain life" or o:lifelink)', "Vida", "Ganar vida y aprovecharla"],
];

/* ---------- estado ---------- */
const st = {
  cmds: [], cards: new Map(), step: 0, mode: "guided", deckId: null, // deckId: mazo de «Mis mazos» que se está editando
  dirty: false, // hay cambios sin guardar en «Mis mazos»
  pool: null, poolKey: "", shown: 30, freeList: null,
  words: [], synMemo: new Map(),
  edh: null, edhDecks: 0, // datos de EDHREC del comandante: Map clave → { synergy, inclusion }
  pick: { colors: new Set(), exact: true, arch: 0, list: [], shown: 24, seq: 0 },
  maxPrice: (() => { try { return Math.max(0, parseFloat(localStorage.getItem(PRICE)) || 0); } catch { return 0; } })(),
};
// Filtro de precio: las cartas más caras que el máximo no se sugieren (las que no tienen precio, sí).
const priceOk = c => !st.maxPrice || c.price <= st.maxPrice;
let booted = false;

const entries = () => [...st.cards.values()];
const total = () => entries().reduce((n, e) => n + e.q, 0);
function counts() { const n = Object.fromEntries(STEPS.map(s => [s.k, 0])); for (const e of entries()) n[catOf(e.c)] += e.q; return n; }
function targets() {
  const t = Object.fromEntries(STEPS.map(s => [s.k, s.t]));
  t.plan = 100 - st.cmds.length - STEPS.filter(s => s.k !== "plan").reduce((a, s) => a + s.t, 0);
  return t;
}
const deckObj = () => ({ cmds: st.cmds, cards: st.cards });
const save = () => { try { localStorage.setItem(SAVE, JSON.stringify({ cmds: st.cmds.map(c => c.name), cards: entries().map(e => [e.c.name, e.q]), step: st.step, deckId: st.deckId, dirty: st.dirty })); } catch {} };
const clearSave = () => { try { localStorage.removeItem(SAVE); } catch {} };

/* ---------- sinergia con el comandante ---------- */
const THEMES = [
  [/\btokens?\b/, ["token"]], [/\+1\/\+1 counter/, ["+1/+1 counter"]], [/graveyard/, ["graveyard"]], [/sacrific/, ["sacrifice"]],
  [/\bartifacts?\b/, ["artifact"]], [/\benchantments?\b/, ["enchantment"]], [/instant|sorcery|noncreature spell/, ["instant", "sorcery"]],
  [/landfall|land enters|lands? you control/, ["landfall", "land enters"]], [/equip/, ["equip"]], [/gain life|lifelink|life total/, ["gain life", "lifelink"]],
];
function synWords(cmds) {
  const w = new Set(A.themeWords(cmds, ""));
  for (const c of cmds) { const t = low(c); for (const [re, ws] of THEMES) if (re.test(t)) ws.forEach(x => w.add(x)); }
  return [...w];
}
// «Sinergia»: según EDHREC (se juega mucho más con este comandante que con otros) o, si no hay datos, por su texto.
function isSyn(c) {
  const k = A.key(c);
  if (!st.synMemo.has(k)) st.synMemo.set(k, A.hasSynergy(c, { edh: st.edh, words: st.words }));
  return st.synMemo.get(k);
}
// Orden de las sugerencias: lo que encaja con el comandante primero, no solo lo más popular.
const score = c => A.fitScore(c, { edh: st.edh, words: st.words });

/* ---------- reserva de cartas para sugerir ---------- */
async function loadPool() {
  const ci = A.ciUnion(st.cmds), key = ci + "|" + st.words.join(",");
  if (st.pool && st.poolKey === key) return;
  st.pool = null; st.poolKey = key; st.edh = null; st.edhDecks = 0; st.synMemo = new Map(); renderGrid();
  try {
    const base = [...await SF.poolFor(ci)];
    const edh = await Edh.forCommanders(st.cmds).catch(() => null);
    if (st.poolKey !== key) return;
    if (edh) {
      await SF.collection([...edh.cards.values()].map(x => x.name), { fuzzyLimit: 0 }).catch(() => {});
      st.edh = edh.cards; st.edhDecks = edh.decks; st.synMemo = new Map();
      base.push(...[...edh.cards.values()].map(x => SF.cached(x.name)).filter(Boolean));
    }
    if (st.words.length) {
      const q = `${SF.ciQuery(ci)} legal:commander game:paper (${st.words.slice(0, 5).map(w => `o:"${w}" or t:"${w}"`).join(" or ")})`;
      base.push(...await SF.search(q, { pages: 2 }).catch(() => []));
    }
    if (st.poolKey !== key) return;
    if (st.mode === "guided") renderHead();
    const cmdKeys = new Set(st.cmds.map(A.key)), seen = new Set();
    st.pool = base.filter(c => { const k = A.key(c); if (seen.has(k) || cmdKeys.has(k) || A.isBasic(c) || !c.legal || !A.subsetCI(c.ci, ci)) return false; seen.add(k); return true; })
      .sort((a, b) => score(a) - score(b));
  } catch {
    if (st.poolKey === key) { st.pool = []; st.poolKey = ""; $("#gGrid").innerHTML = '<p class="no">No se pudo consultar Scryfall. Comprueba la conexión y vuelve a elegir el paso.</p>'; return; }
  }
  renderGrid();
}
function stepListAll() {
  if (!st.pool) return null;
  if (st.mode === "free") return st.freeList || st.pool;
  const k = STEPS[st.step].k;
  return st.pool.filter(k === "plan" ? (c => nonland(c) && catOf(c) === "plan") : is[k]);
}
function stepList() { const all = stepListAll(); return all && all.filter(priceOk); }
function renderPriceNote() {
  const all = stepListAll(), note = $("#gMaxNote");
  $("#gMaxSym").textContent = symbol();
  $("#gMaxClear").hidden = !st.maxPrice;
  if (!st.maxPrice) { note.textContent = "Escribe un precio y no te sugeriremos cartas más caras."; return; }
  const hidden = all ? all.filter(c => !priceOk(c)).length : 0;
  note.textContent = `Solo cartas de hasta ${money(st.maxPrice, 2)}.` + (hidden ? ` Ocultas ${hidden} más caras en este paso.` : "");
}

/* ---------- piezas de HTML ---------- */
function tile(c, attr) {
  const e = H.esc, on = attr === "pick" && st.cards.has(A.key(c));
  return `<div class="gcard${on ? " on" : ""}">
    <button class="gpickbtn" data-${attr}="${e(c.name)}" ${attr === "pick" ? `aria-pressed="${on}"` : ""} aria-label="${attr === "pick" ? (on ? "Quitar " : "Añadir ") : "Elegir "}${e(c.name)}">
      ${c.img ? `<img src="${e(c.img)}" alt="" loading="lazy">` : `<span class="noimg">${e(c.name)}</span>`}<span class="gcheck" aria-hidden="true">✓</span></button>
    <div class="gmeta"><button class="cn" data-name="${e(c.name)}">${e(c.name)}</button>
      <div class="gbadges">${attr === "cmd" ? H.pipsHTML(c.ci) : ""}${attr === "pick" && isSyn(c) ? '<span class="gb syn">Sinergia</span>' : ""}${attr === "pick" && st.edh && A.edhOf(st.edh, c) ? `<span class="gb" title="Mazos de este comandante en EDHREC que la juegan">${Math.round(A.edhOf(st.edh, c).inclusion * 100)} % mazos</span>` : `<span class="gb">${c.rank >= 99999 ? "sin ranking" : "#" + c.rank}</span>`}${c.gc ? '<span class="gb gc">GC</span>' : ""}<span class="gb">${cardMoney(c)}</span></div></div></div>`;
}

/* ---------- 1. elegir comandante ---------- */
function renderArch() {
  $("#gArch").innerHTML = ARCH.map(([, name, sub], i) => `<button data-garch="${i}" aria-pressed="${i === st.pick.arch}"><b>${name}</b><span>${sub}</span></button>`).join("");
}
function renderColors() {
  $("#gColors").innerHTML = ["W", "U", "B", "R", "G", "C"].map(c => `<button class="gcolor" data-gcolor="${c}" aria-pressed="${st.pick.colors.has(c)}" aria-label="${{ W: "Blanco", U: "Azul", B: "Negro", R: "Rojo", G: "Verde", C: "Incoloro" }[c]}"><span class="ms ${c}">${c === "C" ? "◇" : ""}</span></button>`).join("");
  document.querySelectorAll("[data-gexact]").forEach(b => b.setAttribute("aria-pressed", String((b.dataset.gexact === "1") === st.pick.exact)));
}
async function loadCmds() {
  const p = st.pick, my = ++p.seq, grid = $("#gCmdGrid");
  let q = "is:commander game:paper legal:commander";
  if (p.colors.size) { const cs = [...p.colors].join("").toLowerCase(); q += p.exact ? ` id=${cs}` : ` id>=${cs}`; }
  if (ARCH[p.arch][0]) q += " " + ARCH[p.arch][0];
  $("#gCmdTitle").textContent = p.arch ? ARCH[p.arch][1] : "O empieza por uno de los más jugados";
  grid.innerHTML = H.thinking("Buscando comandantes…"); $("#gCmdMore").hidden = true;
  const list = await SF.search(q, { pages: 1 }).catch(() => null);
  if (my !== p.seq) return;
  if (!list) { grid.innerHTML = '<p class="no">No se pudo consultar Scryfall.</p>'; return; }
  p.list = list; p.shown = 24; renderCmdGrid();
}
function renderCmdGrid() {
  const p = st.pick;
  $("#gCmdGrid").innerHTML = p.list.slice(0, p.shown).map(c => tile(c, "cmd")).join("") || '<p class="muted">Ningún comandante con esos filtros.</p>';
  $("#gCmdMore").hidden = p.list.length <= p.shown;
}
function chooseCmd(c) {
  if (!c) return;
  st.cmds = [c]; st.cards = new Map(); st.step = 0; st.mode = "guided"; st.deckId = null; st.dirty = false;
  startBuild(); save();
}

/* ---------- 2. construir ---------- */
function startBuild() {
  st.words = synWords(st.cmds); st.synMemo = new Map(); st.shown = 30; st.freeList = null;
  $("#gPick").hidden = true; $("#gBuild").hidden = false;
  renderCmdPanel(); renderHead(); renderAll();
  window.scrollTo({ top: 0 });
  loadPool();
}
function renderAll() { renderBar(); renderSteps(); renderDeck(); renderCurve(); }

function renderBar() {
  const s = A.analyze(deckObj()), c0 = st.cmds[0], e = H.esc;
  $("#gBar").innerHTML = `
    <div class="gbar-cmd">${c0.art ? `<img class="gthumb" src="${e(c0.art)}" alt="">` : ""}<div style="min-width:0"><div class="gname">${st.cmds.map(c => e(c.name)).join(" + ")}</div><div class="muted small">Construyendo · ${H.pipsHTML(s.ci)}</div></div></div>
    <div class="gbar-prog"><div><b class="mono">${s.total}</b> de 100 cartas</div><div class="gtrack"><span style="width:${Math.min(100, s.total)}%"></span></div></div>
    <div class="gstats">
      <div><span class="eyebrow">Precio</span><b>${money(s.price)}</b></div>
      <div><span class="eyebrow">Coste medio</span><b>${s.avgCmc.toFixed(2)}</b></div>
      <div><span class="eyebrow">Bracket</span><b>B${s.bracket}</b></div>
      <div><span class="eyebrow">Game Changers</span><b>${s.gc.length}</b></div>
    </div>
    <div class="row gbar-act">
      <button class="btn sm" data-gact="new">+ Nuevo mazo</button>
      <button class="btn sm" data-gact="copy">Copiar lista</button>
      <button class="btn sm" data-gact="save">${st.deckId ? "Guardar cambios" : "Guardar en Mis mazos"}</button>
      <button class="btn sm primary" data-gact="analyze">Analizar mazo</button>
    </div>`;
}
function renderSteps() {
  const n = counts(), t = targets();
  $("#gSteps").innerHTML = STEPS.map((s, i) => `<li><button class="gstepbtn${st.mode === "guided" && i === st.step ? " cur" : ""}${n[s.k] >= t[s.k] ? " full" : ""}" data-gstep="${i}" style="--c:${s.c}">
    <span class="dot"></span><span>${s.label}</span><span class="mono">${n[s.k]}/${t[s.k]}</span><span class="gprog"><span style="width:${Math.min(100, n[s.k] / t[s.k] * 100)}%"></span></span></button></li>`).join("");
  document.querySelectorAll("[data-gmode]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.gmode === st.mode)));
}
function renderHead() {
  const head = $("#gStepHead");
  if (st.mode === "free") {
    head.style.setProperty("--c", "var(--accent)");
    head.innerHTML = `<div class="gsh"><div><h3>Modo libre</h3><p class="muted">Busca cualquier carta dentro de tu identidad de color: nombre, tipo («elf») o sintaxis de Scryfall («o:"draw a card"»). Sin búsqueda ves las más jugadas.</p></div></div>
      <input type="text" id="gFree" autocomplete="off" placeholder="Buscar carta…" aria-label="Buscar carta">`;
    let timer = null, seq = 0;
    $("#gFree").addEventListener("input", ev => {
      clearTimeout(timer);
      const q = ev.target.value.trim();
      timer = setTimeout(async () => {
        const my = ++seq;
        if (q.length < 2) { st.freeList = null; st.shown = 30; renderGrid(); return; }
        $("#gGrid").innerHTML = H.thinking("Buscando…");
        const ci = A.ciUnion(st.cmds);
        const res = await SF.search(`${q} legal:commander game:paper ${SF.ciQuery(ci)}`).catch(() => []);
        if (my !== seq) return;
        const cmdKeys = new Set(st.cmds.map(A.key));
        st.freeList = res.filter(c => !cmdKeys.has(A.key(c))); st.shown = 30; renderGrid();
      }, 350);
    });
    return;
  }
  const s = STEPS[st.step], n = counts()[s.k], t = targets()[s.k], last = st.step === STEPS.length - 1;
  const src = st.edh ? ` Ordenadas por lo que mejor encaja con tu comandante según ${st.edhDecks ? st.edhDecks.toLocaleString("es-ES") + " mazos de" : ""} EDHREC.` : "";
  head.style.setProperty("--c", s.c);
  head.innerHTML = `<div class="gsegs">${STEPS.map((x, i) => `<span class="${i === st.step ? "cur" : counts()[x.k] >= targets()[x.k] ? "done" : ""}"></span>`).join("")}</div>
    <div class="gsh"><div><div class="eyebrow">Paso ${st.step + 1} de ${STEPS.length}</div><h3>${s.label} <span class="mono ${n >= t ? "ok" : n >= t - 2 ? "lo" : "muted"}">${n}/${t}</span></h3><p class="muted">${s.desc}${src}</p></div>
    <div class="row"><button class="btn" data-gnav="-1" ${st.step === 0 ? "disabled" : ""}>← Atrás</button>${last ? '<button class="btn primary" data-gact="analyze">Analizar mazo</button>' : '<button class="btn primary" data-gnav="1">Siguiente →</button>'}</div></div>`;
}
function renderGrid() {
  renderPriceNote();
  const grid = $("#gGrid"), list = stepList();
  if (!list) { grid.innerHTML = H.thinking("Buscando las cartas más jugadas en tus colores…"); $("#gMore").hidden = true; return; }
  grid.innerHTML = list.slice(0, st.shown).map(c => tile(c, "pick")).join("")
    || `<p class="muted">${st.maxPrice && stepListAll().length ? `Ninguna carta de este paso cuesta ${money(st.maxPrice, 2)} o menos. Sube el precio máximo en «Filtrar».` : st.mode === "free" ? "Sin resultados." : "No hay sugerencias para este paso en tus colores. Prueba el modo libre."}</p>`;
  $("#gMore").hidden = list.length <= st.shown;
}
function renderDeck() {
  const e = H.esc, groups = {};
  for (const x of entries()) (groups[catOf(x.c)] ||= []).push(x);
  const html = STEPS.filter(s => groups[s.k]).map(s => {
    const arr = groups[s.k].sort((a, b) => a.c.cmc - b.c.cmc || a.c.name.localeCompare(b.c.name));
    return `<div class="gdgroup" style="--c:${s.c}"><h4><span>${s.label}</span><span>${arr.reduce((a, x) => a + x.q, 0)}</span></h4>${arr.map(x =>
      `<div class="card"><span class="q">${x.q}</span><button class="cn" data-name="${e(x.c.name)}">${e(x.c.name)}</button><span>${H.manaHTML(x.c.cost)}</span><button class="x" data-grm="${e(x.c.name)}" aria-label="Quitar ${e(x.c.name)}">×</button></div>`).join("")}</div>`;
  }).join("");
  $("#gDeck").innerHTML = html || '<p class="muted" style="margin:0">Aún no has añadido cartas. Pulsa una carta para añadirla.</p>';
}
function renderCurve() {
  const curve = [0, 0, 0, 0, 0, 0, 0, 0];
  for (const { c, q } of entries()) if (nonland(c)) curve[Math.min(7, Math.floor(c.cmc))] += q;
  const max = Math.max(1, ...curve);
  $("#gCurve").innerHTML = curve.map((n, i) => `<div class="col"><span class="n">${n}</span><div class="bar" style="height:${n / max * 100}%"></div><span class="lb">${i === 7 ? "7+" : i}</span></div>`).join("");
}
function renderCmdPanel() {
  const e = H.esc, c0 = st.cmds[0];
  const canPair = st.cmds.length === 1 && (/partner|choose a background|friends forever|doctor's companion/i.test(c0.text) || /Background/.test(c0.sub));
  $("#gCmdPanel").innerHTML = `<div class="row between" style="margin-bottom:10px"><h3 style="margin:0">Comandante</h3><button class="btn sm" data-gact="change">Cambiar</button></div>
    ${st.cmds.map(c => c.img ? `<img class="gcmdimg" src="${e(c.img)}" alt="${e(c.name)}">` : `<p>${e(c.name)}</p>`).join("")}
    ${canPair ? '<div class="ac"><label class="f" for="gCmd2">Partner o fondo<input type="text" id="gCmd2" autocomplete="off" placeholder="Busca su pareja"></label></div>' : ""}`;
  if (canPair) H.attachAC($("#gCmd2"), { query: H.cmdQuery, onPick: c => {
    if (st.cmds.some(x => x.name === c.name)) return;
    st.cards.delete(A.key(c)); st.cmds.push(c); save(); startBuild();
  } });
}

/* ---------- ¿encaja esta carta? ---------- */
// Valora con la IA si una carta que te gusta encaja en el mazo, qué quitar para meterla y alternativas.
const VERD = { si: ["Buena idea", "ok"], depende: ["Depende", "lo"], no: ["Mejor no", "no"] };
async function fitCard() {
  const out = $("#gFitOut"), name = $("#gFitCard").value.trim(), e = H.esc;
  if (!name) { out.innerHTML = '<p class="muted small">Escribe el nombre de una carta (en inglés) y pulsa «¿Encaja?».</p>'; return; }
  out.innerHTML = H.thinking("Buscando la carta en Scryfall…");
  await SF.collection([name], { fuzzyLimit: 1 }).catch(() => {});
  const c = SF.cached(name);
  if (!c) { out.innerHTML = `<p class="no">No encuentro «${e(name)}» en Scryfall. Escríbela en inglés.</p>`; return; }
  const ci = A.ciUnion(st.cmds), inDeck = st.cards.has(A.key(c));
  // Lo que se puede saber sin IA
  if (st.cmds.some(x => x.name === c.name)) { out.innerHTML = `<p class="muted">${e(c.name)} es tu comandante.</p>`; return; }
  if (!A.subsetCI(c.ci, ci)) { out.innerHTML = `<p class="no"><b>${e(c.name)}</b> no puede ir en este mazo: tiene colores (${H.pipsHTML(c.ci)}) fuera de la identidad de tu comandante (${H.pipsHTML(ci)}).</p>`; return; }
  if (!c.legal) { out.innerHTML = `<p class="no"><b>${e(c.name)}</b> ${c.released > new Date().toISOString().slice(0, 10) ? "aún no ha salido (es una preview)" : "está prohibida o no es legal en Commander"}.</p>`; return; }
  if (!(await H.aiReady(out))) return;

  const btn = $("#gFitBtn"); btn.disabled = true;
  out.innerHTML = H.thinking(`Claude está valorando ${c.name} para tu mazo…`);
  const n = counts(), t = targets(), s = A.analyze(deckObj());
  const cmdTxt = st.cmds.map(x => `${x.name} (${x.type}${x.sub ? " — " + x.sub : ""}): ${x.text}`).join("\n");
  const list = entries().map(x => `${x.q} ${x.c.name}`).join("\n");
  const cats = STEPS.map(x => `${x.label} ${n[x.k]}/${t[x.k]}`).join(", ");
  const prompt = `Un jugador quiere saber si esta carta encaja en su mazo de Commander.
Carta propuesta: ${c.name} (${c.cost || "sin coste"}, ${c.type}${c.sub ? " — " + c.sub : ""}): ${c.text}
${inDeck ? "La carta YA está en el mazo: valora si merece la pena mantenerla." : ""}
Comandante(s):
${cmdTxt}
Identidad de color: ${ci || "incolora"}. ${total() + st.cmds.length} de 100 cartas. Bracket estimado B${s.bracket}, ${s.gc.length} Game Changers, CMC medio ${s.avgCmc.toFixed(2)}.
Categorías (actual/objetivo): ${cats}.
${(() => { const e = st.edh && A.edhOf(st.edh, c); return st.edh ? (e ? `Según EDHREC, ${c.name} aparece en el ${Math.round(e.inclusion * 100)} % de los mazos de este comandante (sinergia ${e.synergy >= 0 ? "+" : ""}${Math.round(e.synergy * 100)} %).` : `Según EDHREC, ${c.name} casi no se juega con este comandante.`) : ""; })()}
${st.edh ? "Cartas con más sinergia con este comandante según EDHREC que no están en la lista: " + [...st.edh.values()].filter(e => e.synergy >= 0.1 && !st.cards.has(SF.norm(e.name))).sort((a, b) => b.synergy - a.synergy).slice(0, 20).map(e => e.name).join(", ") + "." : ""}
Valora sobre todo la sinergia con el comandante; un staple genérico solo es buena idea si cubre un hueco que nada con sinergia cubre.
Lista actual:
${list || "(vacía)"}
Responde SOLO con JSON, con esta forma exacta:
{"veredicto":"si|depende|no","resumen":"1-2 frases claras con la conclusión","a_favor":["2-4 razones cortas"],"en_contra":["0-4 razones cortas"],"cortar":[{"carta":"Nombre exacto en inglés","motivo":"breve"}],"alternativas":[{"carta":"Nombre exacto en inglés","motivo":"breve: por qué es mejor o qué aporta"}]}
Reglas: valora la sinergia con el comandante, la curva, el nivel de poder (bracket) y qué hueco cubre. "cortar": ${inDeck ? "déjalo vacío" : `1-3 cartas de la lista que sacarías para meterla${total() + st.cmds.length < 100 ? " (puede ir vacío si aún hay sitio en el mazo)" : ""}`}. "alternativas": 0-3 cartas que no estén en la lista, legales en Commander y dentro de la identidad ${ci || "incolora"}, solo si el veredicto es "depende" o "no".${st.maxPrice ? ` Las alternativas deben costar como máximo ${st.maxPrice} ${currencyName()} cada una.` : ""}`;
  try {
    const r = await AI.askJSON(prompt, { effort: "low" });
    const cutsRaw = Array.isArray(r.cortar) ? r.cortar : [], altsRaw = Array.isArray(r.alternativas) ? r.alternativas : [];
    await SF.collection([...cutsRaw, ...altsRaw].map(x => String(x.carta || "")), { fuzzyLimit: 6 }).catch(() => {});
    const cuts = cutsRaw.map(x => ({ ...x, c: SF.cached(String(x.carta || "")) })).filter(x => x.c && st.cards.has(A.key(x.c)));
    const seen = new Set([A.key(c)]);
    const alts = altsRaw.map(x => ({ ...x, c: SF.cached(String(x.carta || "")) }))
      .filter(x => x.c && x.c.legal && A.subsetCI(x.c.ci, ci) && priceOk(x.c) && !st.cards.has(A.key(x.c)) && !seen.has(A.key(x.c)) && seen.add(A.key(x.c)));
    const [vtxt, vcls] = VERD[r.veredicto] || VERD.depende;
    const li = arr => (Array.isArray(arr) ? arr : []).map(x => `<li>${e(x)}</li>`).join("");
    const row = (x, kind) => `<div class="fitline">${x.c.small ? `<img src="${e(x.c.small)}" alt="" loading="lazy">` : "<span></span>"}<div style="min-width:0"><button class="cn" data-name="${e(x.c.name)}">${e(x.c.name)}</button><div class="muted small">${e(x.motivo || "")}</div></div>
      <button class="btn sm" data-fit${kind}="${e(x.c.name)}">${kind === "cut" ? "Quitar" : "Añadir"}</button></div>`;
    out.innerHTML = `<div class="fitres">
      <div class="fithead">${c.small ? `<img src="${e(c.small)}" alt="" loading="lazy">` : ""}<div><span class="verdict ${vcls}">${vtxt}</span>
        <div class="fitname"><button class="cn" data-name="${e(c.name)}">${e(c.name)}</button></div><p>${e(r.resumen || "")}</p>
        ${inDeck ? '<p class="muted small">Ya está en tu mazo.</p>' : `<button class="btn sm primary" data-fitadd="${e(c.name)}">Añadir ${e(c.name)}</button>`}</div></div>
      <div class="fitcols">${li(r.a_favor) ? `<div><div class="eyebrow ok">A favor</div><ul>${li(r.a_favor)}</ul></div>` : ""}${li(r.en_contra) ? `<div><div class="eyebrow no">En contra</div><ul>${li(r.en_contra)}</ul></div>` : ""}</div>
      ${cuts.length ? `<div><div class="eyebrow">Para meterla, quitaría</div>${cuts.map(x => row(x, "cut")).join("")}</div>` : ""}
      ${alts.length ? `<div><div class="eyebrow">Alternativas</div>${alts.map(x => row(x, "add")).join("")}</div>` : ""}
    </div>`;
  } catch (err) {
    out.innerHTML = `<p class="no">${e(AI.errMsg(err))}</p>`;
  } finally { btn.disabled = false; }
}

/* ---------- acciones ---------- */
function afterChange() { st.dirty = true; renderAll(); if (st.mode === "guided") renderHead(); save(); }
function toggle(c) {
  const k = A.key(c);
  if (st.cards.has(k)) st.cards.delete(k); else st.cards.set(k, { c, q: 1 });
  afterChange();
  return st.cards.has(k);
}
async function fillBasics() {
  await SF.collection(Object.values(A.BASICS)).catch(() => {});
  const ci = A.ciUnion(st.cmds), cols = ci ? [...ci] : ["C"];
  const lands = entries().reduce((n, e) => n + (A.isLand(e.c) ? e.q : 0), 0);
  const need = Math.min(targets().lands - lands, 100 - st.cmds.length - total());
  if (need <= 0) { H.toast(lands >= targets().lands ? "Ya tienes todas las tierras" : "El mazo ya está completo"); return; }
  const pips = Object.fromEntries(cols.map(c => [c, 1]));
  for (const { c, q } of entries()) if (nonland(c)) for (const m of (c.cost.match(/\{[^}]+\}/g) || [])) for (const ch of cols) if (m.includes(ch)) pips[ch] += q;
  const tot = Object.values(pips).reduce((a, b) => a + b, 0);
  let left = need;
  cols.forEach((col, i) => {
    const n = i === cols.length - 1 ? left : Math.round(need * pips[col] / tot); left -= n;
    const b = SF.cached(A.BASICS[col]); if (!b || n <= 0) return;
    const cur = st.cards.get(A.key(b)); st.cards.set(A.key(b), { c: b, q: (cur ? cur.q : 0) + n });
  });
  afterChange(); H.toast(`Añadidas ${need} tierras básicas`);
}
function resetToPicker() {
  st.cmds = []; st.cards = new Map(); st.step = 0; st.mode = "guided"; st.deckId = null; st.dirty = false; clearSave();
  $("#gBuild").hidden = true; $("#gPick").hidden = false; window.scrollTo({ top: 0 });
}
// Empieza un mazo nuevo desde la elección de comandante. Si el actual tiene cambios sin guardar,
// ofrece guardarlo antes en «Mis mazos».
export async function newDeck() {
  if (!booted) await showGuided(); // recupera el borrador guardado para no perderlo sin preguntar
  if (st.cmds.length && total() && (st.dirty || !st.deckId)) {
    if (confirm("¿Guardar este mazo en «Mis mazos» antes de empezar uno nuevo?\n\nAceptar: guardarlo.  Cancelar: no guardarlo.")) {
      const id = await H.saveDeck(st.cmds, st.cards, st.deckId);
      if (!id) return; // canceló el nombre o no se pudo guardar: se queda como estaba
    } else if (!confirm("Se perderá el mazo actual. ¿Empezar uno nuevo sin guardarlo?")) return;
  }
  resetToPicker();
  location.hash = "guiado";
  if (booted) $("#gCmdSearch").focus();
}
async function onAction(act) {
  if (act === "new") {
    newDeck();
  } else if (act === "save") {
    const id = await H.saveDeck(st.cmds, st.cards, st.deckId);
    if (id) { st.deckId = id; st.dirty = false; save(); renderBar(); }
  } else if (act === "analyze") {
    if (!total()) { H.toast("Añade alguna carta primero"); return; }
    H.onAnalyze(st.cmds.slice(), new Map([...st.cards].map(([k, v]) => [k, { ...v }])), st.deckId);
  } else if (act === "copy") {
    const t = A.deckToText(deckObj());
    navigator.clipboard.writeText(t).then(() => H.toast("Lista copiada"), () => H.toast("No se pudo copiar"));
  } else if (act === "change") {
    if (!total() || confirm("Si cambias de comandante se vacía el mazo. ¿Seguir?")) resetToPicker();
  }
}

/* ---------- arranque ---------- */
export function initGuided(helpers) {
  H = helpers;
  const setH = () => document.documentElement.style.setProperty("--hdr", $("header.top").offsetHeight + "px");
  addEventListener("resize", setH); setH();

  H.attachAC($("#gCmdSearch"), { query: H.cmdQuery, onPick: (c, inp) => { inp.value = ""; chooseCmd(c); } });
  $("#gArch").addEventListener("click", e => { const b = e.target.closest("[data-garch]"); if (!b) return; st.pick.arch = +b.dataset.garch; renderArch(); loadCmds(); });
  $("#gColors").addEventListener("click", e => {
    const b = e.target.closest("[data-gcolor]"); if (!b) return;
    const c = b.dataset.gcolor, set = st.pick.colors;
    if (set.has(c)) set.delete(c); else { if (c === "C") set.clear(); else set.delete("C"); set.add(c); }
    renderColors(); loadCmds();
  });
  document.querySelectorAll("[data-gexact]").forEach(b => b.addEventListener("click", () => { st.pick.exact = b.dataset.gexact === "1"; renderColors(); loadCmds(); }));
  $("#gCmdGrid").addEventListener("click", e => { const b = e.target.closest("[data-cmd]"); if (b) chooseCmd(SF.cached(b.dataset.cmd)); });
  $("#gCmdMore").onclick = () => { st.pick.shown += 24; renderCmdGrid(); };

  $("#gGrid").addEventListener("click", e => {
    const b = e.target.closest("[data-pick]"); if (!b) return;
    const c = SF.cached(b.dataset.pick); if (!c) return;
    const on = toggle(c);
    b.closest(".gcard").classList.toggle("on", on); b.setAttribute("aria-pressed", String(on));
    b.setAttribute("aria-label", (on ? "Quitar " : "Añadir ") + c.name);
  });
  $("#gMore").onclick = () => { st.shown += 30; renderGrid(); };
  $("#gSteps").addEventListener("click", e => {
    const b = e.target.closest("[data-gstep]"); if (!b) return;
    st.step = +b.dataset.gstep; st.mode = "guided"; st.shown = 30; renderSteps(); renderHead(); renderGrid(); save();
  });
  $("#gStepHead").addEventListener("click", e => {
    const n = e.target.closest("[data-gnav]");
    if (n) { st.step = Math.max(0, Math.min(STEPS.length - 1, st.step + +n.dataset.gnav)); st.shown = 30; renderSteps(); renderHead(); renderGrid(); save(); $("#gStepHead").scrollIntoView({ block: "nearest" }); }
  });
  document.querySelectorAll("[data-gmode]").forEach(b => b.addEventListener("click", () => {
    if (st.mode === b.dataset.gmode) return;
    st.mode = b.dataset.gmode; st.freeList = null; st.shown = 30; renderSteps(); renderHead(); renderGrid();
  }));
  $("#gDeck").addEventListener("click", e => {
    const b = e.target.closest("[data-grm]"); if (!b) return;
    const c = SF.cached(b.dataset.grm); if (!c) return;
    const k = A.key(c), cur = st.cards.get(k); if (!cur) return;
    if (cur.q > 1) cur.q--; else st.cards.delete(k);
    afterChange(); renderGrid();
  });
  $("#gBasics").onclick = fillBasics;
  H.attachAC($("#gFitCard"), { query: q => `${q} game:paper` });
  $("#gFitBtn").onclick = fitCard;
  $("#gFitCard").addEventListener("keydown", e => { if (e.key === "Enter" && !e.defaultPrevented) setTimeout(fitCard, 0); });
  $("#gFitOut").addEventListener("click", e => {
    const b = e.target.closest("[data-fitadd],[data-fitcut]"); if (!b) return;
    const c = SF.cached(b.dataset.fitadd || b.dataset.fitcut); if (!c) return;
    const has = st.cards.has(A.key(c));
    if (b.dataset.fitadd ? !has : has) toggle(c);
    b.disabled = true; b.textContent = b.dataset.fitadd ? "Añadida" : "Quitada";
    renderGrid();
  });
  $("#view-guiado").addEventListener("click", e => { const b = e.target.closest("[data-gact]"); if (b) onAction(b.dataset.gact); });
  addEventListener("currencychange", () => { renderPriceNote(); if (st.cmds.length && !$("#gBuild").hidden) { renderBar(); renderGrid(); } });
  const setMax = v => {
    st.maxPrice = Math.max(0, parseFloat(String(v).replace(",", ".")) || 0);
    try { localStorage.setItem(PRICE, String(st.maxPrice)); } catch {}
    st.shown = 30; renderGrid();
  };
  let priceTimer = null;
  $("#gMaxPrice").value = st.maxPrice || "";
  $("#gMaxPrice").addEventListener("input", e => { clearTimeout(priceTimer); priceTimer = setTimeout(() => setMax(e.target.value), 300); });
  $("#gMaxClear").onclick = () => { $("#gMaxPrice").value = ""; setMax(0); };
  renderPriceNote();
}

// Abre un mazo ya hecho (por ejemplo, el de «Analizar») en el constructor para seguir editándolo.
export function editInGuided(cmds, cards, deckId = null) {
  let draft = st.cmds.length ? { cmds: st.cmds.map(c => c.name), n: total() } : null;
  if (!booted) { try { const s = JSON.parse(localStorage.getItem(SAVE) || "null"); if (s && Array.isArray(s.cmds) && s.cmds.length) draft = { cmds: s.cmds, n: (s.cards || []).length }; } catch {} }
  // Solo preguntamos si hay otro mazo a medias (con otro comandante); si es el mismo, se actualiza sin más.
  const same = draft && draft.cmds.join("|") === cmds.map(c => c.name).join("|");
  if (draft && draft.n && !same && !confirm(`Tienes a medias un mazo de ${draft.cmds.join(" + ")} en «Paso a paso». ¿Reemplazarlo por este?`)) return false;
  st.cmds = cmds.slice(); st.cards = new Map([...cards].map(([k, v]) => [k, { ...v }])); st.mode = "guided"; st.deckId = deckId; st.dirty = false;
  const n = counts(), t = targets();
  st.step = Math.max(0, STEPS.findIndex(s => n[s.k] < t[s.k]));
  save();
  if (booted) startBuild();
  location.hash = "guiado";
  return true;
}

export async function showGuided() {
  if (booted) return; booted = true;
  renderArch(); renderColors(); loadCmds();
  let saved = null; try { saved = JSON.parse(localStorage.getItem(SAVE) || "null"); } catch {}
  if (saved && Array.isArray(saved.cmds) && saved.cmds.length) {
    await SF.collection([...saved.cmds, ...(saved.cards || []).map(x => x[0])]).catch(() => {});
    const cmds = saved.cmds.map(n => SF.cached(n)).filter(Boolean);
    if (!cmds.length) return;
    st.cmds = cmds; st.step = Math.min(STEPS.length - 1, +saved.step || 0); st.deckId = saved.deckId || null; st.dirty = !!saved.dirty;
    for (const [n, q] of saved.cards || []) { const c = SF.cached(n); if (c) st.cards.set(A.key(c), { c, q: Math.max(1, +q || 1) }); }
    startBuild();
  }
}
