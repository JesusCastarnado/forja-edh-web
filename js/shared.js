// Mazo compartido (#compartido/<id>): un amigo lo ve, marca qué cartas quitaría, busca cuáles
// añadiría y envía las sugerencias al dueño. No necesita cuenta.
import * as SF from "./scryfall.js";
import * as A from "./analysis.js";
import * as Cloud from "./cloud.js";
import { money } from "./currency.js";

const $ = s => document.querySelector(s);
let H = null; // utilidades de app.js: esc, manaHTML, pipsHTML, toast, attachAC, thinking, buildDeck
const sh = { id: "", deck: null, name: "", cuts: new Map(), adds: new Map(), seq: 0 };
const NAME_KEY = "forja-nombre-amigo";

export function initShared(helpers) {
  H = helpers;
  const root = $("#shareView");
  root.addEventListener("click", e => {
    const cut = e.target.closest("[data-scut]");
    if (cut) { toggleCut(cut.dataset.scut); return; }
    const rm = e.target.closest("[data-srm]");
    if (rm) { const [kind, k] = rm.dataset.srm.split("|"); sh[kind].delete(k); renderDeck(); renderSide(); return; }
    if (e.target.closest("#sSend")) send();
    if (e.target.closest("#sAgain")) { sh.cuts.clear(); sh.adds.clear(); renderAll(); }
  });
  addEventListener("currencychange", () => { if (sh.deck && !$("#view-compartido").hidden) renderAll(); });
  root.addEventListener("input", e => {
    const w = e.target.closest("[data-swhy]");
    if (w) { const [kind, k] = w.dataset.swhy.split("|"); const it = sh[kind].get(k); if (it) it.why = w.value; }
  });
}

export async function showShared(id) {
  if (sh.id === id && sh.deck) return;
  const my = ++sh.seq, root = $("#shareView");
  Object.assign(sh, { id, deck: null, name: "", cuts: new Map(), adds: new Map() });
  root.innerHTML = `<div class="hero"><h2>Un mazo compartido.</h2></div>${H.thinking("Cargando el mazo…")}`;
  let d;
  try { d = await Cloud.sharedDeck(id); }
  catch (e) { if (my === sh.seq) root.innerHTML = msg("No se pudo cargar el mazo", H.esc(e.message || e)); return; }
  if (my !== sh.seq) return;
  if (!d) { root.innerHTML = msg("Este enlace ya no funciona", "El mazo no existe o su dueño ha dejado de compartirlo."); return; }
  root.innerHTML = `<div class="hero"><h2>${H.esc(d.name)}.</h2></div>${H.thinking("Buscando las cartas en Scryfall…")}`;
  try { sh.deck = await H.buildDeck(d.text); }
  catch { if (my === sh.seq) root.innerHTML = msg("No se pudo consultar Scryfall", "Comprueba la conexión y recarga la página."); return; }
  if (my !== sh.seq) return;
  sh.name = d.name;
  renderAll();
}
const msg = (t, p) => `<div class="hero"><h2>${t}.</h2><p>${p}</p></div><p><a class="btn" href="#analizar" style="text-decoration:none">Ir a Forja EDH</a></p>`;

function renderAll() {
  const e = H.esc, d = sh.deck, s = A.analyze(d), c0 = d.cmds[0];
  $("#shareView").innerHTML = `
    <div class="hero"><div class="eyebrow">Te han compartido un mazo</div><h2>${e(sh.name)}.</h2>
      <p>Pulsa las cartas que <b>quitarías</b> y busca a la derecha las que <b>añadirías</b>. Puedes explicar por qué; tu amigo verá tus sugerencias y decidirá cuáles aplicar.</p></div>
    <div class="panel sshead">
      ${c0 && c0.art ? `<img class="gthumb" src="${e(c0.art)}" alt="">` : ""}
      <div style="min-width:0"><div class="gname">${d.cmds.map(c => `<button class="cn" data-name="${e(c.name)}">${e(c.name)}</button>`).join(" + ") || "Sin comandante"}</div><div class="muted small">${H.pipsHTML(s.ci)}</div></div>
      <div class="gstats"><div><span class="eyebrow">Cartas</span><b>${s.total}</b></div><div><span class="eyebrow">Precio</span><b>${money(s.price)}</b></div><div><span class="eyebrow">Coste medio</span><b>${s.avgCmc.toFixed(2)}</b></div><div><span class="eyebrow">Bracket</span><b>B${s.bracket}</b></div></div>
    </div>
    <div class="scols">
      <div id="sDeck"></div>
      <aside class="panel sside" id="sSide"></aside>
    </div>`;
  renderDeck(); renderSide();
}

function renderDeck() {
  const e = H.esc, groups = {};
  for (const x of sh.deck.cards.values()) (groups[A.groupOf(x.c)] ||= []).push(x);
  $("#sDeck").innerHTML = A.ORDER.filter(g => groups[g]).map(g => {
    const arr = groups[g].sort((a, b) => a.c.cmc - b.c.cmc || a.c.name.localeCompare(b.c.name));
    return `<div class="vgroup"><h4>${g} · ${arr.reduce((n, x) => n + x.q, 0)}</h4><div class="ggrid sgrid">${arr.map(({ c, q }) => {
      const on = sh.cuts.has(A.key(c));
      return `<div class="gcard${on ? " on cut" : ""}"><button class="gpickbtn" data-scut="${e(A.key(c))}" aria-pressed="${on}" aria-label="${on ? "No quitar " : "Quitaría "}${e(c.name)}">
        ${c.img ? `<img src="${e(c.img)}" alt="" loading="lazy">` : `<span class="noimg">${e(c.name)}</span>`}<span class="gcheck" aria-hidden="true">✕</span>${q > 1 ? `<span class="qb">${q}</span>` : ""}</button>
        <div class="gmeta"><button class="cn" data-name="${e(c.name)}">${e(c.name)}</button></div></div>`;
    }).join("")}</div></div>`;
  }).join("");
}
function toggleCut(k) {
  const entry = [...sh.deck.cards.values()].find(x => A.key(x.c) === k); if (!entry) return;
  if (sh.cuts.has(k)) sh.cuts.delete(k); else sh.cuts.set(k, { c: entry.c, why: "" });
  renderDeck(); renderSide();
}

function renderSide() {
  const e = H.esc, side = $("#sSide");
  const keepAuthor = $("#sAuthor") ? $("#sAuthor").value : (() => { try { return localStorage.getItem(NAME_KEY) || ""; } catch { return ""; } })();
  const keepMsg = $("#sMsg") ? $("#sMsg").value : "";
  const row = (kind, x) => `<div class="srow">${x.c.small ? `<img src="${e(x.c.small)}" alt="" loading="lazy">` : "<span></span>"}
    <div style="min-width:0"><button class="cn" data-name="${e(x.c.name)}">${e(x.c.name)}</button><input type="text" data-swhy="${kind}|${e(A.key(x.c))}" value="${e(x.why)}" maxlength="200" placeholder="¿Por qué? (opcional)" aria-label="Motivo para ${e(x.c.name)}"></div>
    <button class="x" data-srm="${kind}|${e(A.key(x.c))}" aria-label="Quitar ${e(x.c.name)} de la sugerencia">×</button></div>`;
  side.innerHTML = `<h3>Tus sugerencias</h3>
    <div class="eyebrow no">Quitaría (${sh.cuts.size})</div>
    ${[...sh.cuts.values()].map(x => row("cuts", x)).join("") || '<p class="muted small">Pulsa una carta del mazo para marcarla.</p>'}
    <div class="eyebrow ok" style="margin-top:12px">Añadiría (${sh.adds.size})</div>
    ${[...sh.adds.values()].map(x => row("adds", x)).join("")}
    <div class="ac"><input type="text" id="sAddInput" autocomplete="off" placeholder="Busca una carta para añadir…" aria-label="Buscar carta para añadir"></div>
    <label class="f" for="sAuthor" style="margin-top:12px">Tu nombre<input type="text" id="sAuthor" maxlength="60" autocomplete="nickname" placeholder="Para que sepa quién eres"></label>
    <label class="f" for="sMsg">Mensaje (opcional)<textarea id="sMsg" maxlength="1000" rows="3" placeholder="Ideas generales sobre el mazo…"></textarea></label>
    <button class="btn primary" id="sSend" ${sh.cuts.size + sh.adds.size ? "" : "disabled"}>Enviar sugerencias</button>
    <div class="status" id="sStatus"></div>`;
  $("#sAuthor").value = keepAuthor; $("#sMsg").value = keepMsg;
  const ci = A.ciUnion(sh.deck.cmds);
  H.attachAC($("#sAddInput"), {
    query: q => `${q} legal:commander game:paper ${SF.ciQuery(ci)}`,
    onPick: (c, inp) => {
      inp.value = "";
      if (sh.deck.cards.has(A.key(c)) || sh.deck.cmds.some(x => x.name === c.name)) { H.toast(c.name + " ya está en el mazo"); return; }
      sh.adds.set(A.key(c), { c, why: "" }); renderSide(); $("#sAddInput").focus();
    },
  });
}

async function send() {
  const st = $("#sStatus"), btn = $("#sSend"), author = $("#sAuthor").value.trim();
  try { localStorage.setItem(NAME_KEY, author); } catch {}
  const pack = m => [...m.values()].map(x => ({ name: x.c.name, why: (x.why || "").trim().slice(0, 200) }));
  btn.disabled = true; st.innerHTML = '<span class="spin"></span><span>Enviando…</span>';
  try {
    await Cloud.sendSuggestion(sh.id, { author, message: $("#sMsg").value.trim(), cuts: pack(sh.cuts), adds: pack(sh.adds) });
    $("#sSide").innerHTML = `<h3>¡Enviado!</h3><p>Tu amigo verá tus sugerencias en «Mis mazos» y elegirá cuáles aplicar.</p><button class="btn" id="sAgain">Hacer otra sugerencia</button>`;
    sh.cuts.clear(); sh.adds.clear(); renderDeck();
  } catch (e) {
    btn.disabled = false; st.innerHTML = `<span class="no">No se pudo enviar: ${H.esc(e.message || e)}</span>`;
  }
}
