// Rechnet die Quoten des Automaten exakt aus (alle 8000 Walzen-Kombinationen): wie oft man gewinnt,
// wie viele Kristalle ein Dreh im Schnitt bringt und wie viele Coins damit ein Kristall kostet.
//   npm run slots-odds
const fs = require("fs");
const path = require("path");

globalThis.window = globalThis;
eval(fs.readFileSync(path.join(__dirname, "..", "..", "shared", "js", "rng.js"), "utf8"));
eval(fs.readFileSync(path.join(__dirname, "..", "machine.js"), "utf8"));

const pct = (x) => `${(x * 100).toFixed(2)} %`;
const o = SL.Slots.odds();
console.log("Walzen:");
SL.Slots.REELS.forEach((strip, i) => console.log(`  ${i + 1}: ${strip.join(" ")}`));
console.log(`\nGewinn pro Dreh:      ${pct(o.hitRate)} (jeder ${(1 / o.hitRate).toFixed(1)}. Dreh)`);
console.log(`Kristalle pro Dreh:   ${o.crystalsPerSpin.toFixed(3)} (Einsatz ${SL.Slots.BASE_STAKE} Coins)`);
console.log(`Coins pro Kristall:   ${o.coinsPerCrystal.toFixed(1)}`);
console.log("\nChancen:");
for (const [k, p] of Object.entries(o.chances).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(16)} ${pct(p).padStart(8)}  (1 zu ${Math.round(1 / p)})`);
