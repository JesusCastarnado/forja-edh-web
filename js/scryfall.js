// Capa de acceso a Scryfall (https://scryfall.com/docs/api).
// Scryfall pide 50-100 ms entre peticiones: todas pasan por throttle().
const API = "https://api.scryfall.com";
let nextSlot = 0;
async function throttle() {
  const now = Date.now();
  const wait = Math.max(0, nextSlot - now);
  nextSlot = Math.max(now, nextSlot) + 110;
  if (wait) await new Promise(r => setTimeout(r, wait));
}

async function sf(path, { body, signal } = {}) {
  await throttle();
  const r = await fetch(path.startsWith("http") ? path : API + path, {
    method: body ? "POST" : "GET",
    headers: body ? { Accept: "application/json", "Content-Type": "application/json" } : { Accept: "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    signal,
  });
  if (r.status === 404) return null;
  if (r.status === 429) { await new Promise(r => setTimeout(r, 1500)); return sf(path, { body, signal }); }
  if (!r.ok) throw new Error(`Scryfall respondió ${r.status}`);
  return r.json();
}

export const norm = s => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/[’`]/g, "'").replace(/\s+/g, " ").trim();

export const F = { RAMP: 1, DRAW: 2, REM: 4, WIPE: 8, TUTOR: 16, COUNTER: 32 };

// Etiquetas aproximadas a partir del texto de reglas.
export function tagFlags(c) {
  const t = c.text.toLowerCase(), tl = (c.type + " " + c.sub).toLowerCase();
  const land = /\bland\b/.test(tl), creature = /creature/.test(tl);
  let f = 0;
  if (!land && ((!creature && /add (\{|one mana|two mana|three mana|x mana|an amount of|that much|mana of any)/.test(t))
    || (creature && /(^|\n)\{t\}: add/.test(t))
    || (/search your library for (a|up to \w+|two) (basic )?(land|forest|plains|island|swamp|mountain)/.test(t) && /battlefield/.test(t)))) f |= F.RAMP;
  if (/draws? (a|two|three|four|x|that many|\w+) cards?/.test(t) || /draw cards equal/.test(t)) f |= F.DRAW;
  if (/(destroy|exile) target (creature|artifact|enchantment|planeswalker|permanent|nonland)/.test(t)
    || /deals? (\d+|x) damage to (any target|target creature)/.test(t)
    || /return target (nonland )?(creature|permanent).{0,40}owner's hand/.test(t)
    || /target (creature|player|opponent) sacrifices/.test(t) || /target creature gets -\d+\/-\d+/.test(t)) f |= F.REM;
  if (/(destroy|exile) all (creatures|nonland|permanents|other creatures|artifacts|enchantments)/.test(t)
    || /all creatures get -/.test(t) || /each creature deals/.test(t) || /return all (nonland|creatures)/.test(t)) f |= F.WIPE;
  if (!land && /search your library for (a|an|up to \w+) (card|creature|instant|sorcery|artifact|enchantment|planeswalker)/.test(t)) f |= F.TUTOR;
  if (/counter target (spell|noncreature|creature spell|activated)/.test(t)) f |= F.COUNTER;
  return f;
}

export function toCard(o) {
  const faces = o.card_faces || null, f0 = faces ? faces[0] : {};
  const typeLine = (faces ? f0.type_line : o.type_line) || o.type_line || "";
  const [type, sub = ""] = typeLine.split(" — ");
  const text = faces ? faces.map(f => f.oracle_text || "").join("\n") : (o.oracle_text || "");
  const img = o.image_uris || f0.image_uris || {};
  const backImg = faces && faces[1] && faces[1].image_uris ? faces[1].image_uris.normal : "";
  const p = o.prices || {};
  const c = {
    name: o.name, cost: o.mana_cost || f0.mana_cost || "", cmc: o.cmc || 0, type, sub,
    ci: (o.color_identity || []).join(""), rank: o.edhrec_rank || 99999,
    price: parseFloat(p.usd || p.usd_foil || p.eur || "0") || 0,
    text, img: img.normal || "", small: img.small || "", art: img.art_crop || "", back: backImg,
    gc: !!o.game_changer, legal: (o.legalities || {}).commander === "legal",
    released: o.released_at || "", set: o.set_name || "", uri: o.scryfall_uri || "",
    isCmd: (/Legendary/.test(typeLine) && /Creature/.test(typeLine)) || /can be your commander/i.test(text),
  };
  c.flags = tagFlags(c);
  return c;
}

const cache = new Map();
export function remember(c) {
  cache.set(norm(c.name), c);
  if (c.name.includes(" // ")) { const f = norm(c.name.split(" // ")[0]); if (!cache.has(f)) cache.set(f, c); }
  return c;
}
export const cached = n => cache.get(norm(n)) || cache.get(norm(String(n).split(/\s+\/\/?\s+/)[0]));

// Busca muchas cartas por nombre: /cards/collection (75 por petición) y, para las que falten, búsqueda difusa.
export async function collection(names, { fuzzyLimit = 15 } = {}) {
  const want = [...new Set(names.map(n => String(n).trim()).filter(Boolean))];
  const missing = want.filter(n => !cached(n));
  for (let i = 0; i < missing.length; i += 75) {
    const chunk = missing.slice(i, i + 75);
    const r = await sf("/cards/collection", { body: { identifiers: chunk.map(name => ({ name })) } });
    (r && r.data || []).forEach(o => remember(toCard(o)));
  }
  let fuzzyLeft = fuzzyLimit;
  for (const n of want) {
    if (cached(n) || fuzzyLeft <= 0) continue;
    fuzzyLeft--;
    const o = await sf("/cards/named?fuzzy=" + encodeURIComponent(n));
    if (o && o.object === "card") { const c = remember(toCard(o)); cache.set(norm(n), c); }
  }
  const found = new Map(), notFound = [];
  for (const n of want) { const c = cached(n); if (c) found.set(norm(n), c); else notFound.push(n); }
  return { found, notFound };
}

export async function search(q, { order = "edhrec", dir = "", pages = 1, signal } = {}) {
  let url = `/cards/search?q=${encodeURIComponent(q)}&order=${order}&unique=cards${dir ? "&dir=" + dir : ""}`;
  const out = [];
  for (let p = 0; p < pages && url; p++) {
    const r = await sf(url, { signal });
    if (!r) break;
    r.data.forEach(o => out.push(remember(toCard(o))));
    url = r.has_more ? r.next_page : null;
  }
  return out;
}

export const ciQuery = ci => `id<=${ci ? ci.toLowerCase() : "c"}`;
export const searchURL = q => "https://scryfall.com/search?q=" + encodeURIComponent(q) + "&order=released&dir=desc";
export function isoDaysAgo(days) { const d = new Date(Date.now() - days * 864e5); return d.toISOString().slice(0, 10); }

const poolCache = new Map();
// Las ~700 cartas más jugadas en una identidad de color (para el generador y las sugerencias rápidas).
export function poolFor(ci) {
  if (!poolCache.has(ci)) poolCache.set(ci, search(`${ciQuery(ci)} legal:commander -t:basic game:paper`, { pages: 4 }));
  return poolCache.get(ci);
}
const newsCache = new Map();
// Cartas aparecidas en los últimos `days` días (incluye previews aún sin legalidad).
export function newsFor(ci, days = 150) {
  const key = ci + "|" + days;
  if (!newsCache.has(key)) newsCache.set(key, search(`${ciQuery(ci)} date>=${isoDaysAgo(days)} -t:basic game:paper`, { order: "released", dir: "desc", pages: 1 }).catch(() => []));
  return newsCache.get(key);
}
export function newCommanders(days = 120) {
  return search(`is:commander date>=${isoDaysAgo(days)} game:paper`, { order: "released", dir: "desc", pages: 1 }).catch(() => []);
}
