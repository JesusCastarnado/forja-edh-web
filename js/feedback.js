// Pestaña «Sugerencias» (#sugerencias): cualquiera manda ideas o avisa de fallos; se guardan en Supabase
// (tabla feedback). Con cuenta, ves las tuyas y la respuesta. Los administradores las gestionan en Admin.
import * as Cloud from "./cloud.js";

const $ = s => document.querySelector(s);
let H = null; // utilidades de app.js: esc, toast, thinking
export const KINDS = { idea: "Idea", fallo: "Algo no funciona", otro: "Otra cosa" };
export const STATUS = { nueva: "Enviada", vista: "Leída", hecha: "¡Hecha!", descartada: "Descartada" };
const NAME = "forja-autor";
const store = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch {} } };
export const fbHint = e => /feedback|42P01|PGRST20/.test(String((e && e.message) || e) + (e && e.code))
  ? "Las sugerencias aún no están activadas: hay que ejecutar supabase/schema.sql en el SQL Editor de Supabase."
  : String((e && e.message) || e);
const when = t => new Date(t).toLocaleString("es-ES", { dateStyle: "medium", timeStyle: "short" });

let kind = "idea";
export function initFeedback(helpers) {
  H = helpers;
  const root = $("#view-sugerencias");
  root.addEventListener("click", e => {
    const k = e.target.closest("[data-fbkind]");
    if (k) { kind = k.dataset.fbkind; paintKind(); }
  });
  $("#fbForm").addEventListener("submit", e => { e.preventDefault(); send(); });
  $("#fbText").addEventListener("input", () => { $("#fbCount").textContent = `${$("#fbText").value.length}/2000`; });
  Cloud.onState(() => { if (!$("#view-sugerencias").hidden) renderMine(); });
}
function paintKind() {
  document.querySelectorAll("[data-fbkind]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.fbkind === kind)));
  $("#fbText").placeholder = kind === "fallo"
    ? "¿Qué estabas haciendo, qué esperabas que pasara y qué pasó? Si es con un mazo, di cuál."
    : kind === "idea" ? "¿Qué te gustaría que hiciera Forja EDH? Cuanto más concreto, mejor." : "Cuéntanos lo que quieras.";
}

export async function showFeedback() {
  paintKind();
  if (!$("#fbName").value) $("#fbName").value = store.get(NAME) || Cloud.defaultAuthor() || "";
  $("#fbCount").textContent = `${$("#fbText").value.length}/2000`;
  renderMine();
}

async function send() {
  const text = $("#fbText").value.trim(), author = $("#fbName").value.trim().slice(0, 40);
  if (text.length < 3) { H.toast("Escribe un poco más"); $("#fbText").focus(); return; }
  if (!Cloud.state().configured) { H.toast("La nube no está configurada en esta web"); return; }
  const btn = $("#fbSend"); btn.disabled = true; btn.textContent = "Enviando…";
  try {
    await Cloud.whenReady();
    const db = Cloud.raw(); if (!db) throw new Error("No hay conexión con la nube");
    // Sin .select(): quien no tiene cuenta puede enviar, pero no leer la tabla.
    const { error } = await db.from("feedback").insert({ kind, text: text.slice(0, 2000), author, page: (location.hash || "#").slice(1, 40) || "sugerencias" });
    if (error) throw error;
    if (author) store.set(NAME, author);
    $("#fbText").value = ""; $("#fbCount").textContent = "0/2000";
    $("#fbDone").hidden = false;
    $("#fbDone").textContent = Cloud.state().user
      ? "¡Gracias! La tienes abajo, en «Tus sugerencias»: ahí verás cuándo la leamos y la respuesta."
      : "¡Gracias! Ya nos ha llegado. Si entras con tu cuenta en «Mis mazos», la próxima vez podrás ver aquí la respuesta.";
    renderMine();
  } catch (e) { H.toast("No se pudo enviar: " + fbHint(e)); }
  finally { btn.disabled = false; btn.textContent = "Enviar sugerencia"; }
}

async function renderMine() {
  const box = $("#fbMine"), st = Cloud.state();
  if (!st.configured) { box.innerHTML = ""; return; }
  if (!st.user) { box.innerHTML = '<p class="muted small">Entra con tu cuenta en <a href="#mazos">Mis mazos</a> para ver aquí tus sugerencias y las respuestas.</p>'; return; }
  const db = Cloud.db(); if (!db) return;
  const { data, error } = await db.from("feedback").select("id,at,kind,text,status,reply").eq("user_id", st.user.id).order("at", { ascending: false }).limit(50);
  if (error) { box.innerHTML = `<p class="muted small">${H.esc(fbHint(error))}</p>`; return; }
  const e = H.esc;
  box.innerHTML = (data || []).length ? data.map(f => `<article class="fbitem">
      <div class="row between"><span class="small muted">${e(KINDS[f.kind] || f.kind)} · ${when(f.at)}</span><span class="fbst ${e(f.status)}">${e(STATUS[f.status] || f.status)}</span></div>
      <p class="fbtext">${e(f.text)}</p>
      ${f.reply ? `<div class="fbreply"><span class="eyebrow">Respuesta</span><p>${e(f.reply)}</p></div>` : ""}
    </article>`).join("") : '<p class="muted small">Todavía no has enviado ninguna.</p>';
}
