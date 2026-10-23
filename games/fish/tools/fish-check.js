// Spielt das Ziehen für jeden Fisch mit jeder Ausrüstungsstufe (Angel, Schnur, Köder gleich hoch)
// durch und zeigt die Fangquote - für zwei Bots, die wie Menschen spielen (PLAYERS): Sie halten die
// Spannung ungefähr in der Mitte (ziehen unter low, lassen über high los) und lassen los, wenn der
// Fisch zappelt. Alles, was sie sehen, sehen sie mit Verzögerung (reaction).
// Ziel: Teich mit Startausrüstung fast immer, Fluss ab Stufe 1, Meer ab Stufe 2, der legendäre
// erst mit der besten Ausrüstung sicher. Dazu: welche Ebenen die Rolle je Stufe erreicht.
//
//   node games/fish/tools/fish-check.js
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ctx = { window: {}, console, Math };
ctx.window = ctx;
vm.createContext(ctx);
for (const file of ["data.js", "fishing.js"]) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", file), "utf8"), ctx, { filename: file });
}
const SL = ctx.SL;
const RUNS = 400;
const TICK = 10;
const PLAYERS = [
  { name: "flott", reaction: 200, low: 0.45, high: 0.62 },
  { name: "gemütlich", reaction: 320, low: 0.4, high: 0.66 },
];

function play(fish, gear, size, p) {
  const game = new SL.TensionGame(fish, size, gear);
  const seen = []; // was der Bot sieht: { phase, tension }, verzögert
  const lag = Math.round(p.reaction / TICK);
  let holding = true;
  let ms = 0;
  while (!game.done && ms < 120000) {
    seen.push({ phase: game.phase(), tension: game.tension });
    const view = seen[Math.max(0, seen.length - 1 - lag)];
    if (view.phase !== "calm") holding = false;
    else if (view.tension < p.low) holding = true;
    else if (view.tension > p.high) holding = false;
    game.update(TICK, holding);
    ms += TICK;
  }
  return game;
}

console.log("Rolle: erreichbare Ebenen je Stufe");
for (const spot of SL.SPOTS) {
  const reach = SL.GEAR.find((g) => g.id === "reel").levels.map((l) => SL.reachableLayers(spot, l.depth));
  console.log(`  ${spot.name.padEnd(6)} (${spot.layers} Ebenen à ${spot.layerM} m): ${reach.join(" / ")}`);
}

const levels = [0, 1, 2, 3];
for (const p of PLAYERS) {
  console.log(`\nBot ${p.name} (${p.reaction} ms)`);
  console.log("Fisch          Ort    Ebene  Kraft   Stufe 0  Stufe 1  Stufe 2  Stufe 3   (Fangquote, Ø Dauer Stufe 0)");
  for (const fish of SL.FISH) {
    const cells = [];
    let ms0 = 0;
    for (const level of levels) {
      const gear = SL.gearStats({ rod: level, line: level, reel: level, bait: level, box: level });
      let caught = 0;
      for (let i = 0; i < RUNS; i++) {
        const g = play(fish, gear, Math.random(), p);
        if (g.done === "caught") caught++;
        if (level === 0) ms0 += g.t;
      }
      cells.push(`${String(Math.round((caught / RUNS) * 100)).padStart(5)} %`);
    }
    const layers = fish.layers[0] === fish.layers[1] ? `${fish.layers[0]}` : `${fish.layers[0]}-${fish.layers[1]}`;
    console.log(`${fish.name.padEnd(14)} ${fish.spot.padEnd(6)} ${layers.padStart(4)}   ${fish.strength.toFixed(2)}   ${cells.join("  ")}   ${(ms0 / RUNS / 1000).toFixed(1)}s`);
  }
}
