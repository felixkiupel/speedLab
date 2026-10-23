// Save/Load um localStorage. Prototyp: alles liegt hier, auch die Taler - nichts im Profil.
// Ordner games/fish/ löschen = Spiel weg; übrig bliebe nur dieser Schlüssel im Browser.
window.SL = window.SL || {};

SL.Storage = (function () {
  const SAVE_KEY = "speedlab_fish_v1";

  function defaultSave() {
    return {
      taler: 0,
      cooler: [], // gefangene Fische: { id, kg, value, perfect }
      gear: { rod: 0, line: 0, reel: 0, bait: 0, box: 0 }, // Stufe je Ausrüstungsteil
      spots: ["teich"], // freigeschaltete Angelplätze
      spot: "teich",
      layers: {}, // zuletzt gewählte Tiefen-Ebene je Angelplatz
      book: {}, // Fischbuch: { [id]: { count, bestKg } }
      stats: { caught: 0, escaped: 0, earned: 0 },
      dataVersion: SL.FISH_DATA_VERSION,
      settings: defaultSettings(),
    };
  }

  function defaultSettings() {
    const reducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    return { sound: true, volume: 0.7, vibration: true, effects: !reducedMotion };
  }

  return {
    load() {
      try {
        const raw = localStorage.getItem(SAVE_KEY);
        if (!raw) return defaultSave();
        const parsed = JSON.parse(raw);
        const state = Object.assign(defaultSave(), parsed);
        state.gear = Object.assign(defaultSave().gear, parsed.gear);
        state.stats = Object.assign(defaultSave().stats, parsed.stats);
        state.settings = Object.assign(defaultSettings(), parsed.settings);
        // Fische, die es nicht mehr gibt, fallen aus Kühlbox und Fischbuch
        state.cooler = state.cooler.filter((c) => SL.getFish(c.id));
        for (const id of Object.keys(state.book)) if (!SL.getFish(id)) delete state.book[id];
        // Ausrüstungsstufen nie über die letzte Stufe hinaus (sonst fehlen ihre Werte)
        for (const g of SL.GEAR) state.gear[g.id] = Math.min(state.gear[g.id] || 0, g.levels.length - 1);
        state.spots = state.spots.filter((id) => SL.getSpot(id));
        if (!state.spots.includes("teich")) state.spots.unshift("teich");
        if (!state.spots.includes(state.spot)) state.spot = "teich";
        // gab es in früheren Prototyp-Versionen
        delete state.junk;
        delete state.stats.casts;
        state.dataVersion = SL.FISH_DATA_VERSION;
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
  };
})();
