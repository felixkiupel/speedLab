// Skins und Spuren für die Figur - gemeinsam für alle Spiele, gekauft wird im Shop (shop/).
// Jedes Item gehört zu einer Aufgabe (quests.js): Erst wenn sie geschafft ist, taucht es im Shop
// auf und lässt sich mit Coins kaufen. Vorher sieht man nur ein ausgegrautes Fragezeichen und - bis
// "Episch" - die Aufgabe darunter; bei geheimen Seltenheiten (Legendär, Mythisch) auch die nicht.
// Gespeichert wird im Profil (SL.Profile), gezeichnet in cosmetics-draw.js.
//
// NEUEN SKIN / NEUE SPUR HINZUFÜGEN
//   Eine Zeile in SKINS bzw. TRAILS - Shop und Spiele zeigen das Item automatisch.
//     rarity  Seltenheit aus SL.RARITIES (bestimmt den Preis, überschreibbar mit price)
//     quest   Aufgabe aus SL.QUESTS, die das Item freischaltet
//     Skin:   pattern = Muster aus SL.SkinPatterns, colors = Farben dafür, accent (optional) =
//             Farbe für Spuren, die sich nach dem Skin richten
//     Spur:   style = Stil aus SL.TrailStyles
//   Ein ganz neues Aussehen = zusätzlich ein Eintrag in SL.SkinPatterns / SL.TrailStyles
//   (cosmetics-draw.js). IDs nie ändern - daran hängen die Käufe im Profil.
window.SL = window.SL || {};

// secret: Aufgabe steht nicht im Shop ("???") - man muss selbst draufkommen
SL.RARITIES = {
  common: { name: "Gewöhnlich", rank: 1, price: 100 },
  rare: { name: "Selten", rank: 2, price: 250 },
  epic: { name: "Episch", rank: 3, price: 500 },
  legendary: { name: "Legendär", rank: 4, price: 1000, secret: true },
  mythic: { name: "Mythisch", rank: 5, price: 2000, secret: true },
};

(function () {
  // default: true = Standard, den jeder hat (kein Preis, keine Aufgabe)
  const SKINS = [
    { id: "default", name: "Kohle", default: true, pattern: "solid", colors: ["#2b2420"] },
    // Gewöhnlich
    { id: "dawn", name: "Morgenrot", rarity: "common", quest: "daily", pattern: "sunrise", colors: ["#ff8f7e", "#ffc36b", "#fff2b0"], accent: "#ff9a6b" },
    { id: "frost", name: "Frost", rarity: "common", quest: "drift-ideal", pattern: "frost", colors: ["#bfe6fb", "#ffffff", "#86c6ee"], accent: "#86c6ee" },
    // Selten
    { id: "flame", name: "Flamme", rarity: "rare", quest: "streak-7", pattern: "flame", colors: ["#c8261b", "#ff6a2b", "#ffb636", "#fff3b0"], accent: "#ff6a2b" },
    { id: "twin", name: "Zwilling", rarity: "rare", quest: "daily-double", pattern: "twin", colors: ["#2b2420", "#ffd166"], accent: "#ffd166" },
    // Episch
    { id: "bolt", name: "Blitz", rarity: "epic", quest: "maze-fast", pattern: "bolt", colors: ["#23284a", "#ffd23f"], accent: "#ffd23f" },
    { id: "bullseye", name: "Volltreffer", rarity: "epic", quest: "leap-hard-100", pattern: "target", colors: ["#e8463c", "#fbf7f0"], accent: "#e8463c" },
    // Legendär
    { id: "polar", name: "Polarlicht", rarity: "legendary", quest: "drift-all", pattern: "aurora", colors: ["#0f1a2e", "#4dffb0", "#9b7bff"], accent: "#4dffb0" },
    { id: "labyrinth", name: "Goldlabyrinth", rarity: "legendary", quest: "maze-all", pattern: "maze", colors: ["#2b2420", "#e8b94a"], accent: "#e8b94a" },
    // Mythisch
    { id: "holo", name: "Holo", rarity: "mythic", quest: "leap-all-100", pattern: "holo", colors: ["#ffffff", "#cdd7e8", "#a6b3cb"], accent: "#b9c7e0" },
  ];

  const TRAILS = [
    { id: "trail-dots", name: "Punkte", default: true, style: "dots" },
    // Gewöhnlich
    { id: "trail-rings", name: "Zielringe", rarity: "common", quest: "leap-easy-100", style: "rings" },
    // Selten
    { id: "trail-thread", name: "Ariadnefaden", rarity: "rare", quest: "maze-hard", style: "thread" },
    // Episch
    { id: "trail-flags", name: "Fahnen", rarity: "epic", quest: "endless-100", style: "flags" },
    // Legendär
    { id: "trail-comet", name: "Komet", rarity: "legendary", quest: "leap-all-3", style: "comet" },
    // Mythisch
    { id: "trail-phoenix", name: "Phönix", rarity: "mythic", quest: "streak-30", style: "phoenix" },
  ];

  // Ausgemustert: Wer diese Items gekauft hatte, bekommt die Coins einmal zurück (siehe unten)
  const RETIRED = {
    ember: 50, violet: 80, lime: 120, rose: 160, gold: 250, ice: 300, crimson: 350, sunset: 450,
    zebra: 600, ghost: 700, aurora: 850, galaxy: 1200, prism: 1500,
    "trail-tint": 100, "trail-line": 300, "trail-pixels": 400, "trail-sparks": 750, "trail-rainbow": 1400,
  };

  // Kategorien in Shop-Reihenfolge: Name für Überschriften + die Items
  SL.COSMETIC_TYPES = [
    { id: "skin", name: "Skins", hint: "Der Körper deiner Figur", items: SKINS },
    { id: "trail", name: "Spuren", hint: "Was die Figur hinter sich lässt", items: TRAILS },
  ];
  SL.COSMETICS = SL.COSMETIC_TYPES.flatMap((t) => t.items.map((item) => Object.assign(item, {
    type: t.id,
    price: item.default ? 0 : item.price ?? SL.RARITIES[item.rarity].price,
  })));

  SL.Profile.refundCosmetics(Object.entries(RETIRED).map(([id, coins]) => ({ id, coins })));
})();

SL.getCosmetic = function getCosmetic(id) {
  return SL.COSMETICS.find((c) => c.id === id) || null;
};

// Standard je Kategorie (Kohle / Punkte)
SL.getDefaultCosmetic = function getDefaultCosmetic(type) {
  return SL.COSMETICS.find((c) => c.type === type && c.default);
};

SL.Cosmetics = {
  owns(id) {
    const cos = SL.getCosmetic(id);
    return Boolean(cos) && (cos.default || SL.Profile.ownedCosmetics().includes(id));
  },

  // Freigeschaltet = Aufgabe geschafft (dann im Shop sichtbar und kaufbar)
  isUnlocked(cos) {
    return Boolean(cos.default || this.owns(cos.id) || SL.Quests.isDone(cos.quest));
  },

  // Bleibt die Aufgabe im Shop verborgen ("???")?
  isSecret(cos) {
    return Boolean(cos.rarity && SL.RARITIES[cos.rarity].secret);
  },

  // Ausgerüstetes Item einer Kategorie; fällt auf den Standard zurück, falls die ID unbekannt ist
  equipped(type) {
    const cos = SL.getCosmetic(SL.Profile.equippedCosmetic(type));
    return cos && cos.type === type && this.owns(cos.id) ? cos : SL.getDefaultCosmetic(type);
  },

  // Führt fn aus (z.B. ein Ergebnis eintragen, das Aufgaben erledigt) und liefert die Items, die
  // dadurch neu freigeschaltet wurden - für "Neu im Shop" im Ergebnis
  unlockedBy(fn) {
    const before = new Set(SL.COSMETICS.filter((c) => this.isUnlocked(c)).map((c) => c.id));
    fn();
    SL.Quests.sync();
    return SL.COSMETICS.filter((c) => !before.has(c.id) && this.isUnlocked(c));
  },

  // Kaufen rüstet das Item direkt aus - wer etwas kauft, will es in aller Regel sofort sehen
  buy(id) {
    const cos = SL.getCosmetic(id);
    if (!cos || this.owns(id) || !this.isUnlocked(cos)) return false;
    return SL.Profile.buyCosmetic(id, cos.type, cos.price);
  },

  equip(id) {
    const cos = SL.getCosmetic(id);
    if (!cos || !this.owns(id)) return false;
    SL.Profile.equipCosmetic(id, cos.type);
    return true;
  },
};
