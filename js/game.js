// Kern-Simulation: Tick-basierte Bewegung. Erzwungene Kurven (nur 1 Weg nach vorne) werden
// automatisch genommen, Tasteneingabe entscheidet nur an echten Kreuzungen. Crash = Reset zum Start.
window.SL = window.SL || {};

const CRASH_FLASH_MS = 400;
const TRAIL_LENGTH = 9;

SL.GameSession = function GameSession(levelConfig) {
  this.level = levelConfig;
  this.maze = SL.generateMaze({
    rows: levelConfig.rows,
    cols: levelConfig.cols,
    seed: levelConfig.seed,
    loopFactor: levelConfig.loopFactor,
    coinCount: levelConfig.coinCount,
  });
  this.tickMs = levelConfig.tickMs;
  this.thresholds = SL.Economy.computeThresholds(this.maze.optimalSteps, this.tickMs);

  this.cur = { ...this.maze.start };
  this.currentDir = null;
  this.pendingDir = null;
  this.started = false;
  this.finished = false;
  this.accumulator = 0;
  this.simElapsedMs = 0;
  this.crashCount = 0;
  this.coinsCollected = 0;
  this.collectedSet = new Set();
  this.crashFlashMs = 0;
  this.trail = [];

  // Callback-Hooks (von UI gesetzt)
  this.onFirstMove = null;
  this.onCoinCollected = null;
  this.onCrash = null;
  this.onFinish = null;
};

SL.GameSession.prototype.requestDirection = function requestDirection(dirKey) {
  if (this.finished) return;
  this.pendingDir = dirKey;
  // Sofortige Reaktion statt auf den nächsten Tick zu warten: beim allerersten Zug
  // und direkt nach einem Reset (currentDir ist dann null), damit sich die Steuerung
  // nicht verzögert anfühlt. Während der Punkt bereits läuft, entscheidet ohnehin
  // der nächste Tick bzw. die nächste echte Kreuzung.
  if (!this.currentDir) {
    this._resolveTick();
    this.accumulator = 0;
  }
};

SL.GameSession.prototype.update = function update(dtMs) {
  if (this.finished || !this.started) return;
  if (this.crashFlashMs > 0) this.crashFlashMs = Math.max(0, this.crashFlashMs - dtMs);
  this.accumulator += dtMs;
  let safety = 0;
  while (this.accumulator >= this.tickMs && !this.finished && safety < 50) {
    this.accumulator -= this.tickMs;
    this._resolveTick();
    safety++;
  }
};

SL.GameSession.prototype._openDirsAt = function _openDirsAt(r, c) {
  const { grid, rows, cols } = this.maze;
  return Object.keys(SL.DIRS).filter((k) => {
    const d = SL.DIRS[k];
    const nr = r + d.dr, nc = c + d.dc;
    return nr >= 0 && nr < rows && nc >= 0 && nc < cols && grid[nr][nc] === SL.PATH;
  });
};

SL.GameSession.prototype._resolveTick = function _resolveTick() {
  const openDirs = this._openDirsAt(this.cur.r, this.cur.c);
  let candidate = null;

  if (!this.currentDir) {
    // Steht noch (ganz am Anfang oder direkt nach einem Reset): nur eine gültige,
    // explizite Eingabe setzt den Punkt in Bewegung. Sonst einfach warten, kein Crash.
    if (this.pendingDir && openDirs.includes(this.pendingDir)) candidate = this.pendingDir;
    if (!candidate) return;
  } else {
    // "Vorwärts" = alles außer der exakten Kehrtwende (verhindert Links-Rechts-Spam
    // und das versehentliche Zurücklaufen in eine schon besuchte Richtung).
    const backDir = SL.DIRS[this.currentDir].opposite;
    const forwardOptions = openDirs.filter((d) => d !== backDir);

    if (forwardOptions.length === 0) {
      // Sackgasse: der einzige Weg ist zurück -> Crash.
      this._crashAndReset();
      return;
    } else if (forwardOptions.length === 1) {
      // Erzwungene Kurve bzw. gerader Gang ohne echte Abzweigung: automatisch weiterlaufen,
      // dafür muss man nicht exakt die richtige Taste im richtigen Tick treffen.
      candidate = forwardOptions[0];
    } else if (this.pendingDir && forwardOptions.includes(this.pendingDir)) {
      candidate = this.pendingDir;
    } else if (forwardOptions.includes(this.currentDir)) {
      // Echte Kreuzung ohne (passende) Eingabe: geradeaus weiter, falls möglich.
      candidate = this.currentDir;
    } else {
      // Echte Kreuzung, geradeaus nicht möglich und keine passende Eingabe -> Crash.
      this._crashAndReset();
      return;
    }
  }

  this.currentDir = candidate;
  if (!this.started) {
    this.started = true;
    if (this.onFirstMove) this.onFirstMove();
  }

  const d = SL.DIRS[candidate];
  this.cur = { r: this.cur.r + d.dr, c: this.cur.c + d.dc };
  this.simElapsedMs += this.tickMs;

  // Trail wird pro Tick (nicht pro Frame) fortgeschrieben, damit sich der Punkt sichtbar
  // von Feld zu Feld "teleportiert" statt weich zu gleiten.
  this.trail.push({ ...this.cur });
  if (this.trail.length > TRAIL_LENGTH) this.trail.shift();

  const key = this.cur.r + "," + this.cur.c;
  if (!this.collectedSet.has(key) && this.maze.coins.some((co) => co.r === this.cur.r && co.c === this.cur.c)) {
    this.collectedSet.add(key);
    this.coinsCollected++;
    if (this.onCoinCollected) this.onCoinCollected();
  }

  if (this.cur.r === this.maze.end.r && this.cur.c === this.maze.end.c) {
    this.finished = true;
    if (this.onFinish) this.onFinish(this.buildResult());
  }
};

// Wand-Crash: zählt als Fehler und schickt den Punkt zurück zum Start (bereits eingesammelte Coins bleiben erhalten)
SL.GameSession.prototype._crashAndReset = function _crashAndReset() {
  this.crashCount++;
  this.crashFlashMs = CRASH_FLASH_MS;

  this.cur = { ...this.maze.start };
  this.currentDir = null;
  this.pendingDir = null;
  this.trail = [];

  if (this.onCrash) this.onCrash();
};

SL.GameSession.prototype.buildResult = function buildResult() {
  const stars = SL.Economy.starsForTime(this.simElapsedMs, this.thresholds);
  return {
    timeMs: this.simElapsedMs,
    crashCount: this.crashCount,
    coinsCollected: this.coinsCollected,
    stars,
  };
};

// Liefert die Pixelposition des Spielers - bewusst ohne Interpolation, der Punkt
// "teleportiert" pro Tick direkt ins nächste Feld statt weich zu gleiten.
SL.GameSession.prototype.getPlayerPixel = function getPlayerPixel(cellSize) {
  return {
    x: this.cur.c * cellSize + cellSize / 2,
    y: this.cur.r * cellSize + cellSize / 2,
  };
};
