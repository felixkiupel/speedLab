// Prüft alle Leap-Strecken (30 Level + die Dailys der nächsten Wochen + einige Endlos-Läufe mit
// festem Seed) per Simulation:
//   - perfekt gespielt kommt man ins Ziel (jeder Punkt genau in der Mitte gedrückt)
//   - lässt man irgendeinen Punkt des Hauptwegs aus, stürzt man ab (kein Abkürzen)
//   - über jede Gabelung (früher Punkt) geht es weiter, und dort liegen die Coins
//   - Abstände zwischen Punkten sind groß genug für die Erschöpfung
// Endlos gibt es kein Ziel: dort gilt "Ziel" = die ersten ENDLESS_SECTIONS Checkpoints erreicht.
//
//   npm run leap-check            -> Tabelle + Fehler
//   node games/leap/tools/course-check.js --level 7 --dump   -> eine Strecke als JSON
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
globalThis.window = globalThis;
eval(fs.readFileSync(path.join(root, "..", "..", "shared", "js", "rng.js"), "utf8"));
eval(fs.readFileSync(path.join(root, "..", "..", "shared", "js", "days.js"), "utf8"));
for (const f of ["course", "levels", "economy", "game", "daily", "endless"]) {
  eval(fs.readFileSync(path.join(root, "js", f + ".js"), "utf8"));
}

const args = process.argv.slice(2);
const FRAME = 1000 / 60;

// Spielt eine Strecke ab. plan(point) -> Offset in ms zum Mittelpunkt oder null (nicht drücken).
// endless: { run, sections } - Strecke beim Spielen erweitern, fertig nach so vielen Checkpoints.
// Liefert { finished, falls, jumps, coins, timeMs }
function simulate(course, plan, endless = null) {
  const maxMs = endless ? 60000 * endless.sections : 240000;
  const s = new SL.LeapSession(course);
  if (endless) {
    s.onCheckpoint = (pl) => {
      endless.run.extend(pl.index);
      if (pl.index >= endless.sections) s.finished = true;
    };
  }
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

// course(): baut die Strecke frisch - Endlos-Strecken wachsen beim Simulieren und brauchen pro
// Durchlauf eine neue (gleicher Seed = gleiche Strecke). endless: { seed, sections } oder null.
function check(name, makeCourse, endless = null) {
  const errors = [];
  let course = makeCourse();
  const sim = (plan) => {
    if (!endless) return simulate(course, plan);
    const run = SL.Endless.createRun(endless.seed);
    course = run.course;
    return simulate(course, plan, { run, sections: endless.sections });
  };
  const main = sim(mainPlan);
  if (!main.finished) errors.push(`Hauptweg kommt nicht ins Ziel (Abstürze ${main.falls})`);
  const fork = sim(forkPlan);
  // Endlos: nur die Coins bis zum letzten geprüften Checkpoint zählen
  const endX = endless ? course.platforms[endless.sections].x0 : Infinity;
  const coinsTotal = course.coins.filter((c) => c.x < endX).length;
  if (!fork.finished) errors.push("Weg über die Gabelungen kommt nicht ins Ziel");
  if (coinsTotal && fork.coins !== coinsTotal) errors.push(`Gabelungs-Weg sammelt nur ${fork.coins}/${coinsTotal} Coins`);
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
  const tested = mainPoints.filter((p) => p.x < endX);
  for (const skip of tested) {
    // Punkte haben in jeder frisch gebauten Strecke dieselbe ID
    const r = sim((p, s) => (p.id === skip.id ? null : p === s.target ? 0 : null));
    if (r.finished) errors.push(`Punkt ${skip.id} (x ${Math.round(skip.x)}) lässt sich auslassen`);
  }

  // Abstände - jeder Abschnitt mit seinem Tempo (gilt ab seiner Absprung-Plattform)
  const plats = course.platforms.filter((p) => p.x0 < endX);
  plats.forEach((pl, i) => {
    const minGap = ((pl.vx || course.vx) * SL.LEAP.MIN_GAP_MS) / 1000 - 1;
    const next = course.platforms[i + 1] ? course.platforms[i + 1].x0 : Infinity;
    const xs = course.points.filter((p) => p.x > pl.x1 && p.x < next).map((p) => p.x).sort((a, b) => a - b);
    for (let k = 1; k < xs.length; k++) {
      if (xs[k] - xs[k - 1] < minGap) errors.push(`Punkte zu dicht bei x ${Math.round(xs[k])}`);
    }
  });
  const inRange = course.points.filter((p) => p.x < endX);
  const ys = inRange.map((p) => p.y);
  const speeds = [...new Set(plats.map((p) => p.vx || course.vx))];
  return {
    name,
    vx: speeds.length > 1 ? `${Math.min(...speeds)}-${Math.max(...speeds)}` : course.vx,
    points: inRange.length,
    jumps: endless ? tested.length : course.jumpCount,
    forks: endless ? "" : course.forks,
    coins: coinsTotal,
    cps: endless ? endless.sections : course.platforms.filter((p) => p.kind === "checkpoint").length,
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

const ENDLESS_SECTIONS = 12; // so viele Checkpoints pro Endlos-Lauf prüfen
const ENDLESS_SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];

const rows = [];
for (const level of SL.LEVELS) rows.push(check(`Level ${level.id}`, () => SL.getLevelCourse(level.id)));
const today = SL.Days.key(new Date(2026, 9, 19));
for (let d = 0; d < 42; d++) {
  const key = SL.Days.shift(today, d);
  const config = SL.Daily.getConfig(key);
  rows.push(check(`Daily ${key} ${config.difficulty}`, () => SL.Daily.getCourse(config)));
}
for (const seed of ENDLESS_SEEDS) {
  rows.push(check(`Endlos Seed ${seed}`, () => SL.Endless.createRun(seed).course, { seed, sections: ENDLESS_SECTIONS }));
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
