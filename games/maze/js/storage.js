// Save/Load Wrapper um localStorage - nur der Maze-eigene Fortschritt. Coins, die Daily-Serie und
// der Look aus dem Shop liegen spielübergreifend im Profil (shared/js/profile.js).
window.SL = window.SL || {};

const SAVE_KEY = "speedlab_maze_v1";

function defaultSave() {
  return {
    unlockedLevels: [1],
    levelResults: {}, // { [levelId]: { bestTimeMs, stars, timesPlayed } }
    levelSet: SL.LEVEL_SET_VERSION, // zu welcher Level-Generation die levelResults gehören
    daily: { results: {} }, // { [YYYY-MM-DD]: { bestTimeMs, stars, attempts } }
    settings: defaultSettings(),
  };
}

// touchControls: "auto" = Tipp-Steuerung nur auf Touch-Geräten, "on"/"off" erzwingt es.
// effects: Wackeln/Partikel/Konfetti - bei "weniger Bewegung" im System standardmäßig aus.
function defaultSettings() {
  const reducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  return { sound: true, volume: 0.7, vibration: true, touchControls: "auto", effects: !reducedMotion };
}

SL.Storage = {
  load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return defaultSave();
      const parsed = JSON.parse(raw);
      // Merge mit Default, falls Felder in alten Saves fehlen
      const state = Object.assign(defaultSave(), parsed);
      // Andere Level-Generation: Bestzeiten/Sterne gehören zu anderen Labyrinthen und werden
      // verworfen. Freigeschaltete Level bleiben erhalten (Coins liegen im Profil).
      if (parsed.levelSet !== SL.LEVEL_SET_VERSION) {
        state.levelResults = {};
        state.levelSet = SL.LEVEL_SET_VERSION;
      }
      // Gekaufte Skins lagen früher hier - das Profil hat sie beim Laden schon erstattet (migrateShop)
      delete state.ownedCosmetics;
      delete state.equipped;
      delete state.equippedCosmetic;
      // Neue Bereiche in alten Saves mit Standardwerten auffüllen (flaches Merge reicht nicht)
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

  // Löscht nur den Maze-Fortschritt - Coins und Serie im Profil bleiben
  reset() {
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch (e) {
      console.warn("Speicherstand konnte nicht gelöscht werden.", e);
    }
  },
};
