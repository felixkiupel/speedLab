// Kern-Simulation eines Laufs. Ein Zug = rutschen bis zum Hindernis: Wohin es geht, steht sofort
// fest (SL.slide), die Bewegung selbst läuft als Animation mit fester Dauer (SL.slideDuration).
// Coins zählen erst, wenn die Figur wirklich drüberrutscht, das Ziel erst, wenn sie dort liegen
// bleibt. Eingaben während des Rutschens landen in einer kleinen Warteschlange - wer die Lösung
// kennt, kann Züge vorausdrücken und verliert zwischen den Rutschern keine Zeit.
window.SL = window.SL || {};

const QUEUE_MAX = 3;
const REWIND_MS = 110;
const BUMP_MS = 170;
const FALL_MS = 420; // so lange dauert das Reinfallen ins Loch
SL.FALL_MS = FALL_MS;

// Rutsch-Verlauf (Zeit 0..1 -> Strecke 0..1): kurz anschieben, dann volles Tempo bis zum harten
// Stopp. Der Aufprall kommt so mit voller Wucht, statt sanft auszurollen.
SL.slideEase = function slideEase(t) {
  const push = 0.25; // Anteil der Zeit, in dem beschleunigt wird
  const k = 0.3; // Starttempo relativ zum Höchsttempo
  const vmax = 1 / ((push * (1 + k)) / 2 + (1 - push));
  if (t < push) {
    const v = k * vmax + (1 - k) * vmax * (t / push);
    return ((k * vmax + v) / 2) * t;
  }
  return ((push * (1 + k)) / 2) * vmax + (t - push) * vmax;
};

SL.GameSession = function GameSession(level, puzzle) {
  this.level = level;
  this.board = puzzle.board; // wird nicht verändert
  this.analysis = puzzle.analysis;
  this.thresholds = puzzle.thresholds;

  this.pos = { ...this.board.start }; // logische Position (beim Rutschen schon das Zielfeld)
  this.dir = null; // Blickrichtung der Figur
  this.history = []; // pro Zug: { pos vorher, coins: Feld-Keys, die dieser Zug eingesammelt hat }
  this.collected = new Set();
  this.queue = [];
  this.moveCount = 0; // alle Rutscher, auch zurückgenommene - "Züge" im Ergebnis
  this.anim = null; // laufender Rutscher { from, to, path, dir, start, duration, done }
  this.rewind = null; // kurze Rück-Animation nach "Zug zurück"
  this.bump = null; // Anstupsen, wenn direkt ein Hindernis im Weg ist
  this.impact = null; // letzter Aufprall { dir, start, tiles, cell, snow }
  this.stuck = false; // steht in einer Sackgasse (Ziel von hier aus unerreichbar)
  this.started = false;
  this.finished = false;
  this.finishedAt = null; // wann die Figur im Ziel liegen geblieben ist (für die Verwandlung)
  this.fall = null; // ins Loch gefallen { start } - der Lauf ist dann vorbei
  this.pausedAt = null;
  // Stoppuhr wie bei Maze über performance.now(): elapsedMs = abgeschlossene Abschnitte,
  // runningSince = Beginn des laufenden Abschnitts (null = Uhr steht)
  this.elapsedMs = 0;
  this.runningSince = null;

  // Hooks (setzt die UI)
  this.onStart = null;
  this.onSlide = null; // (anim)
  this.onCoin = null; // (cell)
  this.onPassGoal = null; // (cell) - übers Ziel gerutscht, ohne liegen zu bleiben
  this.onStop = null; // (impact)
  this.onBump = null; // (dir)
  this.onFall = null; // ins Loch gerutscht
  this.onStuck = null; // in eine Sackgasse gerutscht
  this.onUnstuck = null; // wieder raus (per Zug zurück)
  this.onUndo = null;
  this.onFinish = null; // (result)
};

const Session = SL.GameSession.prototype;

Session.keyOf = function keyOf(p) {
  return p.r * this.board.cols + p.c;
};

Session.isGoal = function isGoal(p) {
  return p.r === this.board.goal.r && p.c === this.board.goal.c;
};

// Die Uhr startet beim ersten Zug oder wenn die Level-Einblendung fertig ist - je nachdem, was
// zuerst kommt. Bedenkzeit zählt also mit.
Session.startClock = function startClock(at) {
  if (this.started) return;
  this.started = true;
  this.runningSince = at;
  if (this.onStart) this.onStart();
};

Session.getElapsedMs = function getElapsedMs(now = performance.now()) {
  if (this.runningSince == null) return this.elapsedMs;
  return this.elapsedMs + Math.max(0, now - this.runningSince);
};

// Pause hält Uhr UND Animationen an: alle Startzeiten rücken beim Weiterspielen um die Pause nach
Session.pause = function pause(now) {
  if (this.pausedAt != null) return;
  this.pausedAt = now;
  if (this.runningSince != null) {
    this.elapsedMs += now - this.runningSince;
    this.runningSince = null;
  }
};

Session.resume = function resume(now) {
  if (this.pausedAt == null) return;
  const shift = now - this.pausedAt;
  this.pausedAt = null;
  for (const a of [this.anim, this.rewind, this.bump, this.impact, this.fall]) if (a) a.start += shift;
  if (this.started && !this.finished && !this.fall) this.runningSince = now;
};

Session.requestMove = function requestMove(dir, now) {
  if (this.finished || this.fall || this.pausedAt != null) return;
  this.startClock(now);
  if (this.anim) {
    if (this.queue.length < QUEUE_MAX) this.queue.push(dir);
    return;
  }
  this._begin(dir, now);
};

// Nur anstupsen, ohne zu rutschen (das Tutorial lehnt so falsche Richtungen ab)
Session.nudge = function nudge(dir, now) {
  if (this.anim || this.finished || this.fall) return;
  this.dir = dir;
  this.bump = { dir, start: now };
};

// Startet einen Rutscher. false = direkt ein Hindernis im Weg, die Figur stupst nur kurz an.
Session._begin = function _begin(dir, at) {
  const move = SL.slide(this.board, this.pos, dir);
  this.dir = dir;
  if (!move) {
    this.bump = { dir, start: at };
    if (this.onBump) this.onBump(dir);
    return false;
  }
  this.rewind = null;
  this.bump = null;
  this.history.push({ pos: this.pos, coins: [] });
  this.moveCount++;
  this.anim = { from: this.pos, to: move.to, path: move.path, dir, start: at, duration: SL.slideDuration(move.path.length), done: 0, fell: move.fell };
  this.pos = move.to;
  if (this.onSlide) this.onSlide(this.anim);
  return true;
};

Session.update = function update(now) {
  if (this.pausedAt != null) return;
  // while: bei einem Ruckler (Tab im Hintergrund) können mehrere vorgemerkte Züge in einem Frame enden
  while (this.anim) {
    const a = this.anim;
    const t = Math.min(1, Math.max(0, (now - a.start) / a.duration));
    const traveled = SL.slideEase(t) * a.path.length;
    // Felder, über deren Mitte die Figur schon gerutscht ist
    while (a.done < a.path.length && traveled >= a.done + 0.5) {
      this._cross(a.path[a.done], a.done === a.path.length - 1);
      a.done++;
    }
    if (t < 1) break;
    this._land(a.start + a.duration);
  }
  if (this.bump && now - this.bump.start > BUMP_MS) this.bump = null;
  if (this.rewind && now - this.rewind.start > REWIND_MS) this.rewind = null;
};

Session._cross = function _cross(cell, isLast) {
  const k = this.keyOf(cell);
  if (!this.collected.has(k) && this.board.coins.some((co) => co.r === cell.r && co.c === cell.c)) {
    this.collected.add(k);
    this.history[this.history.length - 1].coins.push(k);
    if (this.onCoin) this.onCoin(cell);
  }
  if (!isLast && this.isGoal(cell) && this.onPassGoal) this.onPassGoal(cell);
};

// Rutscher zu Ende. "at" = exaktes Ende laut Dauer, nicht der (spätere) Frame - so misst die Uhr
// den Zieleinlauf auf die Millisekunde, und vorgemerkte Züge starten ohne Lücke.
Session._land = function _land(at) {
  const a = this.anim;
  this.anim = null;

  // Ins Loch: Uhr steht, nichts geht mehr - die UI startet das Level neu
  if (a.fell) {
    this.queue = [];
    this.fall = { start: at };
    if (this.runningSince != null) {
      this.elapsedMs += Math.max(0, at - this.runningSince);
      this.runningSince = null;
    }
    if (this.onFall) this.onFall(a.to);
    return;
  }

  this.impact = { dir: a.dir, start: at, tiles: a.path.length, cell: a.to, snow: this.board.grid[a.to.r][a.to.c] === SL.SNOW };
  if (this.onStop) this.onStop(this.impact);

  if (this.isGoal(a.to)) {
    this.queue = [];
    this.finished = true;
    this.finishedAt = at;
    if (this.runningSince != null) {
      this.elapsedMs += Math.max(0, at - this.runningSince);
      this.runningSince = null;
    }
    if (this.onFinish) this.onFinish(this.buildResult());
    return;
  }

  // Vorgemerkte Züge abarbeiten; welche direkt gegen ein Hindernis gehen, fallen weg
  while (this.queue.length) {
    if (this._begin(this.queue.shift(), at)) return;
  }

  this._setStuck(!this.analysis.alive.has(this.keyOf(a.to)));
};

// Meldet nur Wechsel: einmal beim Hineinrutschen in eine Sackgasse, einmal beim Herauskommen -
// nicht bei jedem Zug, den man darin macht
Session._setStuck = function _setStuck(dead) {
  if (dead === this.stuck) return;
  this.stuck = dead;
  const hook = dead ? this.onStuck : this.onUnstuck;
  if (hook) hook();
};

// Letzten Zug zurücknehmen: Figur huscht zurück, dabei eingesammelte Coins liegen wieder da.
// Die Uhr läuft weiter - ein Fehler kostet also die Zeit für Hin- und Rückweg.
Session.undo = function undo(now) {
  if (this.finished || this.fall || this.pausedAt != null || !this.history.length) return false;
  const shown = this.getPlayerPos(now);
  const entry = this.history.pop();
  for (const k of entry.coins) this.collected.delete(k);
  this.anim = null;
  this.queue = [];
  this.bump = null;
  this.pos = entry.pos;
  this.rewind = { from: shown, to: { ...entry.pos }, start: now };
  if (this.onUndo) this.onUndo(entry);
  this._setStuck(!this.analysis.alive.has(this.keyOf(this.pos)));
  return true;
};

Session.buildResult = function buildResult() {
  return {
    timeMs: this.elapsedMs,
    stars: SL.Economy.starsForTime(this.elapsedMs, this.thresholds),
    moves: this.moveCount,
    minMoves: this.analysis.minMoves,
    coinsCollected: this.collected.size,
    coinsTotal: this.board.coins.length,
  };
};

// Angezeigte Position in Feld-Koordinaten (Kommazahlen) - inklusive Rutschen, Zurückhuschen und
// Anstupsen. Die Logik kennt nur ganze Felder (this.pos).
Session.getPlayerPos = function getPlayerPos(now) {
  if (this.anim) {
    const a = this.anim;
    const t = Math.min(1, Math.max(0, (now - a.start) / a.duration));
    const s = SL.slideEase(t) * a.path.length;
    const d = SL.DIRS[a.dir];
    return { r: a.from.r + d.dr * s, c: a.from.c + d.dc * s };
  }
  if (this.rewind) {
    const t = Math.min(1, (now - this.rewind.start) / REWIND_MS);
    const e = 1 - Math.pow(1 - t, 3);
    const { from, to } = this.rewind;
    return { r: from.r + (to.r - from.r) * e, c: from.c + (to.c - from.c) * e };
  }
  if (this.bump) {
    const t = Math.min(1, (now - this.bump.start) / BUMP_MS);
    const off = Math.sin(t * Math.PI) * 0.12;
    const d = SL.DIRS[this.bump.dir];
    return { r: this.pos.r + d.dr * off, c: this.pos.c + d.dc * off };
  }
  return { r: this.pos.r, c: this.pos.c };
};

// Zeit seit dem Reinfallen in ms (das Versinken dauert SL.FALL_MS, die Wellen laufen danach
// noch weiter), null = nicht gefallen
Session.getFallMs = function getFallMs(now) {
  if (!this.fall) return null;
  return Math.max(0, now - this.fall.start);
};

// Zeit seit dem Liegenbleiben im Ziel in ms, null = noch nicht im Ziel
Session.getFinishMs = function getFinishMs(now) {
  if (this.finishedAt == null) return null;
  return Math.max(0, now - this.finishedAt);
};

// Verformung der Figur: beim Rutschen in Fahrtrichtung gestreckt, beim Aufprall gestaucht und
// kurz nachfedernd. Liefert { dir, along } - along > 0 streckt, < 0 staucht entlang der Richtung.
// Im Ziel keine, da wird die Figur zum Quadrat (siehe Renderer).
Session.getDeform = function getDeform(now) {
  if (this.fall || this.finished) return null;
  if (this.anim) {
    const a = this.anim;
    const t = Math.min(1, Math.max(0, (now - a.start) / a.duration));
    const speed = Math.min(1, a.path.length / 3) * Math.min(1, t / 0.25);
    return { dir: a.dir, along: 0.2 * speed };
  }
  if (this.impact && !this.impact.snow) {
    const t = (now - this.impact.start) / 260;
    if (t >= 0 && t < 1) {
      const power = Math.min(1, 0.35 + this.impact.tiles * 0.18);
      return { dir: this.impact.dir, along: -0.3 * power * Math.exp(-4.5 * t) * Math.cos(t * 11) };
    }
  }
  return null;
};
