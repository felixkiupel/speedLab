// Sterne, Coin-Belohnung und Level-Freischaltung. Die Coins selbst liegen im spielübergreifenden
// Profil (SL.Profile), damit man sie auch in anderen Spielen ausgeben kann. Skins und Spuren gibt es
// im Shop für alle Spiele (shared/js/cosmetics.js, shop/).
window.SL = window.SL || {};

// Sterne-Bewertung: erlaubte Zeit pro Feld des kürzesten Wegs, in ms.
// 3 Sterne: schneller als 0,2 s/Feld, 2 Sterne: schneller als 0,3 s/Feld, sonst 1 Stern.
const STAR_MS_PER_TILE = { 3: 200, 2: 300 };
SL.STAR_MS_PER_TILE = STAR_MS_PER_TILE;

SL.Economy = {
  isLevelUnlocked(state, levelId) {
    return state.unlockedLevels.includes(levelId);
  },

  canAffordUnlock(levelId) {
    const level = SL.getLevel(levelId);
    if (!level) return false;
    return SL.Profile.coins() >= level.unlockCost;
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

  // Summe der besten Sterne über alle Level
  totalStars(state) {
    return Object.values(state.levelResults).reduce((sum, r) => sum + (r.stars || 0), 0);
  },

  // Sterne-Schwellen = Felder auf dem kürzesten Weg (BFS) × Zeit pro Feld. Bei 20 Feldern
  // gibt es 3 Sterne also nur unter 20 × 0,2 s = 4,00 s - das heißt ~5 Tastendrücke pro
  // Sekunde ohne Umweg und ohne Crash. Bewusst streng.
  computeThresholds(optimalSteps) {
    return {
      optimalSteps,
      t3: optimalSteps * STAR_MS_PER_TILE[3],
      t2: optimalSteps * STAR_MS_PER_TILE[2],
    };
  },

  // Nur echt schneller als die Grenze zählt ("besser als"), Gleichstand reicht nicht
  starsForTime(finalTimeMs, thresholds) {
    if (finalTimeMs < thresholds.t3) return 3;
    if (finalTimeMs < thresholds.t2) return 2;
    return 1;
  },

  // Coin-Belohnung für einen abgeschlossenen Run: die Sterne zahlen sich am Preis des nächsten
  // Levels aus (3 Sterne = reicht direkt, siehe SL.Profile.levelPay), dazu jeder eingesammelte
  // Coin 1:1
  computeReward({ levelId, stars, coinsCollected }) {
    return SL.Profile.levelPay(SL.levelUnlockCost(levelId + 1), stars) + coinsCollected;
  },

  // Aufgaben für den Shop (shared/js/quests.js), die nur Maze kennt. Geprüft wird aus dem
  // Spielstand - so zählen auch Bestzeiten von früher. Beim Start und nach jedem Level.
  checkQuests(state) {
    const results = SL.LEVELS.map((level) => ({ level, r: state.levelResults[String(level.id)] }));
    if (results.some(({ level, r }) => r && level.chapter === 1 && r.bestTimeMs < 3000)) SL.Quests.complete("maze-fast");
    if (results.some(({ level, r }) => r && level.chapter === 3 && r.stars === 3)) SL.Quests.complete("maze-hard");
    if (results.every(({ r }) => r && r.stars === 3)) SL.Quests.complete("maze-all");
  },

  // Trägt ein Run-Ergebnis ein: Coins werden immer gutgeschrieben, Bestzeit/Sterne nur verbessert
  recordLevelResult(state, levelId, timeMs, stars, coinsEarned) {
    const key = String(levelId);
    const prev = state.levelResults[key];
    const timesPlayed = (prev?.timesPlayed || 0) + 1;
    const bestTimeMs = prev ? Math.min(prev.bestTimeMs, timeMs) : timeMs;
    const bestStars = prev ? Math.max(prev.stars, stars) : stars;
    state.levelResults[key] = { bestTimeMs, stars: bestStars, timesPlayed };
    SL.Storage.save(state);
    this.checkQuests(state);
    SL.Profile.addCoins(coinsEarned);
  },
};
