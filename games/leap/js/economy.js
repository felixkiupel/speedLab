// Sterne, Coin-Belohnung und Level-Freischaltung. Die Coins selbst liegen im spielübergreifenden
// Profil (SL.Profile), damit man sie auch in anderen Spielen ausgeben kann.
window.SL = window.SL || {};

// Sterne nach Treffsicherheit (siehe SL.leapAccuracy: Perfekt 3, Gut 2, OK 1 Punkt pro Sprung).
// 3 Sterne verlangen fast nur Perfekt-Treffer, für 2 reicht durchgehend "Gut".
const STAR_ACCURACY = { 3: 90, 2: 65 };
SL.STAR_ACCURACY = STAR_ACCURACY;

// Prozent ohne Nachkommastellen, abgerundet - 89,9 % soll nicht wie 90 % aussehen
SL.formatAccuracy = function formatAccuracy(pct) {
  return pct == null ? "–" : `${Math.floor(pct)} %`;
};

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

  starsForAccuracy(pct) {
    if (pct >= STAR_ACCURACY[3]) return 3;
    if (pct >= STAR_ACCURACY[2]) return 2;
    return 1;
  },

  // Belohnung wie bei Drift, mit Einzelposten fürs Ergebnis: die Sterne zahlen sich am Preis des
  // nächsten Levels aus (3 Sterne = reicht direkt, siehe SL.Profile.levelPay), dazu jeder
  // eingesammelte Coin 1:1
  computeReward({ levelId, stars, coinsCollected }) {
    const parts = [{ label: stars === 1 ? "1 Stern" : `${stars} Sterne`, coins: SL.Profile.levelPay(SL.levelUnlockCost(levelId + 1), stars) }];
    if (coinsCollected) parts.push({ label: `${coinsCollected} × Coin`, coins: coinsCollected });
    return { parts, total: parts.reduce((sum, p) => sum + p.coins, 0) };
  },

  // Trägt ein Run-Ergebnis ein: Coins werden immer gutgeschrieben, Bestwerte nur verbessert
  recordLevelResult(state, levelId, { accuracy, stars, coinsCollected }, coinsEarned) {
    const key = String(levelId);
    const prev = state.levelResults[key];
    state.levelResults[key] = {
      bestAccuracy: prev ? Math.max(prev.bestAccuracy, accuracy) : accuracy,
      stars: prev ? Math.max(prev.stars, stars) : stars,
      bestCoins: prev ? Math.max(prev.bestCoins || 0, coinsCollected) : coinsCollected,
      timesPlayed: (prev?.timesPlayed || 0) + 1,
    };
    SL.Storage.save(state);
    SL.Profile.addCoins(coinsEarned);
  },
};
