// Level-Konfiguration: Größe, Unlock-Kosten, Loop-Faktor für ~15 Level.
// Kein Tempo mehr hier - die Bewegung ist komplett manuell (ein Tastendruck = ein Feld),
// das Tempo macht also nur noch der Spieler selbst über die Drückfrequenz.
window.SL = window.SL || {};

const LEVEL_COUNT = 15;

function nextOdd(n) {
  n = Math.round(n);
  return n % 2 === 0 ? n + 1 : n;
}

SL.LEVELS = (function buildLevels() {
  const levels = [];
  for (let id = 1; id <= LEVEL_COUNT; id++) {
    // "size" ist die Anzahl Räume; das fertige Grid (Wände als eigene Zellen) ist size*2+1 groß.
    const size = Math.min(21, nextOdd(7 + (id - 1) * 1.0));
    const loopFactor = id < 6 ? 0 : Math.min(0.14, (id - 5) * 0.022);
    const coinCount = Math.min(12, 5 + Math.floor(id / 2));
    const unlockCost = id <= 1 ? 0 : 40 + (id - 2) * 35;

    levels.push({
      id,
      name: `Level ${id}`,
      rows: size,
      cols: size,
      loopFactor,
      coinCount,
      unlockCost,
      seed: id * 7919, // Primzahl-Multiplikator für gute Seed-Streuung
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
