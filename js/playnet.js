// Red de «Jugar»: salas online en tiempo real con Supabase Realtime (Broadcast + Presence).
// No hace falta ninguna tabla ni servidor propio:
// - Vestíbulo: canal «forja-lobby». El anfitrión de cada sala pública la anuncia con Presence;
//   cuando se va (o cierra la pestaña), la sala desaparece sola de la lista.
// - Sala: canal «forja-sala-<código>». Presence dice quién está; Broadcast lleva el estado público de
//   la mesa de cada jugador (vida, campo, cementerio, nº de cartas en mano…) y el registro/chat.
// Lo oculto (mano y biblioteca) nunca sale del navegador de su dueño: solo se envía cuántas cartas hay.
import * as Cloud from "./cloud.js";

let sb = null;
export async function connect() {
  await Cloud.init();
  await Cloud.whenReady();
  sb = Cloud.raw();
  return !!sb;
}

const flat = st => Object.values(st || {}).map(a => a[a.length - 1]).filter(Boolean);

// Un canal con Presence (quién está) y un único evento de Broadcast «m» ({ k: tipo, ...datos }).
function open(name, key, { onPeople, onMsg, onStatus } = {}) {
  const ch = sb.channel(name, { config: { broadcast: { self: false }, presence: { key } } });
  let ready = false, meta = null;
  if (onPeople) ch.on("presence", { event: "sync" }, () => onPeople(flat(ch.presenceState())));
  if (onMsg) ch.on("broadcast", { event: "m" }, ({ payload }) => { if (payload && payload.k) onMsg(payload.k, payload); });
  ch.subscribe(st => {
    if (st === "SUBSCRIBED") {
      ready = true;
      if (meta) ch.track(meta); // también al reconectar
      onStatus && onStatus("ok");
    } else if (st === "CHANNEL_ERROR" || st === "TIMED_OUT") { ready = false; onStatus && onStatus("error"); }
    else if (st === "CLOSED") { ready = false; onStatus && onStatus("closed"); }
  });
  return {
    get ready() { return ready; },
    send(k, data = {}) { if (ready) ch.send({ type: "broadcast", event: "m", payload: { ...data, k } }); },
    track(m) { meta = m; if (ready) ch.track(m); },
    untrack() { meta = null; if (ready) ch.untrack(); },
    close() { meta = null; try { sb.removeChannel(ch); } catch {} },
  };
}

// Vestíbulo: onRooms recibe la lista de salas anunciadas.
export function lobby(myId, onRooms, onStatus) {
  return open("forja-lobby", myId, { onPeople: list => onRooms(list.filter(m => m && m.code)), onStatus });
}

// Sala: onPeople(lista de jugadores conectados), onMsg(tipo, datos).
export function room(code, myId, handlers) {
  return open("forja-sala-" + code, myId, handlers);
}

// Códigos de sala sin letras que se confunden (0/O, 1/I/L).
export function newCode() {
  const abc = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const r = crypto.getRandomValues(new Uint8Array(6));
  return [...r].map(n => abc[n % abc.length]).join("");
}
export const validCode = s => /^[A-Z0-9]{6}$/.test(String(s || "").toUpperCase());
