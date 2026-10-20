// Ein Lauf durch eine Leap-Strecke. Die Figur bewegt sich mit festem Tempo nach rechts - ihre
// x-Position ergibt sich direkt aus der Lauf-Uhr. Auf Plattformen rollt sie über die Oberfläche, in
// der Luft folgt sie einem Bogen (SL.leapArc). Das Tempo gehört zum Abschnitt (platform.vx): Es
// wechselt nur beim Landen auf einer Plattform - in Levels ist es überall gleich, im Endlosmodus
// hat jeder Abschnitt sein eigenes.
//
// Drückt man, während man auf einem Punkt ist, fängt der Punkt die Figur auf und schleudert sie auf
// dem festen Bogen zum nächsten Ziel. Die Wertung hängt nur davon ab, wie weit (zeitlich) man von der
// Mitte entfernt war. Optisch wird die Figur dabei kurz in die Mitte gezogen (snap), deshalb sind
// alle Flugbahnen für jeden exakt gleich.
//
// Jeder Druck macht kurz müde (SL.LEAP.COOLDOWN_MS): Solange die Leiste unter der Figur läuft, zählt
// kein weiterer Druck. Wer spammt, verpasst so leicht seinen Punkt.
//
// Alle Zeiten in ms im Takt von performance.now(). Beim Drücken zählt der Zeitstempel des Events,
// nicht der nächste Frame. Kein DOM hier - der Lauf lässt sich auch in Node simulieren (tools/).
window.SL = window.SL || {};

const LOST_MS = 950; // so lange sieht man den Absturz, dann geht es an Start/Checkpoint weiter
const SNAP_MS = 90; // so schnell zieht ein Punkt die Figur in seine Mitte

SL.RATINGS = {
  perfect: { label: "Perfekt", score: 3 },
  good: { label: "Gut", score: 2 },
  ok: { label: "OK", score: 1 },
};

// Treffsicherheit in Prozent: Perfekt 3, Gut 2, OK 1 Punkt - geteilt durch 3 pro Sprung
SL.leapAccuracy = function leapAccuracy(jumps) {
  if (!jumps.length) return null;
  const score = jumps.reduce((sum, j) => sum + SL.RATINGS[j.rating].score, 0);
  return (score / (jumps.length * 3)) * 100;
};

SL.LeapSession = function LeapSession(course) {
  this.course = course;
  this.vx = course.vx; // aktuelles Tempo (px/s)

  // Lauf-Uhr: steht beim Warten am Start/Checkpoint und in der Pause
  this.elapsed = 0;
  this.runningSince = null;
  this.paused = false;

  this.respawnIndex = 0; // Plattform, an der es nach einem Absturz weitergeht
  this.jumps = []; // { pointId, rating, x }
  this.used = new Set(); // Punkte, von denen schon abgesprungen wurde
  this.collected = new Set(); // Coin-IDs
  this.falls = 0;
  this.started = false;
  this.finished = false;
  this.finishedAt = null;

  // Hooks (setzt die UI)
  this.onStart = null; // (first) - losgerollt, auch nach jedem Neustart am Checkpoint
  this.onJump = null; // (point, ratingId)
  this.onWhiff = null; // Druck ohne Punkt (die Erschöpfung läuft trotzdem)
  this.onLaunch = null; // (platform) - Schanze
  this.onLand = null; // (platform)
  this.onCheckpoint = null; // (platform)
  this.onCoin = null; // (coin)
  this.onMiss = null; // (point | null) - verpasst, jetzt geht's abwärts
  this.onWall = null; // gegen eine Plattform-Wand
  this.onRespawn = null; // (platform)
  this.onFinish = null; // (result)

  this._spawn();
};

// ---------- Uhr ----------

SL.LeapSession.prototype.clock = function clock(now) {
  return this.elapsed + (this.runningSince != null ? now - this.runningSince : 0);
};

SL.LeapSession.prototype.pause = function pause(now) {
  if (this.paused) return;
  this.paused = true;
  if (this.runningSince != null) {
    this.elapsed += now - this.runningSince;
    this.runningSince = null;
  }
};

SL.LeapSession.prototype.resume = function resume(now) {
  if (!this.paused) return;
  this.paused = false;
  if (this.mode !== "wait" && this.mode !== "done") this.runningSince = now;
};

// x-Position zur Lauf-Uhr t
SL.LeapSession.prototype._xAt = function _xAt(t) {
  return this.x0 + (this.vx * (t - this.t0)) / 1000;
};

// ---------- Ablauf ----------

// Auf die Respawn-Plattform setzen und warten, bis gedrückt wird
SL.LeapSession.prototype._spawn = function _spawn() {
  const pl = this.course.platforms[this.respawnIndex];
  this.mode = "wait";
  this.platform = pl;
  this.vx = pl.vx || this.course.vx;
  this.arc = null;
  this.trace = null;
  this.wall = null;
  this.snap = null;
  this.x0 = pl.spawnX;
  this.t0 = 0;
  this.fig = { x: pl.spawnX, y: SL.leapGroundY(pl, pl.spawnX) };
  this.cooldownStart = -Infinity;
};

SL.LeapSession.prototype._start = function _start(now) {
  if (!this.paused) this.runningSince = now;
  this.t0 = this.clock(now);
  this.x0 = this.fig.x;
  this.mode = "ground";
  const first = !this.started;
  this.started = true;
  if (this.onStart) this.onStart(first);
};

// Ziel eines Absprungs als { x, y } (Punkt oder Landestelle)
SL.LeapSession.prototype._targetOf = function _targetOf(target) {
  if (!target) return null;
  return target.kind === "point" ? this.course.points[target.id] : target;
};

// Neuer Bogen ab (x, y) zum Ziel. t = Lauf-Uhr beim Absprung.
SL.LeapSession.prototype._fly = function _fly(x, y, target, t) {
  const to = this._targetOf(target);
  const slope = SL.leapAim(x, y, to.x, to.y);
  this.arc = SL.leapArc(x, y, slope);
  this.trace = SL.leapTraceArc(this.course, this.arc, x, this.used);
  const last = this.trace.candidates[this.trace.candidates.length - 1];
  // Ab hier ist man an allen Punkten vorbei (außer der Bogen endet ohnehin auf einer Plattform)
  this.lostX = last ? last.x + (this.vx * SL.LEAP.WINDOW_MS.ok) / 1000 + 6 : Infinity;
  this.target = to;
  this.x0 = x;
  this.t0 = t;
  this.mode = "air";
};

// Leertaste / Tippen. now = Zeitstempel des Drucks. Liefert, was passiert ist (für Tests).
SL.LeapSession.prototype.press = function press(now) {
  if (this.paused || this.mode === "lost" || this.mode === "done") return "ignored";
  if (this.mode === "wait") {
    this._start(now);
    return "start";
  }
  const t = this.clock(now);
  // Leiste läuft noch: Druck zählt nicht (und verlängert sie auch nicht)
  if (t - this.cooldownStart < SL.LEAP.COOLDOWN_MS) return "tired";
  this.cooldownStart = t;
  const x = this._xAt(t);

  let best = null;
  if (this.mode === "air") {
    for (const p of this.trace.candidates) {
      if (this.used.has(p.id)) continue;
      const dx = Math.abs(x - p.x);
      if (!best || dx < best.dx) best = { p, dx };
    }
  }
  const ms = best ? (best.dx / this.vx) * 1000 : Infinity;
  const W = SL.LEAP.WINDOW_MS;
  if (ms > W.ok) {
    if (this.onWhiff) this.onWhiff();
    return "whiff";
  }
  const rating = ms <= W.perfect ? "perfect" : ms <= W.good ? "good" : "ok";
  const p = best.p;
  this.used.add(p.id);
  this.jumps.push({ pointId: p.id, rating, x: p.x });

  // Der Punkt fängt die Figur: Logik springt in seine Mitte, die Optik folgt kurz nach (snap)
  const fromY = this.arc.y(x);
  this.snap = { dx: x - p.x, dy: fromY - p.y, t };
  this._fly(p.x, p.y, p.target, t);
  if (this.onJump) this.onJump(p, rating);
  return rating;
};

SL.LeapSession.prototype.update = function update(now) {
  if (this.paused || this.mode === "wait" || this.mode === "done") return;
  const t = this.clock(now);
  const prevX = this.fig.x;
  let x = this._xAt(t);

  if (this.mode === "lost") {
    if (this.wall) {
      const s = (t - this.wall.t) / 1000;
      const gravity = SL.LEAP.G * this.vx * this.vx; // px/s², passt zur Krümmung der Bögen
      this.fig = { x: this.wall.x, y: this.wall.y + 0.5 * gravity * s * s };
    } else {
      const end = this.trace && this.trace.end;
      if (end && end.type === "wall" && x >= end.x) {
        this.wall = { x: end.x, y: this.arc.y(end.x), t };
        if (this.onWall) this.onWall();
        x = end.x;
      }
      this.fig = { x, y: this.arc.y(x) };
    }
    if (t - this.lostAt > LOST_MS) this._respawn(t);
    return;
  }

  if (this.mode === "ground") {
    const pl = this.platform;
    if (pl.kind === "goal" && x >= pl.goalX) {
      this.fig = { x: pl.goalX, y: SL.leapGroundY(pl, pl.goalX) };
      this._finish(now, t);
      return;
    }
    if (pl.ramp && x >= pl.x1) {
      // Über die Schanze: ab der Kante fliegt die Figur zum ersten Punkt des Abschnitts
      const lipY = SL.leapGroundY(pl, pl.x1);
      this._fly(pl.x1, lipY, pl.target, this.t0 + ((pl.x1 - this.x0) / this.vx) * 1000);
      if (this.onLaunch) this.onLaunch(pl);
    } else {
      this.fig = { x, y: SL.leapGroundY(pl, x) };
    }
  }

  if (this.mode === "air") {
    const end = this.trace.end;
    const landing = end && end.type === "land";
    if (landing && x >= end.x) {
      this._land(end.platform, x, t);
      this.fig = { x, y: SL.leapGroundY(end.platform, x) };
    } else if ((!landing && x > this.lostX) || (end && end.type === "wall" && x >= end.x)) {
      this._lose(t);
      this.fig = { x, y: this.arc.y(x) };
    } else {
      this.fig = { x, y: this.arc.y(x) };
    }
  }

  this._collectCoins(prevX, this.fig.x, this.fig.y);
};

// Landen: x läuft einfach weiter, nur die Höhe kommt jetzt von der Oberfläche. Hat die Plattform
// ein anderes Tempo (neuer Abschnitt), rollt die Figur ab hier damit weiter. x, t = Landestelle.
SL.LeapSession.prototype._land = function _land(platform, x, t) {
  if (platform.vx && platform.vx !== this.vx) {
    this.x0 = x;
    this.t0 = t;
    this.vx = platform.vx;
  }
  this.mode = "ground";
  this.platform = platform;
  this.arc = null;
  this.trace = null;
  if (this.onLand) this.onLand(platform);
  if (platform.kind === "checkpoint" && platform.index > this.respawnIndex) {
    this.respawnIndex = platform.index;
    if (this.onCheckpoint) this.onCheckpoint(platform);
  }
};

// Verpasst: die Figur fliegt ihren Bogen weiter (bzw. knallt gegen die Wand) und fällt aus dem Bild
SL.LeapSession.prototype._lose = function _lose(t) {
  this.mode = "lost";
  this.lostAt = t;
  this.falls++;
  // Verpasst wurde das eigentliche Ziel des Bogens (null, wenn es eine Landestelle war)
  if (this.onMiss) this.onMiss(this.target && this.target.id != null ? this.target : null);
};

// Zurück an die letzte erreichte Plattform. Alles, was danach kam (Sprünge, Coins), zählt nicht mehr -
// man fliegt den Abschnitt ja neu.
SL.LeapSession.prototype._respawn = function _respawn(t) {
  const pl = this.course.platforms[this.respawnIndex];
  this.jumps = this.jumps.filter((j) => j.x < pl.x0);
  for (const id of [...this.used]) if (this.course.points[id].x > pl.x0) this.used.delete(id);
  for (const id of [...this.collected]) if (this.course.coins[id].x > pl.x0) this.collected.delete(id);
  this._stopClock(t);
  this._spawn();
  if (this.onRespawn) this.onRespawn(pl);
};

// Uhr anhalten (bis wieder gedrückt wird); t = aktuelle Lauf-Uhr
SL.LeapSession.prototype._stopClock = function _stopClock(t) {
  this.elapsed = t;
  this.runningSince = null;
};

SL.LeapSession.prototype._collectCoins = function _collectCoins(fromX, toX, y) {
  const reach = SL.LEAP.FIG_R + SL.LEAP.COIN_R + 2;
  for (const c of this.course.coins) {
    if (this.collected.has(c.id) || c.x < Math.min(fromX, toX) - reach || c.x > toX + reach) continue;
    if (Math.abs(c.y - y) <= reach) {
      this.collected.add(c.id);
      if (this.onCoin) this.onCoin(c);
    }
  }
};

SL.LeapSession.prototype._finish = function _finish(now, t) {
  this.mode = "done";
  this.finished = true;
  this.finishedAt = now; // echte Zeit, für die Verwandlung der Figur im Ziel
  this._stopClock(t);
  if (this.onFinish) this.onFinish(this.buildResult());
};

SL.LeapSession.prototype.accuracy = function accuracy() {
  return SL.leapAccuracy(this.jumps);
};

SL.LeapSession.prototype.buildResult = function buildResult() {
  const counts = { perfect: 0, good: 0, ok: 0 };
  for (const j of this.jumps) counts[j.rating]++;
  const accuracy = this.accuracy() ?? 0;
  return {
    accuracy,
    stars: SL.Economy.starsForAccuracy(accuracy),
    counts,
    jumps: this.jumps.length,
    falls: this.falls,
    coinsCollected: this.collected.size,
    coinsTotal: this.course.coins.length,
  };
};

// ---------- Für die Darstellung ----------

// Wie weit die Erschöpfung noch läuft: 1 direkt nach dem Druck, 0 = man kann wieder
SL.LeapSession.prototype.cooldownLeft = function cooldownLeft(now) {
  const left = 1 - (this.clock(now) - this.cooldownStart) / SL.LEAP.COOLDOWN_MS;
  return Math.max(0, Math.min(1, left));
};

// Position der Figur zum Zeichnen: logische Position + kurz der Zug in die Punkt-Mitte
SL.LeapSession.prototype.figureAt = function figureAt(now) {
  const f = this.fig;
  if (!this.snap) return { x: f.x, y: f.y };
  const k = (this.clock(now) - this.snap.t) / SNAP_MS;
  if (k >= 1) {
    this.snap = null;
    return { x: f.x, y: f.y };
  }
  // Der Bogen rechnet schon ab der Punkt-Mitte - die Optik startet an der echten Position und
  // gleitet hinterher. Die Kamera folgt dieser Position, die Welt ruckt also nicht.
  const rest = (1 - k) * (1 - k);
  return { x: f.x + this.snap.dx * rest, y: f.y + this.snap.dy * rest };
};

// Steigung der Bewegung (für Blickrichtung/Streckung der Figur)
SL.LeapSession.prototype.slopeAt = function slopeAt() {
  if (this.mode === "air" || (this.mode === "lost" && !this.wall)) return this.arc ? this.arc.slopeAt(this.fig.x) : 0;
  if (this.mode === "lost" && this.wall) return 6;
  if (this.mode === "ground" || this.mode === "wait") {
    const pl = this.platform;
    if (pl && pl.ramp && this.fig.x > pl.x1 - SL.LEAP.RAMP_W) {
      const u = (this.fig.x - (pl.x1 - SL.LEAP.RAMP_W)) / SL.LEAP.RAMP_W;
      return SL.LEAP.RAMP_SLOPE * u;
    }
  }
  return 0;
};
