// Die Strecke von Leap: Plattformen (Land, das bis zum Boden reicht), Sprungpunkte in der Luft und
// Coins. Alles in Welt-Pixeln, y wächst nach unten, y = 0 ist die Oberkante der Startplattform.
//
// Die Figur fliegt immer mit demselben Tempo nach rechts (course.vx px/s). Darum ist jede Flugbahn
// eine Parabel über x:  y(x) = y0 + slope·(x − x0) + ½·G·(x − x0)²
// Die Form der Bögen hängt nur von G und der Absprung-Steigung ab - das Tempo bestimmt nur, wie
// schnell man sie durchfliegt. Die ganze Strecke ist dadurch reine Geometrie.
//
// Jeder Absprung (Schanze oder Punkt) hat ein festes Ziel: den nächsten Punkt bzw. die Landestelle
// auf der nächsten Plattform. Beim Drücken fängt der Punkt die Figur in seiner Mitte auf (game.js) -
// der Bogen danach ist darum immer genau der hier geplante, egal wie genau man gedrückt hat.
window.SL = window.SL || {};

SL.LEAP = {
  G: 0.016, // Krümmung der Bögen (px⁻¹) = Schwerkraft / Tempo²
  FIG_R: 13, // Radius der Figur
  POINT_R: 18, // Radius eines Sprungpunkts
  COIN_R: 5.5,
  // Absprung-Steigung (dy/dx) je Punkt-Art. Scheitelhöhe = slope² / (2·G): 28 / 66 / 125 px
  JUMPS: { hop: -0.95, normal: -1.45, high: -2.0 },
  RAMP_SLOPE: -1.2, // Schanze am Ende jeder Plattform
  RAMP_W: 56,
  // Wertung: so weit (zeitlich) darf man vom Mittelpunkt entfernt drücken
  WINDOW_MS: { perfect: 35, good: 70, ok: 100 },
  COOLDOWN_MS: 250, // Erschöpfung nach jedem Druck - so lange zählt kein weiterer
  MIN_GAP_MS: 380, // mindestens so viel Zeit zwischen zwei Punkten
};
SL.LEAP.RAMP_H = (SL.LEAP.RAMP_W * -SL.LEAP.RAMP_SLOPE) / 2;

// Parabel ab (x0, y0) mit Steigung slope
SL.leapArc = function leapArc(x0, y0, slope) {
  const G = SL.LEAP.G;
  return {
    x0, y0, slope,
    y(x) { const d = x - x0; return y0 + slope * d + 0.5 * G * d * d; },
    slopeAt(x) { return slope + G * (x - x0); },
  };
};

// Steigung, mit der man von (xs, ys) aus genau (xt, yt) trifft
SL.leapAim = function leapAim(xs, ys, xt, yt) {
  const D = xt - xs;
  return (yt - ys - 0.5 * SL.LEAP.G * D * D) / D;
};

// Höhe eines Punkts, während die Figur bei xFig ist. Bewegte Punkte schwingen mit dem Fortschritt der
// Figur (nicht mit der Uhr) - so stehen sie beim Eintreffen immer an derselben Stelle (p.y).
SL.leapPointY = function leapPointY(p, xFig) {
  if (!p.move) return p.y;
  return p.move.yc + p.move.amp * Math.sin((2 * Math.PI * xFig) / p.move.wave + p.move.phase);
};

// Oberfläche einer Plattform (Höhe der Figur-Mitte beim Rollen): flach, am Ende die Schanze
SL.leapGroundY = function leapGroundY(platform, x) {
  const { FIG_R, RAMP_W, RAMP_H } = SL.LEAP;
  if (!platform.ramp) return platform.top - FIG_R;
  const u = Math.max(0, Math.min(1, (x - (platform.x1 - RAMP_W)) / RAMP_W));
  return platform.top - RAMP_H * u * u - FIG_R;
};

// Welche Punkte ein Bogen trifft und wo er endet (Landung, Wand oder ins Leere). from = x, ab dem der
// Bogen gilt; skip = Punkte, die nicht mehr zählen (schon benutzt). Wird beim Spielen für jeden
// Absprung neu berechnet und vom Generator zum Prüfen benutzt.
SL.leapTraceArc = function leapTraceArc(course, arc, from, skip) {
  const { FIG_R, POINT_R } = SL.LEAP;
  const candidates = course.points.filter((p) =>
    p.x > from + 2 && p.x < from + 1600 && !(skip && skip.has(p.id)) && Math.abs(arc.y(p.x) - p.y) <= POINT_R * 0.9);

  // Erste Plattform, auf die der Bogen trifft: von oben auf die Oberfläche (Landung) oder von der
  // Seite gegen die Wand (Crash). Die Wand reicht bis zum Boden.
  let end = null;
  for (const pl of course.platforms) {
    if (pl.x1 <= from) continue;
    const surface = pl.top - FIG_R;
    if (pl.x0 > from && arc.y(pl.x0 - FIG_R * 0.6) > surface + 3) {
      end = { type: "wall", x: pl.x0 - FIG_R * 0.6, platform: pl };
      break;
    }
    // absteigender Schnittpunkt mit der Oberfläche
    const G = SL.LEAP.G, d0 = from - arc.x0;
    const a = 0.5 * G, b = arc.slope, c = arc.y0 - surface;
    const disc = b * b - 4 * a * c;
    if (disc < 0) continue;
    const xLand = arc.x0 + (-b + Math.sqrt(disc)) / (2 * a);
    if (xLand - arc.x0 >= d0 && xLand >= pl.x0 - 2 && xLand <= pl.x1) {
      end = { type: "land", x: Math.max(xLand, pl.x0), platform: pl };
      break;
    }
  }
  return { candidates: end ? candidates.filter((p) => p.x < end.x) : candidates, end };
};

// ---------- Generator ----------
// Die Strecke entsteht Abschnitt für Abschnitt: Startplattform, dann je Abschnitt eine Reihe Punkte
// und am Ende eine Checkpoint-Plattform mit Schanze bzw. das Ziel. buildCourse baut eine Level- oder
// Daily-Strecke auf einmal, der Endlosmodus (endless.js) hängt beim Spielen immer neue Abschnitte an.
// Jeder Abschnitt darf sein eigenes Tempo haben - es gilt ab seiner Absprung-Plattform (platform.vx).
//
// addSection(cfg) - cfg: { vx, points, forks, kinds: { normal, hop, high, move } (Gewichte),
//                          coinsPerFork, firstGap, goal }
// Wirft nie - notfalls nimmt er sichere Standardwerte.
SL.createCourseBuilder = function createCourseBuilder(seed) {
  const L = SL.LEAP, G = L.G, R = L.FIG_R;
  const rand = SL.createRng(seed);
  const Y_MIN = -230, Y_MAX = 190; // Strecke bleibt in diesem Höhenband
  const between = (a, b) => a + rand() * (b - a);

  const course = { vx: null, platforms: [], points: [], coins: [], forks: 0 };
  let paths = []; // Bögen, die man wirklich fliegt: { arc, from, to }
  let ghosts = []; // Weiterflug, wenn man einen Punkt verpasst: { arc, from }
  let sec = null; // laufender Abschnitt: { vx, gapPx, kinds, coinsPerFork }
  let firstPoint = 0, firstCoin = 0; // ab diesem Index liegen Punkte/Coins des laufenden Abschnitts

  const nearPath = (x, y, min) => paths.some((p) => x >= p.from - 4 && x <= p.to + 4 && Math.abs(p.arc.y(x) - y) < min);
  const nearGhost = (x, y, min) => ghosts.some((g) => x >= g.from && x <= g.from + 900 && Math.abs(g.arc.y(x) - y) < min);
  // Nur der laufende Abschnitt: alles davor liegt hinter einer ganzen Plattform, viel zu weit weg
  function nearThing(x, y, min) {
    for (let i = firstPoint; i < course.points.length; i++) {
      if (Math.hypot(course.points[i].x - x, course.points[i].y - y) < min) return true;
    }
    for (let i = firstCoin; i < course.coins.length; i++) {
      if (Math.hypot(course.coins[i].x - x, course.coins[i].y - y) < min) return true;
    }
    return false;
  }

  function pickKind(allowed) {
    const entries = Object.entries(sec.kinds).filter(([k, w]) => w > 0 && allowed.includes(k));
    if (!entries.length) return "normal";
    let r = rand() * entries.reduce((s, [, w]) => s + w, 0);
    for (const [k, w] of entries) {
      if ((r -= w) <= 0) return k;
    }
    return entries[entries.length - 1][0];
  }

  // Punkt auf dem Bogen eines Absprungs platzieren. minD: frühester Abstand ab dem Absprung.
  // Gesucht wird zwischen kurz vor dem Scheitel und der Stelle, ab der der Bogen zu steil wird.
  // Findet sich keine Stelle, die alle Regeln erfüllt, nimmt er die am wenigsten schlechte.
  function placeOnArc(launch, minD) {
    const arc = SL.leapArc(launch.x, launch.y, launch.slope);
    const dApex = -launch.slope / G;
    const dLo = Math.max(minD, dApex * 0.7);
    const dHi = Math.max(dLo + 1, Math.min((2.3 - launch.slope) / G, dApex * 2 + 140));
    const options = [];
    let fallback = null;
    const N = 28;
    for (let k = 0; k < N; k++) {
      const d = dLo + ((dHi - dLo) * (k + rand())) / N;
      const x = launch.x + d, y = arc.y(x);
      const bad = Math.max(0, Y_MIN - y) + Math.max(0, y - Y_MAX) + (nearGhost(x, y, 46) ? 300 : 0) + (nearThing(x, y, 60) ? 300 : 0);
      // Kurs zur Mitte des Höhenbands ziehen, sonst driftet er nach oben/unten weg
      if (bad === 0) options.push({ x, y, d, w: 1 / (1 + Math.pow((y + 20) / 110, 2)) });
      else if (!fallback || bad < fallback.bad) fallback = { x, y, d, bad };
    }
    if (!options.length) return { ...fallback, arc, ok: false };
    let r = rand() * options.reduce((s, o) => s + o.w, 0);
    for (const o of options) {
      if ((r -= o.w) <= 0) return { ...o, arc, ok: true };
    }
    return { ...options[options.length - 1], arc, ok: true };
  }

  function addPoint(x, y, kind, slope) {
    const p = { id: course.points.length, x, y, kind, slope, target: null };
    if (kind === "move") {
      const amp = between(22, 36);
      const wave = sec.vx * between(1.3, 1.9);
      const phase = rand() * Math.PI * 2;
      p.move = { amp, wave, phase, yc: y - amp * Math.sin((2 * Math.PI * x) / wave + phase) };
    }
    course.points.push(p);
    return p;
  }

  // Absprung (Schanze oder Punkt) bekommt sein Ziel: Bogen merken, Weiterflug als "Geist" merken
  function link(launch, target) {
    launch.target = target;
    const arc = SL.leapArc(launch.x, launch.y, SL.leapAim(launch.x, launch.y, target.x, target.y));
    paths.push({ arc, from: launch.x, to: target.x });
    if (target.kind !== "land") ghosts.push({ arc, from: target.x + 1 });
  }

  // spawnX: hier wartet die Figur nach einem Absturz - am Checkpoint rechts neben der Fahne, damit
  // das Fahnentuch (bis x0 + 40) nicht über ihr hängt
  function addPlatform(kind, x0, x1, top) {
    const pl = {
      index: course.platforms.length, kind, x0, x1, top,
      ramp: kind !== "goal",
      spawnX: x0 + (kind === "start" ? 70 : 58),
      flagX: x0 + 22,
      target: null,
    };
    course.platforms.push(pl);
    return pl;
  }

  // Kante der Schanze = Absprung der Plattform
  function rampLaunch(pl) {
    return { x: pl.x1, y: pl.top - L.RAMP_H - R, slope: L.RAMP_SLOPE, kind: "ramp" };
  }

  // Gabelung: Punkt A kurz vor P auf demselben Bogen. Wer schon bei A springt, fliegt einen höheren
  // Bogen durch die Coins und kommt bei C wieder auf den normalen Weg.
  function tryFork(fork, C) {
    const { A, P } = fork;
    const slopeA = SL.leapAim(A.x, A.y, C.x, C.y);
    const arcA = SL.leapArc(A.x, A.y, slopeA);
    const apex = slopeA < 0 ? (slopeA * slopeA) / (2 * G) : 0;
    if (apex > 200 || arcA.slopeAt(C.x) > 2.6) return false;
    if (Math.abs(arcA.y(P.x) - P.y) < 48) return false;
    // A-Bogen darf keinen anderen Punkt streifen
    if (course.points.some((p) => p !== A && p !== C && p.x > A.x && p.x < C.x && Math.abs(arcA.y(p.x) - p.y) < 40)) return false;
    if (A.y - apex < Y_MIN - 90) return false;

    // Coins dort, wo der A-Bogen weit genug von allen anderen Wegen weg ist
    const spots = [];
    for (let x = A.x + 46; x < C.x - 40; x += 34) {
      const y = arcA.y(x);
      if (nearPath(x, y, 44) || nearGhost(x, y, 40) || nearThing(x, y, 36)) continue;
      spots.push({ x, y });
    }
    if (spots.length < 2) return false;
    // zusammenhängende Reihe um die Mitte der möglichen Stellen
    const want = Math.min(sec.coinsPerFork || 3, spots.length);
    const start = Math.floor((spots.length - want) / 2);
    for (const s of spots.slice(start, start + want)) course.coins.push({ id: course.coins.length, x: s.x, y: s.y });

    A.slope = slopeA;
    // Optik: welche Art Sprung A ist (in Kapitel 1 sehen alle Punkte gleich aus)
    if (sec.kinds.high || sec.kinds.hop) A.kind = slopeA <= -1.75 ? "high" : slopeA >= -1.15 ? "hop" : "normal";
    link(A, C);
    course.forks++;
    return true;
  }

  // Landeplattform hinter dem letzten Punkt Q: höher als Q (sonst könnte man Q auslassen und trotzdem
  // landen) und so weit weg, dass nur Qs Sprung hinkommt.
  function placeLanding(Q) {
    const apexQ = (Q.slope * Q.slope) / (2 * G);
    for (let k = 0; k < 24; k++) {
      const H = between(26, Math.max(30, apexQ - 16)); // Landestelle so viel über Q
      const s = Q.slope;
      const disc = s * s - 2 * G * H;
      if (disc <= 0) continue;
      const dLand = (-s + Math.sqrt(disc)) / G;
      const dUp = (-s - Math.sqrt(disc)) / G;
      const top = Q.y - H + R;
      if (top < Y_MIN - 30 || top > Y_MAX + 30) continue;
      const xLand = Q.x + dLand;
      const x0 = Math.max(Q.x + dUp + R + 10, xLand - between(50, 90), Q.x + 40);
      if (x0 > xLand - 24) continue;
      // jeder Weiterflug (verpasster Punkt) muss gegen die Wand gehen, nicht oben drauf
      if (ghosts.some((g) => g.from < x0 && g.arc.y(x0 - R) < top - R + 8)) continue;
      return { xLand, x0, top };
    }
    // Notlösung: knapp über Q landen
    const s = Q.slope, H = 26;
    const dLand = (-s + Math.sqrt(s * s - 2 * G * H)) / G;
    return { xLand: Q.x + dLand, x0: Q.x + dLand - 40, top: Q.y - H + R };
  }

  // Abschnitt abschließen: Punkte und Coins nach x sortieren und durchnummerieren (Gabelungen wurden
  // nachträglich eingefügt), Ziele als Verweis speichern - Punkt { kind: "point", id } oder
  // Landestelle { kind: "land", x, y, platform }. Frühere Abschnitte liegen komplett weiter links,
  // ihre Nummern bleiben gültig. from = Plattform, von deren Schanze der Abschnitt abspringt.
  function finishSection(from) {
    const points = course.points.splice(firstPoint).sort((a, b) => a.x - b.x);
    points.forEach((p, i) => { p.id = firstPoint + i; });
    course.points.push(...points);
    const coins = course.coins.splice(firstCoin).sort((a, b) => a.x - b.x);
    coins.forEach((c, i) => { c.id = firstCoin + i; });
    course.coins.push(...coins);
    for (const p of points) {
      if (p.target && p.target.kind !== "land") p.target = { kind: "point", id: p.target.id };
    }
    const t = from.launch.target;
    from.target = t.kind === "land" ? t : { kind: "point", id: t.id };
    delete from.launch;
  }

  // ---- Aufbau ----
  let pl = addPlatform("start", -340, 0, 0);
  let launch = rampLaunch(pl);
  pl.launch = launch;
  course.startX = pl.spawnX;
  const allKinds = ["normal", "hop", "high", "move"];

  // Hängt einen Abschnitt an: Punkte ab der letzten Schanze, dann Checkpoint bzw. Ziel. Liefert, wie
  // viele Gabelungen wirklich entstanden sind.
  function addSection(cfg) {
    const n = cfg.points;
    const gapPx = (cfg.vx * L.MIN_GAP_MS) / 1000;
    sec = { vx: cfg.vx, gapPx, kinds: cfg.kinds, coinsPerFork: cfg.coinsPerFork };
    if (course.vx == null) course.vx = cfg.vx;
    const from = pl;
    from.vx = cfg.vx; // ab dieser Plattform gilt das Tempo des neuen Abschnitts
    firstPoint = course.points.length;
    firstCoin = course.coins.length;
    // Was komplett hinter der Schanze liegt, kann keinem neuen Punkt mehr im Weg sein
    paths = paths.filter((p) => p.to + 4 >= launch.x);
    ghosts = ghosts.filter((g) => g.from + 900 >= launch.x);

    let forksLeft = cfg.forks || 0;
    let made = 0;
    let fork = null;
    for (let i = 0; i < n; i++) {
      const isLast = i === n - 1;
      // Gabelung geplant? Dann P weiter weg setzen, damit davor Platz für A ist
      let wantFork = forksLeft > 0 && i >= 1 && i <= n - 2 && launch.kind !== "ramp" && launch.slope <= L.JUMPS.normal &&
        (rand() < 0.6 || n - 2 - i < forksLeft);
      const minD = i === 0 ? Math.max(gapPx, cfg.firstGap || 0) : gapPx;
      let spot = wantFork ? placeOnArc(launch, gapPx * 2.25) : placeOnArc(launch, minD);
      if (wantFork && !spot.ok) {
        // so weit hinten ist kein Platz im Höhenband - dann hier keine Gabelung
        wantFork = false;
        spot = placeOnArc(launch, minD);
      }
      // Punkt-Art: am oberen Rand kein Hochsprung, am unteren kein Hüpfer (sonst läuft der Kurs weg)
      const allowed = (isLast ? ["normal", "high"] : allKinds)
        .filter((k) => !(k === "high" && spot.y < Y_MIN + 70) && !(k === "hop" && spot.y > Y_MAX - 40));
      const kind = pickKind(allowed.length ? allowed : ["normal"]);
      const P = addPoint(spot.x, spot.y, kind, L.JUMPS[kind === "move" ? "normal" : kind]);
      link(launch, P);

      if (fork) {
        if (!tryFork(fork, P)) course.points.splice(course.points.indexOf(fork.A), 1);
        else forksLeft--, made++;
        fork = null;
      }

      // Gabelung vorbereiten: A auf demselben Bogen vor P (wird beim nächsten Punkt aufgelöst)
      if (wantFork) {
        const xA = P.x - gapPx * between(1.0, 1.2);
        const yA = spot.arc.y(xA);
        if (xA - launch.x >= gapPx && !nearGhost(xA, yA, 46) && !nearThing(xA, yA, 60) && yA > Y_MIN - 30) {
          fork = { A: addPoint(xA, yA, "normal", L.JUMPS.normal), P };
        }
      }
      launch = P;
    }
    if (fork) course.points.splice(course.points.indexOf(fork.A), 1);

    // Plattform am Ende des Abschnitts: Checkpoint mit Schanze bzw. das Ziel
    const spot = placeLanding(launch);
    const roll = cfg.vx * (cfg.goal ? 0.55 : 0.95);
    const x1 = cfg.goal ? spot.xLand + roll + 320 : spot.xLand + roll + L.RAMP_W;
    pl = addPlatform(cfg.goal ? "goal" : "checkpoint", spot.x0, x1, spot.top);
    if (cfg.goal) pl.goalX = spot.xLand + roll;
    pl.vx = cfg.vx; // bis ein weiterer Abschnitt folgt (der setzt sein eigenes Tempo)
    link(launch, { kind: "land", x: spot.xLand, y: spot.top - R, platform: pl.index });
    if (!cfg.goal) {
      launch = rampLaunch(pl);
      pl.launch = launch;
    }
    finishSection(from);
    return made;
  }

  return { course, addSection };
};

// Level- und Daily-Strecke auf einmal. cfg: { seed, vx, points, checkpoints, kinds, forks,
// coinsPerFork, firstGap } - Punkte und Gabelungen werden gleichmäßig auf die Abschnitte verteilt.
SL.buildCourse = function buildCourse(cfg) {
  const builder = SL.createCourseBuilder(cfg.seed);
  const segCount = (cfg.checkpoints || 0) + 1;
  const per = cfg.points / segCount;
  let forksLeft = cfg.forks || 0;
  for (let s = 0; s < segCount; s++) {
    forksLeft -= builder.addSection({
      vx: cfg.vx,
      points: Math.max(2, Math.round(per * (s + 1)) - Math.round(per * s)),
      forks: Math.round(forksLeft / (segCount - s)), // gleichmäßig auf die Abschnitte verteilen
      kinds: cfg.kinds,
      coinsPerFork: cfg.coinsPerFork,
      firstGap: s === 0 ? cfg.firstGap : 0, // nur vor dem allerersten Punkt
      goal: s === segCount - 1,
    });
  }
  const course = builder.course;
  course.goalX = course.platforms[course.platforms.length - 1].goalX;
  course.jumpCount = countJumps(course);
  return course;
};

// Wie viele Sprünge der Hauptweg hat (Gabelungen ersetzen einen Sprung, zählen also nicht extra)
function countJumps(course) {
  let n = 0;
  let t = course.platforms[0].target;
  const seen = new Set();
  while (t && t.kind === "point" && !seen.has(t.id)) {
    seen.add(t.id);
    n++;
    const p = course.points[t.id];
    t = p.target && p.target.kind === "point" ? p.target : null;
    if (!t) {
      const land = p.target;
      const pl = land && course.platforms[land.platform];
      t = pl && pl.target;
    }
  }
  return n;
}
