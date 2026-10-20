// Level-Konfiguration: 30 Level in 3 Kapiteln. Größe, Loop-Faktor und die angestrebte Länge des
// kürzesten Wegs folgen einer festen Kurve (levelCurve), damit jedes Level spürbar etwas länger
// ist als das vorherige. Kein Tempo hier - die Bewegung ist komplett manuell (ein Tastendruck = ein Feld).
window.SL = window.SL || {};

// Erhöhen, sobald sich die Mazes ändern (Kurve, Seeds, Generator) - alte Bestzeiten/Sterne
// beziehen sich dann auf andere Labyrinthe und werden beim Laden verworfen (siehe storage.js).
SL.LEVEL_SET_VERSION = 2;

// checkpoints: pro Kapitel einer mehr. Ein Crash schickt dann nur zum letzten erreichten
// Checkpoint statt an den Start - die Uhr läuft trotzdem weiter, die Sterne bleiben also streng.
SL.CHAPTERS = [
  { id: 1, name: "Grundlagen", description: "Ein einziger Weg führt ans Ziel.", firstLevel: 1, lastLevel: 10, checkpoints: 0 },
  { id: 2, name: "Abzweigungen", description: "Erste Schleifen – nicht jede Abkürzung lohnt sich.", firstLevel: 11, lastLevel: 20, checkpoints: 1 },
  { id: 3, name: "Großes Labyrinth", description: "Riesig, verwinkelt, voller Schleifen.", firstLevel: 21, lastLevel: 30, checkpoints: 2 },
];

// Die Kurve: "rooms" = Räume pro Seite (das Grid ist rooms*2+1 Zellen groß), "targetSteps" =
// gewünschte Länge des kürzesten Wegs in Feldern. Loops (ab Kapitel 2) machen das Maze schwerer
// zu lesen, verkürzen aber den kürzesten Weg - deshalb wächst die Größe schneller als das Ziel.
SL.levelCurve = function levelCurve(id) {
  const rooms = Math.round(5 + (id - 1) * 0.75);
  const loopFactor = id <= 10 ? 0 : id <= 20 ? 0.02 + (id - 11) * 0.004 : 0.06 + (id - 21) * 0.004;
  const targetSteps = Math.round(30 + (id - 1) * 8);
  return { rooms, loopFactor, targetSteps };
};

// Pro Level der Seed, dessen kürzester Weg am nächsten an targetSteps liegt (max. ~7 % daneben).
// Fest eingetragen statt zur Laufzeit gesucht, weil die Suche über alle Level ~1 s dauert.
// Neu erzeugen nach Änderungen an Kurve oder Generator: npm run seeds (games/maze/tools/level-seeds.js)
// LEVEL_SEEDS[id - 1] gehört zu Level id.
const LEVEL_SEEDS = [
  217377, 15838, 128486, 136405, 667969, 152243,
  1940555, 272810, 699645, 1440667, 87109, 3551085,
  521863, 2310175, 1270804, 3478032, 1391371, 561458,
  2454499, 3195521, 2365608, 2059340, 601053, 1342075,
  721620, 520081, 4717160, 5353453, 5570830, 6102394,
];

const LEVEL_COUNT = SL.CHAPTERS[SL.CHAPTERS.length - 1].lastLevel;

// Preis zum Freischalten. Die Belohnung eines Levels richtet sich nach dem Preis des nächsten
// (SL.Profile.levelPay) - darum als Funktion, die auch nach Level 30 weiterrechnet.
SL.levelUnlockCost = function levelUnlockCost(id) {
  return id <= 1 ? 0 : 40 + (id - 2) * 35;
};

SL.LEVELS = (function buildLevels() {
  const levels = [];
  for (let id = 1; id <= LEVEL_COUNT; id++) {
    const { rooms, loopFactor } = SL.levelCurve(id);
    const chapter = SL.CHAPTERS.find((ch) => id >= ch.firstLevel && id <= ch.lastLevel);
    levels.push({
      id,
      name: `Level ${id}`,
      chapter: chapter.id,
      checkpoints: chapter.checkpoints,
      rows: rooms,
      cols: rooms,
      loopFactor,
      coinCount: Math.min(16, 4 + Math.floor(id / 2)),
      unlockCost: SL.levelUnlockCost(id),
      seed: LEVEL_SEEDS[id - 1] ?? id * 7919, // Fallback, falls die Seed-Liste kürzer ist
    });
  }
  return levels;
})();

SL.getLevel = function getLevel(id) {
  return SL.LEVELS.find((l) => l.id === id) || null;
};

SL.getNextLevel = function getNextLevel(id) {
  return SL.getLevel(id + 1);
};

// Mazes sind deterministisch und werden während des Spiels nicht verändert - daher einmal
// erzeugen und cachen. Das Level-Menü braucht für jede Kachel den kürzesten Weg (Sterne-Ziel).
const mazeCache = new Map();
SL.getLevelMaze = function getLevelMaze(id) {
  if (!mazeCache.has(id)) {
    const level = SL.getLevel(id);
    mazeCache.set(id, SL.generateMaze({
      rows: level.rows,
      cols: level.cols,
      seed: level.seed,
      loopFactor: level.loopFactor,
      coinCount: level.coinCount,
    }));
  }
  return mazeCache.get(id);
};
