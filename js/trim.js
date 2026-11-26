// «Ajustar a 100»: qué cartas quitar (y por qué) cuando el mazo tiene más de 100.
// Sin IA: mira el esqueleto (tierras, ramp, robo, interacción, barridos), los datos de EDHREC de tu comandante,
// los combos que ya tiene el mazo y el coste. Elige de una en una, recalculando el esqueleto tras cada corte,
// para no dejar el mazo sin ramp por cortar cinco cartas de ramp seguidas.
import * as A from "./analysis.js";

const { F } = A;
const ROLES = [
  { k: "ramp", flag: F.RAMP, label: "ramp", lo: 9, t: 10 },
  { k: "draw", flag: F.DRAW, label: "robo", lo: 9, t: 10 },
  { k: "interaction", flag: F.REM | F.COUNTER, label: "interacción", lo: 7, t: 9 },
  { k: "wipes", flag: F.WIPE, label: "barridos", lo: 2, t: 3 },
];
const LANDS = { lo: 35, t: 37, hi: 38 };
const pct = v => Math.round(v * 100) + " %";

// deck: { cmds, cards: Map(clave → { c, q }), illegal: [c] }
// opts: { edh: Map de EDHREC (o null), words: palabras del tema, combos: { included: [{ cards: [{ name }] }] } (o null), extra: candidatas de más }
// → { over, picks: [{ c, q, motivo, forced }], alts: [...] }  (picks: las que se proponen; alts: otras posibles)
export function trimPlan(deck, { edh = null, words = [], combos = null, extra = 6 } = {}) {
  const s = A.analyze(deck);
  const over = s.total - 100;
  if (over <= 0) return { over, picks: [], alts: [] };

  const cnt = { lands: s.lands, ramp: s.ramp, draw: s.draw, interaction: s.interaction, wipes: s.wipes };
  const comboNames = new Set();
  for (const v of (combos && combos.included) || []) for (const c of v.cards || []) comboNames.add(A.key(c));
  const illegal = new Set((deck.illegal || []).map(A.key));
  const offColor = new Set(s.offColor.map(A.key));

  // Unidades que se pueden cortar: una por copia (las básicas pueden tener muchas).
  const left = new Map(); // clave → copias que quedan
  for (const [k, e] of deck.cards) left.set(k, e.q);
  const entry = k => deck.cards.get(k);

  // Primero lo que no puede estar: fuera de colores, prohibidas, copias repetidas.
  const forced = [];
  for (const [k, e] of deck.cards) {
    const c = e.c;
    let why = "";
    if (offColor.has(k)) why = "Está fuera de la identidad de color de tu comandante.";
    else if (illegal.has(k)) why = "No es legal en Commander.";
    if (why) { forced.push({ c, q: e.q, motivo: why, forced: true }); left.set(k, 0); continue; }
    if (e.q > 1 && !A.isBasic(c) && !/any number of cards named/i.test(c.text)) {
      forced.push({ c, q: e.q - 1, motivo: `Está ${e.q} veces y en Commander solo se permite una copia.`, forced: true });
      left.set(k, 1);
    }
  }
  const unitsOf = x => x.q;
  let chosenUnits = forced.reduce((n, x) => n + unitsOf(x), 0);
  // Lo forzado también baja el esqueleto.
  for (const x of forced) applyCut(x.c, x.q);

  function applyCut(c, q) {
    if (A.isLand(c)) { cnt.lands -= q; return; }
    for (const r of ROLES) if (c.flags & r.flag) cnt[r.k] -= q;
  }
  // Cuánto conviene cortar una carta (más alto = mejor candidata) y el porqué.
  function rate(c) {
    const parts = [];
    // Alto = encaja poco con el comandante. Las básicas no tienen ranking: solo cuenta si sobran tierras.
    let sc = A.isBasic(c) ? 2.4 : A.fitScore(c, { edh, words });
    const e = A.edhOf(edh, c);
    if (A.isLand(c)) {
      const surplus = cnt.lands - LANDS.t;
      if (cnt.lands - 1 < LANDS.lo) sc -= 6;
      else if (surplus > 0) { sc += 1.2 + 0.4 * surplus; parts.push(`Tienes ${cnt.lands} tierras; con ${LANDS.lo}–${LANDS.hi} va bien.`); }
      else sc -= 1.5;
      if (A.isBasic(c)) sc += 0.4; // entre tierras, mejor una básica que una que hace algo
    } else {
      let fills = false;
      for (const r of ROLES) {
        if (!(c.flags & r.flag)) continue;
        fills = true;
        if (cnt[r.k] - 1 < r.lo) sc -= 2.5;
        else if (cnt[r.k] > r.t + 1) { sc += 0.5; parts.push(`Te sobra ${r.label}: tienes ${cnt[r.k]} y con ${r.t} basta.`); }
        else sc -= 0.6;
      }
      if (!fills) sc += 0.3; // no cubre ninguna parte del esqueleto
      if (c.cmc >= 6) { sc += 0.25 * (c.cmc - 5); parts.push(`Es cara (cuesta ${c.cmc}).`); }
      if (c.gc) sc -= 0.4;
    }
    if (comboNames.has(A.key(c))) sc -= 6;
    // EDHREC: el motivo más claro.
    if (!A.isLand(c) || !A.isBasic(c)) {
      if (e) {
        if (e.synergy < 0) parts.unshift(`Sinergia negativa con tu comandante (en el ${pct(e.inclusion)} de sus mazos).`);
        else if (e.inclusion < 0.1) parts.unshift(`Solo la juega el ${pct(e.inclusion)} de los mazos de tu comandante.`);
      } else if (edh && edh.size) parts.unshift("Casi nadie la juega con tu comandante.");
      else if (c.rank >= 3000) parts.unshift(`Poco jugada en Commander (${c.rank >= 99999 ? "sin ranking" : "#" + c.rank} en EDHREC).`);
    }
    if (!parts.length) parts.push(e ? `Es de las que menos encajan: está en el ${pct(e.inclusion)} de los mazos de tu comandante.` : "Es de las que menos aportan al plan del mazo.");
    return { sc, motivo: parts.slice(0, 2).join(" ") };
  }

  const picks = [...forced];
  const need = () => over - chosenUnits;
  // Elige de una en una; tras cada corte cambia el esqueleto y se vuelve a puntuar.
  const pickOne = () => {
    let best = null;
    for (const [k, n] of left) {
      if (n <= 0) continue;
      const c = entry(k).c, r = rate(c);
      if (!best || r.sc > best.sc) best = { k, c, ...r };
    }
    return best;
  };
  while (need() > 0) {
    const b = pickOne(); if (!b) break;
    left.set(b.k, left.get(b.k) - 1); applyCut(b.c, 1); chosenUnits++;
    const prev = picks.find(x => !x.forced && A.key(x.c) === b.k);
    if (prev) { prev.q++; if (A.isLand(b.c)) prev.motivo = b.motivo; } else picks.push({ c: b.c, q: 1, motivo: b.motivo, forced: false });
  }
  // Tierras: el motivo con la cuenta completa (cuántas tienes y en cuántas te quedas).
  const landCuts = picks.filter(x => !x.forced && A.isLand(x.c)).reduce((n, x) => n + x.q, 0);
  if (landCuts) picks.filter(x => !x.forced && A.isLand(x.c)).forEach(x => {
    x.motivo = `Tienes ${s.lands} tierras; quitando ${landCuts} te quedas en ${s.lands - landCuts} (lo normal son ${LANDS.lo}–${LANDS.hi}).`;
  });
  // Otras candidatas (por si prefieres quitar otra): las siguientes mejor puntuadas, sin marcar.
  const alts = [];
  const taken = new Set(picks.filter(x => !A.isBasic(x.c)).map(x => A.key(x.c)));
  const pool = [...left].filter(([k, n]) => n > 0 && !taken.has(k)).map(([k]) => ({ c: entry(k).c, ...rate(entry(k).c) }))
    .filter(x => !A.isBasic(x.c)).sort((a, b) => b.sc - a.sc).slice(0, extra);
  for (const x of pool) alts.push({ c: x.c, q: 1, motivo: x.motivo, forced: false });
  return { over, picks, alts };
}
