// Alle Spiele der Plattform - die Startseite baut daraus ihre Kacheln.
// Neues Spiel = eigener Ordner unter games/ + ein Eintrag hier. Pfade relativ zur Startseite.
window.SL = window.SL || {};

SL.GAMES = [
  {
    id: "maze", // dieselbe ID meldet das Spiel bei SL.Profile.completeDaily
    name: "Maze",
    tagline: "Finde den Weg. Werde schneller.",
    path: "games/maze/",
    preview: "games/maze/preview.svg",
    tags: ["30 Level", "Tempo"],
    daily: true, // hat ein tägliches Rätsel, das für die Serie zählt
  },
  {
    id: "drift",
    name: "Drift",
    tagline: "Rutsch bis zur Wand. Werde schneller.",
    path: "games/drift/",
    preview: "games/drift/preview.svg",
    tags: ["30 Level", "Puzzle"],
    daily: false,
  },
  {
    id: "leap",
    name: "Leap",
    tagline: "Spring im richtigen Moment. Triff die Mitte.",
    path: "games/leap/",
    preview: "games/leap/preview.svg",
    tags: ["30 Level", "Timing"],
    daily: true,
  },
  {
    // Prototyp - zum Verwerfen: Ordner games/duel/ und diesen Eintrag löschen
    id: "duel",
    name: "Duel",
    tagline: "Weich aus. Lies die Kombo. Schlag zurück.",
    path: "games/duel/",
    preview: "games/duel/preview.svg",
    tags: ["Prototyp", "Arcade-Kampf"],
    daily: false,
  },
  {
    // Prototyp - zum Verwerfen: Ordner games/fish/ und diesen Eintrag löschen
    id: "fish",
    name: "Fish",
    tagline: "Lass den Haken runter. Hol ihn hoch. Rüste auf für die Tiefe.",
    path: "games/fish/",
    preview: "games/fish/preview.svg",
    tags: ["Prototyp", "Entspannt"],
    daily: false,
  },
];
