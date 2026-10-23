// Spielt den Kampf mit mehreren Bots durch und meldet, ob die Werte passen:
//   profi    - weicht beim Augenblitzen perfekt aus, schlägt in jeder Öffnung im Takt zu
//   mensch   - Reaktionszeit 260 ms: weicht frühestens dann aus (meist nicht perfekt) und schlägt
//              erst 260 ms nach Beginn einer Öffnung zu
//   zögerer  - wie mensch, nutzt aber nur jede zweite Öffnung (testet die Rundenuhr)
//   spammer  - drückt dauernd zuschlagen und weicht nie aus
// Erwartung: profi + mensch gewinnen immer (mit Zeit übrig), spammer verliert immer.
//
//   node games/duel/tools/duel-check.js
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ctx = { window: {}, console, Math };
ctx.window = ctx;
vm.createContext(ctx);
for (const file of ["boss.js", "game.js"]) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", file), "utf8"), ctx, { filename: file });
}
const SL = ctx.SL;
const TICK = 16;
const RUNS = 40;
const REACTION_MS = 260;

// Wo man stehen muss, damit der Angriff nicht trifft (null = einfach stehen bleiben)
function safeInput(attack) {
  if (!attack.hits.includes("C")) return null;
  if (!attack.hits.includes("L")) return "W";
  if (!attack.hits.includes("R")) return "E";
  return "S";
}

function play(bot) {
  const s = new SL.DuelSession(SL.BOSS);
  s.press("N"); // Start
  let planned = null; // { at, input }
  let seenWindup = null;
  let openStart = null;
  let openCount = 0;
  let useThisOpen = true;
  while (!s.finished && s.time < 300000) {
    const f = s.fight;
    if (bot === "spammer") {
      s.press("N");
    } else {
      // Neues Ausholen gesehen -> Ausweichen planen
      if (f.phase === "windup" && seenWindup !== f.start) {
        seenWindup = f.start;
        const input = safeInput(f.attack);
        const impact = f.start + f.dur + SL.DUEL.STRIKE_MS;
        if (input) {
          const at = bot === "profi" ? impact - 90 : Math.max(impact - 200, f.start + REACTION_MS);
          planned = { at, input };
        }
      }
      if (planned && s.time >= planned.at) {
        s.press(planned.input);
        planned = null;
      }
      // Öffnung: im Takt zuschlagen, solange der Schlag noch rechtzeitig ankommt
      if (s.isBossOpen()) {
        if (openStart !== f.start) {
          openStart = f.start;
          openCount++;
          useThisOpen = bot !== "zögerer" || openCount % 2 === 0;
        }
        const left = f.start + f.dur - s.time;
        const seen = bot === "profi" || s.time - f.start > REACTION_MS;
        const punch = SL.DUEL.PUNCHES[s.time <= s.chain.until ? s.chain.next : 0];
        const free = s.player.action === "idle" || (s.player.action === "dodge" && s.time - s.player.start > 300);
        if (useThisOpen && seen && free && !planned && left > punch.hit + 30) s.press("N");
      }
    }
    s.update(TICK);
  }
  return s.result;
}

let ok = true;
const fmt = (ms) => (ms / 1000).toFixed(1) + "s";
console.log(`${SL.BOSS.name}: ${SL.BOSS.hp} Energie, Rundenuhr ${fmt(SL.BOSS.roundMs)}\n`);
console.log("Bot       Siege   Sterne Ø  Zeit Ø   Zeit max  Combo Ø  perfekt Ø  geblockt Ø");
for (const bot of ["profi", "mensch", "zögerer", "spammer"]) {
  let wins = 0, stars = 0, time = 0, maxTime = 0, combo = 0, perfects = 0, blocked = 0;
  const reasons = {};
  for (let i = 0; i < RUNS; i++) {
    const r = play(bot);
    if (r.won) wins++;
    reasons[r.reason] = (reasons[r.reason] || 0) + 1;
    stars += r.stars;
    time += r.timeMs;
    maxTime = Math.max(maxTime, r.timeMs);
    combo += r.maxCombo;
    perfects += r.perfects;
    blocked += r.blocked;
  }
  const bad = bot === "spammer" ? wins > 0 : bot === "zögerer" ? false : wins < RUNS;
  if (bad) ok = false;
  const avg = (v) => (v / RUNS).toFixed(1).padStart(5);
  console.log(
    `${bot.padEnd(9)} ${String(wins).padStart(2)}/${RUNS}   ${(stars / RUNS).toFixed(2).padStart(6)}    ${fmt(time / RUNS).padStart(6)}   ${fmt(maxTime).padStart(6)}   ${avg(combo)}    ${avg(perfects)}     ${avg(blocked)}`
    + `   ${Object.entries(reasons).map(([k, v]) => `${k}:${v}`).join(" ")}${bad ? "   <- !" : ""}`,
  );
}
console.log(ok ? "\nAlles ok." : "\nAuffälligkeiten (siehe <- !).");
process.exit(ok ? 0 : 1);
