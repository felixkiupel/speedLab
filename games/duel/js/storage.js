// Save/Load um localStorage - nur der Duel-eigene Fortschritt (Prototyp: keine Coins, nichts im
// Profil). Ordner games/duel/ löschen = Spiel weg; übrig bliebe nur dieser Schlüssel im Browser.
window.SL = window.SL || {};

SL.Storage = (function () {
  const SAVE_KEY = "speedlab_duel_v1";

  function defaultRecord() {
    return { bestTimeMs: null, stars: 0, wins: 0, tries: 0, bestCombo: 0 };
  }

  function defaultSave() {
    return {
      record: defaultRecord(),
      levelSet: SL.LEVEL_SET_VERSION,
      settings: defaultSettings(),
    };
  }

  function defaultSettings() {
    const reducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    return { sound: true, volume: 0.7, vibration: true, touchControls: "auto", effects: !reducedMotion };
  }

  return {
    load() {
      try {
        const raw = localStorage.getItem(SAVE_KEY);
        if (!raw) return defaultSave();
        const parsed = JSON.parse(raw);
        const state = Object.assign(defaultSave(), parsed);
        if (parsed.levelSet !== SL.LEVEL_SET_VERSION) {
          state.record = defaultRecord();
          state.levelSet = SL.LEVEL_SET_VERSION;
        }
        delete state.levelResults; // erster Prototyp hatte 9 Level
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

    reset() {
      try {
        localStorage.removeItem(SAVE_KEY);
      } catch (e) {
        console.warn("Speicherstand konnte nicht gelöscht werden.", e);
      }
    },

    // Trägt einen Kampf ein: Sterne/Bestzeit nur bei Sieg und nur verbessert
    recordResult(state, result) {
      const prev = state.record;
      const next = { ...prev, tries: prev.tries + 1, bestCombo: Math.max(prev.bestCombo, result.maxCombo) };
      if (result.won) {
        next.wins = prev.wins + 1;
        next.stars = Math.max(prev.stars, result.stars);
        next.bestTimeMs = prev.bestTimeMs == null ? result.timeMs : Math.min(prev.bestTimeMs, result.timeMs);
      }
      state.record = next;
      this.save(state);
      return { isNewBest: result.won && (prev.bestTimeMs == null || result.timeMs < prev.bestTimeMs) };
    },
  };
})();
