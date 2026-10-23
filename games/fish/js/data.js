// Inhalte: Angelplätze mit Tiefen-Ebenen, Fische, Ausrüstung. Prototyp - Taler sind eine eigene
// Währung nur für dieses Spiel (keine Plattform-Coins, siehe CLAUDE.md).
window.SL = window.SL || {};

(function () {
  // Erhöhen, wenn sich Fische/Preise so ändern, dass alte Spielstände nicht mehr passen
  SL.FISH_DATA_VERSION = 2;

  // Reihenfolge = Freischalt-Reihenfolge. Wasser = layers Ebenen à layerM Meter.
  SL.SPOTS = [
    { id: "teich", name: "Teich", price: 0, layers: 3, layerM: 2, description: "Flach und ruhig – bis 6 m tief." },
    { id: "fluss", name: "Fluss", price: 180, layers: 4, layerM: 3, description: "Strömung und flinke Fische – bis 12 m." },
    { id: "meer", name: "Meer", price: 750, layers: 5, layerM: 6, description: "Tief und dunkel – bis 30 m." },
  ];

  // layers = [von, bis] Ebene (1 = oben). rarity: 1 häufig .. 4 legendär. value = Taler bei
  // mittlerer Größe, kg = [kleinster, größter]. strength: wie hart er zieht (Spannung, Fortschritt);
  // behavior: wie oft und lang er sich aufbäumt (fishing.js, SURGES). len = Länge im Bild.
  // shape: Zeichnung (fishart.js) - h Körperhöhe, tail fork|round|fan|eel, fin, nose, marks.
  SL.FISH = [
    { id: "stichling", name: "Stichling", spot: "teich", layers: [1, 1], rarity: 1, value: 4, kg: [0.01, 0.04], strength: 0.25, behavior: "ruhig", len: 18, shape: { h: 0.3, tail: "fork", fin: 0.3, marks: "dots" } },
    { id: "rotauge", name: "Rotauge", spot: "teich", layers: [1, 2], rarity: 1, value: 6, kg: [0.1, 0.5], strength: 0.35, behavior: "ruhig", len: 24, shape: { h: 0.38, tail: "fork", fin: 0.22 } },
    { id: "karausche", name: "Karausche", spot: "teich", layers: [2, 2], rarity: 2, value: 12, kg: [0.3, 1.4], strength: 0.5, behavior: "sinker", len: 28, shape: { h: 0.52, tail: "round", fin: 0.24 } },
    { id: "goldfisch", name: "Goldfisch", spot: "teich", layers: [2, 3], rarity: 3, value: 50, kg: [0.05, 0.4], strength: 0.55, behavior: "flitzer", len: 22, shape: { h: 0.5, tail: "fan", fin: 0.32 } },
    { id: "karpfen", name: "Karpfen", spot: "teich", layers: [3, 3], rarity: 2, value: 26, kg: [2, 12], strength: 0.8, behavior: "sinker", len: 42, shape: { h: 0.46, tail: "fork", fin: 0.3, marks: "dots" } },

    { id: "barsch", name: "Barsch", spot: "fluss", layers: [1, 2], rarity: 1, value: 14, kg: [0.2, 1.8], strength: 0.6, behavior: "flitzer", len: 30, shape: { h: 0.42, tail: "fork", fin: 0.38, marks: "bands" } },
    { id: "forelle", name: "Forelle", spot: "fluss", layers: [1, 2], rarity: 1, value: 18, kg: [0.3, 2.5], strength: 0.65, behavior: "springer", len: 34, shape: { h: 0.32, tail: "round", fin: 0.2, marks: "dots" } },
    { id: "hecht", name: "Hecht", spot: "fluss", layers: [2, 3], rarity: 2, value: 45, kg: [2, 14], strength: 1.0, behavior: "flitzer", len: 54, shape: { h: 0.22, tail: "fork", fin: 0.16, marks: "wave" } },
    { id: "aal", name: "Aal", spot: "fluss", layers: [3, 4], rarity: 2, value: 34, kg: [0.5, 3.5], strength: 0.9, behavior: "wild", len: 50, shape: { h: 0.14, tail: "eel", fin: 0.08 } },
    { id: "lachs", name: "Lachs", spot: "fluss", layers: [4, 4], rarity: 3, value: 95, kg: [3, 18], strength: 1.15, behavior: "springer", len: 52, shape: { h: 0.3, tail: "fork", fin: 0.24, marks: "dots" } },

    { id: "hering", name: "Hering", spot: "meer", layers: [1, 2], rarity: 1, value: 22, kg: [0.1, 0.5], strength: 0.55, behavior: "ruhig", len: 26, shape: { h: 0.28, tail: "fork", fin: 0.18 } },
    { id: "makrele", name: "Makrele", spot: "meer", layers: [2, 3], rarity: 1, value: 30, kg: [0.3, 1.8], strength: 0.8, behavior: "flitzer", len: 34, shape: { h: 0.26, tail: "fork", fin: 0.2, marks: "wave" } },
    { id: "dorsch", name: "Dorsch", spot: "meer", layers: [3, 4], rarity: 2, value: 60, kg: [2, 25], strength: 1.1, behavior: "sinker", len: 50, shape: { h: 0.34, tail: "round", fin: 0.26, marks: "dots" } },
    { id: "thunfisch", name: "Thunfisch", spot: "meer", layers: [4, 5], rarity: 3, value: 180, kg: [30, 250], strength: 1.45, behavior: "wild", len: 70, shape: { h: 0.4, tail: "fork", fin: 0.34 } },
    { id: "schwertfisch", name: "Schwertfisch", spot: "meer", layers: [5, 5], rarity: 4, value: 450, kg: [60, 400], strength: 1.7, behavior: "springer", len: 82, shape: { h: 0.3, tail: "fork", fin: 0.5, nose: 0.45 } },
  ];

  // Ausrüstung: levels[0] hat man von Anfang an, price = Preis dieser Stufe
  SL.GEAR = [
    {
      id: "rod", name: "Angel", effect: "Zieht kräftiger – holt schneller ein",
      levels: [
        { name: "Bambusrute", price: 0, power: 1 },
        { name: "Glasfaserrute", price: 80, power: 1.25 },
        { name: "Carbonrute", price: 320, power: 1.55 },
        { name: "Meisterrute", price: 1100, power: 1.9 },
      ],
    },
    {
      id: "line", name: "Schnur", effect: "Hält mehr Spannung aus",
      levels: [
        { name: "Nylonschnur", price: 0, strength: 1 },
        { name: "Flechtschnur", price: 60, strength: 1.3 },
        { name: "Stahlvorfach", price: 260, strength: 1.7 },
        { name: "Titanseil", price: 950, strength: 2.2 },
      ],
    },
    {
      id: "reel", name: "Rolle", effect: "Mehr Schnur – tiefer angeln",
      levels: [
        { name: "Holzrolle · 4 m", price: 0, depth: 4 },
        { name: "Kugellager · 8 m", price: 90, depth: 8 },
        { name: "Hochsee · 15 m", price: 350, depth: 15 },
        { name: "Tiefsee · 24 m", price: 900, depth: 24 },
        { name: "Goldrolle · 30 m", price: 1800, depth: 30 },
      ],
    },
    {
      id: "bait", name: "Köder", effect: "Beißt schneller, mehr seltene Fische",
      levels: [
        { name: "Wurm", price: 0, wait: 1, luck: 0 },
        { name: "Made", price: 50, wait: 0.8, luck: 0.15 },
        { name: "Blinker", price: 240, wait: 0.65, luck: 0.35 },
        { name: "Glitzerköder", price: 900, wait: 0.5, luck: 0.6 },
      ],
    },
    {
      id: "box", name: "Kühlbox", effect: "Mehr Platz für Fische",
      levels: [
        { name: "Eimer", price: 0, slots: 5 },
        { name: "Kühltasche", price: 70, slots: 8 },
        { name: "Kühlbox", price: 300, slots: 12 },
        { name: "Kühltruhe", price: 1000, slots: 20 },
      ],
    },
  ];

  SL.RARITY = ["", "Häufig", "Selten", "Sehr selten", "Legendär"];

  SL.getFish = (id) => SL.FISH.find((f) => f.id === id) || null;
  SL.getSpot = (id) => SL.SPOTS.find((s) => s.id === id) || null;
  SL.getGear = (id) => SL.GEAR.find((g) => g.id === id) || null;

  // Werte der aktuellen Ausrüstung zusammengefasst: { power, strength, depth, wait, luck, slots }
  SL.gearStats = function gearStats(levels) {
    return SL.GEAR.reduce((stats, g) => {
      const { name, price, ...values } = g.levels[levels[g.id] || 0];
      return Object.assign(stats, values);
    }, {});
  };

  // Wie viele Ebenen eines Angelplatzes die Schnur erreicht (eine Ebene zählt, wenn die Schnur bis
  // zu ihrem Boden reicht). Die oberste geht immer.
  SL.reachableLayers = function reachableLayers(spot, depth) {
    return Math.max(1, Math.min(spot.layers, Math.floor(depth / spot.layerM + 1e-9)));
  };
})();
