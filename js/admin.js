// Pantalla «Admin» (#admin), solo para los administradores: quién tiene IA en la web publicada y cuánto
// se gasta. Los datos están en Supabase (tablas ai_access y ai_usage) y las reglas de la base de datos
// impiden que nadie más los vea, aunque abra esta pantalla a mano.
import * as Cloud from "./cloud.js";

const $ = s => document.querySelector(s);
let H = null; // utilidades de app.js: esc, toast, thinking
const LIMIT = "forja-admin-limite"; // límite mensual en dólares que pusiste en la consola de Anthropic
const ACTIONS = { optimizar: "Optimizar", presupuesto: "A presupuesto", radiografia: "Radiografía (antigua)", guia: "Guía del mazo", generar: "Generar mazo", encaja: "¿Encaja esta carta?", autorrellenar: "Autorrellenar", otro: "Otros" };
let data = { access: [], users: [], usage: [] }, seq = 0;

const usd = v => v < 0.01 && v > 0 ? `${v.toLocaleString("es-ES", { maximumFractionDigits: 4 })} $` : `${v.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $`;
const num = v => v.toLocaleString("es-ES");
const when = t => t ? new Date(t).toLocaleString("es-ES", { dateStyle: "medium", timeStyle: "short" }) : "—";
const limit = () => { try { return Math.max(0, parseFloat(localStorage.getItem(LIMIT)) || 5); } catch { return 5; } };
const monthStart = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); };

export function initAdmin(helpers) {
  H = helpers;
  // El botón «Admin» de la cabecera solo aparece a los administradores.
  Cloud.onState(async s => { $("#btnAdmin").hidden = !(s.user && await Cloud.isAdmin()); });
  const root = $("#view-admin");
  root.addEventListener("submit", e => { if (e.target.id === "admAddForm") { e.preventDefault(); addAccess($("#admEmail").value, $("#admNote").value); } });
  root.addEventListener("click", e => {
    const b = e.target.closest("[data-adm]"); if (!b) return;
    const a = b.dataset.adm, email = b.dataset.email;
    if (a === "give") addAccess(email, "");
    else if (a === "toggle") setEnabled(email, b.dataset.on !== "1");
    else if (a === "remove" && confirm(`¿Quitar el acceso a la IA a ${email}?`)) removeAccess(email);
    else if (a === "reload") showAdmin();
  });
  root.addEventListener("change", e => {
    if (e.target.id === "admLimit") { try { localStorage.setItem(LIMIT, String(Math.max(0, parseFloat(String(e.target.value).replace(",", ".")) || 0))); } catch {} renderUsage(); }
  });
}

export async function showAdmin() {
  const my = ++seq, root = $("#admBody");
  if (!Cloud.state().configured) { root.innerHTML = '<p class="muted">La nube no está configurada en esta web.</p>'; return; }
  await Cloud.whenReady();
  if (!Cloud.state().user) { root.innerHTML = '<p class="lo">Entra con tu cuenta en <a href="#mazos">Mis mazos</a> para ver esta pantalla.</p>'; return; }
  if (!(await Cloud.isAdmin())) { root.innerHTML = '<p class="no">Esta pantalla es solo para el administrador de la web.</p>'; return; }
  root.innerHTML = H.thinking("Cargando accesos y consumo…");
  const db = Cloud.db(), since = new Date(Math.min(monthStart(), Date.now() - 30 * 864e5)).toISOString();
  const [acc, users, usage] = await Promise.all([
    db.from("ai_access").select("email,note,enabled,added_at").order("added_at", { ascending: false }),
    db.rpc("admin_users"),
    db.from("ai_usage").select("at,email,action,model,input_tokens,output_tokens,cost_usd").gte("at", since).order("at", { ascending: false }).limit(5000),
  ]);
  if (my !== seq) return;
  const err = acc.error || users.error || usage.error;
  if (err) { root.innerHTML = `<p class="no">No se pudieron leer los datos: ${H.esc(err.message)}. ¿Están creadas las tablas del panel en Supabase (supabase/schema.sql)?</p>`; return; }
  data = { access: acc.data || [], users: users.data || [], usage: (usage.data || []).map(u => ({ ...u, cost: +u.cost_usd || 0, t: new Date(u.at) })) };
  root.innerHTML = `<div class="adm-grid"><section class="panel" id="admAccess"></section><section class="panel" id="admUsage"></section></div>`;
  renderAccess(); renderUsage();
}

/* ---------- acceso a la IA ---------- */
function renderAccess() {
  const e = H.esc, me = (Cloud.state().user.email || "").toLowerCase(), m0 = monthStart();
  const stats = email => { const rows = data.usage.filter(u => u.email === email); return { last: rows[0] && rows[0].at, month: rows.filter(u => u.t >= m0).reduce((a, u) => a + u.cost, 0) }; };
  const has = new Set(data.access.map(a => a.email));
  const others = data.users.filter(u => u.email !== me && !u.is_admin && !has.has(u.email));
  const admins = data.users.filter(u => u.email !== me && u.is_admin);
  $("#admAccess").innerHTML = `
    <div class="row between"><h3 style="margin:0">Acceso a la IA</h3><button class="btn sm" data-adm="reload">Actualizar</button></div>
    <p class="muted small" style="margin:0">Quien esté aquí (y tenga una cuenta en la web con ese email) puede usar la IA en la web publicada, gastando de tu saldo. Tú, como administrador, siempre tienes acceso. Los cambios son al momento.</p>
    <form class="row adm-add" id="admAddForm">
      <input type="email" id="admEmail" required placeholder="email@ejemplo.com" aria-label="Email al que dar acceso">
      <input type="text" id="admNote" maxlength="60" placeholder="Nota (opcional): «Pablo, del grupo»" aria-label="Nota">
      <button class="btn primary sm">Dar acceso</button>
    </form>
    <div class="adm-list">
      <div class="adm-row me"><div><b>${e(me)}</b><span class="muted small"> · tú (administrador)</span></div><span class="gb ok">Siempre</span><span class="mono small">${usd(stats(me).month)} este mes</span><span></span></div>
      ${admins.map(u => `<div class="adm-row me"><div><b>${e(u.email)}</b><span class="muted small"> · administrador</span></div><span class="gb ok">Siempre</span><span class="mono small">${usd(stats(u.email).month)} este mes</span><span></span></div>`).join("")}
      ${data.access.map(a => { const s = stats(a.email); return `
      <div class="adm-row${a.enabled ? "" : " off"}"><div style="min-width:0"><b>${e(a.email)}</b>${a.note ? `<span class="muted small"> · ${e(a.note)}</span>` : ""}<div class="muted small">Desde ${when(a.added_at)} · último uso: ${when(s.last)}</div></div>
        <span class="gb ${a.enabled ? "ok" : ""}">${a.enabled ? "Con IA" : "En pausa"}</span><span class="mono small">${usd(s.month)} este mes</span>
        <span class="row"><button class="btn sm" data-adm="toggle" data-email="${e(a.email)}" data-on="${a.enabled ? "1" : "0"}">${a.enabled ? "Pausar" : "Activar"}</button><button class="btn sm danger" data-adm="remove" data-email="${e(a.email)}">Quitar</button></span></div>`; }).join("") || '<p class="muted small">Todavía no has dado acceso a nadie.</p>'}
    </div>
    <h4 class="adm-h4">Gente que ha entrado en la web sin IA</h4>
    <div class="adm-list">${others.map(u => `<div class="adm-row"><div><b>${e(u.email)}</b><div class="muted small">Último acceso: ${when(u.last_sign_in_at)}</div></div><span class="gb">Sin IA</span><span></span><button class="btn sm" data-adm="give" data-email="${e(u.email)}">Dar IA</button></div>`).join("") || '<p class="muted small">Nadie más ha entrado todavía. Cuando un amigo entre en «Mis mazos» con su cuenta, aparecerá aquí.</p>'}</div>`;
}
async function addAccess(email, note) {
  email = String(email || "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { H.toast("Escribe un email válido"); return; }
  const { error } = await Cloud.db().from("ai_access").upsert({ email, note: String(note || "").trim().slice(0, 60), enabled: true });
  if (error) { H.toast("No se pudo: " + error.message); return; }
  H.toast(`${email} ya tiene IA`); showAdmin();
}
async function setEnabled(email, enabled) {
  const { error } = await Cloud.db().from("ai_access").update({ enabled }).eq("email", email);
  if (error) { H.toast("No se pudo: " + error.message); return; }
  H.toast(enabled ? `IA activada para ${email}` : `IA en pausa para ${email}`); showAdmin();
}
async function removeAccess(email) {
  const { error } = await Cloud.db().from("ai_access").delete().eq("email", email);
  if (error) { H.toast("No se pudo: " + error.message); return; }
  H.toast(`${email} ya no tiene IA`); showAdmin();
}

/* ---------- consumo ---------- */
function bars(rows) { // [{ label, value, sub }] → barras horizontales de una sola magnitud
  const max = Math.max(...rows.map(r => r.value), 0) || 1, e = H.esc;
  return rows.map(r => `<div class="hbar" title="${e(r.label)}: ${usd(r.value)} · ${e(r.sub)}"><span class="hl">${e(r.label)}</span><span class="ht"><span style="width:${Math.max(r.value > 0 ? 2 : 0, r.value / max * 100)}%"></span></span><span class="hv mono">${usd(r.value)}</span><span class="hs muted small">${e(r.sub)}</span></div>`).join("");
}
function group(rows, key) {
  const m = new Map();
  for (const u of rows) { const k = key(u), g = m.get(k) || { cost: 0, n: 0, tin: 0, tout: 0 }; g.cost += u.cost; g.n++; g.tin += u.input_tokens; g.tout += u.output_tokens; m.set(k, g); }
  return [...m].sort((a, b) => b[1].cost - a[1].cost);
}
function renderUsage() {
  const e = H.esc, m0 = monthStart(), month = data.usage.filter(u => u.t >= m0), lim = limit();
  const spent = month.reduce((a, u) => a + u.cost, 0), pct = lim ? Math.min(100, spent / lim * 100) : 0;
  const tin = month.reduce((a, u) => a + u.input_tokens, 0), tout = month.reduce((a, u) => a + u.output_tokens, 0);
  // Últimos 30 días, un valor por día (los días sin uso cuentan como 0).
  const days = [...Array(30)].map((_, i) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - 29 + i); return d; });
  const perDay = days.map(d => { const n = new Date(d); n.setDate(n.getDate() + 1); const r = data.usage.filter(u => u.t >= d && u.t < n); return { d, cost: r.reduce((a, u) => a + u.cost, 0), n: r.length }; });
  const dmax = Math.max(...perDay.map(x => x.cost), 0) || 1;
  const monthName = m0.toLocaleDateString("es-ES", { month: "long" });
  $("#admUsage").innerHTML = `
    <h3 style="margin:0">Consumo de la IA</h3>
    <p class="muted small" style="margin:0">Solo cuenta la IA de la web publicada (la de tu ordenador va con tu cuenta de Claude y no gasta saldo). Coste calculado con los precios de la API en dólares; el dato exacto está en la consola de Anthropic.</p>
    <div class="adm-kpi">
      <div><span class="eyebrow">Gastado en ${e(monthName)}</span><b class="adm-big">${usd(spent)}</b>
        <div class="adm-meter" title="${usd(spent)} de ${usd(lim)}"><span style="width:${pct}%" class="${pct >= 90 ? "no" : pct >= 70 ? "lo" : ""}"></span></div>
        <label class="small muted adm-lim" for="admLimit">de un límite de <input type="number" id="admLimit" min="0" step="1" value="${lim}" inputmode="decimal"> $ al mes</label></div>
      <div><span class="eyebrow">Respuestas</span><b class="adm-big">${num(month.length)}</b><span class="muted small">${month.length ? usd(spent / month.length) + " de media" : "este mes"}</span></div>
      <div><span class="eyebrow">Tokens</span><b class="adm-big">${num(tin + tout)}</b><span class="muted small">${num(tin)} entrada · ${num(tout)} salida</span></div>
    </div>
    <h4 class="adm-h4">Gasto por día · últimos 30 días</h4>
    <div class="adm-days" role="img" aria-label="Gasto diario de los últimos 30 días">${perDay.map(x => `<span class="adm-day" tabindex="0" title="${x.d.toLocaleDateString("es-ES", { day: "numeric", month: "short" })}: ${usd(x.cost)} · ${x.n} respuestas"><span style="height:${x.cost ? Math.max(3, x.cost / dmax * 100) : 0}%"></span></span>`).join("")}</div>
    <div class="adm-daysaxis muted small"><span>${days[0].toLocaleDateString("es-ES", { day: "numeric", month: "short" })}</span><span>hoy</span></div>
    <div class="adm-two">
      <div><h4 class="adm-h4">Por persona · ${e(monthName)}</h4>${bars(group(month, u => u.email || "—").map(([k, g]) => ({ label: k, value: g.cost, sub: `${g.n} respuestas` }))) || '<p class="muted small">Sin uso este mes.</p>'}</div>
      <div><h4 class="adm-h4">Por función · ${e(monthName)}</h4>${bars(group(month, u => ACTIONS[u.action] || u.action || "Otros").map(([k, g]) => ({ label: k, value: g.cost, sub: `${g.n} respuestas` }))) || '<p class="muted small">Sin uso este mes.</p>'}</div>
    </div>
    <h4 class="adm-h4">Últimas respuestas</h4>
    <div class="adm-table-wrap"><table class="adm-table"><thead><tr><th>Cuándo</th><th>Quién</th><th>Función</th><th>Modelo</th><th class="r">Tokens</th><th class="r">Coste</th></tr></thead><tbody>
      ${data.usage.slice(0, 25).map(u => `<tr><td>${when(u.at)}</td><td>${e(u.email || "—")}</td><td>${e(ACTIONS[u.action] || u.action)}</td><td class="mono small">${e(String(u.model).replace(/^claude-/, ""))}</td><td class="r mono">${num(u.input_tokens + u.output_tokens)}</td><td class="r mono">${usd(u.cost)}</td></tr>`).join("") || '<tr><td colspan="6" class="muted">Todavía no hay consumo registrado.</td></tr>'}
    </tbody></table></div>`;
}
