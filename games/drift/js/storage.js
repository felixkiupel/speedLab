// Save/Load um localStorage - nur der Drift-eigene Fortschritt. Coins und die Daily-Serie liegen
// spielübergreifend im Profil (shared/js/profile.js).
window.SL = window.SL || {};

const SAVE_KEY = "speedlab_drift_v1";

function defaultSave() {
  return {
    unlockedLevels: [1],
    levelResults: {}, // { [levelId]: { bestTimeMs, stars, bestMoves, timesPlayed } }
    levelSet: SL.LEVEL_SET_VERSION, // zu welcher Level-Generation die levelResults gehören
    tutorialDone: false,
    coachSeen: [], // Kapitel, deren "Neu: ..."-Hinweis schon gezeigt wurde
    settings: defaultSettings(),
  };
}

// hints: "Sackgasse!"-Hinweis, sobald man von seinem Feld aus das Ziel nicht mehr erreichen kann.
// effects: Wackeln/Partikel/Konfetti - bei "weniger Bewegung" im System standardmäßig aus.
function defaultSettings() {
  const reducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  return { sound: true, volume: 0.7, vibration: true, effects: !reducedMotion, hints: true };
}

SL.Storage = {
  load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return defaultSave();
      const parsed = JSON.parse(raw);
      const state = Object.assign(defaultSave(), parsed);
      // Andere Level-Generation: Bestzeiten/Sterne gehören zu anderen Karten und werden verworfen.
      // Freigeschaltete Level bleiben (die Coins dafür sind ja ausgegeben).
      if (parsed.levelSet !== SL.LEVEL_SET_VERSION) {
        state.levelResults = {};
        state.levelSet = SL.LEVEL_SET_VERSION;
      }
      state.settings = Object.assign(defaultSettings(), parsed.settings);
      return state;
    } catch (e) {
      console.warn("Speicherstand konnte nicht geladen werden, starte neu.", e);
      return defaultSave();
    }
  },

  save(state) {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn("Speicherstand konnte nicht gespeichert werden.", e);
    }
  },

  // Löscht nur den Drift-Fortschritt - Coins und Serie im Profil bleiben
  reset() {
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch (e) {
      console.warn("Speicherstand konnte nicht gelöscht werden.", e);
    }
  },
};
