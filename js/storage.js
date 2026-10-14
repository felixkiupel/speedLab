// Save/Load Wrapper um localStorage
window.SL = window.SL || {};

const SAVE_KEY = "speedlab_save_v1";

function defaultSave() {
  return {
    coins: 0,
    unlockedLevels: [1],
    levelResults: {}, // { [levelId]: { bestTimeMs, stars, timesPlayed } }
    levelSet: SL.LEVEL_SET_VERSION, // zu welcher Level-Generation die levelResults gehören
    ownedCosmetics: ["default", "trail-dots"],
    equipped: { skin: "default", trail: "trail-dots" },
    daily: { streak: 0, bestStreak: 0, lastCompleted: null, results: {} }, // { [YYYY-MM-DD]: { bestTimeMs, stars, attempts } }
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
      // verworfen. Coins, freigeschaltete Level und Skins bleiben erhalten.
      if (parsed.levelSet !== SL.LEVEL_SET_VERSION) {
        state.levelResults = {};
        state.levelSet = SL.LEVEL_SET_VERSION;
      }
      // Alte Saves kannten nur eine ausgerüstete Farbe (equippedCosmetic) -> wird zum Skin
      if (!parsed.equipped) {
        state.equipped = { skin: parsed.equippedCosmetic || "default", trail: "trail-dots" };
        delete state.equippedCosmetic;
      }
      // Neue Bereiche in alten Saves mit Standardwerten auffüllen (flaches Merge reicht nicht)
      state.settings = Object.assign(defaultSettings(), parsed.settings);
      state.daily = Object.assign(defaultSave().daily, parsed.daily);
      // Gratis-Items (auch später neu hinzugekommene) besitzt jeder
      for (const type of SL.COSMETIC_TYPES) {
        const free = SL.getDefaultCosmetic(type).id;
        if (!state.ownedCosmetics.includes(free)) state.ownedCosmetics.push(free);
      }
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

  reset() {
    localStorage.removeItem(SAVE_KEY);
    return defaultSave();
  },
};
