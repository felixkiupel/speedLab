// Fang verbuchen, verkaufen, Ausrüstung und Angelplätze kaufen. Rechnet nur mit dem Spielstand
// (state) und speichert - die Anzeige macht ui.js.
window.SL = window.SL || {};

SL.Market = {
  slots(state) {
    return SL.gearStats(state.gear).slots;
  },

  coolerFull(state) {
    return state.cooler.length >= this.slots(state);
  },

  // Fang in die Kühlbox + Fischbuch. Liefert { isNew, isRecord }
  addCatch(state, result) {
    const prev = state.book[result.fish.id];
    const isNew = !prev;
    const isRecord = !!prev && result.kg > prev.bestKg;
    state.book[result.fish.id] = {
      count: (prev ? prev.count : 0) + 1,
      bestKg: Math.max(prev ? prev.bestKg : 0, result.kg),
    };
    state.cooler.push({ id: result.fish.id, kg: result.kg, value: result.value, perfect: result.perfect });
    state.stats.caught++;
    SL.Storage.save(state);
    return { isNew, isRecord };
  },

  coolerValue(state) {
    return state.cooler.reduce((sum, c) => sum + c.value, 0);
  },

  sellAll(state) {
    const total = this.coolerValue(state);
    state.taler += total;
    state.stats.earned += total;
    state.cooler = [];
    SL.Storage.save(state);
    return total;
  },

  // Nächste Stufe eines Ausrüstungsteils (oder null, wenn schon das Beste)
  nextGear(state, gearId) {
    const g = SL.getGear(gearId);
    return g.levels[state.gear[gearId] + 1] || null;
  },

  buyGear(state, gearId) {
    const next = this.nextGear(state, gearId);
    if (!next || state.taler < next.price) return false;
    state.taler -= next.price;
    state.gear[gearId]++;
    SL.Storage.save(state);
    return true;
  },

  buySpot(state, spotId) {
    const spot = SL.getSpot(spotId);
    if (!spot || state.spots.includes(spotId) || state.taler < spot.price) return false;
    state.taler -= spot.price;
    state.spots.push(spotId);
    state.spot = spotId;
    SL.Storage.save(state);
    return true;
  },

  chooseSpot(state, spotId) {
    if (!state.spots.includes(spotId)) return false;
    state.spot = spotId;
    SL.Storage.save(state);
    return true;
  },
};
