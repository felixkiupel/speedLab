// Seeded PRNG (mulberry32) - gleicher Seed => gleiche Zahlenfolge => reproduzierbare Mazes
window.SL = window.SL || {};

SL.createRng = function createRng(seed) {
  let a = seed >>> 0;
  return function rand() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

// Hilfsfunktion: zufälliges Ganzzahl-Element eines Arrays via rand()
SL.randInt = function randInt(rand, maxExclusive) {
  return Math.floor(rand() * maxExclusive);
};
