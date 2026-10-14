// Coin-/Unlock-/Shop-Logik
window.SL = window.SL || {};

SL.COSMETICS = [
  { id: "default", name: "Schwarz", color: "#111111", price: 0 },
  { id: "ember", name: "Ember", color: "#ff8a5c", price: 50 },
  { id: "violet", name: "Violet", color: "#b084ff", price: 80 },
  { id: "lime", name: "Lime", color: "#c6f24a", price: 120 },
  { id: "rose", name: "Rose", color: "#ff6fa5", price: 160 },
  { id: "gold", name: "Gold", color: "#ffd166", price: 200 },
  { id: "ice", name: "Ice", color: "#8fd8ff", price: 260 },
  { id: "crimson", name: "Crimson", color: "#ff4d4d", price: 320 },
];

SL.getCosmetic = function getCosmetic(id) {
  return SL.COSMETICS.find((c) => c.id === id) || SL.COSMETICS[0];
};

SL.Economy = {
  isLevelUnlocked(state, levelId) {
    return state.unlockedLevels.includes(levelId);
  },

  canAffordUnlock(state, levelId) {
    const level = SL.getLevel(levelId);
    if (!level) return false;
    return state.coins >= level.unlockCost;
  },

  unlockLevel(state, levelId) {
    const level = SL.getLevel(levelId);
    if (!level) return false;
    if (this.isLevelUnlocked(state, levelId)) return true;
    if (state.coins < level.unlockCost) return false;
    state.coins -= level.unlockCost;
    state.unlockedLevels.push(levelId);
    SL.Storage.save(state);
    return true;
  },

  purchaseCosmetic(state, cosmeticId) {
    const cos = SL.getCosmetic(cosmeticId);
    if (state.ownedCosmetics.includes(cosmeticId)) return false;
    if (state.coins < cos.price) return false;
    state.coins -= cos.price;
    state.ownedCosmetics.push(cosmeticId);
    SL.Storage.save(state);
    return true;
  },

  equipCosmetic(state, cosmeticId) {
    if (!state.ownedCosmetics.includes(cosmeticId)) return false;
    state.equippedCosmetic = cosmeticId;
    SL.Storage.save(state);
    return true;
  },

  // Berechnet Sterne-Schwellen relativ zur BFS-Optimalzeit eines Mazes
  computeThresholds(optimalSteps, tickMs) {
    const optimalTimeMs = optimalSteps * tickMs;
    const t3 = optimalTimeMs * 1.15 + 800;
    const t2 = optimalTimeMs * 1.5 + 1200;
    return { optimalTimeMs, t3, t2 };
  },

  starsForTime(finalTimeMs, thresholds) {
    if (finalTimeMs <= thresholds.t3) return 3;
    if (finalTimeMs <= thresholds.t2) return 2;
    return 1;
  },

  // Berechnet Coin-Belohnung für einen abgeschlossenen Run
  computeReward({ levelId, stars, crashCount, coinsCollected }) {
    const base = 20 + levelId * 5;
    const speedBonus = stars === 3 ? 30 : stars === 2 ? 15 : 0;
    const noCrashBonus = crashCount === 0 ? 10 : 0;
    const pickupValue = coinsCollected * 3;
    return base + speedBonus + noCrashBonus + pickupValue;
  },

  // Trägt ein Run-Ergebnis ein: Coins werden immer gutgeschrieben, Bestzeit/Sterne nur verbessert
  recordLevelResult(state, levelId, timeMs, stars, coinsEarned) {
    const key = String(levelId);
    const prev = state.levelResults[key];
    const timesPlayed = (prev?.timesPlayed || 0) + 1;
    const bestTimeMs = prev ? Math.min(prev.bestTimeMs, timeMs) : timeMs;
    const bestStars = prev ? Math.max(prev.stars, stars) : stars;
    state.levelResults[key] = { bestTimeMs, stars: bestStars, timesPlayed };
    state.coins += coinsEarned;
    SL.Storage.save(state);
  },
};
