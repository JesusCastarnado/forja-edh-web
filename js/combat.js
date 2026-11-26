// Cálculo del daño de combate de «Jugar» (sin interfaz: se puede probar aparte).
// Es una ayuda, no un juez: cubre lo más habitual (arrollar, vínculo vital, toque mortal, dañar primero,
// doble daño, infectar, indestructible) y el jugador revisa el resultado antes de aplicarlo.
//
// resolve(attackers) → resultado
//   attackers: [{ key, owner, name, pow, tou, kw: [palabras clave en minúsculas], cmd: es comandante,
//                 target: { p: id del jugador atacado, pw: clave del planeswalker o null },
//                 blockers: [{ key, owner, name, pow, tou, kw }] }]
//   resultado: {
//     players: { [id]: { life: daño a sus vidas, poison, cmd: { [idAtacante]: daño de comandante }, gain: vida ganada } },
//     pw: { [clave]: daño al planeswalker },
//     dies: [claves de las criaturas que mueren],
//     lines: [{ key, toTarget, toBlockers: { [clave]: daño }, taken, dies }]  (detalle por atacante)
//   }

const has = (c, k) => (c.kw || []).includes(k);
const dealsFirst = c => has(c, "first strike") || has(c, "double strike");
const dealsRegular = c => !has(c, "first strike") || has(c, "double strike");
const lethalTo = (src, dst, dmg) => has(src, "deathtouch") ? 1 : Math.max(0, (dst.tou || 0) - (dmg.get(dst.key) || 0));

export function resolve(attackers) {
  const out = { players: {}, pw: {}, dies: [], lines: [] };
  const P = id => (out.players[id] ||= { life: 0, poison: 0, cmd: {}, gain: 0 });

  for (const A of attackers) {
    const Bs = A.blockers || [];
    const blocked = Bs.length > 0;
    const dmg = new Map();        // clave → daño recibido
    const dtHit = new Set();      // recibió daño de una fuente con toque mortal
    const dead = new Set();
    const line = { key: A.key, toTarget: 0, toBlockers: {}, taken: 0, dies: [] };
    const hurt = (src, dst, n) => {
      if (n <= 0) return;
      dmg.set(dst.key, (dmg.get(dst.key) || 0) + n);
      if (has(src, "deathtouch")) dtHit.add(dst.key);
      if (has(src, "lifelink")) P(src.owner).gain += n;
    };
    const hitTarget = n => {
      if (n <= 0) return;
      line.toTarget += n;
      if (has(A, "lifelink")) P(A.owner).gain += n;
      if (A.target.pw) { out.pw[A.target.pw] = (out.pw[A.target.pw] || 0) + n; return; }
      const t = P(A.target.p);
      if (has(A, "infect")) t.poison += n; else t.life += n;
      if (A.cmd) t.cmd[A.owner] = (t.cmd[A.owner] || 0) + n;
    };
    const alive = c => !dead.has(c.key);

    const anyFirst = [A, ...Bs].some(dealsFirst);
    const steps = anyFirst ? ["first", "regular"] : ["regular"];
    for (const step of steps) {
      const deals = c => alive(c) && (step === "first" ? dealsFirst(c) : dealsRegular(c));
      // El atacante reparte su daño.
      if (deals(A) && A.pow > 0) {
        const live = Bs.filter(alive);
        if (!blocked) hitTarget(A.pow);
        else if (!live.length) { if (has(A, "trample")) hitTarget(A.pow); } // bloqueado y sin bloqueadores: solo arrollar llega
        else {
          let left = A.pow;
          live.forEach((B, k) => {
            const last = k === live.length - 1;
            let give = Math.min(left, lethalTo(A, B, dmg));
            if (last && !has(A, "trample")) give = left; // sin arrollar, lo que sobra se queda en el último
            hurt(A, B, give); line.toBlockers[B.key] = (line.toBlockers[B.key] || 0) + give; left -= give;
          });
          if (left > 0 && has(A, "trample")) hitTarget(left);
        }
      }
      // Los bloqueadores golpean al atacante.
      for (const B of Bs) if (deals(B) && B.pow > 0 && alive(A)) { hurt(B, A, B.pow); line.taken += B.pow; }
      // Mueren los que han recibido daño letal (o de toque mortal), salvo los indestructibles.
      for (const c of [A, ...Bs]) {
        if (!alive(c) || has(c, "indestructible")) continue;
        const d = dmg.get(c.key) || 0;
        if ((d > 0 && dtHit.has(c.key)) || (c.tou != null && d >= c.tou && d > 0)) dead.add(c.key);
      }
    }
    line.dies = [...dead];
    out.dies.push(...dead);
    out.lines.push(line);
  }
  return out;
}

// Fuerza/resistencia de una cara de Scryfall ("3", "*", "1+*") → número.
export const num = v => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : 0; };
