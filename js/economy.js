// Coin-/Unlock-/Shop-Logik
window.SL = window.SL || {};

SL.RARITIES = {
  common: { name: "Gewöhnlich", rank: 1 },
  rare: { name: "Selten", rank: 2 },
  epic: { name: "Episch", rank: 3 },
  legendary: { name: "Legendär", rank: 4 },
};

// Zwei Kategorien: "skin" (Körper der Figur) und "trail" (Spur hinter der Figur). Gezeichnet wird
// beides in renderer.js (fillBody / drawTrail) - im Spiel und in den Shop-Vorschauen gleich.
// Skin-Muster: solid | split | stripes | ring | gradient | galaxy | prism (animiert).
// "accent" = Farbe, die farbige Spuren und die Logo-/Maskottchen-Ableitungen verwenden.
// Die IDs der ursprünglichen Farben bleiben gleich, damit alte Käufe gültig bleiben.
//
// Kaufen braucht Coins UND eine Mindestzahl Sterne (alle Level zusammen, max. 90). Coins kann man
// farmen, Sterne nur durch Können - deshalb hängt die Seltenheit an den Sternen:
//   Gewöhnlich 0-9 (Kapitel 1) · Selten 12-25 (Ende Kap. 1/Kap. 2) · Episch 32-45 (Kap. 2/3)
//   Legendär 60-80 (viele 3-Sterne-Läufe). Preise ~ eine Level-Freischaltung der jeweiligen Phase.
SL.COSMETICS = [
  { id: "default", type: "skin", name: "Kohle", rarity: "common", price: 0, stars: 0, pattern: "solid", colors: ["#2b2420"] },
  { id: "ember", type: "skin", name: "Ember", rarity: "common", price: 50, stars: 0, pattern: "solid", colors: ["#ff8a5c"] },
  { id: "violet", type: "skin", name: "Violet", rarity: "common", price: 80, stars: 3, pattern: "solid", colors: ["#b084ff"] },
  { id: "lime", type: "skin", name: "Lime", rarity: "common", price: 120, stars: 6, pattern: "solid", colors: ["#c6f24a"] },
  { id: "rose", type: "skin", name: "Rose", rarity: "common", price: 160, stars: 9, pattern: "solid", colors: ["#ff6fa5"] },
  { id: "gold", type: "skin", name: "Gold", rarity: "rare", price: 250, stars: 12, pattern: "solid", colors: ["#ffd166"] },
  { id: "ice", type: "skin", name: "Ice", rarity: "rare", price: 300, stars: 16, pattern: "solid", colors: ["#8fd8ff"] },
  { id: "crimson", type: "skin", name: "Crimson", rarity: "rare", price: 350, stars: 20, pattern: "solid", colors: ["#ff4d4d"] },
  { id: "sunset", type: "skin", name: "Sunset", rarity: "rare", price: 450, stars: 25, pattern: "split", colors: ["#ff8a5c", "#ff6fa5"] },
  { id: "zebra", type: "skin", name: "Zebra", rarity: "epic", price: 600, stars: 32, pattern: "stripes", colors: ["#fbf7f0", "#2b2420"], accent: "#2b2420" },
  { id: "ghost", type: "skin", name: "Geist", rarity: "epic", price: 700, stars: 38, pattern: "ring", colors: ["#fbf7f0", "#2b2420"], accent: "#2b2420" },
  { id: "aurora", type: "skin", name: "Aurora", rarity: "epic", price: 850, stars: 45, pattern: "gradient", colors: ["#8fd8ff", "#b084ff", "#ff6fa5"], accent: "#b084ff" },
  { id: "galaxy", type: "skin", name: "Galaxie", rarity: "legendary", price: 1200, stars: 60, pattern: "galaxy", colors: ["#1d1838", "#6c4fd1", "#fbf7f0"], accent: "#6c4fd1" },
  { id: "prism", type: "skin", name: "Prisma", rarity: "legendary", price: 1500, stars: 80, pattern: "prism", colors: ["#ff6fa5", "#ffd166", "#c6f24a", "#8fd8ff", "#b084ff"], accent: "#ff6fa5", animated: true },

  { id: "trail-dots", type: "trail", name: "Punkte", rarity: "common", price: 0, stars: 0, style: "dots" },
  { id: "trail-tint", type: "trail", name: "Farbspur", rarity: "common", price: 100, stars: 4, style: "tint" },
  { id: "trail-line", type: "trail", name: "Linie", rarity: "rare", price: 300, stars: 14, style: "line" },
  { id: "trail-pixels", type: "trail", name: "Pixel", rarity: "rare", price: 400, stars: 22, style: "pixels" },
  { id: "trail-sparks", type: "trail", name: "Funken", rarity: "epic", price: 750, stars: 40, style: "sparks", animated: true },
  { id: "trail-rainbow", type: "trail", name: "Regenbogen", rarity: "legendary", price: 1400, stars: 70, style: "rainbow", animated: true },
];

SL.COSMETIC_TYPES = ["skin", "trail"];

SL.getCosmetic = function getCosmetic(id) {
  return SL.COSMETICS.find((c) => c.id === id) || null;
};

// Gratis-Standard je Kategorie (Kohle / Punkte)
SL.getDefaultCosmetic = function getDefaultCosmetic(type) {
  return SL.COSMETICS.find((c) => c.type === type && c.price === 0);
};

// Ausgerüstetes Item einer Kategorie; fällt auf den Standard zurück, falls die ID unbekannt ist
SL.getEquipped = function getEquipped(state, type) {
  const cos = SL.getCosmetic(state.equipped && state.equipped[type]);
  return cos && cos.type === type ? cos : SL.getDefaultCosmetic(type);
};

// Sterne-Bewertung: erlaubte Zeit pro Feld des kürzesten Wegs, in ms.
// 3 Sterne: schneller als 0,2 s/Feld, 2 Sterne: schneller als 0,3 s/Feld, sonst 1 Stern.
const STAR_MS_PER_TILE = { 3: 200, 2: 300 };
SL.STAR_MS_PER_TILE = STAR_MS_PER_TILE;

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

  // Summe der besten Sterne über alle Level
  totalStars(state) {
    return Object.values(state.levelResults).reduce((sum, r) => sum + (r.stars || 0), 0);
  },

  hasStarsFor(state, cos) {
    return this.totalStars(state) >= (cos.stars || 0);
  },

  // Nächstes noch nicht per Sterne freigeschaltetes Item (für "Nächste Freischaltung"-Hinweise)
  nextStarUnlock(state) {
    const stars = this.totalStars(state);
    return SL.COSMETICS
      .filter((c) => c.stars > stars && !state.ownedCosmetics.includes(c.id))
      .sort((a, b) => a.stars - b.stars)[0] || null;
  },

  // Items, deren Sterne-Grenze zwischen "vorher" und "nachher" liegt (für das Ergebnis-Feedback)
  cosmeticsUnlockedBetween(starsBefore, starsAfter) {
    return SL.COSMETICS.filter((c) => c.stars > starsBefore && c.stars <= starsAfter);
  },

  // Kaufen rüstet das Item direkt aus - wer etwas kauft, will es in aller Regel sofort sehen
  purchaseCosmetic(state, cosmeticId) {
    const cos = SL.getCosmetic(cosmeticId);
    if (!cos || state.ownedCosmetics.includes(cosmeticId)) return false;
    if (!this.hasStarsFor(state, cos)) return false;
    if (state.coins < cos.price) return false;
    state.coins -= cos.price;
    state.ownedCosmetics.push(cosmeticId);
    state.equipped[cos.type] = cosmeticId;
    SL.Storage.save(state);
    return true;
  },

  equipCosmetic(state, cosmeticId) {
    const cos = SL.getCosmetic(cosmeticId);
    if (!cos || !state.ownedCosmetics.includes(cosmeticId)) return false;
    state.equipped[cos.type] = cosmeticId;
    SL.Storage.save(state);
    return true;
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
