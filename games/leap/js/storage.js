// Save/Load um localStorage - nur der Leap-eigene Fortschritt. Coins und die Daily-Serie liegen
// spielübergreifend im Profil (shared/js/profile.js).
window.SL = window.SL || {};

const SAVE_KEY = "speedlab_leap_v1";

function defaultSave() {
  return {
    unlockedLevels: [1],
    levelResults: {}, // { [levelId]: { bestAccuracy, stars, bestCoins, timesPlayed } }
    levelSet: SL.LEVEL_SET_VERSION, // zu welcher Strecken-Generation die levelResults gehören
    daily: { results: {} }, // { [YYYY-MM-DD]: { bestAccuracy, stars, attempts } }
    coachSeen: [], // Kapitel, deren "Neu: ..."-Hinweis schon gezeigt wurde
    settings: defaultSettings(),
  };
}

// effects: Wackeln/Partikel/Konfetti - bei "weniger Bewegung" im System standardmäßig aus.
// guide: Annäherungs-Ring um den nächsten Punkt (zeigt, wann die Mitte kommt).
// touchControls: "auto" = Sprung-Knopf nur auf Touch-Geräten, "on"/"off" erzwingt es (wie Maze).
function defaultSettings() {
  const reducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  return { sound: true, volume: 0.7, vibration: true, effects: !reducedMotion, guide: true, touchControls: "auto" };
}

SL.Storage = {
  load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return defaultSave();
      const parsed = JSON.parse(raw);
      const state = Object.assign(defaultSave(), parsed);
      // Andere Strecken-Generation: Bestwerte/Sterne gehören zu anderen Strecken und werden
      // verworfen. Freigeschaltete Level bleiben (die Coins dafür sind ja ausgegeben).
      if (parsed.levelSet !== SL.LEVEL_SET_VERSION) {
        state.levelResults = {};
        state.levelSet = SL.LEVEL_SET_VERSION;
      }
      state.settings = Object.assign(defaultSettings(), parsed.settings);
      state.daily = Object.assign(defaultSave().daily, parsed.daily);
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

  // Löscht nur den Leap-Fortschritt - Coins und Serie im Profil bleiben
  reset() {
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch (e) {
      console.warn("Speicherstand konnte nicht gelöscht werden.", e);
    }
  },
};
