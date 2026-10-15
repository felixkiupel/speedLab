// Kern-Simulation: Bewegung ist komplett manuell, kein Tick, keine Automatik. Jeder
// Tastendruck (WASD/Pfeiltasten) ist genau EIN Versuch, ein Feld weiterzugehen - sofort,
// synchron. Wand im Weg -> zurück zum Start bzw. zum letzten erreichten Checkpoint. Das Tempo
// macht nur noch der Spieler selbst: schnell drücken = schnell, Zeit lassen = langsamer.
window.SL = window.SL || {};

const CRASH_FLASH_MS = 400;
const TRAIL_LENGTH = 9;

// maze: fertig erzeugtes (gecachtes) Labyrinth - Level und Daily liefern es selbst
SL.GameSession = function GameSession(levelConfig, maze) {
  this.level = levelConfig;
  this.maze = maze; // wird nicht verändert
  this.thresholds = SL.Economy.computeThresholds(this.maze.optimalSteps);

  // Checkpoints auf dem kürzesten Weg; respawnIndex = zuletzt erreichter (-1 = Start)
  this.checkpoints = SL.computeCheckpoints(this.maze, levelConfig.checkpoints || 0).map((cp) => ({ ...cp, reached: false }));
  this.respawnIndex = -1;

  this.cur = { ...this.maze.start };
  this.currentDir = null; // letzte erfolgreiche Richtung - für Crash-Logik und das Gesicht
  this.started = false;
  this.finished = false;
  // Echte Stoppuhr über performance.now() statt aufsummierter Frame-Deltas - sonst läuft
  // die Zeit bei niedriger FPS zu langsam. elapsedMs = abgeschlossene Laufabschnitte,
  // runningSince = Beginn des aktuellen Abschnitts (null = Uhr steht, z.B. in der Pause).
  this.elapsedMs = 0;
  this.runningSince = null;
  this.crashCount = 0;
  this.coinsCollected = 0;
  this.collectedSet = new Set();
  this.crashFlashMs = 0;
  this.trail = [];
  this.lastMoveAt = 0; // für den kurzen "Squash" der Figur pro Schritt

  // Callback-Hooks (von UI gesetzt)
  this.onFirstMove = null;
  this.onStep = null; // (dirKey)
  this.onBump = null; // Wand angetippt, während die Figur steht (kein Crash)
  this.onCoinCollected = null; // (cell)
  this.onCheckpoint = null; // (cell, index)
  this.onCrash = null; // (crashCell)
  this.onFinish = null;
};

SL.GameSession.prototype._isWall = function _isWall(r, c) {
  const { grid, rows, cols } = this.maze;
  return !(r >= 0 && r < rows && c >= 0 && c < cols && grid[r][c] === SL.PATH);
};

// Ein Aufruf = ein Versuch, sofort ein Feld in "dirKey" weiterzugehen. Kein Tick, keine
// Verzögerung - wie schnell es vorangeht, entscheidet allein die Drückfrequenz des Spielers.
SL.GameSession.prototype.requestDirection = function requestDirection(dirKey) {
  if (this.finished) return;
  // Zurücklaufen ist erlaubt: ohne Tick gibt es kein "auf der Stelle halten" mehr, und
  // ohne Kehrtwende wäre jede Sackgasse / falsche Abzweigung ein garantierter Crash.

  const d = SL.DIRS[dirKey];
  const nr = this.cur.r + d.dr, nc = this.cur.c + d.dc;

  if (this._isWall(nr, nc)) {
    // Steht der Punkt gerade still (vor dem ersten Zug oder direkt nach einem Reset,
    // currentDir dann null), zählt ein falscher Versuch nicht als Fehler - man probiert
    // nur eine Richtung aus. Ist er aber schon unterwegs: Wand in Fahrtrichtung = Reset.
    if (this.currentDir) this._crashAndReset();
    else if (this.onBump) this.onBump();
    return;
  }

  this.currentDir = dirKey;
  if (!this.started) {
    this.started = true;
    this.runningSince = performance.now();
    if (this.onFirstMove) this.onFirstMove();
  }

  this.cur = { r: nr, c: nc };
  this.lastMoveAt = performance.now();

  this.trail.push({ ...this.cur });
  if (this.trail.length > TRAIL_LENGTH) this.trail.shift();
  if (this.onStep) this.onStep(dirKey);

  const key = this.cur.r + "," + this.cur.c;
  if (!this.collectedSet.has(key) && this.maze.coins.some((co) => co.r === this.cur.r && co.c === this.cur.c)) {
    this.collectedSet.add(key);
    this.coinsCollected++;
    if (this.onCoinCollected) this.onCoinCollected({ ...this.cur });
  }

  // Checkpoint: nur "nach vorne" zählen - wer über eine Schleife zurück zu einem früheren
  // Checkpoint läuft, verliert seinen weiteren Respawn-Punkt nicht
  const cpIndex = this.checkpoints.findIndex((cp) => cp.r === this.cur.r && cp.c === this.cur.c);
  if (cpIndex > this.respawnIndex) {
    this.respawnIndex = cpIndex;
    this.checkpoints[cpIndex].reached = true;
    if (this.onCheckpoint) this.onCheckpoint({ ...this.cur }, cpIndex);
  }

  if (this.cur.r === this.maze.end.r && this.cur.c === this.maze.end.c) {
    this.pauseClock(); // Endzeit exakt im Moment des Zieleinlaufs, nicht erst beim nächsten Frame
    this.finished = true;
    if (this.onFinish) this.onFinish(this.buildResult());
  }
};

// Keine Bewegung und keine Zeitmessung mehr hier - nur noch den Crash-Flash ausblenden.
SL.GameSession.prototype.update = function update(dtMs) {
  if (this.crashFlashMs > 0) this.crashFlashMs = Math.max(0, this.crashFlashMs - dtMs);
};

SL.GameSession.prototype.getElapsedMs = function getElapsedMs() {
  const running = this.runningSince != null ? performance.now() - this.runningSince : 0;
  return this.elapsedMs + running;
};

SL.GameSession.prototype.pauseClock = function pauseClock() {
  if (this.runningSince == null) return;
  this.elapsedMs += performance.now() - this.runningSince;
  this.runningSince = null;
};

SL.GameSession.prototype.resumeClock = function resumeClock() {
  if (!this.started || this.finished || this.runningSince != null) return;
  this.runningSince = performance.now();
};

// 1 direkt nach dem Crash, läuft linear auf 0 aus - für den ausblendenden Crash-Flash
SL.GameSession.prototype.getCrashFlashStrength = function getCrashFlashStrength() {
  return this.crashFlashMs / CRASH_FLASH_MS;
};

// Wand-Crash: zählt als Fehler und schickt den Punkt zurück zum letzten erreichten Checkpoint
// bzw. zum Start. Die Uhr läuft weiter, eingesammelte Coins bleiben erhalten.
SL.GameSession.prototype._crashAndReset = function _crashAndReset() {
  const crashCell = { ...this.cur };
  this.crashCount++;
  this.crashFlashMs = CRASH_FLASH_MS;

  const respawn = this.respawnIndex >= 0 ? this.checkpoints[this.respawnIndex] : this.maze.start;
  this.cur = { r: respawn.r, c: respawn.c };
  this.currentDir = null;
  this.trail = [];

  if (this.onCrash) this.onCrash(crashCell);
};

SL.GameSession.prototype.buildResult = function buildResult() {
  const timeMs = this.getElapsedMs();
  const stars = SL.Economy.starsForTime(timeMs, this.thresholds);
  return {
    timeMs,
    crashCount: this.crashCount,
    coinsCollected: this.coinsCollected,
    stars,
  };
};

// Liefert die Pixelposition des Spielers - bewusst ohne Interpolation, der Punkt
// "teleportiert" pro Schritt direkt ins nächste Feld statt weich zu gleiten.
SL.GameSession.prototype.getPlayerPixel = function getPlayerPixel(cellSize) {
  return {
    x: this.cur.c * cellSize + cellSize / 2,
    y: this.cur.r * cellSize + cellSize / 2,
  };
};
