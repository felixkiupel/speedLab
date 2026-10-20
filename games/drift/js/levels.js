// Level-Konfiguration: 30 Level in 3 Kapiteln. Jedes Kapitel hat eine feste Brettgröße (6×7, 7×8,
// 8×9) und bringt eine neue Feldart; innerhalb des Kapitels steigen Zugzahl und Fallen. Die Karten
// erzeugt tools/level-gen.js (npm run drift-levels): eindeutige Lösung mit genau der geplanten
// Zugzahl, und jedes Teil auf dem Brett hat eine Aufgabe - Felsen stoppen die Lösung oder bauen
// Fallen, Schnee liegt auf dem Weg, Löcher versperren Abkürzungen oder lauern neben dem Weg (nie
// nebeneinander, nie in Ecken). Ein Coin liegt auf dem Weg, der Rest auf Umwegen. Man kann die
// Karten auch von Hand anpassen (Zeichen siehe js/puzzle.js) und mit
// "node games/drift/tools/level-gen.js --check" prüfen.
window.SL = window.SL || {};

// Erhöhen, sobald sich bestehende Karten ändern - alte Bestzeiten/Sterne gehören dann zu anderen
// Rätseln und werden beim Laden verworfen (siehe storage.js).
SL.LEVEL_SET_VERSION = 3;

// coach: Hinweis beim allerersten Öffnen des ersten Kapitel-Levels, wenn das Kapitel etwas Neues
// einführt - Meldung unter dem Brett, die neuen Felder pulsieren bis zum ersten Zug.
SL.CHAPTERS = [
  {
    id: 1, name: "Glatteis", firstLevel: 1, lastLevel: 10,
    description: "Rutsch bis zum nächsten Fels – und bleib genau auf dem Ziel liegen.",
  },
  {
    id: 2, name: "Schneefelder", firstLevel: 11, lastLevel: 20,
    description: "Größeres Feld. Schnee bremst sofort – manchmal ist er die einzige Rettung.",
    coach: { text: "Neu: <b>Schnee</b> bremst dich sofort", tile: SL.SNOW },
  },
  {
    id: 3, name: "Dünnes Eis", firstLevel: 21, lastLevel: 30,
    description: "Noch größer. Wer in ein Loch rutscht, fällt rein – und muss neu starten.",
    coach: { text: "Neu: <b>Löcher</b> – reinrutschen heißt neu starten", tile: SL.HOLE },
  },
];

// Tutorial: festes Mini-Brett mit geführten Schritten, ohne Uhr und Sterne. "move" = diese
// Richtung ist dran (andere werden abgelehnt), "undo" = Zug zurücknehmen. Schritt 3 rutscht
// absichtlich übers Ziel, damit man "genau drauf stoppen" und "Zurück" einmal selbst erlebt.
SL.TUTORIAL = {
  name: "Tutorial",
  map: [
    ".#...",
    "S....",
    ".....",
    "....$",
    "..G..",
  ],
  steps: [
    { move: "E", text: "Rutsch nach rechts" },
    { move: "S", text: "Bis zum Rand! Jetzt runter, über den Coin" },
    { move: "W", text: "Und nach links aufs Ziel …" },
    { undo: true, text: "Vorbei! Du musst <b>auf</b> dem Ziel stoppen" },
    { move: "N", text: "Neuer Plan: erst ganz nach oben" },
    { move: "W", text: "Nach links – der Fels bremst dich" },
    { move: "S", text: "Jetzt runter, genau aufs Ziel!" },
  ],
  reward: 30, // Coins, einmalig beim ersten Abschluss
};

// Eine Karte pro Level, Zeile für Zeile. # Fels · . Eis · : Schnee · o Loch · S Start · G Ziel · $ Coin
const LEVEL_MAPS = [
  [
    ".#....",
    ".....G",
    "......",
    ".$....",
    "......",
    ".S....",
    "......",
  ],
  [
    "......",
    "....S.",
    "......",
    "#.....",
    "...$..",
    "G$..#.",
    "#.....",
  ],
  [
    "...S..",
    "......",
    "......",
    "#..$..",
    "G.....",
    "......",
    ".$.#..",
  ],
  [
    "..G...",
    "......",
    "......",
    "......",
    "#...S.",
    "$.....",
    "..$#..",
  ],
  [
    "......",
    ".....#",
    ".....G",
    "S...#.",
    "...$..",
    "......",
    "...#$.",
  ],
  [
    ".$..S.",
    "#.....",
    "....#.",
    "$....#",
    ".....G",
    "......",
    ".....$",
  ],
  [
    "......",
    "#.....",
    ".G#..S",
    "$.....",
    "......",
    ".....$",
    "..$#..",
  ],
  [
    "..#...",
    "......",
    "......",
    "G$...$",
    "...#..",
    "....$#",
    "..S...",
  ],
  [
    "..G$#.",
    "$....$",
    "......",
    "......",
    "......",
    "...#.S",
    "#...#.",
  ],
  [
    ".#....",
    "$.$#G.",
    ".....#",
    "......",
    "..$...",
    "S.#...",
    "......",
  ],
  [
    ".......",
    ".....S.",
    ".#...:$",
    ".G.....",
    ".......",
    ".......",
    "#..$...",
    ".....#.",
  ],
  [
    "....#..",
    "....$..",
    ".......",
    ".......",
    "...$:S.",
    ".......",
    "..$G#..",
    "...#...",
  ],
  [
    "$.:G#..",
    "......$",
    ".......",
    ".......",
    "#......",
    ".#.....",
    "S.$....",
    ".#.....",
  ],
  [
    ".....G.",
    ".....$.",
    "...:.:.",
    ".$.....",
    "#.....S",
    "$......",
    ".....#.",
    "....#..",
  ],
  [
    "...S...",
    ".......",
    "#....##",
    ".$.#...",
    ".......",
    "G..:...",
    "...:$..",
    "$...#..",
  ],
  [
    "....S..",
    ".....$.",
    ".......",
    "#......",
    "$..:.:.",
    "......G",
    ".....#.",
    "..$.#..",
  ],
  [
    "$...#..",
    "#......",
    "......G",
    "...:...",
    ".$.....",
    "......$",
    "#:.....",
    ".S.....",
  ],
  [
    ".....#.",
    "$......",
    "......S",
    "....:..",
    "....:..",
    "$.#.:$.",
    "#......",
    ".$.G...",
  ],
  [
    "..:....",
    "....$..",
    "..$....",
    "....:#.",
    "....:..",
    "G..#$..",
    "..#...#",
    "$#.S...",
  ],
  [
    "$.#....",
    "G......",
    ".:.....",
    ".......",
    "..:.$.$",
    "$.:..#.",
    "#......",
    ".....S.",
  ],
  [
    ".o......",
    ".......$",
    "........",
    "........",
    "........",
    "........",
    ".....$..",
    "S..#....",
    "..$.#G..",
  ],
  [
    ".#.o...G",
    ".......#",
    "........",
    "..S.....",
    "........",
    ".$......",
    "........",
    "#..o..$.",
    "$.#.....",
  ],
  [
    "........",
    "$...S.#.",
    ".....$..",
    "........",
    "..o.....",
    "........",
    "#.......",
    "G#....$.",
    "...o.#..",
  ],
  [
    ".$.#....",
    ".....:o.",
    "..#.....",
    "$....G..",
    ".....#..",
    ".....oS.",
    "........",
    "#.....:.",
    ".$......",
  ],
  [
    "....#...",
    ".#......",
    ".......#",
    "...$..$.",
    ".S.o....",
    ".o.....$",
    "......o.",
    ".......$",
    ".#...#.G",
  ],
  [
    "..#.....",
    "...#....",
    ".....o..",
    ".....#.S",
    "..#..$:.",
    "...o..o.",
    "$.......",
    "........",
    ".G$..$#.",
  ],
  [
    "...S....",
    "........",
    "........",
    "o...#...",
    "..o..$G#",
    ".......$",
    ":..#....",
    "o.....#$",
    ".$...#..",
  ],
  [
    "..:...#.",
    "$...o...",
    "......$.",
    "$.......",
    "#......:",
    ".o.....o",
    "...$....",
    "G.#.....",
    "#.....S.",
  ],
  [
    "........",
    "...$....",
    "#.o:.S.o",
    ".$.:$.#.",
    "...o..o.",
    "....##..",
    "..$.....",
    "........",
    ".....#G.",
  ],
  [
    ".....$..",
    ".......$",
    "G.......",
    "#......$",
    "...:o..#",
    "....:...",
    ".....#o.",
    "o...o.$.",
    ".....S.#",
  ],
];

// Preis zum Freischalten. Die Belohnung eines Levels richtet sich nach dem Preis des nächsten
// (SL.Profile.levelPay) - darum als Funktion, die auch nach Level 30 weiterrechnet.
SL.levelUnlockCost = function levelUnlockCost(id) {
  return id <= 1 ? 0 : 60 + (id - 2) * 15;
};

SL.LEVELS = LEVEL_MAPS.map((map, i) => {
  const id = i + 1;
  const chapter = SL.CHAPTERS.find((ch) => id >= ch.firstLevel && id <= ch.lastLevel);
  return {
    id,
    name: `Level ${id}`,
    chapter: chapter.id,
    map,
    unlockCost: SL.levelUnlockCost(id),
  };
});

SL.getLevel = function getLevel(id) {
  return SL.LEVELS.find((l) => l.id === id) || null;
};

SL.getNextLevel = function getNextLevel(id) {
  return SL.getLevel(id + 1);
};

// Karte + Analyse (Lösung, Sackgassen, Sterne-Grenzen) einmal pro Level berechnen und cachen -
// das Level-Menü braucht die Sterne-Grenzen für jede Kachel.
const puzzleCache = new Map();
SL.getLevelPuzzle = function getLevelPuzzle(id) {
  if (!puzzleCache.has(id)) {
    const board = SL.parseBoard(SL.getLevel(id).map);
    const analysis = SL.analyzeBoard(board);
    puzzleCache.set(id, { board, analysis, thresholds: SL.Economy.computeThresholds(analysis) });
  }
  return puzzleCache.get(id);
};
