// Level-Konfiguration: Größe, Geschwindigkeit, Unlock-Kosten, Loop-Faktor für ~15 Level
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
    // tickMs = Zeit pro Grid-Zelle (ein Raumwechsel braucht 2 Zellen: Tür + Nachbarraum).
    const tickMs = Math.max(65, 420 - (id - 1) * 25);
    const loopFactor = id < 6 ? 0 : Math.min(0.14, (id - 5) * 0.022);
    const coinCount = Math.min(12, 5 + Math.floor(id / 2));
    const unlockCost = id <= 1 ? 0 : 40 + (id - 2) * 35;

    levels.push({
      id,
      name: `Level ${id}`,
      rows: size,
      cols: size,
      tickMs,
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

// Tempo eines Levels relativ zum langsamsten/schnellsten Level, als Stufe 1..SPEED_SEGMENTS
// (für die Speed-Anzeige im HUD - niedrigeres tickMs = schneller = mehr Stufen).
SL.SPEED_SEGMENTS = 8;
SL.speedLevelFor = function speedLevelFor(tickMs) {
  const slowest = SL.LEVELS[0].tickMs;
  const fastest = SL.LEVELS[SL.LEVELS.length - 1].tickMs;
  const ratio = (slowest - tickMs) / (slowest - fastest);
  return 1 + Math.round(ratio * (SL.SPEED_SEGMENTS - 1));
};
