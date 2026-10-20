// Sterne, Coin-Belohnung und Level-Freischaltung. Die Coins selbst liegen im spielübergreifenden
// Profil (SL.Profile), damit man sie auch in anderen Spielen ausgeben kann.
window.SL = window.SL || {};

// Sterne-Grenzen = schnellste Lösung (echte Rutschzeit, siehe SL.slideDuration) + eine kleine
// Zugabe pro Zug. Die Uhr startet erst mit dem ersten Zug - ansehen und nachdenken ist vorher frei,
// danach bleibt für 3 Sterne pro Zug nur eine Viertelsekunde: Das schafft nur, wer die Lösung
// komplett im Kopf hat und ohne Zögern runterrutscht. Bewusst streng - sterben kann man nicht,
// also ist die Uhr der einzige Gegner.
const STAR_ALLOWANCE = {
  3: { perMoveMs: 250, startMs: 0 },
  2: { perMoveMs: 800, startMs: 0 },
};
SL.STAR_ALLOWANCE = STAR_ALLOWANCE;

SL.Economy = {
  isLevelUnlocked(state, levelId) {
    return state.unlockedLevels.includes(levelId);
  },

  canAffordUnlock(levelId) {
    const level = SL.getLevel(levelId);
    return Boolean(level) && SL.Profile.coins() >= level.unlockCost;
  },

  unlockLevel(state, levelId) {
    const level = SL.getLevel(levelId);
    if (!level) return false;
    if (this.isLevelUnlocked(state, levelId)) return true;
    if (!SL.Profile.spend(level.unlockCost)) return false;
    state.unlockedLevels.push(levelId);
    SL.Storage.save(state);
    return true;
  },

  totalStars(state) {
    return Object.values(state.levelResults).reduce((sum, r) => sum + (r.stars || 0), 0);
  },

  computeThresholds(analysis) {
    const limit = (stars) => analysis.fastestMs(STAR_ALLOWANCE[stars].perMoveMs) + STAR_ALLOWANCE[stars].startMs;
    return { minMoves: analysis.minMoves, t3: limit(3), t2: limit(2) };
  },

  // Nur echt schneller als die Grenze zählt, Gleichstand reicht nicht
  starsForTime(timeMs, thresholds) {
    if (timeMs < thresholds.t3) return 3;
    if (timeMs < thresholds.t2) return 2;
    return 1;
  },

  // Belohnung: die Sterne zahlen sich am Preis des nächsten Levels aus (3 Sterne = reicht direkt,
  // siehe SL.Profile.levelPay), dazu jeder eingesammelte Coin 1:1. Die Umweg-Coins kosten Züge und
  // damit Zeit - ob sich das lohnt, hängt an den Sternen. Liefert die Einzelposten, damit das
  // Ergebnis zeigen kann, wofür es Coins gab.
  computeReward({ levelId, stars, coinsCollected }) {
    const parts = [{ label: stars === 1 ? "1 Stern" : `${stars} Sterne`, coins: SL.Profile.levelPay(SL.levelUnlockCost(levelId + 1), stars) }];
    if (coinsCollected) parts.push({ label: `${coinsCollected} × Coin`, coins: coinsCollected });
    return { parts, total: parts.reduce((sum, p) => sum + p.coins, 0) };
  },

  // Aufgaben für den Shop (shared/js/quests.js), die nur Drift kennt. Geprüft wird aus dem
  // Spielstand - so zählen auch Lösungen von früher. Beim Start und nach jedem Level.
  checkQuests(state) {
    const results = SL.LEVELS.map((level) => ({ level, r: state.levelResults[String(level.id)] }));
    if (!SL.Quests.isDone("drift-ideal") && results.some(({ level, r }) => r && r.bestMoves === SL.getLevelPuzzle(level.id).analysis.minMoves)) {
      SL.Quests.complete("drift-ideal");
    }
    if (results.every(({ r }) => r && r.stars === 3)) SL.Quests.complete("drift-all");
  },

  // Trägt ein Run-Ergebnis ein: Coins werden immer gutgeschrieben, Bestwerte nur verbessert
  recordLevelResult(state, levelId, { timeMs, stars, moves }, coinsEarned) {
    const key = String(levelId);
    const prev = state.levelResults[key];
    state.levelResults[key] = {
      bestTimeMs: prev ? Math.min(prev.bestTimeMs, timeMs) : timeMs,
      stars: prev ? Math.max(prev.stars, stars) : stars,
      bestMoves: prev ? Math.min(prev.bestMoves ?? moves, moves) : moves,
      timesPlayed: (prev?.timesPlayed || 0) + 1,
    };
    SL.Storage.save(state);
    this.checkQuests(state);
    SL.Profile.addCoins(coinsEarned);
  },
};
