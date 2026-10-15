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

// So viel ist ein eingesammelter Coin wert: 5 in Kapitel 1, 8 in Kapitel 2, 11 in Kapitel 3. Die
// Umweg-Coins kosten Züge und damit Zeit - ob sich das lohnt, hängt an den Sternen.
SL.coinValue = function coinValue(levelId) {
  const level = SL.getLevel(levelId);
  return 5 + 3 * ((level ? level.chapter : 1) - 1);
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

  // Belohnung skaliert mit dem Level und hat zwei Teile:
  //   pro Lauf      Grundbetrag (10 + 3 × Level), 3 Sterne verdoppeln ihn, 2 Sterne +50 %,
  //                 Ideallösung (kein Zug zu viel) +5 + Level, jeder Coin je nach Kapitel 5/8/11
  //   einmalig      erster Abschluss (10 + 4 × Level) und jeder neue Bestwert-Stern (8 + 3 × Level)
  // Wiederholen lohnt sich also, aber Fortschritt lohnt sich mehr. Liefert die Einzelposten, damit
  // das Ergebnis zeigen kann, wofür es Coins gab.
  computeReward({ levelId, stars, moves, minMoves, coinsCollected, prevStars }) {
    const base = 10 + 3 * levelId;
    const parts = [{ label: "Geschafft", coins: base }];
    if (stars === 3) parts.push({ label: "3 Sterne", coins: base });
    else if (stars === 2) parts.push({ label: "2 Sterne", coins: Math.round(base / 2) });
    if (moves === minMoves) parts.push({ label: "Ideallösung", coins: 5 + levelId });
    if (coinsCollected) parts.push({ label: `${coinsCollected} × Coin`, coins: coinsCollected * SL.coinValue(levelId) });
    if (prevStars == null) parts.push({ label: "Erster Abschluss", coins: 10 + 4 * levelId });
    const newStars = stars - (prevStars || 0);
    if (newStars > 0) parts.push({ label: `${newStars === 1 ? "Neuer Stern" : `${newStars} neue Sterne`}`, coins: newStars * (8 + 3 * levelId) });
    return { parts, total: parts.reduce((sum, p) => sum + p.coins, 0) };
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
    SL.Profile.addCoins(coinsEarned);
  },
};
