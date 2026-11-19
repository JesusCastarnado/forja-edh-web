// Comparar dos mazos: cartas que solo están en uno, en común, y cómo cambian curva, esqueleto, precio y bracket.
import * as A from "./analysis.js";
import * as Decks from "./decks.js";
import { money, cardMoney } from "./currency.js";

const $ = s => document.querySelector(s);
let H = null; // utilidades de app.js: esc, pipsHTML, manaHTML, thinking, buildDeck, currentText, openInAnalyze
let last = null, seq = 0;

export function initCompare(helpers) {
  H = helpers;
  for (const side of ["A", "B"]) {
    $("#cmpPick" + side).addEventListener("change", e => {
      const v = e.target.value; if (!v) return;
      const text = v === "@current" ? H.currentText() : (Decks.get(v) || {}).text || "";
      $("#cmpText" + side).value = text;
    });
  }
  $("#cmpSwap").onclick = () => {
    const a = $("#cmpTextA").value; $("#cmpTextA").value = $("#cmpTextB").value; $("#cmpTextB").value = a;
    const pa = $("#cmpPickA").value; $("#cmpPickA").value = $("#cmpPickB").value; $("#cmpPickB").value = pa;
    if (last) { last = { a: last.b, b: last.a, na: last.nb, nb: last.na }; paint(); }
  };
  $("#cmpBtn").onclick = compare;
  $("#cmpOut").addEventListener("click", e => {
    const b = e.target.closest("[data-cmpopen]"); if (!b) return;
    H.openInAnalyze($("#cmpText" + b.dataset.cmpopen).value);
  });
  addEventListener("currencychange", () => { if (last && !$("#view-comparar").hidden) paint(); });
}

export function showCompare() {
  const decks = Decks.list();
  const opts = sel => `<option value="">Elegir un mazo…</option><option value="@current">El mazo de Analizar</option>${decks.map(d => `<option value="${H.esc(d.id)}">${H.esc(d.name)}</option>`).join("")}`;
  for (const side of ["A", "B"]) { const s = $("#cmpPick" + side), v = s.value; s.innerHTML = opts(); s.value = [...s.options].some(o => o.value === v) ? v : ""; }
  if (!$("#cmpTextA").value.trim() && H.currentText().trim()) { $("#cmpTextA").value = H.currentText(); $("#cmpPickA").value = "@current"; }
}

const nameOf = side => {
  const v = $("#cmpPick" + side).value;
  if (v && v !== "@current") { const d = Decks.get(v); if (d) return d.name; }
  return "Mazo " + side;
};

async function compare() {
  const ta = $("#cmpTextA").value, tb = $("#cmpTextB").value, st = $("#cmpStatus"), my = ++seq;
  if (!ta.trim() || !tb.trim()) { st.innerHTML = '<span class="lo">Pon una lista en cada lado (o elige dos de tus mazos).</span>'; return; }
  st.innerHTML = '<span class="spin"></span><span>Buscando las cartas en Scryfall…</span>';
  try {
    const a = await H.buildDeck(ta), b = await H.buildDeck(tb);
    if (my !== seq) return;
    last = { a, b, na: nameOf("A"), nb: nameOf("B") };
    st.innerHTML = [a, b].some(d => d.unknown.length) ? `<span class="lo">No encontradas: ${[...a.unknown, ...b.unknown].slice(0, 8).map(H.esc).join(", ")}${a.unknown.length + b.unknown.length > 8 ? "…" : ""}</span>` : "";
    paint();
  } catch (e) {
    if (my === seq) st.innerHTML = `<span class="no">No se pudo consultar Scryfall: ${H.esc(e.message || e)}</span>`;
  }
}

function paint() {
  const { a, b, na, nb } = last, e = H.esc;
  const sa = A.analyze(a), sb = A.analyze(b);
  // Cartas: por nombre normalizado (los comandantes cuentan como cartas del mazo).
  const all = d => { const m = new Map(); d.cmds.forEach(c => m.set(A.key(c), { c, q: 1, cmd: true })); d.cards.forEach((v, k) => m.set(k, { ...v })); return m; };
  const ma = all(a), mb = all(b);
  const onlyA = [], onlyB = [], common = [];
  for (const [k, x] of ma) { const y = mb.get(k); if (y) common.push({ c: x.c, qa: x.q, qb: y.q, cmd: x.cmd && y.cmd }); else onlyA.push(x); }
  for (const [k, y] of mb) if (!ma.has(k)) onlyB.push(y);
  const qty = arr => arr.reduce((n, x) => n + (x.q ?? Math.min(x.qa, x.qb)), 0);
  const shared = common.reduce((n, x) => n + Math.min(x.qa, x.qb), 0);
  const sim = Math.round(shared / Math.max(1, Math.max(sa.total, sb.total)) * 100);

  const head = (d, s, name, side) => {
    const c0 = d.cmds[0];
    return `<div class="panel cmpcard" style="--k:${side === "A" ? "var(--accent)" : "var(--mU)"}${c0 && c0.art ? `;--art:url('${e(c0.art)}')` : ""}">
      <div class="cmpart"></div>
      <div class="eyebrow"><span class="cmpdot"></span>${side === "A" ? "Mazo A" : "Mazo B"}</div>
      <div class="gname">${e(name)}</div>
      <div class="muted small">${d.cmds.map(c => e(c.name)).join(" + ") || "Sin comandante"} ${H.pipsHTML(s.ci)}</div>
      <div class="gstats" style="margin-top:8px"><div><span class="eyebrow">Nota</span><b class="grade">${s.grade}</b></div><div><span class="eyebrow">Bracket</span><b>B${s.bracket}</b></div><div><span class="eyebrow">Precio</span><b>${money(s.price)}</b></div></div>
      <button class="btn sm" data-cmpopen="${side}" style="margin-top:10px;justify-self:start">Abrir en Analizar</button></div>`;
  };

  const ROWS = [
    ["Cartas", s => s.total, 0], ["Precio", s => s.price, "money"], ["Coste medio (CMC)", s => s.avgCmc, 2],
    ["Puntuación", s => s.score, 0, s => `${s.grade} · ${s.score}`], ["Bracket", s => s.bracket, 0, s => "B" + s.bracket],
    ["Game Changers", s => s.gc.length, 0], ["Tierras", s => s.lands, 0], ["Ramp", s => s.ramp, 0], ["Robo", s => s.draw, 0],
    ["Removal + counters", s => s.interaction, 0], ["Barridos", s => s.wipes, 0], ["Tutores", s => s.tutors, 0],
  ];
  const fmtV = (v, f) => f === "money" ? money(v) : f === 2 ? v.toFixed(2).replace(".", ",") : String(Math.round(v));
  const diff = (va, vb, f) => {
    const d = vb - va;
    if (Math.abs(d) < (f === 2 ? 0.005 : 0.5)) return '<span class="muted">=</span>';
    const t = f === "money" ? money(Math.abs(d)) : f === 2 ? Math.abs(d).toFixed(2).replace(".", ",") : String(Math.round(Math.abs(d)));
    return `<span class="mono">${d > 0 ? "+" : "−"}${t}</span>`;
  };
  const table = `<table class="cmptab"><thead><tr><th></th><th><span class="cmpdot" style="--k:var(--accent)"></span>A</th><th><span class="cmpdot" style="--k:var(--mU)"></span>B</th><th>B − A</th></tr></thead><tbody>
    ${ROWS.map(([label, get, f, show]) => `<tr><th>${label}</th><td>${show ? show(sa) : fmtV(get(sa), f)}</td><td>${show ? show(sb) : fmtV(get(sb), f)}</td><td>${diff(get(sa), get(sb), f)}</td></tr>`).join("")}
  </tbody></table>`;

  const max = Math.max(1, ...sa.curve, ...sb.curve);
  const curve = `<div class="cmpcurve">${sa.curve.map((n, i) => `<div class="col"><div class="bars"><span class="n">${n}</span><div class="bar" style="height:${n / max * 100}%;background:var(--accent)"></div><span class="n">${sb.curve[i]}</span><div class="bar" style="height:${sb.curve[i] / max * 100}%;background:var(--mU)"></div></div><span class="lb">${i === 7 ? "7+" : i}</span></div>`).join("")}</div>
    <p class="muted small mono" style="margin:6px 0 0">A: CMC medio ${sa.avgCmc.toFixed(2).replace(".", ",")} · B: CMC medio ${sb.avgCmc.toFixed(2).replace(".", ",")}</p>`;

  const list = (arr, kind) => {
    if (!arr.length) return '<p class="muted small" style="margin:0">Ninguna.</p>';
    const groups = {};
    for (const x of arr) (groups[x.cmd ? "Comandante" : A.groupOf(x.c)] ||= []).push(x);
    return ["Comandante", ...A.ORDER].filter(g => groups[g]).map(g => {
      const xs = groups[g].sort((p, q) => p.c.cmc - q.c.cmc || p.c.name.localeCompare(q.c.name));
      return `<div class="group"><h4><span>${g}</span><span>${xs.reduce((n, x) => n + (x.q ?? Math.min(x.qa, x.qb)), 0)}</span></h4>${xs.map(x => {
        const q = kind === "common" ? (x.qa === x.qb ? x.qa : `<span class="lo" title="A: ${x.qa}, B: ${x.qb}">${x.qa}→${x.qb}</span>`) : x.q;
        return `<div class="card"><span class="q">${q}</span><button class="cn" data-name="${e(x.c.name)}">${e(x.c.name)}</button><span>${H.manaHTML(x.c.cost)}</span><span class="muted small mono">${cardMoney(x.c)}</span></div>`;
      }).join("")}</div>`;
    }).join("");
  };
  const priceOf = arr => arr.reduce((n, x) => n + x.c.price * (x.q ?? 0), 0);

  $("#cmpOut").innerHTML = `
    <div class="cmphead">${head(a, sa, na, "A")}<div class="cmpsim"><div class="big">${sim} %</div><div class="muted small">de cartas en común</div><div class="small mono">${shared} compartidas</div></div>${head(b, sb, nb, "B")}</div>
    <div class="cmpmid"><div class="panel"><h3>Números</h3>${table}</div><div class="panel"><h3>Curva de maná</h3>${curve}</div></div>
    <div class="cmplists">
      <div class="panel" style="--k:var(--accent)"><h3><span class="cmpdot"></span>Solo en A <span class="muted mono">${qty(onlyA)}</span></h3><p class="muted small" style="margin:-6px 0 10px">Valen ${money(priceOf(onlyA))}</p>${list(onlyA, "a")}</div>
      <div class="panel"><h3>En los dos <span class="muted mono">${shared}</span></h3><p class="muted small" style="margin:-6px 0 10px">Cantidades distintas en naranja (A→B)</p>${list(common, "common")}</div>
      <div class="panel" style="--k:var(--mU)"><h3><span class="cmpdot"></span>Solo en B <span class="muted mono">${qty(onlyB)}</span></h3><p class="muted small" style="margin:-6px 0 10px">Valen ${money(priceOf(onlyB))}</p>${list(onlyB, "b")}</div>
    </div>`;
}
