// Lectura de listas, estadísticas del mazo y generador automático. Sin red: trabaja con objetos de carta.
import { norm, F } from "./scryfall.js";
export { F };

export const BASICS = { W: "Plains", U: "Island", B: "Swamp", R: "Mountain", G: "Forest", C: "Wastes" };
const BASIC_SET = new Set(["plains", "island", "swamp", "mountain", "forest", "wastes",
  "snow-covered plains", "snow-covered island", "snow-covered swamp", "snow-covered mountain", "snow-covered forest", "snow-covered wastes"]);
export const isBasic = c => BASIC_SET.has(norm(c.name));
export const isLand = c => /\bLand\b/.test(c.type);
export const subsetCI = (ci, of) => [...ci].every(ch => of.includes(ch));
export const ciUnion = cards => "WUBRG".split("").filter(ch => cards.some(c => c.ci.includes(ch))).join("");
export const key = c => norm(c.name);

export function parseList(text) {
  const lines = text.split(/\r?\n/); let section = "main";
  const main = [], cmd = [], blocks = [[]];
  for (const raw of lines) {
    let l = raw.trim();
    if (!l) { blocks.push([]); continue; }
    const low = l.toLowerCase().replace(/^[\/#\s]+/, "").replace(/[:\s]+$/, "").replace(/\s*\(\d+\)$/, "");
    if (/^(commanders?|comandantes?)$/.test(low)) { section = "cmd"; continue; }
    if (/^(deck|mazo|main|mainboard|main deck|library|creatures?|lands?|instants?|sorcery|sorceries|artifacts?|enchantments?|planeswalkers?|criaturas|tierras)$/.test(low)) { section = "main"; continue; }
    if (/^(sideboard|maybeboard|considering|tokens?|companion|banquillo)$/.test(low)) { section = "skip"; continue; }
    const isC = /\*cmdr\*|\[commander\]/i.test(l);
    l = l.replace(/\*cmdr\*|\*f\*|\*e\*|\[[^\]]*\]|\^[^^]*\^/gi, "").trim();
    let qty = 1, name = l; const m = l.match(/^(\d+)\s*x?\s+(.+)$/i); if (m) { qty = +m[1]; name = m[2]; }
    name = name.replace(/\s+\([A-Za-z0-9]{2,6}\)(\s+[\w\-★]+)?\s*$/, "").replace(/\s+#\S+$/, "").trim();
    if (section === "skip" || !name) continue;
    const e = { qty, name };
    if (section === "cmd" || isC) cmd.push(e); else { main.push(e); blocks[blocks.length - 1].push(e); }
  }
  const bs = blocks.filter(b => b.length);
  return { main, cmd, lastBlock: bs.length > 1 ? bs[bs.length - 1] : null };
}

export function deckToText(d) {
  const lines = [];
  if (d.cmds.length) { lines.push("Commander"); d.cmds.forEach(c => lines.push("1 " + c.name)); lines.push(""); lines.push("Deck"); }
  [...d.cards.values()].sort((a, b) => sortKey(a.c) - sortKey(b.c) || a.c.name.localeCompare(b.c.name)).forEach(e => lines.push(e.q + " " + e.c.name));
  return lines.join("\n");
}

const GROUPS = [["Criaturas", /Creature/], ["Planeswalkers", /Planeswalker/], ["Batallas", /Battle/], ["Instantáneos", /Instant/], ["Conjuros", /Sorcery/], ["Artefactos", /Artifact/], ["Encantamientos", /Enchantment/], ["Otros", /./]];
export const ORDER = ["Criaturas", "Planeswalkers", "Batallas", "Instantáneos", "Conjuros", "Artefactos", "Encantamientos", "Otros", "Tierras"];
export function groupOf(c) { if (isLand(c)) return "Tierras"; for (const [g, re] of GROUPS) if (re.test(c.type)) return g; return "Otros"; }
const sortKey = c => ORDER.indexOf(groupOf(c)) * 100 + Math.min(99, c.cmc);

export const TARGETS = [
  { k: "lands", label: "Tierras", lo: 34, hi: 39, t: 37 },
  { k: "ramp", label: "Ramp", lo: 9, t: 10 },
  { k: "draw", label: "Robo", lo: 9, t: 10 },
  { k: "interaction", label: "Removal", lo: 7, t: 9 },
  { k: "wipes", label: "Barridos", lo: 2, t: 3 },
];
export const BRK = { 1: "Exhibition", 2: "Core", 3: "Upgraded", 4: "Optimized", 5: "cEDH" };

// `combos` (opcional): resultado de Combos.findCombos para este mazo; los combos cuentan para el bracket.
export function analyze(d, { combos = null } = {}) {
  const ci = ciUnion(d.cmds);
  const s = { ci, total: d.cmds.length, lands: 0, ramp: 0, draw: 0, removal: 0, wipes: 0, tutors: 0, counters: 0, gc: [],
    curve: [0, 0, 0, 0, 0, 0, 0, 0], types: {}, pips: { W: 0, U: 0, B: 0, R: 0, G: 0 }, price: 0, usd: 0, eur: 0, cmcSum: 0, nonland: 0, ranks: [], offColor: [], dupes: [] };
  d.cmds.forEach(c => { s.price += c.price; s.usd += c.usd || 0; s.eur += c.eur || 0; if (c.gc) s.gc.push(c); });
  for (const { c, q } of d.cards.values()) {
    s.total += q; s.price += c.price * q; s.usd += (c.usd || 0) * q; s.eur += (c.eur || 0) * q;
    if (q > 1 && !isBasic(c) && !/any number of cards named/i.test(c.text)) s.dupes.push(c);
    if (d.cmds.length && !subsetCI(c.ci, ci)) s.offColor.push(c);
    const g = groupOf(c); s.types[g] = (s.types[g] || 0) + q;
    if (isLand(c)) { s.lands += q; if (!isBasic(c)) s.ranks.push(c.rank); continue; }
    s.nonland += q; s.cmcSum += c.cmc * q; s.curve[Math.min(7, Math.floor(c.cmc))] += q; s.ranks.push(c.rank);
    const f = c.flags;
    if (f & F.RAMP) s.ramp += q; if (f & F.DRAW) s.draw += q; if (f & F.REM) s.removal += q; if (f & F.WIPE) s.wipes += q;
    if (f & F.TUTOR) s.tutors += q; if (f & F.COUNTER) s.counters += q; if (c.gc) s.gc.push(c);
    for (const m of (c.cost.split(" // ")[0].match(/\{[^}]+\}/g) || [])) for (const ch of "WUBRG") if (m.includes(ch)) s.pips[ch] += q;
  }
  s.interaction = s.removal + s.counters;
  s.avgCmc = s.nonland ? s.cmcSum / s.nonland : 0;
  s.ranks.sort((a, b) => a - b); s.medRank = s.ranks.length ? s.ranks[Math.floor(s.ranks.length / 2)] : 99999;
  const near = (v, lo, hi) => v >= lo && v <= hi ? 1 : Math.max(0, 1 - Math.min(Math.abs(v - lo), Math.abs(v - hi)) / 8);
  let sc = 15 * near(s.lands, 35, 39);
  sc += 15 * Math.min(1, s.ramp / 10) + 15 * Math.min(1, s.draw / 10) + 15 * Math.min(1, s.interaction / 9) + 5 * Math.min(1, s.wipes / 2);
  sc += 10 * Math.max(0, Math.min(1, (4.2 - s.avgCmc) / 1.2));
  sc += 25 * Math.max(0, Math.min(1, (Math.log10(9000) - Math.log10(Math.max(150, s.medRank))) / (Math.log10(9000) - Math.log10(400))));
  if (s.total !== 100) sc -= 5;
  s.score = Math.round(Math.max(0, Math.min(100, sc)));
  s.grade = s.score >= 90 ? "A+" : s.score >= 82 ? "A" : s.score >= 75 ? "B+" : s.score >= 67 ? "B" : s.score >= 58 ? "C+" : s.score >= 50 ? "C" : "D";
  const gc = s.gc.length;
  s.bracket = gc === 0 && s.tutors <= 3 ? 2 : gc <= 3 ? 3 : (gc >= 7 && s.avgCmc < 2.6 && s.tutors >= 5 ? 5 : 4);
  if (combos) {
    const inf = v => v.produces.some(p => /infinite|win the game|lose the game/i.test(p));
    s.combos = combos.included.length;
    s.twoCard = combos.included.filter(v => v.cards.length <= 2 && inf(v)).length;
    s.ruthless = combos.included.filter(v => v.tag === "R").length;
    if (s.ruthless) s.bracket = Math.max(s.bracket, 4); else if (s.twoCard) s.bracket = Math.max(s.bracket, 3);
  }
  s.level = s.bracket >= 4 && s.score >= 82 ? "Competitivo" : s.score >= 75 ? "Fuerte" : s.score >= 58 ? "Mejorado" : "Nivel precon";
  return s;
}

export function hyperAtLeast(N, K, n, k) {
  const lc = (a, b) => { if (b < 0 || b > a) return -Infinity; let r = 0; for (let i = 1; i <= b; i++) r += Math.log(a - b + i) - Math.log(i); return r; };
  let p = 0; for (let x = k; x <= n; x++) p += Math.exp(lc(K, x) + lc(N - K, n - x) - lc(N, n)); return p;
}

const ES_EN = { vampiros: "vampire", zombis: "zombie", elfos: "elf", dragones: "dragon", angeles: "angel", goblins: "goblin", trasgos: "goblin",
  dinosaurios: "dinosaur", gatos: "cat", perros: "dog", piratas: "pirate", humanos: "human", guerreros: "warrior", magos: "wizard",
  espiritus: "spirit", slivers: "sliver", artefactos: "artifact", encantamientos: "enchantment", equipos: "equipment", auras: "aura",
  fichas: "token", cementerio: "graveyard", tierras: "landfall", contadores: "counter", ninjas: "ninja", hadas: "faerie", demonios: "demon" };
export function themeWords(cmds, theme) {
  const w = new Set();
  norm(theme || "").split(/[^a-z0-9\-]+/).filter(x => x.length > 3).forEach(x => w.add(ES_EN[x] || x));
  cmds.forEach(c => c.sub.split(/\s+/).forEach(sub => { if (sub.length > 2 && norm(c.text).includes(norm(sub))) w.add(norm(sub)); }));
  return [...w];
}

// Completa `cards` (Map clave -> {c,q}) hasta 100 menos los comandantes (99, o 98 con partner/background)
// con cuotas de ramp/robo/interacción, tierras y básicas.
export function fillDeck(cmds, cards, pool, basics, { bracket = 3, budget = 0, theme = "", boosted = new Set() } = {}) {
  const ci = ciUnion(cmds), words = themeWords(cmds, theme), size = 100 - cmds.length;
  const gcMax = bracket <= 2 ? 0 : bracket === 3 ? 3 : 99;
  let gcCount = [...cards.values()].filter(e => e.c.gc).length;
  const cmdKeys = new Set(cmds.map(key));
  const ok = c => !cmdKeys.has(key(c)) && !cards.has(key(c)) && !isBasic(c) && c.legal && subsetCI(c.ci, ci)
    && !(budget && c.price > budget) && !(c.gc && gcCount >= gcMax);
  const score = c => { let r = c.rank; if (boosted.has(key(c))) r /= 8; else if (words.length) { const hay = norm(c.name + " " + c.type + " " + c.sub + " " + c.text); if (words.some(w => hay.includes(w))) r /= 5; } return r; };
  const seen = new Set();
  const list = pool.filter(c => { const k = key(c); if (seen.has(k)) return false; seen.add(k); return true; }).sort((a, b) => score(a) - score(b));
  const take = c => { cards.set(key(c), { c, q: 1 }); if (c.gc) gcCount++; };
  const count = pred => [...cards.values()].reduce((n, e) => n + (pred(e.c) ? e.q : 0), 0);
  const total = () => [...cards.values()].reduce((n, e) => n + e.q, 0);
  const quotas = [[F.RAMP, 10], [F.DRAW, 10], [F.REM, 8], [F.WIPE, bracket >= 3 ? 3 : 2]];
  for (const [flag, n] of quotas) for (const c of list) {
    if (count(x => !isLand(x) && (x.flags & flag)) >= n) break;
    if (!isLand(c) && (c.flags & flag) && ok(c)) take(c);
  }
  for (const c of list) { if (count(x => !isLand(x)) >= 63) break; if (!isLand(c) && ok(c)) take(c); }
  const nb = ci.length <= 1 ? 7 : ci.length === 2 ? 13 : 17;
  for (const c of list) { if (count(x => isLand(x) && !isBasic(x)) >= nb || total() >= size) break; if (isLand(c) && ok(c)) take(c); }
  const need = size - total();
  if (need > 0) {
    const cols = ci ? [...ci] : ["C"], pips = {}; cols.forEach(c => pips[c] = 1);
    for (const { c, q } of cards.values()) for (const m of (c.cost.match(/\{[^}]+\}/g) || [])) for (const ch of cols) if (m.includes(ch)) pips[ch] += q;
    const tot = Object.values(pips).reduce((a, b) => a + b, 0); let left = need;
    cols.forEach((col, i) => {
      const n = i === cols.length - 1 ? left : Math.floor(need * pips[col] / tot); left -= n;
      const b = basics[col]; if (b && n > 0) { const e = cards.get(key(b)); cards.set(key(b), { c: b, q: (e ? e.q : 0) + n }); }
    });
  }
  while (total() > size) {
    const worst = [...cards.values()].filter(e => !isLand(e.c)).sort((a, b) => b.c.rank - a.c.rank)[0];
    if (!worst) break; cards.delete(key(worst.c));
  }
  return cards;
}

// Mazo a presupuesto sin IA: cambia las cartas más caras por otras muy jugadas y mucho más baratas que
// cumplan la misma función (ramp, robo, removal… o el mismo tipo si no tiene etiqueta), hasta bajar de `target`.
// `pool`: cartas candidatas (ordenadas o no); `basics`: { W: carta, U: carta, … } para sustituir tierras caras.
// Devuelve { swaps: [{ out, in, save }], from, to }.
export function budgetSwaps(d, pool, target, basics = {}) {
  const s = analyze(d), ci = ciUnion(d.cmds);
  const from = s.price; let total = from;
  const swaps = [];
  if (total <= target) return { swaps, from, to: total };
  const taken = new Set([...d.cards.keys(), ...d.cmds.map(key)]);
  const seen = new Set(), words = themeWords(d.cmds, "");
  // Primero las que encajan con el comandante (tipo de criatura, temas de su texto) y luego las más jugadas.
  const syn = c => words.length && words.some(w => norm(c.name + " " + c.type + " " + c.sub + " " + c.text).includes(w));
  const score = c => c.rank / (syn(c) ? 6 : 1);
  const cands = pool.filter(c => { const k = key(c); if (seen.has(k)) return false; seen.add(k);
    return c.legal && !isBasic(c) && c.price > 0 && subsetCI(c.ci, ci) && !taken.has(k); }).sort((a, b) => score(a) - score(b));
  const nCards = Math.max(1, s.total - d.cmds.length);
  const same = (c, r) => {
    if (isLand(c)) return isLand(r);
    if (isLand(r) || r.cmc > c.cmc + 1) return false;
    // Sin etiqueta (una criatura del tema, un motor…): misma clase de carta y, si encajaba con el comandante, la nueva también.
    return c.flags ? !!(r.flags & c.flags) : groupOf(r) === groupOf(c) && (!syn(c) || syn(r));
  };
  // Color con más símbolos de maná en el mazo, para cambiar tierras caras por básicas.
  const cols = ci ? [...ci] : ["C"];
  const topCol = cols.slice().sort((a, b) => (s.pips[b] || 0) - (s.pips[a] || 0))[0];
  const expensive = [...d.cards.values()].map(e => e.c).filter(c => !isBasic(c) && c.price >= 1).sort((a, b) => b.price - a.price);
  for (const c of expensive) {
    if (total <= target) break;
    const cap = Math.min(c.price * 0.4, Math.max(1, target / nCards * 2));
    let r = cands.find(x => !taken.has(key(x)) && x.price <= cap && same(c, x));
    if (!r && isLand(c) && !c.flags) r = basics[topCol] || null;
    if (!r) continue;
    const save = c.price - (r.price || 0);
    if (save <= 0) continue;
    if (!isBasic(r)) taken.add(key(r));
    swaps.push({ out: c, in: r, save });
    total -= save;
  }
  return { swaps, from, to: total };
}
