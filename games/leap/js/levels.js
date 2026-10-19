// Level-Konfiguration: 30 Level in 3 Kapiteln. Jedes Kapitel bringt etwas Neues, innerhalb eines
// Kapitels werden die Strecken länger und das Tempo steigt. Die Strecken selbst baut der Generator
// (js/course.js) aus einem festen Seed - für jeden gleich. Prüfen: npm run leap-check
window.SL = window.SL || {};

// Erhöhen, sobald sich Strecken ändern (Kurve, Seeds, Generator) - alte Bestwerte/Sterne gehören
// dann zu anderen Strecken und werden beim Laden verworfen (siehe storage.js).
SL.LEVEL_SET_VERSION = 1;

// coach: Hinweis vor dem ersten Lauf im ersten Level des Kapitels (einmalig)
SL.CHAPTERS = [
  {
    id: 1, name: "Abheben", firstLevel: 1, lastLevel: 10, checkpoints: 0,
    description: "Spring genau auf den Punkten ab. Wer früher springt, holt die Coins.",
    kinds: { normal: 1 },
  },
  {
    id: 2, name: "Hoch & flach", firstLevel: 11, lastLevel: 20, checkpoints: 1,
    description: "Punkte mit hohen und flachen Sprüngen. Ein Checkpoint pro Strecke.",
    kinds: { normal: 0.5, hop: 0.25, high: 0.25 },
    coach: "Neu: <b>Pfeil</b> = hoher Sprung, <b>Strich</b> = flacher Hüpfer",
  },
  {
    id: 3, name: "In Bewegung", firstLevel: 21, lastLevel: 30, checkpoints: 2,
    description: "Manche Punkte schwingen auf und ab. Zwei Checkpoints pro Strecke.",
    kinds: { normal: 0.4, hop: 0.2, high: 0.2, move: 0.2 },
    coach: "Neu: Punkte, die <b>auf und ab</b> schwingen",
  },
];

// Die Kurve: Tempo (px/s), Anzahl Punkte, Gabelungen mit Coins. Innerhalb eines Kapitels steigen
// Länge und Tempo, jedes Kapitel startet wieder etwas ruhiger.
SL.levelCurve = function levelCurve(id) {
  const chapter = SL.CHAPTERS.find((ch) => id >= ch.firstLevel && id <= ch.lastLevel) || SL.CHAPTERS[SL.CHAPTERS.length - 1];
  const k = id - chapter.firstLevel; // 0..9 im Kapitel
  return {
    chapter,
    vx: Math.round(225 + (chapter.id - 1) * 22 + k * 4),
    points: Math.round(7 + (chapter.id - 1) * 9 + k * 1.4),
    forks: id < 3 ? 0 : Math.min(4, 1 + (chapter.id - 1) + Math.floor(k / 5)),
    coinsPerFork: 3,
    checkpoints: chapter.checkpoints,
    kinds: chapter.kinds,
    firstGap: id === 1 ? 180 : 0, // Level 1: erster Punkt mit viel Anlauf
  };
};

const LEVEL_COUNT = SL.CHAPTERS[SL.CHAPTERS.length - 1].lastLevel;

SL.LEVELS = (function buildLevels() {
  const levels = [];
  for (let id = 1; id <= LEVEL_COUNT; id++) {
    const curve = SL.levelCurve(id);
    levels.push({
      id,
      name: `Level ${id}`,
      chapter: curve.chapter.id,
      // Kosten wachsen im selben Takt wie die Belohnung (SL.Economy.computeReward)
      unlockCost: id <= 1 ? 0 : 60 + (id - 2) * 15,
      seed: id * 7919 + 17, // fester Seed pro Level - ändern = neue Strecke (LEVEL_SET_VERSION erhöhen)
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

// Strecken sind deterministisch und ändern sich im Spiel nicht - einmal bauen und cachen
const courseCache = new Map();
SL.getLevelCourse = function getLevelCourse(id) {
  if (!courseCache.has(id)) {
    const level = SL.getLevel(id);
    const curve = SL.levelCurve(id);
    courseCache.set(id, SL.buildCourse({ ...curve, seed: level.seed }));
  }
  return courseCache.get(id);
};
