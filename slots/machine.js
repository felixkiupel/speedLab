// Der Automat ohne DOM: Symbole, Walzen, Gewinnplan und ein Dreh. Bezahlt wird mit Coins, gewonnen
// werden nur Kristalle (zweite Währung, siehe SL.Profile) - bewusst zu einem schlechten Kurs.
// Läuft auch in Node: npm run slots-odds rechnet Trefferquote und Kurs exakt aus.
//
// Jede Walze ist ein Band aus 20 Feldern wie eine echte Walze: Wie oft ein Symbol auf dem Band
// steht, ist seine Wahrscheinlichkeit. Gewertet wird die mittlere Reihe:
//   3 gleiche                pay3 des Symbols
//   2 gleiche von links      PAIR_PAY (Walze 1 und 2 gleich, Walze 3 anders)
// Gewinne gelten pro Einsatz-Stufe: Einsatz 2 × BASE_STAKE = doppelter Gewinn.
//
// QUOTEN ÄNDERN: count (Häufigkeit), pay3, PAIR_PAY oder BASE_STAKE anpassen, dann npm run slots-odds.
window.SL = window.SL || {};

SL.Slots = (function () {
  const BASE_STAKE = 40; // Coins pro Dreh auf der kleinsten Stufe
  const STAKES = [1, 2, 5]; // Einsatz-Stufen (× BASE_STAKE)
  const PAIR_PAY = 1;

  // count = Felder pro Walzenband (zusammen 20). Die Sieben ist der Jackpot.
  const SYMBOLS = [
    { id: "dot", name: "Punkt", count: 6, pay3: 2 },
    { id: "triangle", name: "Dreieck", count: 5, pay3: 3 },
    { id: "square", name: "Viereck", count: 4, pay3: 5 },
    { id: "hexagon", name: "Sechseck", count: 3, pay3: 10 },
    { id: "star", name: "Stern", count: 1, pay3: 40 },
    { id: "seven", name: "Sieben", count: 1, pay3: 100 },
  ];
  const byId = Object.fromEntries(SYMBOLS.map((s) => [s.id, s]));

  // Walzenband: alle Symbole gemischt, nie zwei gleiche nebeneinander (auch nicht über das Ende
  // hinweg). Fester Seed: jede Walze sieht immer gleich aus, wie bei einer echten Maschine.
  function buildStrip(seed) {
    const rand = SL.createRng(seed);
    for (let attempt = 0; attempt < 1000; attempt++) {
      const left = Object.fromEntries(SYMBOLS.map((s) => [s.id, s.count]));
      const strip = [];
      let ok = true;
      for (let n = SYMBOLS.reduce((sum, s) => sum + s.count, 0); n > 0; n--) {
        const prev = strip[strip.length - 1];
        const options = SYMBOLS.filter((s) => left[s.id] > 0 && s.id !== prev);
        if (!options.length) { ok = false; break; }
        // nach Restmenge gewichtet, sonst bleiben am Ende nur noch Punkte übrig
        let r = rand() * options.reduce((sum, s) => sum + left[s.id], 0);
        const pick = options.find((s) => (r -= left[s.id]) < 0) || options[options.length - 1];
        left[pick.id]--;
        strip.push(pick.id);
      }
      if (ok && strip[0] !== strip[strip.length - 1]) return strip;
    }
    throw new Error("Walzenband ohne Doppel nicht gefunden");
  }

  const REELS = [buildStrip(11), buildStrip(23), buildStrip(37)];

  // Gewinn für die mittlere Reihe (Symbol-IDs). reels = welche Walzen zum Gewinn gehören.
  function evaluate([a, b, c]) {
    if (a === b && b === c) return { kind: "three", symbol: a, pay: byId[a].pay3, reels: [0, 1, 2] };
    if (a === b) return { kind: "pair", symbol: a, pay: PAIR_PAY, reels: [0, 1] };
    return { kind: null, symbol: null, pay: 0, reels: [] };
  }

  // Ein Dreh: auf welchem Feld jede Walze stehen bleibt, was in der Mitte steht und was es bringt.
  // Der Gewinn in Kristallen ist pay × Einsatz-Stufe.
  function spin(level, rand = Math.random) {
    const stops = REELS.map((strip) => Math.floor(rand() * strip.length));
    const symbols = stops.map((stop, i) => REELS[i][stop]);
    const result = evaluate(symbols);
    return { stops, symbols, ...result, win: result.pay * level, stake: BASE_STAKE * level };
  }

  // Exakte Quoten über alle Kombinationen (20 × 20 × 20)
  function odds() {
    let total = 0, hits = 0, sum = 0;
    const perKind = {};
    for (const a of REELS[0]) for (const b of REELS[1]) for (const c of REELS[2]) {
      const r = evaluate([a, b, c]);
      total++;
      sum += r.pay;
      if (!r.kind) continue;
      hits++;
      const key = r.kind === "three" ? `3× ${byId[r.symbol].name}` : "2 gleiche";
      perKind[key] = (perKind[key] || 0) + 1;
    }
    const perSpin = sum / total; // Kristalle pro Dreh auf Stufe 1
    return {
      hitRate: hits / total,
      crystalsPerSpin: perSpin,
      coinsPerCrystal: BASE_STAKE / perSpin,
      chances: Object.fromEntries(Object.entries(perKind).map(([k, n]) => [k, n / total])),
    };
  }

  return { BASE_STAKE, STAKES, SYMBOLS, REELS, symbol: (id) => byId[id], evaluate, spin, odds };
})();
