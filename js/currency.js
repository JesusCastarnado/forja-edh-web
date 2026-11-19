// Moneda de los precios: dólares (TCGplayer) o euros (Cardmarket), ambos vienen de Scryfall.
// Cada carta guarda los dos precios y `c.price` devuelve el de la moneda elegida.
const KEY = "forja-moneda";
let cur = "usd";
try { if (localStorage.getItem(KEY) === "eur") cur = "eur"; } catch {}

export const currency = () => cur;
export const symbol = () => (cur === "eur" ? "€" : "$");
export const currencyName = () => (cur === "eur" ? "euros (Cardmarket)" : "dólares (TCGplayer)");
export function setCurrency(c) {
  const next = c === "eur" ? "eur" : "usd";
  if (next === cur) return;
  cur = next;
  try { localStorage.setItem(KEY, cur); } catch {}
  dispatchEvent(new CustomEvent("currencychange", { detail: cur }));
}

const fmt = (n, dec) => Number(n || 0).toLocaleString("es-ES", { minimumFractionDigits: dec, maximumFractionDigits: dec });
// Total (sin decimales): «123 €». Con dec = 2: «1,25 €».
export const money = (n, dec = 0) => `${fmt(n, dec)} ${symbol()}`;
// Precio de una carta: «–» si Scryfall no lo tiene en esta moneda.
export const cardMoney = c => (c && c.price ? money(c.price, 2) : "–");
