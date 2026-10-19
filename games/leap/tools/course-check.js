// Prüft alle Leap-Strecken (30 Level + die Dailys der nächsten Wochen) per Simulation:
//   - perfekt gespielt kommt man ins Ziel (jeder Punkt genau in der Mitte gedrückt)
//   - lässt man irgendeinen Punkt des Hauptwegs aus, stürzt man ab (kein Abkürzen)
//   - über jede Gabelung (früher Punkt) geht es weiter, und dort liegen die Coins
//   - Abstände zwischen Punkten sind groß genug für die Erschöpfung
//
//   npm run leap-check            -> Tabelle + Fehler
//   node games/leap/tools/course-check.js --level 7 --dump   -> eine Strecke als JSON
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
globalThis.window = globalThis;
eval(fs.readFileSync(path.join(root, "..", "..", "shared", "js", "rng.js"), "utf8"));
eval(fs.readFileSync(path.join(root, "..", "..", "shared", "js", "days.js"), "utf8"));
for (const f of ["course", "levels", "economy", "game", "daily"]) {
  eval(fs.readFileSync(path.join(root, "js", f + ".js"), "utf8"));
}

const args = process.argv.slice(2);
const FRAME = 1000 / 60;

// Spielt eine Strecke ab. plan(point) -> Offset in ms zum Mittelpunkt oder null (nicht drücken).
// Liefert { finished, falls, jumps, coins, timeMs }
function simulate(course, plan, maxMs = 240000) {
  const s = new SL.LeapSession(course);
  let now = 0;
  s.press(now); // losrollen
  const pending = []; // geplante Drücke (Zeitpunkte)
  let lastArc = null;
  let falls = 0;
  s.onMiss = () => { falls++; };
  while (now < maxMs && !s.finished) {
    now += FRAME;
    // Für jeden neuen Bogen die Drücke planen (Kandidat = Ziel des Bogens bzw. vom Plan gewählt)
    if (s.mode === "air" && s.arc !== lastArc) {
      lastArc = s.arc;
      pending.length = 0;
      const t = s.clock(now);
      for (const p of s.trace.candidates) {
        const off = plan(p, s);
        if (off == null) continue;
        const at = s.t0 + ((p.x - s.x0) / s.vx) * 1000 + off; // Lauf-Uhr beim Mittelpunkt + Offset
        pending.push(at - t + now);
        break; // nur einen Punkt pro Bogen anpeilen
      }
    }
    for (let i = pending.length - 1; i >= 0; i--) {
      if (pending[i] <= now) {
        s.press(pending[i]);
        pending.splice(i, 1);
      }
    }
    s.update(now);
    if (s.mode === "wait") { // nach Absturz: sofort weiter
      if (falls > 0) return { finished: false, falls, jumps: s.jumps.length, coins: s.collected.size, timeMs: now };
      s.press(now);
    }
  }
  return { finished: s.finished, falls, jumps: s.jumps.length, coins: s.collected.size, timeMs: now };
}

// Hauptweg: immer das Ziel des aktuellen Bogens (nie die Gabelung)
const mainPlan = (p, s) => (p === s.target ? 0 : null);
// Gabelungen nehmen: immer den ersten Kandidaten
const forkPlan = () => 0;

function check(name, course) {
  const errors = [];
  const main = simulate(course, mainPlan);
  if (!main.finished) errors.push(`Hauptweg kommt nicht ins Ziel (Abstürze ${main.falls})`);
  const fork = simulate(course, forkPlan);
  if (!fork.finished) errors.push("Weg über die Gabelungen kommt nicht ins Ziel");
  if (course.coins.length && fork.coins !== course.coins.length) errors.push(`Gabelungs-Weg sammelt nur ${fork.coins}/${course.coins.length} Coins`);
  if (main.coins) errors.push(`Hauptweg sammelt ${main.coins} Coins (sollten nur über Gabelungen gehen)`);

  // Jeden Punkt des Hauptwegs einmal auslassen -> muss abstürzen
  const mainPoints = [];
  let t = course.platforms[0].target;
  while (t) {
    if (t.kind === "point") {
      const p = course.points[t.id];
      mainPoints.push(p);
      t = p.target;
    } else {
      t = course.platforms[t.platform].target;
    }
  }
  for (const skip of mainPoints) {
    const r = simulate(course, (p, s) => (p === skip ? null : p === s.target ? 0 : null));
    if (r.finished) errors.push(`Punkt ${skip.id} (x ${Math.round(skip.x)}) lässt sich auslassen`);
  }

  // Abstände
  const minGap = (course.vx * SL.LEAP.MIN_GAP_MS) / 1000 - 1;
  const xs = course.points.map((p) => p.x).sort((a, b) => a - b);
  for (let i = 1; i < xs.length; i++) {
    if (xs[i] - xs[i - 1] < minGap) errors.push(`Punkte zu dicht bei x ${Math.round(xs[i])}`);
  }
  const ys = course.points.map((p) => p.y);
  return {
    name,
    vx: course.vx,
    points: course.points.length,
    jumps: course.jumpCount,
    forks: course.forks,
    coins: course.coins.length,
    cps: course.platforms.filter((p) => p.kind === "checkpoint").length,
    secs: (main.timeMs / 1000).toFixed(1),
    yRange: `${Math.round(Math.min(...ys))}..${Math.round(Math.max(...ys))}`,
    errors,
  };
}

if (args.includes("--dump")) {
  const id = Number(args[args.indexOf("--level") + 1]) || 1;
  console.log(JSON.stringify(SL.getLevelCourse(id), null, 1));
  process.exit(0);
}

const rows = [];
for (const level of SL.LEVELS) rows.push(check(`Level ${level.id}`, SL.getLevelCourse(level.id)));
const today = SL.Days.key(new Date(2026, 9, 19));
for (let d = 0; d < 42; d++) {
  const key = SL.Days.shift(today, d);
  const config = SL.Daily.getConfig(key);
  rows.push(check(`Daily ${key} ${config.difficulty}`, SL.Daily.getCourse(config)));
}

let failed = 0;
console.log("Strecke                       Tempo Punkte Sprünge Gabeln Coins CPs  Dauer  Höhe");
for (const r of rows) {
  console.log(`${r.name.padEnd(29)} ${String(r.vx).padStart(5)} ${String(r.points).padStart(6)} ${String(r.jumps).padStart(7)} ${String(r.forks).padStart(6)} ${String(r.coins).padStart(5)} ${String(r.cps).padStart(3)} ${r.secs.padStart(5)}s  ${r.yRange}`);
  for (const e of r.errors) console.log("   ! " + e);
  if (r.errors.length) failed++;
}
console.log(failed ? `\n${failed} Strecken mit Fehlern` : "\nAlle Strecken in Ordnung");
process.exitCode = failed ? 1 : 0;
