// Erzeugt die Drift-Level: baut pro Level viele Karten (zufällig würfeln, dann schrittweise
// verbessern, bis sie zum Plan passen), dünnt jede aus und trägt die beste samt Coins in
// js/levels.js ein (Block LEVEL_MAPS).
//
//   npm run drift-levels                                  -> alle Level neu, levels.js schreiben
//   node games/drift/tools/level-gen.js --dry             -> nur anzeigen
//   node games/drift/tools/level-gen.js --only 4,17       -> nur diese Level neu, Rest bleibt
//   node games/drift/tools/level-gen.js --check           -> bestehende Karten nur prüfen
//   DRIFT_GEN_DEBUG=1 ...                                 -> pro Level zeigen, was verworfen wurde
//
// Grundsatz: Jedes Teil auf dem Brett hat eine Aufgabe. Nach dem Würfeln fliegt so lange ein Fels,
// Schnee oder Loch nach dem anderen raus, wie das Rätsel dadurch nicht leichter wird (gleiche
// Zugzahl, eindeutige Lösung, genug Fallen). Was übrig bleibt, wird gebraucht:
//   Fels    die Lösung stoppt daran, er versperrt eine Abkürzung oder er baut eine Falle
//   Schnee  die Lösung bleibt darauf stehen oder er versperrt eine Abkürzung
//   Loch    es versperrt eine Abkürzung oder man kann von der Lösung aus hineinrutschen
// Löcher liegen nie direkt nebeneinander (auch nicht schräg) und nie in einer Ecke.
//
// Danach SL.LEVEL_SET_VERSION in levels.js erhöhen, falls sich bestehende Level geändert haben.
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const levelsFile = path.join(root, "js", "levels.js");
// Pro Level so lange Karten bauen, bis ENOUGH brauchbare da sind, höchstens MAX_TRIES Versuche mit
// je bis zu CLIMB_STEPS Verbesserungsschritten
const ENOUGH = 100;
const MAX_TRIES = 6000;
const CLIMB_STEPS = 400;

globalThis.window = globalThis;
for (const f of ["rng", "puzzle", "levels"]) {
  eval(fs.readFileSync(path.join(root, "js", f + ".js"), "utf8"));
}

// Der Plan: drei Kapitel à 10 Level. Innerhalb eines Kapitels bleibt die Brettgröße gleich (Spalten
// × Zeilen, hochkant fürs Handy), schwerer wird es über die Zugzahl und die Fallen. Jedes Kapitel
// ist eine Größe größer und bringt eine neue Feldart: 1 nur Felsen, 2 Schnee, 3 Löcher.
//   moves    exakte Zugzahl der kürzesten Lösung
//   traps    so viele Züge mindestens, mit denen man von der Lösung aus in eine Sackgasse rutscht
//            (mehr als 2 kommt auf diesen Brettgrößen praktisch nicht vor)
//   falls    so viele Züge mindestens, mit denen man von der Lösung aus ins Loch rutscht
//   snow     so viele Schneefelder hat die fertige Karte mindestens (alle mit Aufgabe)
//   holes    so viele Löcher hat die fertige Karte mindestens (alle mit Aufgabe)
//   maxRocks mehr Felsen nicht - kleine Bretter sollen aufgeräumt aussehen
const CHAPTER_PLANS = [
  {
    cols: 6, rows: 7, rockRate: 0.2, maxRocks: [4, 5, 5, 6, 6, 7, 7, 8, 8, 8],
    moves: [2, 3, 3, 4, 4, 5, 5, 6, 6, 7],
    traps: [0, 0, 1, 1, 1, 1, 2, 2, 2, 2],
    coins: [1, 2, 2, 2, 2, 3, 3, 3, 3, 3],
  },
  {
    cols: 7, rows: 8, rockRate: 0.18, maxRocks: [7, 7, 8, 8, 9, 9, 10, 10, 10, 11],
    snow: [1, 1, 1, 2, 2, 2, 2, 3, 3, 3],
    moves: [4, 5, 5, 6, 6, 7, 7, 8, 8, 9],
    traps: [1, 1, 1, 1, 2, 2, 2, 2, 2, 2],
    coins: [2, 3, 3, 3, 3, 3, 3, 4, 4, 4],
  },
  {
    cols: 8, rows: 9, rockRate: 0.16, maxRocks: [9, 9, 10, 10, 11, 11, 12, 12, 12, 13],
    snow: [0, 0, 0, 1, 0, 1, 1, 1, 1, 1],
    holes: [1, 2, 2, 2, 3, 3, 3, 3, 4, 4],
    moves: [5, 6, 6, 7, 7, 8, 8, 9, 9, 10],
    traps: [1, 1, 1, 1, 1, 1, 2, 2, 2, 2],
    falls: [1, 2, 2, 2, 3, 3, 3, 4, 4, 4],
    coins: [3, 3, 3, 3, 4, 4, 4, 4, 4, 4],
  },
];

const PLAN = CHAPTER_PLANS.flatMap((ch, chapterIndex) => ch.moves.map((moves, i) => ({
  chapter: chapterIndex + 1,
  cols: ch.cols,
  rows: ch.rows,
  rockRate: ch.rockRate,
  maxRocks: ch.maxRocks[i],
  snow: ch.snow ? ch.snow[i] : 0,
  holes: ch.holes ? ch.holes[i] : 0,
  moves,
  traps: ch.traps[i],
  falls: ch.falls ? ch.falls[i] : 0,
  coins: ch.coins[i],
  // Erstes Loch-Level: mindestens ein Loch muss sichtbar eine Abkürzung versperren
  needsGuardHole: chapterIndex === 2 && i === 0,
})));

const cellKey = (board, p) => p.r * board.cols + p.c;
const isCorner = (board, p) => (p.r === 0 || p.r === board.rows - 1) && (p.c === 0 || p.c === board.cols - 1);

function shuffle(list, rand) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = SL.randInt(rand, i + 1);
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

function cellsOf(board, tile) {
  const cells = [];
  for (let r = 0; r < board.rows; r++) for (let c = 0; c < board.cols; c++) if (board.grid[r][c] === tile) cells.push({ r, c });
  return cells;
}

const cloneBoard = (board) => ({ ...board, grid: board.grid.map((row) => row.slice()), coins: [] });

// Darf hier ein Loch hin? Nicht in eine Ecke und nicht neben (auch schräg) ein anderes Loch.
function holeFits(board, p) {
  if (isCorner(board, p)) return false;
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const r = p.r + dr, c = p.c + dc;
      if ((dr || dc) && r >= 0 && r < board.rows && c >= 0 && c < board.cols && board.grid[r][c] === SL.HOLE) return false;
    }
  }
  return true;
}

// Zufällige Ausgangskarte ohne Ziel: Felsen mit Wahrscheinlichkeit rockRate, dazu ein paar
// Schneefelder und Löcher mehr als geplant (das Ausdünnen nimmt die überflüssigen wieder weg)
function randomLayout(plan, rand) {
  const { rows, cols } = plan;
  const grid = Array.from({ length: rows }, () => Array.from({ length: cols }, () => (rand() < plan.rockRate ? SL.ROCK : SL.ICE)));
  const free = shuffle(cellsOf({ rows, cols, grid }, SL.ICE), rand);
  if (free.length < 12) return null;
  const board = { rows, cols, grid, start: free.pop(), goal: null, coins: [] };
  const snow = plan.snow ? plan.snow + 1 + SL.randInt(rand, 2) : 0;
  for (let i = 0; i < snow; i++) {
    const p = free.pop();
    grid[p.r][p.c] = SL.SNOW;
  }
  const holes = plan.holes ? plan.holes + 1 + SL.randInt(rand, 2) : 0;
  for (let i = free.length - 1, placed = 0; i >= 0 && placed < holes; i--) {
    if (!holeFits(board, free[i])) continue;
    grid[free[i].r][free[i].c] = SL.HOLE;
    placed++;
  }
  return board;
}

// Zugzahl vom Start bis zu jedem Haltepunkt (BFS)
function distances(board) {
  const graph = SL.buildGraph(board);
  const startKey = cellKey(board, board.start);
  const dist = new Map([[startKey, 0]]);
  const queue = [startKey];
  for (let head = 0; head < queue.length; head++) {
    for (const e of graph.get(queue[head])) {
      if (!dist.has(e.to)) {
        dist.set(e.to, dist.get(queue[head]) + 1);
        queue.push(e.to);
      }
    }
  }
  return dist;
}

// Wie weit ist die Karte vom Plan weg? 0 = passt. Ziel = ein Haltepunkt auf Eis genau "moves" Züge
// vom Start; von bis zu vier möglichen Zielen gewinnt das beste und wird eingetragen.
function fit(board, plan, rand) {
  const dist = distances(board);
  let far = 0;
  const pool = [];
  for (const [k, d] of dist) {
    const p = { r: Math.floor(k / board.cols), c: k % board.cols };
    far = Math.max(far, d);
    if (d === plan.moves && board.grid[p.r][p.c] === SL.ICE) pool.push(p);
  }
  if (!pool.length) return 30 + Math.abs(plan.moves - far) * 4;
  let best = null;
  for (const goal of shuffle(pool, rand).slice(0, 4)) {
    board.goal = goal;
    const m = measure(board);
    const rocks = cellsOf(board, SL.ROCK).length;
    const penalty = (Math.min(m.a.shortestCount, 6) - 1) * 2
      + Math.max(0, plan.traps - m.temptDead) * 2
      + Math.max(0, plan.falls - m.temptFall) * 2
      + Math.max(0, plan.snow - m.snowStops) * 2 // Schnee gehört auf den Weg
      + Math.max(0, plan.holes - m.fallHoles.size) * 2 // Löcher dorthin, wo man reinrutschen kann
      + Math.max(0, rocks - plan.maxRocks - 3) * 0.5;
    if (!best || penalty < best.penalty) best = { penalty, goal };
  }
  board.goal = best.goal;
  return best.penalty;
}

// Kleine Änderung: Fels setzen/wegnehmen, Start versetzen oder ein Schneefeld/Loch umsetzen
function mutate(board, rand) {
  const next = cloneBoard(board);
  const g = next.grid;
  const pick = () => ({ r: SL.randInt(rand, next.rows), c: SL.randInt(rand, next.cols) });
  const isStart = (p) => p.r === next.start.r && p.c === next.start.c;
  const roll = rand();
  if (roll < 0.15) {
    const p = pick();
    if (g[p.r][p.c] === SL.ICE) next.start = p;
    return next;
  }
  if (roll < 0.35) {
    const parts = [...cellsOf(next, SL.SNOW), ...cellsOf(next, SL.HOLE)];
    if (parts.length) {
      const from = parts[SL.randInt(rand, parts.length)];
      const to = pick();
      const tile = g[from.r][from.c];
      if (g[to.r][to.c] !== SL.ICE || isStart(to)) return next;
      g[from.r][from.c] = SL.ICE;
      if (tile === SL.HOLE && !holeFits(next, to)) {
        g[from.r][from.c] = tile;
        return next;
      }
      g[to.r][to.c] = tile;
      return next;
    }
  }
  const p = pick();
  if (isStart(p)) return next;
  if (g[p.r][p.c] === SL.ICE) g[p.r][p.c] = SL.ROCK;
  else if (g[p.r][p.c] === SL.ROCK) g[p.r][p.c] = SL.ICE;
  return next;
}

// Zufallskarte schrittweise verbessern, bis sie zum Plan passt (Bergsteigen: Änderungen, die nicht
// schlechter machen, bleiben). null, wenn es nach "steps" Schritten noch nicht passt.
function climb(plan, rand, steps) {
  let board = randomLayout(plan, rand);
  if (!board) return null;
  let penalty = fit(board, plan, rand);
  for (let i = 0; i < steps && penalty > 0; i++) {
    const next = mutate(board, rand);
    const p = fit(next, plan, rand);
    if (p <= penalty) {
      board = next;
      penalty = p;
    }
  }
  return penalty === 0 ? board : null;
}

// Alles, was die Bewertung über eine Karte wissen muss
function measure(board) {
  const a = SL.analyzeBoard(board);
  const m = { a, solvable: a.solvable };
  if (!a.solvable) return m;
  // Haltepunkte der Lösung (Start, jeder Stopp, Ziel) und die überrutschten Felder
  m.stops = [board.start];
  m.cells = new Set([cellKey(board, board.start)]);
  m.usedRocks = new Set(); // Felsen, an denen die Lösung stoppt
  let pos = board.start;
  for (const dir of a.solution) {
    const move = SL.slide(board, pos, dir);
    move.path.forEach((p) => m.cells.add(cellKey(board, p)));
    pos = move.to;
    m.stops.push(pos);
    const d = SL.DIRS[dir];
    const next = { r: pos.r + d.dr, c: pos.c + d.dc };
    if (next.r >= 0 && next.r < board.rows && next.c >= 0 && next.c < board.cols && board.grid[next.r][next.c] === SL.ROCK) {
      m.usedRocks.add(cellKey(board, next));
    }
  }
  // Falsche Züge unterwegs: in eine Sackgasse oder ins Loch
  m.temptDead = 0;
  m.temptFall = 0;
  m.fallHoles = new Set(); // Löcher, in die man von der Lösung aus rutschen kann
  for (const p of m.stops.slice(0, -1)) {
    for (const dir of SL.DIR_KEYS) {
      const move = SL.slide(board, p, dir);
      if (!move) continue;
      if (move.fell) {
        m.temptFall++;
        m.fallHoles.add(cellKey(board, move.to));
      } else if (!a.alive.has(cellKey(board, move.to))) {
        m.temptDead++;
      }
    }
  }
  m.snowStops = m.stops.filter((p) => board.grid[p.r][p.c] === SL.SNOW).length;
  m.key = a.solution.join("");
  return m;
}

function ok(board, m, plan) {
  return m.solvable
    && m.a.minMoves === plan.moves
    && m.a.shortestCount === 1
    && m.temptDead >= plan.traps
    && m.temptFall >= plan.falls
    && cellsOf(board, SL.SNOW).length >= plan.snow
    && cellsOf(board, SL.HOLE).length >= plan.holes;
}

// Teil für Teil zu Eis machen, solange das Rätsel dadurch nicht leichter wird
function prune(board, plan, rand) {
  let m = measure(board);
  if (!ok(board, m, plan)) return null;
  for (let changed = true; changed;) {
    changed = false;
    const parts = shuffle([...cellsOf(board, SL.ROCK), ...cellsOf(board, SL.SNOW), ...cellsOf(board, SL.HOLE)], rand);
    for (const p of parts) {
      const tile = board.grid[p.r][p.c];
      board.grid[p.r][p.c] = SL.ICE;
      const next = measure(board);
      if (ok(board, next, plan)) {
        m = next;
        changed = true;
      } else {
        board.grid[p.r][p.c] = tile;
      }
    }
  }
  return m;
}

// Wozu ist dieses Teil da? Einmal testweise zu Eis machen und vergleichen.
//   weg     die Lösung stoppt daran/darauf
//   sperre  ohne das Teil wird es kürzer, mehrdeutig oder ändert sich der Lösungsweg
//   falle   ohne das Teil gibt es weniger falsche Züge (Sackgasse/Loch) unterwegs
function purposes(board, m, p) {
  const tile = board.grid[p.r][p.c];
  const k = cellKey(board, p);
  const tags = [];
  if (tile === SL.ROCK && m.usedRocks.has(k)) tags.push("weg");
  if (tile === SL.SNOW && m.stops.some((s) => s.r === p.r && s.c === p.c)) tags.push("weg");
  if (tile === SL.HOLE && m.fallHoles.has(k)) tags.push("falle");
  board.grid[p.r][p.c] = SL.ICE;
  const without = measure(board);
  board.grid[p.r][p.c] = tile;
  if (!without.solvable || without.a.minMoves !== m.a.minMoves || without.a.shortestCount > 1 || without.key !== m.key) {
    if (!tags.includes("weg")) tags.push("sperre");
  }
  if (without.solvable && (without.temptDead < m.temptDead || without.temptFall < m.temptFall) && !tags.includes("falle")) tags.push("falle");
  return tags;
}

function audit(board, m) {
  const parts = { rock: [], snow: [], hole: [] };
  for (const [name, tile] of [["rock", SL.ROCK], ["snow", SL.SNOW], ["hole", SL.HOLE]]) {
    for (const p of cellsOf(board, tile)) parts[name].push({ ...p, tags: purposes(board, m, p) });
  }
  const holes = parts.hole;
  const adjacentHoles = holes.some((h, i) => holes.some((o, j) => j > i && Math.abs(h.r - o.r) <= 1 && Math.abs(h.c - o.c) <= 1));
  return {
    parts,
    idle: [...parts.rock, ...parts.snow, ...parts.hole].filter((x) => !x.tags.length),
    // Schnee nur auf dem Weg oder als Sperre, Löcher nur als Sperre oder Falle auf dem Weg
    badSnow: parts.snow.filter((x) => !x.tags.includes("weg") && !x.tags.includes("sperre")),
    badHoles: holes.filter((x) => !x.tags.includes("sperre") && !m.fallHoles.has(cellKey(board, x))),
    cornerHoles: holes.filter((x) => isCorner(board, x)),
    adjacentHoles,
    guardHoles: holes.filter((x) => x.tags.includes("sperre")),
  };
}

// Wie viel vom Brett nutzt die Lösung? Fläche des Rechtecks um alle überrutschten Felder.
function coverage(board, m) {
  let r0 = Infinity, r1 = -1, c0 = Infinity, c1 = -1;
  for (const k of m.cells) {
    const r = Math.floor(k / board.cols), c = k % board.cols;
    r0 = Math.min(r0, r); r1 = Math.max(r1, r);
    c0 = Math.min(c0, c); c1 = Math.max(c1, c);
  }
  return ((r1 - r0 + 1) * (c1 - c0 + 1)) / (board.rows * board.cols);
}

// Schnee direkt vor einem Loch, auf dem die Lösung stehen bleibt - "die einzige Rettung"
function snowSaves(board, m) {
  let n = 0;
  for (let i = 1; i < m.stops.length; i++) {
    const p = m.stops[i];
    if (board.grid[p.r][p.c] !== SL.SNOW) continue;
    const d = SL.DIRS[m.a.solution[i - 1]];
    const r = p.r + d.dr, c = p.c + d.dc;
    if (r >= 0 && r < board.rows && c >= 0 && c < board.cols && board.grid[r][c] === SL.HOLE) n++;
  }
  return n;
}

// usedSolutions: Zugfolgen anderer Level - dieselbe Folge zweimal fühlt sich nach Wiederholung an
function score(board, m, plan, report, usedSolutions) {
  const rocks = report.parts.rock.length;
  const pieces = rocks + report.parts.snow.length + report.parts.hole.length;
  const dirs = new Set(m.a.solution).size;
  // Felsen, an denen die Lösung stoppt, sind die schönsten: man sieht, wofür sie da sind
  const usedShare = rocks ? m.usedRocks.size / rocks : 1;
  // Löcher am Rand wirken wie eine fehlende Bande - lieber mitten im Eis
  const edgeHoles = report.parts.hole.filter((h) => h.r === 0 || h.c === 0 || h.r === board.rows - 1 || h.c === board.cols - 1).length;
  return (
    Math.min(m.temptDead, plan.traps + 2) * 3
    + Math.min(m.temptFall, plan.falls + 2) * 3
    + Math.min(m.a.states, 45) * 0.35
    + dirs * 2
    + coverage(board, m) * 10
    + usedShare * 6
    + snowSaves(board, m) * 4
    + report.guardHoles.length * 2
    - pieces * 0.6
    - edgeHoles * 2
    - (usedSolutions.has(m.key) ? 10 : 0)
  );
}

function pickLevel(plan, index, usedSolutions) {
  let best = null;
  let found = 0;
  let tries = 0;
  const rejected = {};
  for (let k = 0; k < MAX_TRIES && found < ENOUGH; k++, tries++) {
    const seed = (index + 1) * 7919 + k * 104729;
    const rand = SL.createRng(seed);
    const board = climb(plan, rand, CLIMB_STEPS);
    if (!board) continue;
    const m = prune(board, plan, rand);
    if (!m) continue;
    const report = audit(board, m);
    const reject = report.parts.rock.length > plan.maxRocks ? "zu viele Felsen"
      : report.idle.length ? "Teile ohne Aufgabe"
      : report.badSnow.length ? "Schnee ohne Aufgabe"
      : report.badHoles.length ? "Loch ohne Aufgabe"
      : report.adjacentHoles || report.cornerHoles.length ? "Lochlage"
      : plan.needsGuardHole && !report.guardHoles.length ? "kein Sperr-Loch"
      : null;
    if (reject) {
      rejected[reject] = (rejected[reject] || 0) + 1;
      continue;
    }
    found++;
    // Coins gleich mit verteilen: Karten, auf denen nicht alle geplanten Coins sinnvoll Platz
    // finden, verlieren Punkte
    const coins = placeCoins(board, m, plan.coins, SL.createRng(seed ^ 0x5bd1e995));
    const s = score(board, m, plan, report, usedSolutions) - (plan.coins - coins.length) * 4;
    if (!best || s > best.score) best = { board, m, report, score: s, seed, coins };
  }
  if (process.env.DRIFT_GEN_DEBUG) console.error(`Level ${index + 1}: ${found} brauchbare Karten, ${tries} Versuche`, rejected);
  if (!best) throw new Error(`Keine Karte für Level ${index + 1} gefunden`);
  best.board.coins = best.coins;
  return best;
}

// ---------- Coins ----------

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
// Zügen - wer alle will, verliert Zeit und damit eventuell Sterne. Coins halten Abstand
// zueinander und zum Start, damit sie nicht wie hingestreut wirken.
function placeCoins(board, m, count, rand) {
  const candidates = [];
  for (let r = 0; r < board.rows; r++) {
    for (let c = 0; c < board.cols; c++) {
      if (board.grid[r][c] !== SL.ICE) continue;
      const k = r * board.cols + c;
      if (k === cellKey(board, board.goal)) continue;
      if (Math.abs(r - board.start.r) + Math.abs(c - board.start.c) < 2) continue;
      const extra = movesVia(board, m.a, k) - m.a.minMoves;
      if (extra === Infinity || extra > 3) continue;
      candidates.push({ r, c, extra, onPath: m.cells.has(k), shuffle: rand() });
    }
  }
  const apart = (a, list) => list.every((b) => Math.max(Math.abs(a.r - b.r), Math.abs(a.c - b.c)) >= 2);
  const chosen = [];
  const free = candidates.filter((x) => x.extra === 0 && x.onPath).sort((a, b) => a.shuffle - b.shuffle);
  if (free.length) chosen.push(free[0]);
  const detours = candidates.filter((x) => x.extra > 0).sort((a, b) => a.extra - b.extra || a.shuffle - b.shuffle);
  // abwechselnd billige und teure Umwege, damit die Coins nicht alle gleich viel kosten
  while (chosen.length < count && detours.length) {
    const pick = chosen.length % 2 ? detours.pop() : detours.shift();
    if (apart(pick, chosen)) chosen.push(pick);
  }
  return chosen.map(({ r, c }) => ({ r, c }));
}

// ---------- Ausgabe ----------

function describe(board, m) {
  const report = audit(board, m);
  const coinExtra = board.coins.map((co) => movesVia(board, m.a, cellKey(board, co)) - m.a.minMoves);
  return { report, coinExtra };
}

function printTable(rows) {
  console.log("Level  Größe  Züge  Lösungen  Sackg.  Löcher  Haltep.  Fels  Schnee  Loch  ohne Aufgabe  Coins (Umweg)");
  for (const { id, board, m, report, coinExtra } of rows) {
    const problems = [];
    if (report.idle.length) problems.push(report.idle.length + " Teile");
    if (report.badSnow.length) problems.push(report.badSnow.length + " Schnee");
    if (report.badHoles.length) problems.push(report.badHoles.length + " Löcher");
    if (report.adjacentHoles) problems.push("Löcher nebeneinander");
    if (report.cornerHoles.length) problems.push("Loch in Ecke");
    console.log(
      String(id).padStart(5),
      `${board.cols}x${board.rows}`.padStart(6),
      String(m.a.minMoves).padStart(5),
      String(m.a.shortestCount).padStart(9),
      String(m.temptDead).padStart(7),
      String(m.temptFall).padStart(7),
      String(m.a.states).padStart(8),
      String(report.parts.rock.length).padStart(5),
      String(report.parts.snow.length).padStart(7),
      String(report.parts.hole.length).padStart(5),
      "  " + (problems.join(", ") || "-").padEnd(12),
      "  " + coinExtra.map((x) => "+" + x).join(" ")
    );
  }
}

function printMaps(rows) {
  for (const { id, board, m } of rows) {
    console.log(`\nLevel ${id}: ${m.a.solution.join(" ")}`);
    SL.boardToMap(board).forEach((line) => console.log("  " + line.split("").join(" ")));
  }
}

function main() {
  const args = process.argv.slice(2);
  const onlyArg = args.includes("--only") ? args[args.indexOf("--only") + 1] : null;
  const only = onlyArg ? new Set(onlyArg.split(",").map(Number)) : null;

  if (args.includes("--check")) {
    const rows = SL.LEVELS.map((level) => {
      const board = SL.parseBoard(level.map);
      const m = measure(board);
      return { id: level.id, board, m, ...describe(board, m) };
    });
    printTable(rows);
    printMaps(rows);
    return;
  }

  // Zugfolgen der Level, die bleiben, gelten von Anfang an als vergeben
  const usedSolutions = new Set();
  const kept = new Map();
  if (only) {
    for (const level of SL.LEVELS) {
      if (only.has(level.id)) continue;
      const board = SL.parseBoard(level.map);
      const m = measure(board);
      kept.set(level.id, { id: level.id, board, m, ...describe(board, m) });
      usedSolutions.add(m.key);
    }
  }
  const rows = PLAN.map((plan, i) => {
    const id = i + 1;
    if (kept.has(id)) return kept.get(id);
    const best = pickLevel(plan, i, usedSolutions);
    usedSolutions.add(best.m.key);
    return { id, board: best.board, m: best.m, ...describe(best.board, best.m) };
  });
  printTable(rows);
  printMaps(rows);

  if (args.includes("--dry")) return;

  const src = fs.readFileSync(levelsFile, "utf8");
  const body = rows.map(({ board }) => `  [\n${SL.boardToMap(board).map((l) => `    "${l}",`).join("\n")}\n  ],`).join("\n");
  const replaced = src.replace(/const LEVEL_MAPS = \[[\s\S]*?\n\];/, `const LEVEL_MAPS = [\n${body}\n];`);
  if (replaced === src) {
    console.log("\nLEVEL_MAPS unverändert.");
  } else {
    fs.writeFileSync(levelsFile, replaced);
    console.log(`\nLEVEL_MAPS in js/levels.js aktualisiert (${rows.length} Level).`);
  }
}

module.exports = { PLAN, randomLayout, climb, fit, mutate, measure, ok, prune, audit, score, pickLevel };
if (require.main === module) main();
