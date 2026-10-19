// Sucht für jedes Level den Seed, dessen kürzester Weg am nächsten an der Zielkurve
// (SL.levelCurve -> targetSteps) liegt, und trägt die Liste in js/levels.js ein.
//
//   npm run seeds                                 -> Tabelle anzeigen + LEVEL_SEEDS schreiben
//   node games/maze/tools/level-seeds.js --dry    -> nur anzeigen
//
// Danach SL.LEVEL_SET_VERSION in levels.js erhöhen, falls sich Mazes geändert haben.
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const levelsFile = path.join(root, "js", "levels.js");
const TRIES = 80;

globalThis.window = globalThis;
eval(fs.readFileSync(path.join(root, "..", "..", "shared", "js", "rng.js"), "utf8"));
for (const f of ["maze", "levels", "economy"]) {
  eval(fs.readFileSync(path.join(root, "js", f + ".js"), "utf8"));
}

const seeds = [];
console.log("Level  Räume  Loops   Ziel  gewählt  3★-Zeit");
for (const level of SL.LEVELS) {
  const { targetSteps } = SL.levelCurve(level.id);
  let best = null;
  for (let k = 0; k < TRIES; k++) {
    const seed = level.id * 7919 + k * 104729;
    const { optimalSteps } = SL.generateMaze({ ...level, seed });
    if (!best || Math.abs(optimalSteps - targetSteps) < Math.abs(best.steps - targetSteps)) {
      best = { seed, steps: optimalSteps };
    }
  }
  seeds.push(best.seed);
  const t3 = SL.Economy.computeThresholds(best.steps).t3 / 1000;
  console.log(
    String(level.id).padStart(5),
    String(level.rows).padStart(6),
    level.loopFactor.toFixed(3).padStart(6),
    String(targetSteps).padStart(6),
    String(best.steps).padStart(8),
    (t3.toFixed(2) + "s").padStart(9)
  );
}

if (process.argv.includes("--dry")) process.exit(0);

const src = fs.readFileSync(levelsFile, "utf8");
const lines = [];
for (let i = 0; i < seeds.length; i += 6) lines.push("  " + seeds.slice(i, i + 6).join(", ") + ",");
const replaced = src.replace(/const LEVEL_SEEDS = \[[\s\S]*?\];/, `const LEVEL_SEEDS = [\n${lines.join("\n")}\n];`);
if (replaced === src) {
  console.log("\nLEVEL_SEEDS unverändert.");
} else {
  fs.writeFileSync(levelsFile, replaced);
  console.log(`\nLEVEL_SEEDS in js/levels.js aktualisiert (${seeds.length} Level).`);
}
