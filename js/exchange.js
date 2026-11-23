// Importar mazos por enlace y exportarlos con el formato de otras webs.
// - Archidekt: su API pública se lee a través de /api/archidekt (api/archidekt.js y dev/serve.ps1).
// - Moxfield: no ofrece una forma pública de leer mazos desde otras webs, así que se explica cómo
//   copiar la lista desde Moxfield (Export → Copy for MTGA) y pegarla.

// ¿El texto es solo un enlace de un mazo? → { site: "archidekt" | "moxfield", id } o null.
export function deckLink(text) {
  const t = String(text || "").trim();
  if (!/^https?:\/\/\S+$/i.test(t)) return null;
  let m = /archidekt\.com\/(?:api\/)?decks\/(\d+)/i.exec(t);
  if (m) return { site: "archidekt", id: m[1] };
  m = /moxfield\.com\/decks\/([\w-]+)/i.exec(t);
  if (m) return { site: "moxfield", id: m[1] };
  return null;
}

export const MOXFIELD_HELP = "Moxfield no deja leer sus mazos desde otras webs. En Moxfield abre el mazo, pulsa «Export» → «Copy for MTGA» (o «Copy Plain Text») y pega aquí la lista: el comandante se detecta solo.";

// Lee un mazo público de Archidekt y lo devuelve como lista en texto: { name, text }.
export async function fromArchidekt(id) {
  let r;
  try { r = await fetch("/api/archidekt?id=" + encodeURIComponent(id)); }
  catch { throw new Error("No hay conexión con el servidor"); }
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || "No se pudo leer el mazo de Archidekt");
  const outside = new Set((d.categories || []).filter(c => c.includedInDeck === false).map(c => c.name));
  const cmd = [], main = [];
  for (const c of d.cards || []) {
    const name = c.card && c.card.oracleCard && c.card.oracleCard.name, cats = c.categories || [];
    if (!name) continue;
    if (cats.includes("Commander")) { cmd.push(`1 ${name}`); continue; }
    if (cats.length && cats.every(x => outside.has(x))) continue; // sideboard, maybeboard…
    main.push(`${c.quantity || 1} ${name}`);
  }
  if (!cmd.length && !main.length) throw new Error("El mazo de Archidekt está vacío");
  return { name: d.name || "Mazo de Archidekt", text: (cmd.length ? `Commander\n${cmd.join("\n")}\n\nDeck\n` : "") + main.join("\n") };
}

// Exportar con el formato de cada web. `deck`: { cmds: [carta], cards: Map(clave → { c, q }) }.
export const FORMATS = {
  moxfield: "Moxfield / MTG Arena",
  archidekt: "Archidekt",
  plain: "Texto simple (1 por línea)",
};
export function exportText(deck, fmt) {
  const cmds = deck.cmds || [], cards = [...deck.cards.values()].sort((a, b) => a.c.name.localeCompare(b.c.name));
  if (fmt === "archidekt") return [...cmds.map(c => `1x ${c.name} [Commander{top}]`), ...cards.map(e => `${e.q}x ${e.c.name}`)].join("\n");
  if (fmt === "plain") return [...cmds.map(c => `1 ${c.name} *CMDR*`), ...cards.map(e => `${e.q} ${e.c.name}`)].join("\n");
  return (cmds.length ? `Commander\n${cmds.map(c => `1 ${c.name}`).join("\n")}\n\nDeck\n` : "") + cards.map(e => `${e.q} ${e.c.name}`).join("\n");
}
