// Erzeugt die Drift-Level: probiert pro Level viele zufällige Karten (SL.generateBoard), bewertet
// sie und trägt die beste samt Coins in js/levels.js ein (Block LEVEL_MAPS).
//
//   npm run drift-levels                                 -> Tabelle + Karten anzeigen, levels.js schreiben
//   node games/drift/tools/level-gen.js --dry            -> nur anzeigen
//
// Danach SL.LEVEL_SET_VERSION in levels.js erhöhen, falls sich bestehende Level geändert haben.
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const levelsFile = path.join(root, "js", "levels.js");
const TRIES = 8000;

globalThis.window = globalThis;
for (const f of ["rng", "puzzle"]) {
  eval(fs.readFileSync(path.join(root, "js", f + ".js"), "utf8"));
}

// Der Plan: drei Kapitel à 10 Level. Innerhalb eines Kapitels bleibt die Brettgröße gleich (Spalten
// × Zeilen, hochkant fürs Handy), schwerer wird es über die Zugzahl und die Fallen. Jedes Kapitel
// ist eine Größe größer und bringt eine neue Feldart: 1 nur Felsen, 2 Schnee, 3 Löcher.
//   moves    exakte Zugzahl der kürzesten Lösung
//   traps    so viele Sackgassen mindestens (maxTraps höchstens - der Anfang soll gnädig sein)
//   falls    so viele Züge ins Loch mindestens, die man von lösbaren Feldern aus machen kann
const CHAPTER_PLANS = [
  {
    cols: 6, rows: 7, rockRate: 0.16,
    moves: [2, 3, 3, 4, 4, 5, 5, 6, 6, 7],
    traps: [0, 0, 1, 1, 2, 2, 3, 3, 4, 4],
    maxTraps: [1, 2, 4],
    coins: [1, 2, 2, 2, 2, 3, 3, 3, 3, 3],
  },
  {
    cols: 7, rows: 8, rockRate: 0.14,
    snow: [2, 2, 2, 3, 3, 3, 3, 4, 4, 4],
    moves: [4, 5, 5, 6, 6, 7, 7, 8, 8, 9],
    traps: [1, 1, 2, 2, 3, 3, 4, 4, 5, 5],
    coins: [2, 3, 3, 3, 3, 3, 3, 4, 4, 4],
  },
  {
    cols: 8, rows: 9, rockRate: 0.12,
    snow: [0, 0, 1, 1, 1, 2, 2, 2, 2, 3],
    holes: [2, 2, 3, 3, 3, 4, 4, 4, 5, 5],
    moves: [5, 6, 6, 7, 7, 8, 8, 9, 9, 10],
    traps: [1, 1, 2, 2, 3, 3, 4, 4, 5, 5],
    falls: [2, 2, 3, 3, 3, 4, 4, 5, 5, 6],
    coins: [3, 3, 3, 3, 4, 4, 4, 4, 4, 4],
  },
];

const PLAN = CHAPTER_PLANS.flatMap((ch, chapterIndex) => ch.moves.map((moves, i) => ({
  chapter: chapterIndex + 1,
  cols: ch.cols,
  rows: ch.rows,
  rockRate: ch.rockRate,
  snow: ch.snow ? ch.snow[i] : 0,
  holes: ch.holes ? ch.holes[i] : 0,
  moves,
  traps: ch.traps[i],
  maxTraps: ch.maxTraps ? ch.maxTraps[i] : undefined,
  falls: ch.falls ? ch.falls[i] : 0,
  coins: ch.coins[i],
  // Im Schnee-Kapitel muss die Lösung den Schnee auch wirklich brauchen
  needsSnow: chapterIndex === 1,
})));

const cellKey = (board, p) => p.r * board.cols + p.c;

// Felder der kürzesten Lösung (alle überrutschten Felder)
function solutionCells(board, analysis) {
  const cells = new Set();
  let pos = board.start;
  for (const dir of analysis.solution) {
    const move = SL.slide(board, pos, dir);
    move.path.forEach((p) => cells.add(cellKey(board, p)));
    pos = move.to;
  }
  return cells;
}

// Wie viele Züge braucht man mindestens bis ins Ziel, wenn man unterwegs über "cell" rutschen muss?
// BFS über (Haltepunkt, Coin schon geholt?)
function movesVia(board, analysis, cell) {
  const startKey = cellKey(board, board.start);
  const goalKey = cellKey(board, board.goal);
  const seen = new Set([startKey * 2]);
  let frontier = [[startKey, 0]];
  for (let depth = 0; frontier.length; depth++) {
    const next = [];
    for (const [node, got] of frontier) {
      if (node === goalKey && got) return depth;
      for (const e of analysis.graph.get(node)) {
        const g = got || e.path.some((p) => cellKey(board, p) === cell) ? 1 : 0;
        const id = e.to * 2 + g;
        if (seen.has(id)) continue;
        seen.add(id);
        next.push([e.to, g]);
      }
    }
    frontier = next;
  }
  return Infinity;
}

// Coins: einer liegt auf der kürzesten Lösung (gratis), die übrigen kosten einen Umweg von 1-3
// Zügen - wer alle will, verliert Zeit und damit eventuell Sterne.
function placeCoins(board, analysis, count, rand) {
  const onPath = solutionCells(board, analysis);
  const candidates = [];
  for (let r = 0; r < board.rows; r++) {
    for (let c = 0; c < board.cols; c++) {
      if (board.grid[r][c] !== SL.ICE) continue;
      const k = r * board.cols + c;
      if (k === cellKey(board, board.start) || k === cellKey(board, board.goal)) continue;
      const extra = movesVia(board, analysis, k) - analysis.minMoves;
      if (extra === Infinity || extra > 3) continue;
      candidates.push({ r, c, extra, onPath: onPath.has(k), shuffle: rand() });
    }
  }
  const far = (a, list) => list.every((b) => Math.abs(a.r - b.r) + Math.abs(a.c - b.c) >= 2);
  const chosen = [];
  const free = candidates.filter((x) => x.extra === 0 && x.onPath).sort((a, b) => a.shuffle - b.shuffle);
  if (free.length) chosen.push(free[0]);
  const detours = candidates.filter((x) => x.extra > 0).sort((a, b) => a.extra - b.extra || a.shuffle - b.shuffle);
  // abwechselnd billige und teure Umwege, damit die Coins nicht alle gleich viel kosten
  while (chosen.length < count && detours.length) {
    const pick = chosen.length % 2 ? detours.pop() : detours.shift();
    if (far(pick, chosen)) chosen.push(pick);
  }
  return chosen.map(({ r, c, extra }) => ({ r, c, extra }));
}

function usesSnow(board, analysis) {
  let pos = board.start;
  for (const dir of analysis.solution) {
    pos = SL.slide(board, pos, dir).to;
    if (board.grid[pos.r][pos.c] === SL.SNOW) return true;
  }
  return false;
}

function score(board, analysis, plan) {
  let rocks = 0;
  for (const row of board.grid) for (const t of row) if (t === SL.ROCK) rocks++;
  const dirs = new Set(analysis.solution).size;
  return (
    -(analysis.shortestCount - 1) * 5 // eindeutige Lösung = echtes Rätsel
    + Math.min(analysis.deadStates, plan.traps + 3) * 2 // Sackgassen, in die man reinrutschen kann
    + Math.min(analysis.fallMoves, plan.falls + 3) * 1.5 // Gelegenheiten, ins Loch zu rutschen
    + analysis.states * 0.6 // viele Haltepunkte = viele falsche Fährten
    + dirs * 2
    - rocks * 0.4 // lieber wenige Felsen mit langer Lösung als ein vollgestelltes Feld
  );
}

function pickLevel(plan, index) {
  let best = null;
  for (let k = 0; k < TRIES; k++) {
    const seed = (index + 1) * 7919 + k * 104729;
    const board = SL.generateBoard({ ...plan, goalDist: plan.moves, seed });
    if (!board) continue;
    const analysis = SL.analyzeBoard(board);
    if (analysis.minMoves !== plan.moves) continue;
    if (analysis.deadStates < plan.traps) continue;
    if (analysis.deadStates > (plan.maxTraps ?? Infinity)) continue;
    if (analysis.fallMoves < plan.falls) continue;
    if (plan.needsSnow && !usesSnow(board, analysis)) continue;
    const s = score(board, analysis, plan);
    if (!best || s > best.score) best = { board, analysis, score: s, seed };
  }
  if (!best) throw new Error(`Keine Karte für Level ${index + 1} gefunden`);
  const rand = SL.createRng(best.seed ^ 0x5bd1e995);
  best.coins = placeCoins(best.board, best.analysis, plan.coins, rand);
  best.board.coins = best.coins;
  return best;
}

const maps = [];
console.log("Level  Größe  Züge  Lösungen  Sackg.  Löcher  Haltep.  Coins (Umweg)");
PLAN.forEach((plan, i) => {
  const best = pickLevel(plan, i);
  const a = best.analysis;
  maps.push(SL.boardToMap(best.board));
  console.log(
    String(i + 1).padStart(5),
    `${plan.cols}x${plan.rows}`.padStart(6),
    String(a.minMoves).padStart(5),
    String(a.shortestCount).padStart(9),
    String(a.deadStates).padStart(7),
    String(a.fallMoves).padStart(7),
    String(a.states).padStart(8),
    "  " + best.coins.map((co) => "+" + co.extra).join(" ")
  );
});
console.log("");
maps.forEach((map, i) => {
  console.log(`Level ${i + 1}:`);
  map.forEach((line) => console.log("  " + line.split("").join(" ")));
});

if (process.argv.includes("--dry")) process.exit(0);

const src = fs.readFileSync(levelsFile, "utf8");
const body = maps.map((map) => `  [\n${map.map((l) => `    "${l}",`).join("\n")}\n  ],`).join("\n");
const replaced = src.replace(/const LEVEL_MAPS = \[[\s\S]*?\n\];/, `const LEVEL_MAPS = [\n${body}\n];`);
if (replaced === src) {
  console.log("\nLEVEL_MAPS unverändert.");
} else {
  fs.writeFileSync(levelsFile, replaced);
  console.log(`\nLEVEL_MAPS in js/levels.js aktualisiert (${maps.length} Level).`);
}
