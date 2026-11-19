// «Probar mano»: mano inicial con mulligan de Commander, partida en solitario (goldfish) con maná y
// zonas de juego, y simulación automática de mil partidas para ver si el mazo arranca.
import * as A from "./analysis.js";

const $ = s => document.querySelector(s);
let H = null; // utilidades de app.js: esc, toast, getDeck
const g = { key: "", phase: "empty", library: [], hand: [], lands: [], perms: [], grave: [], cmd: [], turn: 0, landPlayed: false, spent: 0, mulls: 0, bottom: 0, log: [] };
let uid = 0;

/* ---------- reglas aproximadas a partir del texto ---------- */
const PERM = /Creature|Artifact|Enchantment|Planeswalker|Battle/;
const isCreature = c => /Creature/.test(c.type);
// Maná que produce un permanente al girarse (0 si no produce o si cuesta maná activarlo).
export function manaOf(c) {
  if (A.isLand(c)) return 1;
  const m = c.text.match(/(^|\n)([^\n:]*\{T\}[^\n:]*): Add ([^.\n]*)/i);
  if (!m || /\{X\}/.test(m[2])) return 0;
  // Coste de activación en maná (p. ej. los Signets: «{1}, {T}: Add {R}{W}» dan +1 neto).
  const cost = (m[2].match(/\{[0-9WUBRGC]+\}/g) || []).reduce((n, s) => n + (/^\{\d+\}$/.test(s) ? +s.slice(1, -1) : 1), 0);
  const add = m[3].split(/ or /i)[0];
  const syms = (add.match(/\{[WUBRGC]\}/g) || []).length;
  const out = syms || (/three mana/i.test(add) ? 3 : /two mana/i.test(add) ? 2 : /mana/i.test(add) ? 1 : 0);
  return Math.max(0, out - cost);
}
// Tierras que entran giradas (sin la cláusula «unless…», que suele cumplirse).
const entersTapped = c => /enters (the battlefield )?tapped/i.test(c.text) && !/unless|you may pay/i.test(c.text);
// Hechizos de ramp que ponen tierras en juego: { bf: cuántas al campo, hand: cuántas a la mano, basic }.
export function landSearch(c) {
  if (A.isLand(c)) return null;
  const t = c.text.toLowerCase();
  const m = t.match(/search your library for (up to )?(a|an|one|two|three|x) ([^.]*?)(lands?|forests?|plains|islands?|swamps?|mountains?)( cards?)?/);
  if (!m || !/onto the battlefield/.test(t)) return null;
  const n = { a: 1, an: 1, one: 1, two: 2, three: 3, x: 1 }[m[2]] || 1;
  let bf = n, hand = 0;
  if (n >= 2 && /(put )?one onto the battlefield/.test(t) && /(the other|into your hand)/.test(t)) { bf = 1; hand = n - 1; }
  return { bf, hand, basic: /basic/.test(m[3]) || /basic/.test(t.slice(m.index, m.index + 80)) };
}
const tagged = c => ({ c, id: ++uid });

/* ---------- partida manual ---------- */
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function libraryOf(d) { const lib = []; for (const { c, q } of d.cards.values()) for (let k = 0; k < q; k++) lib.push(c); return shuffle(lib); }
const log = msg => { g.log.push({ t: g.turn, msg }); };

function newHand(keepMull) {
  const d = H.getDeck();
  g.key = A.deckToText(d);
  g.library = libraryOf(d); g.hand = g.library.splice(0, 7).map(tagged);
  g.lands = []; g.perms = []; g.grave = []; g.cmd = d.cmds.map(c => ({ c, casts: 0 }));
  g.turn = 0; g.landPlayed = false; g.spent = 0; g.bottom = 0;
  if (!keepMull) { g.mulls = 0; g.log = []; }
  g.phase = g.library.length + g.hand.length ? "mull" : "empty";
  if (keepMull) log(`Mulligan ${g.mulls}${g.mulls > 1 ? ` (pondrás ${g.mulls - 1} al fondo)` : " (gratis)"}.`);
  render();
}
function keep() {
  if (g.phase !== "mull") return;
  g.bottom = Math.max(0, g.mulls - 1);
  log(`Te quedas con ${g.hand.length} cartas (${g.hand.filter(h => A.isLand(h.c)).length} tierras).`);
  if (g.bottom) { g.phase = "bottom"; render(); return; }
  startTurn();
}
function startTurn() {
  g.phase = "play"; g.turn++; g.landPlayed = false; g.spent = 0;
  g.lands.forEach(l => { l.tapped = false; }); g.perms.forEach(p => { p.sick = false; });
  if (g.turn > 1 || $("#gfDrawFirst").checked) draw(true);
  render();
}
function draw(auto) {
  if (!g.library.length) { H.toast("La biblioteca está vacía"); return; }
  const h = tagged(g.library.shift()); g.hand.forEach(x => { x.isNew = false; }); h.isNew = true; g.hand.push(h);
  if (g.phase === "play") log(`${auto ? "Robas" : "Robas (extra)"} ${h.c.name}.`);
  render();
}
const totalMana = () => g.lands.filter(l => !l.tapped).length + g.perms.filter(p => !p.sick).reduce((n, p) => n + manaOf(p.c), 0);
const available = () => Math.max(0, totalMana() - g.spent);

function playFromHand(i) {
  const h = g.hand[i]; if (!h) return;
  if (g.phase === "bottom") {
    g.hand.splice(i, 1); g.library.push(h.c); g.bottom--;
    log(`Pones ${h.c.name} en el fondo de la biblioteca.`);
    if (!g.bottom) startTurn(); else render();
    return;
  }
  if (g.phase !== "play") { H.toast("Primero quédate con la mano"); return; }
  const c = h.c;
  if (A.isLand(c)) {
    if (g.landPlayed) { H.toast("Ya has jugado una tierra este turno"); return; }
    g.hand.splice(i, 1); g.landPlayed = true; g.lands.push({ ...h, tapped: entersTapped(c) });
    log(`Juegas ${c.name}${entersTapped(c) ? " (entra girada)" : ""}.`);
  } else {
    if (!cast(c, c.cmc)) return;
    g.hand.splice(i, 1);
    resolve(h);
  }
  render();
}
function cast(c, cost) {
  const av = available();
  if (cost > av) { H.toast(`Te falta maná: cuesta ${cost} y tienes ${av}`); return false; }
  g.spent += cost; return true;
}
function resolve(h) {
  const c = h.c;
  if (PERM.test(c.type)) g.perms.push({ ...h, sick: isCreature(c) });
  else g.grave.push(h);
  let extra = "";
  const ls = landSearch(c);
  if (ls) {
    const pick = () => { const k = g.library.findIndex(x => A.isLand(x) && (!ls.basic || A.isBasic(x))); return k >= 0 ? g.library.splice(k, 1)[0] : null; };
    const got = [];
    for (let n = 0; n < ls.bf; n++) { const l = pick(); if (l) { g.lands.push({ ...tagged(l), tapped: /tapped/i.test(c.text) }); got.push(l.name); } }
    for (let n = 0; n < ls.hand; n++) { const l = pick(); if (l) { g.hand.push(tagged(l)); got.push(l.name + " a la mano"); } }
    shuffle(g.library);
    if (got.length) extra = ` (buscas ${got.join(", ")})`;
  }
  log(`Lanzas ${c.name} por ${c.cmc}${extra}.`);
}
function castCommander(i) {
  const x = g.cmd[i]; if (!x || g.phase !== "play") { if (g.phase !== "play") H.toast("Primero quédate con la mano"); return; }
  const cost = x.c.cmc + 2 * x.casts;
  if (!cast(x.c, cost)) return;
  x.casts++; g.perms.push({ ...tagged(x.c), sick: isCreature(x.c), isCmd: i });
  x.out = true;
  log(`Lanzas a tu comandante ${x.c.name} por ${cost}${x.casts > 1 ? ` (impuesto +${2 * (x.casts - 1)})` : ""}.`);
  render();
}
function bounce(zone, i) {
  const arr = g[zone], x = arr[i]; if (!x) return;
  arr.splice(i, 1);
  if (x.isCmd !== undefined) { g.cmd[x.isCmd].out = false; log(`${x.c.name} vuelve a la zona de mando.`); }
  else { g.hand.push(tagged(x.c)); log(`Devuelves ${x.c.name} a la mano.`); }
  render();
}

/* ---------- pintar ---------- */
function cardBtn(c, data, extra = "", cls = "") {
  const e = H.esc;
  return `<button class="gfc ${cls}" data-gf="${data}" data-name="${e(c.name)}" aria-label="${e(c.name)}">${c.img ? `<img src="${e(c.img)}" alt="" loading="lazy">` : `<span class="noimg">${e(c.name)}</span>`}${extra}</button>`;
}
function render() {
  const d = H.getDeck();
  if (g.phase !== "empty" && g.key !== A.deckToText(d)) { g.phase = "empty"; g.hand = []; }
  const bar = $("#gfBar"), lands = g.hand.filter(h => A.isLand(h.c)).length;
  $("#btnKeep").hidden = g.phase !== "mull";
  $("#btnMull").hidden = g.phase !== "mull";
  $("#btnNextTurn").hidden = g.phase !== "play";
  $("#gfBoard").hidden = g.phase !== "play";
  if (g.phase === "empty") {
    bar.innerHTML = d.cards.size ? '<span class="muted">Pulsa «Nueva mano» para robar siete.</span>' : '<span class="muted">Analiza o genera un mazo primero.</span>';
    $("#handInfo").textContent = ""; $("#hand").innerHTML = ""; paintLog(); return;
  }
  if (g.phase === "mull") bar.innerHTML = `<span><b>Mano inicial</b> · ${lands} ${lands === 1 ? "tierra" : "tierras"}</span>${g.mulls ? `<span class="lo">Mulligan ${g.mulls}${g.mulls > 1 ? ` · al quedarte pondrás ${g.mulls - 1} al fondo` : " (gratis)"}</span>` : ""}<span class="muted">${g.library.length} en la biblioteca</span>`;
  else if (g.phase === "bottom") bar.innerHTML = `<span class="lo"><b>Pulsa ${g.bottom} ${g.bottom === 1 ? "carta" : "cartas"} de la mano para ponerla${g.bottom === 1 ? "" : "s"} en el fondo.</b></span>`;
  else {
    const tot = totalMana(), av = available();
    bar.innerHTML = `<span class="gfturn">Turno ${g.turn}</span><span>Maná <b class="mono">${av}</b> de <b class="mono">${tot}</b></span>
      <span class="${g.landPlayed ? "muted" : "ok"}">${g.landPlayed ? "Tierra jugada" : "Puedes jugar una tierra"}</span><span class="muted">${g.library.length} en la biblioteca</span>`;
  }
  $("#handInfo").textContent = `· ${g.hand.length} ${g.hand.length === 1 ? "carta" : "cartas"} · ${lands} ${lands === 1 ? "tierra" : "tierras"}`;
  const playable = h => g.phase === "play" && (A.isLand(h.c) ? !g.landPlayed : h.c.cmc <= available());
  $("#hand").innerHTML = g.hand.map((h, i) => cardBtn(h.c, "h:" + i, "", (h.isNew ? "new " : "") + (playable(h) ? "can" : g.phase === "play" ? "cant" : ""))).join("");
  if (g.phase === "play") {
    $("#gfCmd").innerHTML = g.cmd.map((x, i) => x.out ? "" : cardBtn(x.c, "c:" + i, `<span class="qb">${x.c.cmc + 2 * x.casts}</span>`, x.c.cmc + 2 * x.casts <= available() ? "can" : "cant")).join("") || '<span class="muted small">En el campo</span>';
    $("#gfLands").innerHTML = g.lands.map((l, i) => cardBtn(l.c, "l:" + i, "", l.tapped ? "tapped" : "")).join("");
    $("#gfPerms").innerHTML = g.perms.map((p, i) => cardBtn(p.c, "p:" + i, manaOf(p.c) ? `<span class="qb">+${manaOf(p.c)}</span>` : "", p.sick ? "sick" : "")).join("") || '<span class="muted small">Nada todavía</span>';
    $("#gfGrave").innerHTML = g.grave.map((x, i) => cardBtn(x.c, "g:" + i)).join("") || '<span class="muted small">Vacío</span>';
    $("#gfLandsN").textContent = g.lands.length; $("#gfPermsN").textContent = g.perms.length; $("#gfGraveN").textContent = g.grave.length;
  }
  paintLog();
}
function paintLog() {
  const e = H.esc, el = $("#gfLog");
  el.innerHTML = g.log.slice(-60).map(x => `<li><span class="mono muted">${x.t ? "T" + x.t : "—"}</span> ${e(x.msg)}</li>`).join("") || '<li class="muted">Aquí aparecerá lo que pase en la partida.</li>';
  el.scrollTop = el.scrollHeight;
}

/* ---------- simulación ---------- */
export function simulate(d, { games = 1000, turns = 8, drawFirst = true } = {}) {
  const deckArr = []; for (const { c, q } of d.cards.values()) for (let k = 0; k < q; k++) deckArr.push(c);
  const info = new Map(deckArr.map(c => [c, { land: A.isLand(c), tapped: A.isLand(c) && entersTapped(c), mana: A.isLand(c) ? 0 : manaOf(c), creature: isCreature(c), ls: landSearch(c) }]));
  const cmdCost = d.cmds.length ? Math.min(...d.cmds.map(c => c.cmc)) : null;
  const acc = Array.from({ length: turns + 1 }, () => ({ lands: 0, mana: 0, drop: 0, cmd: 0 }));
  let mulls = 0, screw = 0, cmdTurnSum = 0, cmdCount = 0;
  for (let gm = 0; gm < games; gm++) {
    let lib = shuffle(deckArr.slice()), hand = lib.splice(0, 7);
    const nl = h => h.filter(c => info.get(c).land).length;
    if (nl(hand) < 2 || nl(hand) > 5) { mulls++; lib = shuffle(deckArr.slice()); hand = lib.splice(0, 7); }
    let lands = 0, rocks = 0, sickRocks = 0, cmdT = null;
    for (let t = 1; t <= turns; t++) {
      rocks += sickRocks; sickRocks = 0;
      if ((t > 1 || drawFirst) && lib.length) hand.push(lib.shift());
      let tappedNow = 0;
      // Tierra: mejor una que entre enderezada.
      let li = hand.findIndex(c => info.get(c).land && !info.get(c).tapped);
      if (li < 0) li = hand.findIndex(c => info.get(c).land);
      if (li >= 0) { const c = hand.splice(li, 1)[0]; lands++; if (info.get(c).tapped) tappedNow++; }
      let avail = lands - tappedNow + rocks;
      // Ramp primero, de más barato a más caro.
      const ramp = hand.filter(c => { const i = info.get(c); return !i.land && (i.mana || i.ls); }).sort((a, b) => a.cmc - b.cmc);
      for (const c of ramp) {
        if (c.cmc > avail) break;
        avail -= c.cmc; hand.splice(hand.indexOf(c), 1);
        const i = info.get(c);
        if (i.mana) { if (i.creature) sickRocks += i.mana; else { rocks += i.mana; avail += i.mana; } }
        if (i.ls) {
          for (let n = 0; n < i.ls.bf; n++) { const k = lib.findIndex(x => info.get(x).land && (!i.ls.basic || A.isBasic(x))); if (k >= 0) { lib.splice(k, 1); lands++; tappedNow++; } }
          for (let n = 0; n < i.ls.hand; n++) { const k = lib.findIndex(x => info.get(x).land && (!i.ls.basic || A.isBasic(x))); if (k >= 0) hand.push(lib.splice(k, 1)[0]); }
        }
      }
      if (cmdCost !== null && cmdT === null && cmdCost <= avail) { cmdT = t; avail -= cmdCost; }
      const a = acc[t];
      a.lands += lands; a.mana += lands + rocks + sickRocks; if (lands >= t) a.drop++; if (cmdT !== null) a.cmd++;
      if (t === 4 && lands <= 2) screw++;
    }
    if (cmdT !== null) { cmdTurnSum += cmdT; cmdCount++; }
  }
  return { games, turns, acc, mulls, screw, cmdCost, cmdAvg: cmdCount ? cmdTurnSum / cmdCount : null, cmdPct: cmdCount / games };
}
function paintSim(r) {
  const pct = x => Math.round(x / r.games * 100) + " %";
  const d = H.getDeck(), cmdName = d.cmds.map(c => c.name).join(" / ");
  $("#gfSimOut").innerHTML = `<div class="kv" style="margin-bottom:12px">
      <div><span>Mulligan</span><b>${pct(r.mulls)}</b></div>
      <div><span>Atascado (≤2 tierras en T4)</span><b>${pct(r.screw)}</b></div>
      ${r.cmdCost !== null ? `<div><span>Comandante (coste ${r.cmdCost}), turno medio</span><b>${r.cmdAvg ? r.cmdAvg.toFixed(1).replace(".", ",") : "–"}</b></div>` : ""}
    </div>
    <table class="cmptab simtab"><thead><tr><th>Turno</th><th>Tierras</th><th>Maná</th><th>Tierra cada turno</th>${r.cmdCost !== null ? "<th>Comandante ya en juego</th>" : ""}</tr></thead><tbody>
    ${r.acc.slice(1).map((a, i) => `<tr><th>${i + 1}</th><td>${(a.lands / r.games).toFixed(1).replace(".", ",")}</td><td>${(a.mana / r.games).toFixed(1).replace(".", ",")}</td><td>${pct(a.drop)}</td>${r.cmdCost !== null ? `<td>${pct(a.cmd)}</td>` : ""}</tr>`).join("")}
    </tbody></table>
    <p class="muted small" style="margin:8px 0 0">«Maná» cuenta tierras, piedras y criaturas de maná en juego. «Tierra cada turno» es el porcentaje de partidas con al menos tantas tierras como el número de turno.${cmdName ? ` Comandante: ${H.esc(cmdName)}.` : ""}</p>`;
}

/* ---------- arranque ---------- */
export function initGoldfish(helpers) {
  H = helpers;
  $("#btnNewHand").onclick = () => newHand(false);
  $("#btnMull").onclick = () => { if (g.phase !== "mull") return; g.mulls++; newHand(true); };
  $("#btnKeep").onclick = keep;
  $("#btnNextTurn").onclick = () => { if (g.phase === "play") { startTurn(); } };
  $("#btnDraw").onclick = () => { if (g.phase === "empty") { newHand(false); return; } draw(false); };
  $("#view-mano").addEventListener("click", e => {
    const b = e.target.closest("[data-gf]"); if (!b) return;
    const [z, k] = b.dataset.gf.split(":"), i = +k;
    if (z === "h") playFromHand(i);
    else if (z === "c") castCommander(i);
    else if (z === "l") bounce("lands", i);
    else if (z === "p") bounce("perms", i);
  });
  $("#gfSim").onclick = () => {
    const d = H.getDeck();
    if (!d.cards.size) { $("#gfSimOut").innerHTML = '<p class="lo">Analiza o genera un mazo primero.</p>'; return; }
    $("#gfSimOut").innerHTML = '<div class="status"><span class="spin"></span><span>Simulando…</span></div>';
    setTimeout(() => paintSim(simulate(d, { drawFirst: $("#gfDrawFirst").checked })), 20);
  };
}
// Al entrar en la pestaña: si no hay mano (o cambió el mazo), roba una.
export function showGoldfish() {
  const d = H.getDeck();
  if ((g.phase === "empty" || g.key !== A.deckToText(d)) && d.cards.size) newHand(false); else render();
}
