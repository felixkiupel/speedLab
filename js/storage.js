// Save/Load Wrapper um localStorage
window.SL = window.SL || {};

const SAVE_KEY = "speedlab_save_v1";

function defaultSave() {
  return {
    coins: 0,
    unlockedLevels: [1],
    levelResults: {}, // { [levelId]: { bestTimeMs, stars, timesPlayed } }
    ownedCosmetics: ["default"],
    equippedCosmetic: "default",
  };
}

SL.Storage = {
  load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return defaultSave();
      const parsed = JSON.parse(raw);
      // Merge mit Default, falls Felder in alten Saves fehlen
      return Object.assign(defaultSave(), parsed);
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

  reset() {
    localStorage.removeItem(SAVE_KEY);
    return defaultSave();
  },
};
