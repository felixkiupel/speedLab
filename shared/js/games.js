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
    tags: ["30 Level", "Skins"],
    daily: true, // hat ein tägliches Rätsel, das für die Serie zählt
  },
];
