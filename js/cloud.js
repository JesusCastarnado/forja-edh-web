// Sincroniza «Mis mazos» con Supabase. Inicio de sesión sin contraseña (enlace por email).
// Regla de sincronización: por cada mazo gana la versión con `updated` más reciente; los borrados
// viajan como marcas (`deleted`) para que también desaparezcan en los demás dispositivos.
import * as Decks from "./decks.js";
import * as Coll from "./collection.js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

const CDN = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/+esm"; // admite las claves «publishable»
const COLS = "id,name,cmds,text,stats,created,updated,deleted";

let client = null, user = null, syncing = null, timer = null, lastSync = 0, lastError = "", suggestions = [], colError = "";
let readyResolve; const readyP = new Promise(r => { readyResolve = r; });
const listeners = new Set();

export const configured = () => Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
export const state = () => ({ configured: configured(), ready: !!client, user, lastSync, syncing: !!syncing, error: lastError, suggestions, colError });
// Espera a que la nube esté lista (o a que se sepa que no hay nube). Devuelve true si hay cliente.
export const whenReady = () => configured() ? readyP.then(() => !!client) : Promise.resolve(false);
export const onState = cb => listeners.add(cb);
const emit = () => listeners.forEach(cb => { try { cb(state()); } catch {} });

export async function init() {
  if (!configured()) return;
  try {
    const { createClient } = await import(CDN);
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      // PKCE: el enlace vuelve con ?code=… (no toca el #pestaña que usa la web).
      auth: { flowType: "pkce", persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: "forja-auth" },
    });
    const { data, error } = await client.auth.getSession();
    if (error) lastError = "No se pudo iniciar sesión: " + error.message;
    cleanUrl();
    user = data && data.session ? data.session.user : null;
    client.auth.onAuthStateChange((_ev, session) => {
      const was = user && user.id; user = session ? session.user : null; emit();
      if (user && user.id !== was) sync();
    });
    Decks.onChange(schedule);
    Coll.onChange(src => { if (src !== "sync") schedule(); });
    addEventListener("focus", () => { if (user && Date.now() - lastSync > 60_000) sync(); });
    emit();
    if (user) sync();
  } catch (e) {
    lastError = "No se pudo conectar con la nube: " + (e.message || e); emit();
  } finally { readyResolve(); }
}

// Quita de la dirección los restos del enlace de inicio de sesión.
function cleanUrl() {
  const u = new URL(location.href), p = u.searchParams;
  if (p.get("error_description")) lastError = "No se pudo iniciar sesión: " + p.get("error_description");
  if (!["code", "error", "error_code", "error_description"].some(k => p.has(k))) return;
  ["code", "error", "error_code", "error_description"].forEach(k => p.delete(k));
  history.replaceState(null, "", u.pathname + (u.search || "") + u.hash);
}

// Token de la sesión actual (lo usa la IA publicada para saber que eres tú). null si no hay sesión.
export async function accessToken() {
  if (!client || !user) return null;
  try { const { data } = await client.auth.getSession(); return data && data.session ? data.session.access_token : null; }
  catch { return null; }
}

export async function signIn(email) {
  if (!client) throw new Error("La nube no está disponible");
  const { error } = await client.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname } });
  if (error) throw error;
}
// Entrar con GitHub: sin correo de por medio (el plan gratis de Supabase solo envía 2 correos por hora).
export async function signInWithGitHub() {
  if (!client) throw new Error("La nube no está disponible");
  const { error } = await client.auth.signInWithOAuth({ provider: "github", options: { redirectTo: location.origin + location.pathname } });
  if (error) throw error; // si va bien, el navegador se va a GitHub y vuelve con la sesión
}
export async function signOut() {
  if (client) await client.auth.signOut();
  user = null; lastSync = 0; emit();
}

function schedule() { if (!user) return; clearTimeout(timer); timer = setTimeout(sync, 1500); }
export function sync() {
  if (!client || !user) return Promise.resolve(false);
  if (syncing) { schedule(); return syncing; }
  syncing = run().finally(() => { syncing = null; emit(); });
  emit();
  return syncing;
}
async function run() {
  try {
    const uid = user.id;
    const changed = await syncWith({
      list: async () => { const { data, error } = await client.from("decks").select(COLS); if (error) throw error; return data || []; },
      upsert: async rows => { if (!rows.length) return; const { error } = await client.from("decks").upsert(rows.map(r => ({ ...r, user_id: uid }))); if (error) throw error; },
    });
    lastSync = Date.now(); lastError = "";
    await syncCollection();
    await loadSuggestions();
    return changed;
  } catch (e) {
    lastError = "Error al sincronizar: " + (e.message || e);
    return false;
  }
}

// Colección y lista de deseos: una fila por usuario con todas sus cartas; se mezcla carta a carta.
// Si la tabla aún no existe (falta volver a ejecutar supabase/schema.sql), los mazos se sincronizan igual.
async function syncCollection() {
  try {
    const { data, error } = await client.from("collections").select("items").maybeSingle();
    if (error) throw error;
    const r = Coll.merge(data ? data.items : {});
    if (r.push || (!data && Object.keys(Coll._raw()).length)) {
      const { error: e2 } = await client.from("collections").upsert({ user_id: user.id, items: Coll._raw(), updated: Date.now() });
      if (e2) throw e2;
    }
    colError = "";
  } catch (e) {
    const msg = String((e && e.message) || e);
    colError = /collections|42P01|PGRST20/.test(msg + (e && e.code))
      ? "La colección no se guarda en la nube: falta su tabla en Supabase (vuelve a ejecutar supabase/schema.sql en el SQL Editor)."
      : "No se pudo sincronizar la colección: " + msg;
  }
}

/* ---------- compartir y sugerencias ---------- */
export const shareURL = shareId => `${location.origin}${location.pathname}#compartido/${shareId}`;

// Devuelve el enlace para compartir un mazo (lo crea si no existía). El mazo se sube antes a la nube.
export async function shareLink(deckId) {
  if (!client || !user) throw new Error("Entra con tu cuenta para compartir mazos");
  await sync(); if (syncing) await syncing;
  const { data, error } = await client.from("decks").select("share_id").eq("id", deckId).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("El mazo aún no está en la nube; prueba otra vez en unos segundos");
  let shareId = data.share_id;
  if (!shareId) {
    shareId = crypto.randomUUID();
    const r = await client.from("decks").update({ share_id: shareId }).eq("id", deckId);
    if (r.error) throw r.error;
  }
  return shareURL(shareId);
}
export async function unshare(deckId) {
  if (!client || !user) return;
  const { error } = await client.from("decks").update({ share_id: null }).eq("id", deckId);
  if (error) throw error;
}
// Mazo compartido (lo puede leer cualquiera con el enlace, sin cuenta). null si no existe.
export async function sharedDeck(shareId) {
  if (!(await whenReady())) throw new Error("La nube no está configurada en esta web");
  const { data, error } = await client.rpc("shared_deck", { p_share: shareId });
  if (error) throw error;
  return Array.isArray(data) && data[0] ? data[0] : null;
}
export async function sendSuggestion(shareId, { author, message, cuts, adds }) {
  if (!(await whenReady())) throw new Error("La nube no está configurada en esta web");
  const { error } = await client.rpc("suggest", { p_share: shareId, p_author: author || "", p_message: message || "", p_cuts: cuts, p_adds: adds });
  if (error) throw error;
}
// Sugerencias recibidas en mis mazos (las que no he descartado).
async function loadSuggestions() {
  if (!client || !user) { suggestions = []; return; }
  const { data, error } = await client.from("suggestions").select("id,deck_id,author,message,cuts,adds,status,created").neq("status", "dismissed").order("created", { ascending: false });
  if (!error) suggestions = data || [];
}
export async function setSuggestionStatus(id, status) {
  if (!client || !user) return;
  const { error } = await client.from("suggestions").update({ status }).eq("id", id);
  if (error) throw error;
  suggestions = suggestions.map(s => s.id === id ? { ...s, status } : s).filter(s => s.status !== "dismissed");
  emit();
}

const toRow = d => ({ id: d.id, name: d.name, cmds: d.cmds || [], text: d.text, stats: d.stats || {}, created: d.created || d.updated || Date.now(), updated: d.updated || Date.now(), deleted: false });
const fromRow = r => ({ id: r.id, name: r.name, cmds: r.cmds || [], text: r.text, stats: r.stats || {}, created: +r.created || +r.updated, updated: +r.updated });

// Mezcla los mazos de este navegador con los de la nube. `remote` = { list(), upsert(rows) }.
// Devuelve true si cambió algo en este navegador. Exportada para poder probarla sin Supabase.
export async function syncWith(remote) {
  const rows = await remote.list();
  const local = new Map(Decks._all().map(d => [d.id, d])), tombs = Decks.tombs();
  const inRemote = new Set(rows.map(r => r.id));
  const push = []; let changed = false;
  for (const r of rows) {
    r.updated = +r.updated;
    const l = local.get(r.id), t = tombs[r.id];
    if (r.deleted) {
      // Borrado en otro dispositivo: se borra aquí, salvo que aquí se haya editado después.
      if (l && (l.updated || 0) <= r.updated) { local.delete(r.id); changed = true; }
      else if (l) push.push(toRow(l));
      continue;
    }
    if (t && t >= r.updated) { push.push({ ...toRow(fromRow(r)), deleted: true, updated: t }); continue; } // borrado aquí
    if (!l || r.updated > (l.updated || 0)) { local.set(r.id, fromRow(r)); changed = true; }
    else if ((l.updated || 0) > r.updated) push.push(toRow(l));
  }
  for (const l of local.values()) if (!inRemote.has(l.id)) push.push(toRow(l));
  await remote.upsert(push);
  if (changed) Decks._save([...local.values()]);
  Decks.clearTombs(Object.keys(tombs));
  return changed;
}
