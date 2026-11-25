// «Jugar»: partidas de Commander online, como una mesa de verdad: no aplica las reglas, cada jugador
// mueve sus cartas (robar, jugar, girar, cementerio, exilio…) y los demás lo ven al momento.
// Red: js/playnet.js (Supabase Realtime). Cada navegador manda solo el estado PÚBLICO de su mesa.
import * as SF from "./scryfall.js";
import * as A from "./analysis.js";
import * as Decks from "./decks.js";
import * as Cloud from "./cloud.js";
import * as Net from "./playnet.js";

const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};
const rid = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36));
// Un id por pestaña (sessionStorage): sobrevive a recargar, y dos pestañas son dos jugadores distintos.
let freshTab = false;
const tabId = () => { try { let i = sessionStorage.getItem("forja-play-id"); if (!i) { freshTab = true; i = rid(); sessionStorage.setItem("forja-play-id", i); } return i; } catch { return rid(); } };
const ME = { id: tabId(), name: store.get("forja-autor") || "" };
const ZN = { lib: "la biblioteca", hand: "la mano", bf: "el campo", gy: "el cementerio", ex: "el exilio", cz: "la zona de mando" };
const PUBLIC = new Set(["bf", "gy", "ex", "cz"]);
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

/* ===================== estado ===================== */
let chosen = null;        // mazo elegido: { name, text, cmds:[nombres], art }
let lobbyNet = null, rooms = [];
let net = null, room = null; // room: { code, name, max, priv }
let people = [];          // conectados a la sala (Presence)
let R = { v: 0, started: false };  // estado común de la sala (lo manda el anfitrión o quien pasa el turno)
const pubs = new Map();   // id → estado público de cada jugador
let G = null;             // mi partida (privada)
let logs = [];
let dragging = false, pendingRender = false;

/* ===================== arranque ===================== */
init();
async function init() {
  $("#myName").value = ME.name;
  $("#myName").addEventListener("input", e => { ME.name = e.target.value.trim().slice(0, 24); store.set("forja-autor", ME.name); trackMe(); });
  chosen = (() => { try { return JSON.parse(store.get("forja-play-deck") || "null"); } catch { return null; } })();
  renderDeckPick();
  Decks.onChange(renderDeckPick);
  bindLobby(); bindTable();
  const ok = await Net.connect().catch(() => false);
  if (!ME.name) { ME.name = Cloud.defaultAuthor() || ""; $("#myName").value = ME.name; }
  renderDeckPick(); // la nube puede haber traído mazos
  if (!ok) { status("No se puede conectar con el servidor de partidas (Supabase). Revisa la conexión y recarga.", true); $("#roomList").innerHTML = ""; return; }
  lobbyNet = Net.lobby(ME.id, list => { rooms = list; renderRooms(); },
    st => status(st === "ok" ? "" : "Conexión perdida con el servidor de partidas; reintentando…", st !== "ok"));
  const m = /sala=([A-Za-z0-9]{6})/.exec(location.hash);
  if (m) joinRoom(m[1].toUpperCase());
}
function status(msg, bad) { const p = $("#netStatus"); p.hidden = !msg; p.textContent = msg; p.classList.toggle("bad", !!bad); }

/* ===================== elegir mazo ===================== */
function deckFromSaved(d) {
  return { id: d.id, name: d.name, text: d.text, cmds: d.cmds || [], art: (d.stats && d.stats.art) || "" };
}
function renderDeckPick() {
  const list = Decks.list();
  const html = (list.length ? list.map(d => {
    const on = chosen && chosen.id === d.id;
    return `<button class="pdeck${on ? " on" : ""}" data-pick="${esc(d.id)}">
      <span class="art" style="${d.stats && d.stats.art ? `background-image:url('${esc(d.stats.art)}')` : ""}"></span>
      <span class="nm">${esc(d.name)}</span><span class="cm">${esc((d.cmds || []).join(" + "))}</span></button>`;
  }).join("") : '<p class="muted small">Aún no tienes mazos guardados. Guarda uno en <a href="index.html#mazos">Mis mazos</a> o pega una lista aquí abajo.</p>')
    + (chosen && !chosen.id ? `<button class="pdeck on"><span class="art"></span><span class="nm">${esc(chosen.name)}</span><span class="cm">Lista pegada</span></button>` : "");
  $("#deckPick").innerHTML = html; $("#deckPick2").innerHTML = html;
  $("#deckHint").textContent = chosen ? `Jugarás con «${chosen.name}».` : "Elige uno de «Mis mazos» o pega una lista.";
}
function choose(d) {
  chosen = d; store.set("forja-play-deck", JSON.stringify(d)); renderDeckPick(); trackMe();
}
document.addEventListener("click", e => {
  const b = e.target.closest("[data-pick]"); if (!b) return;
  if (R.started && G) return;
  const d = Decks.get(b.dataset.pick); if (d) choose(deckFromSaved(d));
});

/* ===================== vestíbulo ===================== */
function bindLobby() {
  $("#pasteUse").addEventListener("click", () => {
    const text = $("#pasteText").value.trim(); if (!text) return;
    const p = A.parseList(text), cmd = $("#pasteCmd").value.trim();
    const cmds = p.cmd.length ? p.cmd.map(e => e.name) : (cmd ? [cmd] : []);
    if (!cmds.length) { alert("Falta el comandante: escríbelo en su casilla o pon la sección «Commander» en la lista."); return; }
    choose({ id: "", name: cmds.join(" + "), text, cmds, art: "" });
  });
  $("#roomCreate").addEventListener("click", () => {
    if (!needBasics()) return;
    const code = Net.newCode();
    joinRoom(code, { name: $("#roomName").value.trim().slice(0, 40) || `Sala de ${ME.name}`, max: +$("#roomMax").value, priv: $("#roomPriv").checked, host: true });
  });
  $("#joinBtn").addEventListener("click", () => {
    const c = $("#joinCode").value.trim().toUpperCase();
    if (!Net.validCode(c)) { alert("El código son 6 letras o números."); return; }
    if (needBasics()) joinRoom(c);
  });
  $("#roomList").addEventListener("click", e => {
    const b = e.target.closest("[data-join]"); if (b && needBasics()) joinRoom(b.dataset.join);
  });
  $("#leaveRoom").addEventListener("click", leaveRoom);
  $("#copyLink").addEventListener("click", () => {
    const url = location.origin + location.pathname + "#sala=" + room.code;
    navigator.clipboard.writeText(url).then(() => { $("#copyLink").textContent = "¡Copiado!"; setTimeout(() => $("#copyLink").textContent = "Copiar enlace", 1500); }, () => prompt("Copia el enlace:", url));
  });
  $("#startGame").addEventListener("click", startAsHost);
}
function needBasics() {
  if (!ME.name) { $("#myName").focus(); alert("Escribe tu nombre arriba para que te reconozcan."); return false; }
  if (!lobbyNet) { alert("Aún no hay conexión con el servidor de partidas."); return false; }
  return true;
}
function renderRooms() {
  const list = rooms.filter(r => !r.priv).sort((a, b) => (a.started - b.started) || (b.at - a.at));
  $("#roomList").innerHTML = list.length ? list.map(r => `<div class="proom">
      <div><b>${esc(r.name)}</b><span class="muted small"> · ${esc(r.host)}</span><br>
      <span class="small muted">${r.players}/${r.max} jugadores${r.started ? " · en partida" : ""}</span></div>
      <button class="btn sm${r.started || r.players >= r.max ? "" : " primary"}" data-join="${esc(r.code)}">${r.started ? "Mirar" : r.players >= r.max ? "Llena" : "Unirme"}</button></div>`).join("")
    : '<p class="muted small">No hay salas abiertas. ¡Crea una y pásale el código a tus amigos!</p>';
}

/* ===================== sala ===================== */
const host = () => { const p = [...people].sort((a, b) => a.joined - b.joined || String(a.id).localeCompare(b.id)); return p[0] || null; };
const amHost = () => { const h = host(); return !!h && h.id === ME.id; };
const meta = () => ({ id: ME.id, name: ME.name || "Jugador", joined: joinedAt, deck: chosen ? chosen.name : "", art: chosen ? chosen.art : "", hasDeck: !!chosen, room: room ? { name: room.name, max: room.max, priv: room.priv } : null });
let joinedAt = 0;
function trackMe() { if (net) net.track(meta()); }

function joinRoom(code, opts = {}) {
  if (net) leaveRoom(true);
  room = { code, name: opts.name || "Sala", max: opts.max || 4, priv: !!opts.priv };
  joinedAt = opts.host ? Date.now() - 1 : Date.now();
  pubs.clear(); people = [];
  // Pestaña nueva (cerraste la anterior): recupera quién eras en esta sala para volver a tu mesa.
  const prev = store.get("forja-play-me-" + code);
  if (freshTab && prev && prev !== ME.id && store.get(saveKey(code, prev))) { ME.id = prev; try { sessionStorage.setItem("forja-play-id", prev); } catch {} }
  freshTab = false; store.set("forja-play-me-" + code, ME.id);
  const saved = loadSaved(code);
  R = (saved && saved.R) || { v: 0, started: false };
  G = saved && saved.G; logs = (saved && saved.logs) || [];
  net = Net.room(code, ME.id, {
    onPeople: list => { people = list; adoptRoomInfo(); announce(); onPeopleChange(); },
    onMsg,
    onStatus: st => { if (st === "ok") { net.send("hello"); if (G) sendPub(true); } },
  });
  net.track(meta());
  history.replaceState(null, "", "#sala=" + code);
  showView("room"); renderRoom();
  if (R.started) onRoomState(); // volver a una partida empezada (recargar la página)
}
function leaveRoom(silent) {
  if (net) { if (G && R.started) addLog(`${ME.name} sale de la partida`, true); net.close(); }
  if (lobbyNet) lobbyNet.untrack();
  net = null; room = null; people = []; R = { v: 0, started: false }; G = null; pubs.clear();
  if (silent !== true) { history.replaceState(null, "", location.pathname); showView("lobby"); }
}
// El nombre y tamaño de la sala los decide quien la creó (va en su Presence).
function adoptRoomInfo() {
  const h = host(); if (h && h.room && h.id !== ME.id) room = { ...room, ...h.room };
}
// El anfitrión anuncia la sala en el vestíbulo (si no es privada).
function announce() {
  if (!lobbyNet || !room) return;
  if (amHost() && !room.priv) lobbyNet.track({ code: room.code, name: room.name, host: ME.name, players: people.filter(p => p.hasDeck).length || people.length, max: room.max, started: !!R.started, at: joinedAt });
  else lobbyNet.untrack();
}
function onPeopleChange() {
  if (!R.started) {
    // ¿Sala llena? Se va el último en llegar.
    const players = [...people].sort((a, b) => a.joined - b.joined);
    const idx = players.findIndex(p => p.id === ME.id);
    if (idx >= room.max) { alert("La sala está llena."); leaveRoom(); return; }
    renderRoom();
  } else render();
}
function renderRoom() {
  if (!room) return;
  $("#roomTitle").textContent = room.name; $("#roomCode").textContent = room.code;
  const h = host();
  $("#playerList").innerHTML = [...people].sort((a, b) => a.joined - b.joined).map(p => `<div class="pplayer">
      <span class="art" style="${p.art ? `background-image:url('${esc(p.art)}')` : ""}"></span>
      <div><b>${esc(p.name)}</b>${h && p.id === h.id ? ' <span class="tag">Anfitrión</span>' : ""}${p.id === ME.id ? ' <span class="tag">Tú</span>' : ""}<br>
      <span class="small ${p.hasDeck ? "muted" : "bad"}">${p.hasDeck ? esc(p.deck) : "Sin mazo elegido"}</span></div></div>`).join("") || '<p class="muted small">Conectando…</p>';
  const me = amHost(), ready = people.filter(p => p.hasDeck).length;
  $("#startGame").hidden = !me; $("#lifeWrap").hidden = !me;
  $("#startHint").textContent = me
    ? (ready ? `Cuando estéis todos, empieza. Jugarán ${ready} (quien no tenga mazo mirará).` : "Elige un mazo para poder empezar.")
    : "Esperando a que el anfitrión empiece la partida…";
  $("#startGame").disabled = !ready;
}
function startAsHost() {
  const players = people.filter(p => p.hasDeck).map(p => p.id);
  if (!players.length) return;
  R = { v: R.v + 1, started: true, gid: rid().slice(0, 8), order: shuffle(players), turn: 0, turnNo: 1, life: +$("#startLife").value || 40 };
  net.send("room", { R });
  onRoomState();
}

/* ===================== mensajes ===================== */
function onMsg(k, m) {
  if (k === "hello") { if (G) sendPub(true); if (amHost() && R.v) net.send("room", { R }); return; }
  if (k === "room") { if (m.R && m.R.v > R.v) { R = m.R; onRoomState(); } return; }
  if (k === "pub") { if (m.p && m.p.id && m.p.id !== ME.id) { pubs.set(m.p.id, m.p); resolveNames(m.p); scheduleRender(); } return; }
  if (k === "log") { logs.push(m.e); if (logs.length > 300) logs.shift(); renderLog(); clearTimeout(onMsg.st); onMsg.st = setTimeout(save, 500); return; }
}
let lastTurnSeen = "";
function onRoomState() {
  announce(); save();
  if (!R.started) { renderRoom(); return; }
  if (!G || G.gid !== R.gid) {
    G = null;
    if (R.order.includes(ME.id) && chosen) { startGame(); return; }
  }
  showView("table");
  const key = R.gid + ":" + R.turnNo;
  if (key !== lastTurnSeen) {
    const first = !lastTurnSeen; lastTurnSeen = key;
    if (!first && G && activeId() === ME.id && G.mull.phase === "done") myTurnStarts();
  }
  render();
}
const activeId = () => R.order ? R.order[R.turn % R.order.length] : null;
const nameOf = id => id === ME.id ? ME.name : ((pubs.get(id) || people.find(p => p.id === id) || {}).name || "Alguien");

/* ===================== registro y chat ===================== */
function addLog(text, chat = false) {
  const e = { at: Date.now(), from: ME.id, who: ME.name, text, chat };
  logs.push(e); if (logs.length > 300) logs.shift();
  if (net) net.send("log", { e });
  save();
  renderLog();
}
function renderLog() {
  const box = $("#logList"); if (!box) return;
  box.innerHTML = logs.slice(-150).map(e => `<p class="${e.chat ? "lchat" : ""}"><b>${esc(e.who)}</b>${e.chat ? ": " : " "}${esc(e.text)}</p>`).join("");
  box.scrollTop = box.scrollHeight;
}

/* ===================== mi partida ===================== */
// Cada jugador guarda su mesa aparte (dos pestañas del mismo navegador son dos jugadores).
const saveKey = (code, id = ME.id) => "forja-play-g-" + code + ":" + id;
function loadSaved(code) { try { const s = JSON.parse(store.get(saveKey(code)) || "null"); return s && s.R ? s : null; } catch { return null; } }
function save() { if (room && R.started) store.set(saveKey(room.code), JSON.stringify({ R, G, logs: logs.slice(-80) })); }

async function startGame() {
  showView("table");
  $("#bf").innerHTML = '<p class="muted bfmsg">Barajando tu mazo y buscando las cartas…</p>';
  const p = A.parseList(chosen.text);
  let cmdNames = p.cmd.map(e => e.name); if (!cmdNames.length) cmdNames = chosen.cmds || [];
  const isCmd = n => cmdNames.some(c => SF.norm(c) === SF.norm(n));
  const main = p.main.filter(e => !isCmd(e.name));
  await SF.collection([...cmdNames, ...main.map(e => e.name)], { fuzzyLimit: 25 }).catch(() => {});
  G = { gid: R.gid, life: R.life || 40, poison: 0, cmdDmg: {}, tax: {}, lib: [], hand: [], bf: [], gy: [], ex: [], cz: [], cards: {}, n: 0, mull: { count: 0, phase: "decide" }, deck: chosen.name };
  const add = (name, extra = {}) => { const c = SF.cached(name); const i = "c" + (++G.n); G.cards[i] = { n: c ? c.name : name, ...extra }; return i; };
  cmdNames.forEach(n => G.cz.push(add(n, { cmd: 1 })));
  main.forEach(e => { for (let k = 0; k < e.qty; k++) G.lib.push(add(e.name)); });
  shuffle(G.lib);
  G.hand = G.lib.splice(0, 7);
  lastTurnSeen = R.gid + ":" + R.turnNo;
  addLog(`se sienta con «${chosen.name}» (${G.lib.length + G.hand.length + G.cz.length} cartas)`);
  changed();
}

// Cualquier cambio en mi mesa: guardar, mandar a los demás y pintar.
function changed() { save(); sendPub(); render(); }
let pubTimer = null;
function sendPub(now) {
  if (!net || !G) return;
  clearTimeout(pubTimer);
  const go = () => net.send("pub", { p: myPub() });
  if (now) go(); else pubTimer = setTimeout(go, 90);
}
function myPub() {
  const C = i => G.cards[i] || { n: "?" };
  return {
    id: ME.id, name: ME.name, deck: G.deck, life: G.life, poison: G.poison, cmdDmg: G.cmdDmg,
    lib: G.lib.length, hand: G.hand.length, ready: G.mull.phase === "done", dead: G.dead || null,
    bf: G.bf.map(b => ({ i: b.i, n: b.f ? null : C(b.i).n, u: b.f ? null : C(b.i).u || null, x: +b.x.toFixed(3), y: +b.y.toFixed(3), t: b.t ? 1 : 0, f: b.f ? 1 : 0, c: b.c || 0 })),
    gy: G.gy.map(i => C(i).n), ex: G.ex.map(i => C(i).n),
    cz: G.cz.map(i => ({ n: C(i).n, tax: (G.tax[i] || 0) * 2 })),
  };
}

const where = i => {
  for (const z of ["lib", "hand", "gy", "ex", "cz"]) if (G[z].includes(i)) return z;
  return G.bf.some(b => b.i === i) ? "bf" : null;
};
function take(i) {
  for (const z of ["lib", "hand", "gy", "ex", "cz"]) { const k = G[z].indexOf(i); if (k >= 0) { G[z].splice(k, 1); return z; } }
  const k = G.bf.findIndex(b => b.i === i); if (k >= 0) { G.bf.splice(k, 1); return "bf"; }
  return null;
}
// Mueve una carta mía a otra zona. opts: { x, y, bottom, faceDown, quiet }
function move(i, to, opts = {}) {
  const c = G.cards[i]; if (!c) return;
  const prevBf = G.bf.find(b => b.i === i);
  const from = take(i);
  if (!from) return;
  if (c.tok && to !== "bf") { delete G.cards[i]; if (!opts.quiet) addLog(`retira la ficha ${c.n}`); changed(); return; }
  // El comandante que iría al cementerio o al exilio vuelve a la zona de mando.
  if (c.cmd && (to === "gy" || to === "ex") && !opts.force) to = "cz";
  if (to === "bf") {
    const pos = opts.x != null ? { x: opts.x, y: opts.y } : freeSpot(c);
    G.bf.push({ i, x: pos.x, y: pos.y, t: false, f: !!opts.faceDown, c: 0 });
    if (from === "cz") G.tax[i] = (G.tax[i] || 0) + 1;
  } else if (to === "lib") { opts.bottom ? G.lib.push(i) : G.lib.unshift(i); }
  else G[to].push(i);
  if (!opts.quiet) {
    const visible = (PUBLIC.has(from) || PUBLIC.has(to)) && !(prevBf && prevBf.f) && !opts.faceDown;
    const nm = visible ? c.n : "una carta";
    let msg;
    if (from === "hand" && to === "bf") msg = opts.faceDown ? "juega una carta boca abajo" : `juega ${nm}`;
    else if (from === "cz" && to === "bf") msg = `lanza ${nm} desde la zona de mando${G.tax[i] > 1 ? ` (impuesto +${(G.tax[i] - 1) * 2})` : ""}`;
    else if (from === "lib" && to === "hand") msg = "roba una carta";
    else if (from === "lib" && to === "gy") msg = `muele ${nm}`;
    else if (from === "hand" && to === "gy") msg = `descarta ${nm}`;
    else if (to === "lib") msg = `pone ${nm} ${opts.bottom ? "debajo" : "encima"} de su biblioteca`;
    else msg = `mueve ${nm} de ${ZN[from]} a ${ZN[to]}`;
    addLog(msg);
  }
  changed();
}
function freeSpot(c) {
  const sc = SF.cached(c.n), land = sc && A.isLand(sc);
  const y = land ? 0.62 : (sc && /Creature/.test(sc.type) ? 0.02 : 0.32);
  for (let x = 0.01; x < 0.92; x += 0.06) {
    if (!G.bf.some(b => Math.abs(b.x - x) < 0.045 && Math.abs(b.y - y) < 0.12)) return { x, y };
  }
  return { x: 0.01 + Math.random() * 0.8, y: Math.min(0.62, y + 0.06) };
}
function draw(n = 1) {
  let k = 0;
  for (; k < n && G.lib.length; k++) G.hand.push(G.lib.shift());
  if (!k) { addLog("intenta robar con la biblioteca vacía"); return; }
  addLog(k === 1 ? "roba una carta" : `roba ${k} cartas`); changed();
}
function myTurnStarts() {
  G.bf.forEach(b => { b.t = false; });
  const skipDraw = R.order.length === 2 && R.turnNo === 1;
  if (!skipDraw && G.lib.length) G.hand.push(G.lib.shift());
  addLog(skipDraw ? "empieza su turno (endereza; el primer jugador no roba en partidas de dos)" : "empieza su turno: endereza y roba");
  changed();
}

/* ===================== mulligan ===================== */
function renderMull() {
  const box = $("#mull");
  if (!G || G.mull.phase === "done") { box.hidden = true; return; }
  box.hidden = false;
  const m = G.mull, need = Math.max(0, m.count - 1) - (m.bottomed || 0);
  box.innerHTML = `<div class="mbox">
    <h2>${m.phase === "bottom" ? `Pon ${need} ${need === 1 ? "carta" : "cartas"} debajo de tu biblioteca` : "Tu mano inicial"}</h2>
    <p class="muted small">${m.phase === "bottom" ? "Pulsa las cartas que quieres poner al fondo." : m.count ? `Mulligan ${m.count} (el primero es gratis en Commander).` : "¿Te la quedas? El primer mulligan es gratis."}</p>
    <div class="mhand">${G.hand.map(i => `<button class="mcard" data-mi="${i}" ${m.phase === "bottom" ? "" : "tabindex='-1'"}>${cardImg(G.cards[i].n, G.cards[i].u, "img")}</button>`).join("")}</div>
    ${m.phase === "bottom" ? "" : `<div class="row" style="justify-content:center"><button class="btn" id="mMull">Mulligan</button><button class="btn primary" id="mKeep">Me la quedo</button></div>`}
  </div>`;
}
function bindMull() {
  $("#mull").addEventListener("click", e => {
    if (!G) return;
    if (e.target.closest("#mMull")) {
      G.lib.push(...G.hand); G.hand = []; shuffle(G.lib); G.hand = G.lib.splice(0, 7); G.mull.count++;
      addLog(`hace mulligan (${G.mull.count})`); changed(); return;
    }
    if (e.target.closest("#mKeep")) {
      if (G.mull.count > 1) { G.mull.phase = "bottom"; G.mull.bottomed = 0; }
      else { G.mull.phase = "done"; addLog(`se queda la mano${G.mull.count ? " tras un mulligan" : ""}`); }
      changed(); return;
    }
    const c = e.target.closest("[data-mi]");
    if (c && G.mull.phase === "bottom") {
      const i = c.dataset.mi; G.hand.splice(G.hand.indexOf(i), 1); G.lib.push(i); G.mull.bottomed++;
      if (G.mull.bottomed >= G.mull.count - 1) { G.mull.phase = "done"; addLog(`se queda ${G.hand.length} cartas tras ${G.mull.count} mulligans`); }
      changed();
    }
  });
}

/* ===================== imágenes ===================== */
const waiting = new Set(); let resolveTimer = null;
function img(name, size) {
  const c = name && SF.cached(name);
  if (c) return size === "img" ? (c.img || c.small) : (c.small || c.img);
  if (name) { waiting.add(name); clearTimeout(resolveTimer); resolveTimer = setTimeout(flushNames, 150); }
  return "";
}
async function flushNames() {
  const names = [...waiting]; waiting.clear(); if (!names.length) return;
  await SF.collection(names, { fuzzyLimit: 10 }).catch(() => {});
  scheduleRender();
}
function resolveNames(p) {
  [...p.bf.map(b => b.u ? null : b.n), ...p.gy.slice(-1), ...p.ex.slice(-1), ...p.cz.map(c => c.n)].forEach(n => { if (n && !SF.cached(n)) waiting.add(n); });
  if (waiting.size) { clearTimeout(resolveTimer); resolveTimer = setTimeout(flushNames, 150); }
}
function cardImg(name, u, size) {
  const src = u || img(name, size);
  return src ? `<img src="${esc(src)}" alt="${esc(name)}" draggable="false" loading="lazy">` : `<span class="pname-ph">${esc(name || "?")}</span>`;
}
const zoomAttr = (name, u) => name ? ` data-zoom="${esc(name)}"${u ? ` data-zu="${esc(u)}"` : ""}` : "";

/* ===================== pintar ===================== */
function showView(v) {
  $("#lobbyView").hidden = v !== "lobby"; $("#roomView").hidden = v !== "room"; $("#tableView").hidden = v !== "table";
  document.body.classList.toggle("intable", v === "table");
  if (v === "lobby") { renderDeckPick(); renderRooms(); }
}
let renderTimer = null;
function scheduleRender() { if (dragging) { pendingRender = true; return; } clearTimeout(renderTimer); renderTimer = setTimeout(render, 30); }
function render() {
  if (dragging) { pendingRender = true; return; }
  if (!R.started || $("#tableView").hidden) return;
  $("#tCode").textContent = room ? room.code : "";
  const act = activeId();
  $("#turnInfo").innerHTML = `Turno ${R.turnNo} · <b>${esc(act === ME.id ? "Tu turno" : nameOf(act))}</b>`;
  $("#passTurn").hidden = act !== ME.id || !G;
  ["#untapAll", "#diceBtn", "#tokenBtn"].forEach(s => $(s).hidden = !G);
  renderOpps(); renderMine(); renderMull(); renderLog(); renderEnd();
  if (zoomEl && !zoomEl.isConnected) hideZoom();
}
function renderOpps() {
  const ids = (R.order || []).filter(id => id !== ME.id);
  const spect = people.filter(p => !R.order.includes(p.id));
  $("#opps").dataset.n = ids.length;
  $("#opps").innerHTML = ids.map(id => {
    const p = pubs.get(id), on = people.some(x => x.id === id);
    if (!p) return `<div class="opp"><div class="ohead"><b>${esc(nameOf(id))}</b><span class="muted small">${on ? "preparando su mesa…" : "desconectado"}</span></div><div class="obf"></div></div>`;
    const myDmg = (p.cmdDmg || {})[ME.id] || 0;
    return `<div class="opp${activeId() === id ? " active" : ""}${on ? "" : " off"}${p.dead ? " dead" : ""}">
      <div class="ohead">
        <b>${esc(p.name)}</b>${p.dead ? ` <span class="tag bad">Eliminado: ${esc(p.dead)}</span>` : p.ready ? "" : ' <span class="tag">Mulligan…</span>'}${on ? "" : ' <span class="tag bad">Desconectado</span>'}
        <span class="olife" title="Vidas">${p.life}</span>${p.poison ? `<span class="tag" title="Veneno">☠ ${p.poison}</span>` : ""}
        ${myDmg ? `<span class="tag" title="Daño de tu comandante">⚔ ${myDmg}</span>` : ""}
        <span class="grow"></span>
        <span class="ocount" title="Cartas en la mano">✋ ${p.hand}</span><span class="ocount" title="Biblioteca">📚 ${p.lib}</span>
        <button class="linkbtn" data-ozone="gy" data-oid="${esc(id)}">Cementerio ${p.gy.length}</button>
        <button class="linkbtn" data-ozone="ex" data-oid="${esc(id)}">Exilio ${p.ex.length}</button>
      </div>
      <div class="ohand" title="${p.hand} ${p.hand === 1 ? "carta" : "cartas"} en la mano">${'<div class="pc back"></div>'.repeat(Math.min(p.hand, 15))}<b>${p.hand}</b></div>
      <div class="obody">
        <div class="ocz">${p.cz.map(c => `<div class="pc"${zoomAttr(c.n)}>${cardImg(c.n)}${c.tax ? `<span class="badge">+${c.tax}</span>` : ""}</div>`).join("")}</div>
        <div class="obf">${p.bf.map(b => `<div class="pc${b.t ? " tap" : ""}${b.f ? " down" : ""}" style="left:${b.x * 100}%;top:${b.y * 100}%"${zoomAttr(b.n, b.u)}>${b.f ? "" : cardImg(b.n, b.u)}${b.c ? `<span class="badge">${b.c > 0 ? "+" : ""}${b.c}</span>` : ""}</div>`).join("")}</div>
      </div></div>`;
  }).join("") + (spect.length ? `<p class="spect muted small">Mirando: ${spect.map(p => esc(p.name)).join(", ")}</p>` : "")
    + (!ids.length ? '<p class="muted small bfmsg">Juegas solo: ideal para probar el mazo.</p>' : "");
}
function renderMine() {
  if (!G) {
    $("#bf").innerHTML = '<p class="muted bfmsg">Estás mirando la partida.</p>'; $("#hand").innerHTML = ""; $("#zones").innerHTML = ""; $("#lifeBox").innerHTML = ""; $("#cmdz").innerHTML = "";
    return;
  }
  $("#bf").innerHTML = G.bf.map(b => {
    const c = G.cards[b.i];
    return `<div class="pc own${b.t ? " tap" : ""}${b.f ? " down" : ""}" data-i="${b.i}" data-z="bf" style="left:${b.x * 100}%;top:${b.y * 100}%"${zoomAttr(c.n, c.u)}>${b.f ? "" : cardImg(c.n, c.u)}${b.c ? `<span class="badge">${b.c > 0 ? "+" : ""}${b.c}</span>` : ""}${c.tok ? '<span class="tokb">Ficha</span>' : ""}</div>`;
  }).join("") || '<p class="muted bfmsg">Tu campo de batalla: arrastra aquí las cartas de tu mano.</p>';
  $("#hand").innerHTML = G.hand.map(i => `<div class="pc own" data-i="${i}" data-z="hand"${zoomAttr(G.cards[i].n, G.cards[i].u)}>${cardImg(G.cards[i].n, G.cards[i].u)}</div>`).join("");
  $("#hand").style.setProperty("--n", Math.max(G.hand.length, 1));
  const top = z => G[z].length ? G[z][G[z].length - 1] : null, gt = top("gy"), et = top("ex");
  $("#zones").innerHTML = `
    <div class="zone" data-drop="lib" data-zone="lib" title="Pulsa para robar · clic derecho: más opciones"><div class="pc back${G.lib.length ? "" : " empty"}" data-i="${G.lib[0] || ""}" data-z="lib"></div><span>Biblioteca ${G.lib.length}</span></div>
    <div class="zone" data-drop="gy" data-zone="gy" title="Pulsa para verlo">${gt ? `<div class="pc own" data-i="${gt}" data-z="gy"${zoomAttr(G.cards[gt].n)}>${cardImg(G.cards[gt].n)}</div>` : '<div class="pc empty"></div>'}<span>Cementerio ${G.gy.length}</span></div>
    <div class="zone" data-drop="ex" data-zone="ex" title="Pulsa para verlo">${et ? `<div class="pc own" data-i="${et}" data-z="ex"${zoomAttr(G.cards[et].n)}>${cardImg(G.cards[et].n)}</div>` : '<div class="pc empty"></div>'}<span>Exilio ${G.ex.length}</span></div>`;
  $("#cmdz").innerHTML = `<div class="czc">${G.cz.map(i => `<div class="pc own" data-i="${i}" data-z="cz"${zoomAttr(G.cards[i].n)} title="Doble clic para lanzarlo">${cardImg(G.cards[i].n)}${G.tax[i] ? `<span class="badge">+${G.tax[i] * 2}</span>` : ""}</div>`).join("") || '<div class="pc empty"></div>'}</div><span>Zona de mando</span>`;
  const opps = (R.order || []).filter(id => id !== ME.id);
  $("#lifeBox").innerHTML = `
    ${G.dead ? `<div class="ldead">Eliminado: ${esc(G.dead)}</div>` : ""}
    <div class="lrow"><button class="btn sm" data-life="-1">−</button><span class="lnum${G.life <= 0 ? " bad" : ""}">${G.life}</span><button class="btn sm" data-life="1">+</button></div>
    <div class="lsub"><span>Veneno</span><button class="linkbtn" data-poison="-1">−</button><b class="${G.poison >= 10 ? "bad" : ""}">${G.poison}</b><button class="linkbtn" data-poison="1">+</button></div>
    ${opps.map(id => { const n = G.cmdDmg[id] || 0; return `<div class="lsub" title="Daño que te ha hecho el comandante de ${esc(nameOf(id))}"><span>⚔ ${esc(nameOf(id))}</span><button class="linkbtn" data-cdmg="${esc(id)}" data-d="-1">−</button><b class="${n >= 21 ? "bad" : ""}">${n}</b><button class="linkbtn" data-cdmg="${esc(id)}" data-d="1">+</button></div>`; }).join("")}`;
}

/* ===================== interacción con la mesa ===================== */
function bindTable() {
  bindMull();
  $("#passTurn").addEventListener("click", () => {
    if (activeId() !== ME.id) return;
    passTurn();
  });
  $("#untapAll").addEventListener("click", () => { G.bf.forEach(b => b.t = false); addLog("endereza sus permanentes"); changed(); });
  $("#diceBtn").addEventListener("click", e => menu(e, [
    ["Tirar un d6", () => addLog(`tira un d6: ${1 + Math.floor(Math.random() * 6)}`)],
    ["Tirar un d20", () => addLog(`tira un d20: ${1 + Math.floor(Math.random() * 20)}`)],
    ["Lanzar una moneda", () => addLog(`lanza una moneda: ${Math.random() < 0.5 ? "cara" : "cruz"}`)],
  ]));
  $("#tokenBtn").addEventListener("click", () => { $("#tokenDlg").showModal(); $("#tokenQ").focus(); });
  $("#tokenForm").addEventListener("submit", async e => {
    e.preventDefault(); const q = $("#tokenQ").value.trim(); if (!q) return;
    $("#tokenGrid").innerHTML = '<p class="muted small">Buscando…</p>';
    const nq = SF.norm(q), rank = c => (SF.norm(c.name) === nq ? 0 : SF.norm(c.name).startsWith(nq) ? 1 : c.name.includes(" // ") ? 3 : 2);
    const list = (await SF.search(`t:token ${q}`, { order: "name", pages: 1 }).catch(() => [])).sort((x, y) => rank(x) - rank(y));
    $("#tokenGrid").innerHTML = list.slice(0, 40).map(c => `<button class="pvcard" data-tok="${esc(c.name)}" data-tu="${esc(c.img || c.small)}"><img src="${esc(c.small)}" alt="${esc(c.name)}"><span>${esc(c.name)}</span></button>`).join("") || '<p class="muted small">No hay fichas con ese nombre (escríbelo en inglés).</p>';
  });
  $("#tokenGrid").addEventListener("click", e => {
    const b = e.target.closest("[data-tok]"); if (!b || !G) return;
    createToken(b.dataset.tok, b.dataset.tu); $("#tokenDlg").close();
  });
  document.querySelectorAll("dialog [data-close]").forEach(b => b.addEventListener("click", () => b.closest("dialog").close()));
  $("#logToggle").addEventListener("click", () => $("#tgrid").classList.toggle("nolog"));
  $("#leaveGame").addEventListener("click", () => {
    if (G && !confirm("¿Salir de la partida? Si vuelves a entrar con el mismo código, recuperas tu mesa.")) return;
    leaveRoom();
  });
  $("#chatForm").addEventListener("submit", e => { e.preventDefault(); const t = $("#chatIn").value.trim(); if (t) addLog(t, true); $("#chatIn").value = ""; });

  $("#lifeBox").addEventListener("click", e => {
    if (!G) return;
    const l = e.target.closest("[data-life]"), p = e.target.closest("[data-poison]"), cd = e.target.closest("[data-cdmg]");
    if (l) { G.life += +l.dataset.life; lifeLog(); checkDeath(); changed(); }
    if (p) { G.poison = Math.max(0, G.poison + +p.dataset.poison); addLog(`tiene ${G.poison} contadores de veneno`); checkDeath(); changed(); }
    if (cd) {
      const id = cd.dataset.cdmg, d = +cd.dataset.d, now = Math.max(0, (G.cmdDmg[id] || 0) + d);
      if (now !== (G.cmdDmg[id] || 0)) { G.cmdDmg[id] = now; G.life -= d; addLog(`recibe daño de comandante de ${nameOf(id)}: ${now} en total (vidas ${G.life})`); checkDeath(); changed(); }
    }
  });

  // Ver cementerio/exilio de un rival.
  $("#opps").addEventListener("click", e => {
    const b = e.target.closest("[data-ozone]"); if (!b) return;
    const p = pubs.get(b.dataset.oid); if (!p) return;
    viewer(`${b.dataset.ozone === "gy" ? "Cementerio" : "Exilio"} de ${p.name}`, [...p[b.dataset.ozone]].reverse().map(n => ({ n })), null);
  });

  // Zonas: clic en la biblioteca roba; en cementerio/exilio abre el visor.
  $("#zones").addEventListener("click", e => {
    if (!G || e.defaultPrevented) return;
    const z = e.target.closest("[data-zone]"); if (!z) return;
    if (z.dataset.zone === "lib") draw(1);
    else if (z.dataset.zone === "gy" || z.dataset.zone === "ex") openZone(z.dataset.zone);
  });

  // Clic en una carta del campo: girar/enderezar.
  $("#bf").addEventListener("click", e => {
    if (justDragged) return;
    const el = e.target.closest(".pc[data-i]"); if (!el || !G) return;
    const b = G.bf.find(x => x.i === el.dataset.i); if (!b) return;
    b.t = !b.t; addLog(`${b.t ? "gira" : "endereza"} ${b.f ? "una carta boca abajo" : G.cards[b.i].n}`); changed();
  });
  $("#hand").addEventListener("dblclick", e => { const el = e.target.closest(".pc[data-i]"); if (el && G) move(el.dataset.i, "bf"); });
  $("#cmdz").addEventListener("dblclick", e => { const el = e.target.closest('.pc[data-z="cz"]'); if (el && G) move(el.dataset.i, "bf"); });

  // Menú contextual (clic derecho o pulsación larga).
  document.addEventListener("contextmenu", e => {
    if ($("#tableView").hidden || !G) return;
    const el = e.target.closest(".pc[data-i]"), z = e.target.closest("[data-zone]");
    if (el && el.dataset.i && el.dataset.z !== "lib") { e.preventDefault(); cardMenu(e, el.dataset.i); return; }
    if (z && z.dataset.zone === "lib") { e.preventDefault(); libMenu(e); return; }
    if (z && (z.dataset.zone === "gy" || z.dataset.zone === "ex")) { e.preventDefault(); openZone(z.dataset.zone); }
  });
  document.addEventListener("click", e => { if (!e.target.closest("#cmenu")) hideMenu(); });
  addEventListener("keydown", e => { if (e.key === "Escape") hideMenu(); });
  addEventListener("keydown", onKey);
  $("#keysBtn").addEventListener("click", () => $("#keysDlg").showModal());
  // La carta que tienes debajo del ratón (para los atajos de teclado).
  document.addEventListener("pointerover", e => { const el = e.target.closest(".pc.own[data-i]"); if (el) hoverI = el.dataset.i; });
  document.addEventListener("pointerout", e => { const el = e.target.closest(".pc.own[data-i]"); if (el && (!e.relatedTarget || !el.contains(e.relatedTarget))) hoverI = null; });

  bindDrag(); bindZoom();
}
/* ===================== atajos de teclado ===================== */
let hoverI = null;
const keyName = e => (e.key === "Delete" || e.key === "Backspace" ? "Supr" : e.key === "=" || e.key === "+" ? "+" : e.key === "-" || e.key === "_" ? "-" : e.key.length === 1 ? e.key.toUpperCase() : e.key);
// Atajos sin carta: con el ratón en cualquier sitio de la mesa.
const TABLE_KEYS = {
  R: () => draw(1),
  B: () => { shuffle(G.lib); addLog("baraja su biblioteca"); changed(); },
  E: () => $("#untapAll").click(),
  P: () => { if (activeId() === ME.id) $("#passTurn").click(); },
  F: () => $("#tokenBtn").click(),
  D: () => addLog(`tira un d6: ${1 + Math.floor(Math.random() * 6)}`),
  L: () => $("#logToggle").click(),
  "?": () => $("#keysDlg").showModal(),
};
function onKey(e) {
  if ($("#tableView").hidden || !G || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.target.closest && e.target.closest("input, textarea, select, [contenteditable]")) return;
  if (document.querySelector("dialog[open]") || !$("#mull").hidden || !$("#endBox").hidden) return;
  const k = keyName(e);
  if (hoverI && G.cards[hoverI] && where(hoverI)) {
    const act = cardActs(hoverI).find(a => a && a.key === k);
    if (act) {
      e.preventDefault(); hideMenu();
      const i = hoverI;
      if (!["G", "+", "-", "V", "C"].includes(k)) hoverI = null; // la carta se va: el siguiente atajo no debe moverla otra vez
      act.run(i); return;
    }
  }
  const t = TABLE_KEYS[k];
  if (t) { e.preventDefault(); hideMenu(); t(); }
}
/* ===================== derrota y victoria ===================== */
// Pierdes con 0 vidas o menos, 10 contadores de veneno o 21 de daño de un mismo comandante.
const isDead = id => (id === ME.id ? !!(G && G.dead) : !!(pubs.get(id) || {}).dead);
function deathReason() {
  if (G.life <= 0) return "sin vidas";
  if (G.poison >= 10) return "10 contadores de veneno";
  const id = Object.keys(G.cmdDmg).find(k => G.cmdDmg[k] >= 21);
  return id ? `21 de daño del comandante de ${nameOf(id)}` : "";
}
let endSeen = "", endKey = "";
function checkDeath() {
  if (!G || G.dead) return;
  const why = deathReason(); if (!why) return;
  G.dead = why; endSeen = "";
  addLog(`ha perdido la partida (${why})`);
  if (activeId() === ME.id) setTimeout(passTurn, 50); // si era su turno, pasa al siguiente
}
function revive() {
  if (!G || !G.dead) return;
  G.dead = null; G.life = Math.max(G.life, 1); G.poison = Math.min(G.poison, 9);
  Object.keys(G.cmdDmg).forEach(k => { G.cmdDmg[k] = Math.min(G.cmdDmg[k], 20); });
  addLog(`vuelve a la partida (había sido un error) con ${G.life} vidas`);
  changed();
}
// Pasa el turno al siguiente jugador que siga vivo.
function passTurn() {
  const n = R.order.length; let t = R.turn + 1;
  for (let k = 0; k < n - 1 && isDead(R.order[t % n]); k++) t++;
  R = { ...R, v: R.v + 1, turn: t, turnNo: R.turnNo + 1 };
  addLog(`pasa el turno a ${nameOf(activeId())}`);
  net.send("room", { R }); onRoomState();
}
// Cartel de «Has perdido» (solo para ti) o de «X gana la partida» (para todos).
function renderEnd() {
  const box = $("#endBox"), order = R.order || [];
  const alive = order.filter(id => !isDead(id));
  let key = "", html = "";
  if (order.length > 1 && alive.length === 1) {
    const w = alive[0];
    key = "win:" + w;
    html = `<div class="ebox win"><div class="etrophy">🏆</div><h2>${w === ME.id ? "¡Has ganado!" : `${esc(nameOf(w))} gana la partida`}</h2>
      <p class="muted">${w === ME.id ? "Eres el último en pie." : "Es el último jugador en pie."}</p>
      <div class="row" style="justify-content:center"><button class="btn primary" data-end="close">Ver la mesa</button>${G && G.dead ? '<button class="btn" data-end="revive">Ha sido un error: volver</button>' : ""}</div></div>`;
  } else if (G && G.dead) {
    key = "dead:" + G.dead;
    html = `<div class="ebox"><div class="etrophy">💀</div><h2>Has perdido</h2><p class="muted">${esc(G.dead[0].toUpperCase() + G.dead.slice(1))}. Puedes seguir mirando la partida.</p>
      <div class="row" style="justify-content:center"><button class="btn primary" data-end="close">Seguir mirando</button><button class="btn" data-end="revive">Ha sido un error: volver</button></div></div>`;
  }
  endKey = key;
  if (!key) { box.hidden = true; endSeen = ""; return; }
  if (endSeen === key) { box.hidden = true; return; }
  box.innerHTML = html; box.hidden = false;
}
$("#endBox").addEventListener("click", e => {
  const b = e.target.closest("[data-end]"); if (!b) return;
  if (b.dataset.end === "revive") { endSeen = ""; revive(); return; }
  endSeen = endKey; $("#endBox").hidden = true;
});
function lifeLog() { clearTimeout(lifeLog.t); lifeLog.t = setTimeout(() => G && addLog(`tiene ${G.life} vidas`), 900); }

function createToken(name, u, copy) {
  const i = "t" + (++G.n); G.cards[i] = { n: name, u, tok: 1 };
  const pos = freeSpot(G.cards[i]); G.bf.push({ i, x: pos.x, y: pos.y, t: false, f: false, c: 0 });
  addLog(copy ? `crea una copia de ${name}` : `crea una ficha: ${name}`); changed();
}

// Acciones sobre una carta mía. `key`: su atajo de teclado (con el ratón encima de la carta).
// `when(z, c, b)`: si se puede en la zona donde está (b = la carta en el campo, si está ahí).
const bfOf = i => G.bf.find(x => x.i === i);
const nameOrHidden = (i, b) => (b && b.f ? "una carta boca abajo" : G.cards[i].n);
const CARD_ACTS = [
  { key: "J", label: "Al campo", when: z => z !== "bf", run: i => move(i, "bf") },
  { key: "", label: "Al campo boca abajo", when: z => z === "hand", run: i => move(i, "bf", { faceDown: true }) },
  { key: "G", label: b => (b.t ? "Enderezar" : "Girar"), when: (z, c, b) => !!b, run: i => { const b = bfOf(i); b.t = !b.t; addLog(`${b.t ? "gira" : "endereza"} ${nameOrHidden(i, b)}`); changed(); } },
  { key: "+", label: "+1 contador", when: (z, c, b) => !!b, run: i => { const b = bfOf(i); b.c = (b.c || 0) + 1; addLog(`pone un contador en ${nameOrHidden(i, b)} (${b.c})`); changed(); } },
  { key: "-", label: "−1 contador", when: (z, c, b) => !!b, run: i => { const b = bfOf(i); b.c = (b.c || 0) - 1; addLog(`quita un contador de ${nameOrHidden(i, b)} (${b.c})`); changed(); } },
  { key: "V", label: b => (b.f ? "Poner boca arriba" : "Poner boca abajo"), when: (z, c, b) => !!b, run: i => { const b = bfOf(i); b.f = !b.f; addLog(b.f ? `pone ${G.cards[i].n} boca abajo` : `pone boca arriba ${G.cards[i].n}`); changed(); } },
  { key: "C", label: "Copiar (crea una ficha igual)", when: (z, c, b) => !(b && b.f), run: i => { const c = G.cards[i]; createToken(c.n, c.u || img(c.n, "img"), true); } },
  null,
  { key: "M", label: "A la mano", when: z => z !== "hand", run: i => move(i, "hand") },
  { key: "Supr", label: "Al cementerio", when: z => z !== "gy", run: i => move(i, "gy", { force: true }) },
  { key: "X", label: "Al exilio", when: z => z !== "ex", run: i => move(i, "ex", { force: true }) },
  { key: "A", label: "Encima de la biblioteca", when: () => true, run: i => move(i, "lib") },
  { key: "Z", label: "Debajo de la biblioteca", when: () => true, run: i => move(i, "lib", { bottom: true }) },
  { key: "", label: "A la zona de mando", when: (z, c) => c.cmd && z !== "cz", run: i => move(i, "cz") },
  { key: "", label: "Quitar un impuesto", when: (z, c) => c.cmd && z === "cz" && G.tax[c.i], run: i => { G.tax[i]--; changed(); } },
  { key: "", label: "Enseñar a los demás", when: z => z === "hand", run: i => addLog(`enseña ${G.cards[i].n} de su mano`) },
];
function cardActs(i) {
  const z = where(i), c = { ...G.cards[i], i }, b = bfOf(i);
  return CARD_ACTS.filter(a => !a || a.when(z, c, b));
}
function cardMenu(e, i) {
  const b = bfOf(i);
  const items = cardActs(i).map(a => a && [typeof a.label === "function" ? a.label(b) : a.label, () => a.run(i), a.key]);
  menu(e, items.filter((x, k, arr) => x || (k > 0 && arr[k - 1] && k < arr.length - 1)));
}
function libMenu(e) {
  const ask = (q, def) => { const n = parseInt(prompt(q, def), 10); return n > 0 ? Math.min(n, 99) : 0; };
  menu(e, [
    ["Robar una", () => draw(1)],
    ["Robar X…", () => { const n = ask("¿Cuántas cartas robas?", "2"); if (n) draw(n); }],
    ["Barajar", () => { shuffle(G.lib); addLog("baraja su biblioteca"); changed(); }],
    null,
    ["Buscar en la biblioteca", () => { addLog("busca en su biblioteca"); openZone("lib"); }],
    ["Mirar las X de arriba…", () => { const n = ask("¿Cuántas miras?", "3"); if (n) { addLog(`mira las ${n} cartas de arriba de su biblioteca`); openZone("lib", n); } }],
    ["Moler X…", () => { const n = ask("¿Cuántas mueles?", "1"); for (let k = 0; k < n && G.lib.length; k++) move(G.lib[0], "gy"); }],
    ["Revelar la de arriba", () => { if (G.lib[0]) addLog(`revela la carta de arriba de su biblioteca: ${G.cards[G.lib[0]].n}`); }],
    ["Exiliar la de arriba", () => { if (G.lib[0]) move(G.lib[0], "ex"); }],
  ]);
}
// Visor de una zona propia (con acciones) o ajena (solo mirar).
function openZone(z, topN) {
  const ids = z === "lib" ? (topN ? G.lib.slice(0, topN) : [...G.lib]) : [...G[z]].reverse();
  const title = z === "lib" ? (topN ? `Las ${topN} de arriba de tu biblioteca` : "Tu biblioteca") : z === "gy" ? "Tu cementerio" : "Tu exilio";
  viewer(title, ids.map(i => ({ n: G.cards[i].n, i })), z, z === "lib" && !topN ? "Al cerrar se baraja la biblioteca." : (topN ? "Pulsa una carta para moverla; las demás se quedan arriba en este orden." : ""));
}
function viewer(title, list, zone, note = "") {
  const dlg = $("#viewer");
  $("#vTitle").textContent = title; $("#vNote").textContent = note;
  $("#vGrid").innerHTML = list.length ? list.map(c => `<button class="pvcard"${c.i ? ` data-vi="${c.i}"` : ""}${zoomAttr(c.n)}>${cardImg(c.n)}<span>${esc(c.n)}</span></button>`).join("") : '<p class="muted small">No hay cartas.</p>';
  dlg.dataset.zone = zone || ""; dlg.dataset.shuffle = note.startsWith("Al cerrar") ? "1" : "";
  if (!dlg.open) dlg.showModal();
}
$("#viewer").addEventListener("close", () => {
  const d = $("#viewer");
  if (d.dataset.shuffle && G) { shuffle(G.lib); addLog("baraja su biblioteca"); changed(); }
  d.dataset.shuffle = "";
});
$("#vGrid").addEventListener("click", e => {
  const b = e.target.closest("[data-vi]"); if (!b || !G) return;
  const i = b.dataset.vi, from = where(i);
  const after = () => { b.remove(); };
  const items = [["A la mano", () => { move(i, "hand"); after(); }], ["Al campo", () => { move(i, "bf"); after(); }]];
  if (from !== "gy") items.push(["Al cementerio", () => { move(i, "gy", { force: true }); after(); }]);
  if (from !== "ex") items.push(["Al exilio", () => { move(i, "ex", { force: true }); after(); }]);
  if (from !== "lib") items.push(["Encima de la biblioteca", () => { move(i, "lib"); after(); }]);
  items.push(["Debajo de la biblioteca", () => { move(i, "lib", { bottom: true }); after(); }]);
  menu(e, items, $("#viewer"));
});

/* ===================== menú ===================== */
let menuHost = null;
function menu(e, items, inside) {
  e.preventDefault(); e.stopPropagation();
  const m = $("#cmenu");
  if (inside && m.parentElement !== inside) inside.appendChild(m);
  if (!inside && m.parentElement !== document.body) document.body.appendChild(m);
  menuHost = items;
  m.innerHTML = items.map((it, k) => it ? `<button data-mk="${k}"><span>${esc(it[0])}</span>${it[2] ? `<kbd>${esc(it[2])}</kbd>` : ""}</button>` : "<hr>").join("");
  m.hidden = false;
  const r = m.getBoundingClientRect(), x = Math.min(e.clientX, innerWidth - r.width - 8), y = Math.min(e.clientY, innerHeight - r.height - 8);
  m.style.left = Math.max(8, x) + "px"; m.style.top = Math.max(8, y) + "px";
}
function hideMenu() { $("#cmenu").hidden = true; }
$("#cmenu").addEventListener("click", e => {
  const b = e.target.closest("[data-mk]"); if (!b) return;
  e.stopPropagation(); hideMenu();
  const it = menuHost && menuHost[+b.dataset.mk]; if (it) it[1]();
});

/* ===================== arrastrar ===================== */
let justDragged = false;
function bindDrag() {
  let st = null;
  document.addEventListener("pointerdown", e => {
    if (e.button !== 0 || !G || $("#tableView").hidden) return;
    const el = e.target.closest(".pc[data-i]"); if (!el || !el.dataset.i || !el.closest("#zones, #hand, #bf, #cmdz")) return;
    const r = el.getBoundingClientRect();
    st = { el, i: el.dataset.i, z: el.dataset.z, x0: e.clientX, y0: e.clientY, dx: e.clientX - r.left, dy: e.clientY - r.top, w: r.width, h: r.height, on: false, ghost: null };
  });
  document.addEventListener("pointermove", e => {
    if (!st) return;
    if (!st.on) {
      if (Math.hypot(e.clientX - st.x0, e.clientY - st.y0) < 6) return;
      st.on = true; dragging = true; hideZoom();
      const g = st.el.cloneNode(true); g.className = "pc ghost" + (st.el.classList.contains("tap") ? " tap" : "");
      Object.assign(g.style, { width: st.w + "px", height: st.h + "px", left: "0", top: "0" });
      document.body.appendChild(g); st.ghost = g; st.el.style.opacity = ".25";
    }
    st.ghost.style.transform = `translate(${e.clientX - st.dx}px, ${e.clientY - st.dy}px)${st.el.classList.contains("tap") ? " rotate(90deg)" : ""}`;
    document.querySelectorAll(".dropover").forEach(x => x.classList.remove("dropover"));
    const t = dropAt(e); if (t) t.classList.add("dropover");
  });
  const end = e => {
    if (!st) return;
    const s = st; st = null;
    if (!s.on) return;
    s.ghost.remove(); s.el.style.opacity = "";
    document.querySelectorAll(".dropover").forEach(x => x.classList.remove("dropover"));
    dragging = false; justDragged = true; setTimeout(() => { justDragged = false; }, 50);
    const t = e.type === "pointerup" ? dropAt(e) : null;
    if (t) {
      const to = t.dataset.drop;
      if (s.z === "lib" && to === "hand") draw(1);
      else if (to === "bf") {
        const r = $("#bf").getBoundingClientRect();
        const bw = Math.min(s.w, s.h) / r.width, bh = Math.max(s.w, s.h) / r.height; // tamaño de una carta del campo (aprox.)
        const x = Math.max(0, Math.min(1 - Math.min(bw, 0.06), (e.clientX - s.dx - r.left) / r.width)), y = Math.max(0, Math.min(1 - Math.min(bh, 0.3), (e.clientY - s.dy - r.top) / r.height));
        const b = G.bf.find(q => q.i === s.i);
        if (b) { b.x = x; b.y = y; changed(); }
        else move(s.i, "bf", { x, y });
      } else if (to !== s.z) move(s.i, to);
    }
    if (pendingRender) { pendingRender = false; }
    render();
  };
  document.addEventListener("pointerup", end);
  document.addEventListener("pointercancel", end);
}
function dropAt(e) {
  const el = document.elementFromPoint(e.clientX, e.clientY);
  return el && el.closest("[data-drop]");
}

/* ===================== zoom al pasar el ratón ===================== */
function bindZoom() {
  const z = $("#pzoom");
  document.addEventListener("pointerover", e => {
    if (dragging || e.pointerType === "touch") return;
    const el = e.target.closest("[data-zoom]"); if (!el) return;
    zoomEl = el;
    const c = SF.cached(el.dataset.zoom), src = el.dataset.zu || (c && c.img);
    if (!src) return;
    z.querySelector("img").src = src; z.hidden = false;
    z.classList.toggle("left", e.clientX > innerWidth / 2);
  });
  document.addEventListener("pointerout", e => { if (e.target.closest("[data-zoom]")) hideZoom(); });
}
let zoomEl = null;
function hideZoom() { zoomEl = null; $("#pzoom").hidden = true; }

// Si la pestaña se cierra, al menos se guarda la mesa (la recuperas entrando de nuevo en la sala).
addEventListener("pagehide", save);
