// Kern-Simulation: Bewegung ist komplett manuell, kein Tick, keine Automatik. Jeder
// Tastendruck (WASD/Pfeiltasten) ist genau EIN Versuch, ein Feld weiterzugehen - sofort,
// synchron. Wand im Weg -> Reset zum Start. Das Tempo macht nur noch der Spieler selbst:
// schnell drücken = schnell, Zeit lassen = langsamer.
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
  this.thresholds = SL.Economy.computeThresholds(this.maze.optimalSteps);

  this.cur = { ...this.maze.start };
  this.currentDir = null; // letzte erfolgreiche Richtung - nur für die Kehrtwende-Sperre und das Gesicht
  this.started = false;
  this.finished = false;
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

SL.GameSession.prototype._isWall = function _isWall(r, c) {
  const { grid, rows, cols } = this.maze;
  return !(r >= 0 && r < rows && c >= 0 && c < cols && grid[r][c] === SL.PATH);
};

// Ein Aufruf = ein Versuch, sofort ein Feld in "dirKey" weiterzugehen. Kein Tick, keine
// Verzögerung - wie schnell es vorangeht, entscheidet allein die Drückfrequenz des Spielers.
SL.GameSession.prototype.requestDirection = function requestDirection(dirKey) {
  if (this.finished) return;
  // Kehrtwende wird ignoriert, solange der Punkt schon eine Richtung hat - sonst könnte
  // man sich per Links-Rechts-Spam auf der Stelle halten. Direkt nach einem Reset
  // (currentDir ist dann null) ist jede Richtung wieder frei wählbar.
  if (this.currentDir && dirKey === SL.DIRS[this.currentDir].opposite) return;

  const d = SL.DIRS[dirKey];
  const nr = this.cur.r + d.dr, nc = this.cur.c + d.dc;

  if (this._isWall(nr, nc)) {
    // Steht der Punkt gerade still (vor dem ersten Zug oder direkt nach einem Reset,
    // currentDir dann null), zählt ein falscher Versuch nicht als Fehler - man probiert
    // nur eine Richtung aus. Ist er aber schon unterwegs: Wand in Fahrtrichtung = Reset.
    if (this.currentDir) this._crashAndReset();
    return;
  }

  this.currentDir = dirKey;
  if (!this.started) {
    this.started = true;
    if (this.onFirstMove) this.onFirstMove();
  }

  this.cur = { r: nr, c: nc };

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

// Keine Bewegung mehr hier (die passiert sofort in requestDirection) - nur noch die
// Echtzeit-Stoppuhr weiterlaufen lassen und den Crash-Flash ausblenden.
SL.GameSession.prototype.update = function update(dtMs) {
  if (this.crashFlashMs > 0) this.crashFlashMs = Math.max(0, this.crashFlashMs - dtMs);
  if (this.started && !this.finished) this.simElapsedMs += dtMs;
};

// Wand-Crash: zählt als Fehler und schickt den Punkt zurück zum Start (bereits eingesammelte Coins bleiben erhalten)
SL.GameSession.prototype._crashAndReset = function _crashAndReset() {
  this.crashCount++;
  this.crashFlashMs = CRASH_FLASH_MS;

  this.cur = { ...this.maze.start };
  this.currentDir = null;
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
// "teleportiert" pro Schritt direkt ins nächste Feld statt weich zu gleiten.
SL.GameSession.prototype.getPlayerPixel = function getPlayerPixel(cellSize) {
  return {
    x: this.cur.c * cellSize + cellSize / 2,
    y: this.cur.r * cellSize + cellSize / 2,
  };
};
