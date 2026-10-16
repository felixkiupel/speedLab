// Eis-Puzzle-Kern: Karte einlesen, rutschen, lösen. Reine Logik ohne DOM - läuft auch in den
// Node-Tools (tools/level-gen.js), die damit die Level erzeugen und prüfen.
//
// Regeln: Ein Zug rutscht so lange in eine Richtung, bis ein Fels oder der Spielfeldrand im Weg
// ist. Schnee bremst sofort - man bleibt auf dem Schneefeld stehen. Wer über ein Loch rutscht,
// fällt hinein, der Lauf ist dann vorbei. Das Ziel bremst NICHT: man muss genau darauf liegen
// bleiben, drüberrutschen zählt nicht.
window.SL = window.SL || {};

SL.ICE = 0;
SL.ROCK = 1;
SL.SNOW = 2;
SL.HOLE = 3;

SL.DIRS = {
  N: { dr: -1, dc: 0 },
  E: { dr: 0, dc: 1 },
  S: { dr: 1, dc: 0 },
  W: { dr: 0, dc: -1 },
};
SL.DIR_KEYS = ["N", "E", "S", "W"];

// Rutsch-Tempo: fester Anteil pro Zug + Zeit pro Feld. Das Spiel animiert genau so lange, und die
// Sterne-Grenzen rechnen mit denselben Werten - eine lange Rutschpartie kostet also echte Zeit.
SL.SLIDE_BASE_MS = 70;
SL.SLIDE_TILE_MS = 34;
SL.slideDuration = function slideDuration(tiles) {
  return SL.SLIDE_BASE_MS + tiles * SL.SLIDE_TILE_MS;
};

// Kartenzeichen: # Fels · . Eis · : Schnee · o Loch · S Start · G Ziel · $ Coin (auf Eis)
const CHAR_TILES = { "#": SL.ROCK, ".": SL.ICE, ":": SL.SNOW, o: SL.HOLE, S: SL.ICE, G: SL.ICE, $: SL.ICE };
const TILE_CHARS = { [SL.ROCK]: "#", [SL.ICE]: ".", [SL.SNOW]: ":", [SL.HOLE]: "o" };

SL.parseBoard = function parseBoard(map) {
  const rows = map.length;
  const cols = map[0].length;
  const grid = [];
  const coins = [];
  let start = null;
  let goal = null;
  map.forEach((line, r) => {
    if (line.length !== cols) throw new Error(`Zeile ${r} hat ${line.length} statt ${cols} Zeichen`);
    const row = [];
    for (let c = 0; c < cols; c++) {
      const ch = line[c];
      if (!(ch in CHAR_TILES)) throw new Error(`Unbekanntes Zeichen "${ch}" in Zeile ${r}`);
      row.push(CHAR_TILES[ch]);
      if (ch === "S") start = { r, c };
      else if (ch === "G") goal = { r, c };
      else if (ch === "$") coins.push({ r, c });
    }
    grid.push(row);
  });
  if (!start || !goal) throw new Error("Karte braucht Start (S) und Ziel (G)");
  return { rows, cols, grid, start, goal, coins };
};

// Zurück in Kartenzeichen (für die Tools)
SL.boardToMap = function boardToMap(board) {
  const coinKeys = new Set(board.coins.map((co) => co.r * board.cols + co.c));
  return board.grid.map((row, r) => row.map((t, c) => {
    if (r === board.start.r && c === board.start.c) return "S";
    if (r === board.goal.r && c === board.goal.c) return "G";
    if (coinKeys.has(r * board.cols + c)) return "$";
    return TILE_CHARS[t];
  }).join(""));
};

// Außerhalb des Felds zählt wie ein Fels: der Rand ist die Bande
SL.isBlocked = function isBlocked(board, r, c) {
  return r < 0 || r >= board.rows || c < 0 || c >= board.cols || board.grid[r][c] === SL.ROCK;
};

// Ein Zug. path = alle Felder, über die gerutscht wird (ohne Startfeld, mit Endfeld).
// fell = der Zug endet in einem Loch. null, wenn direkt ein Hindernis im Weg ist.
SL.slide = function slide(board, from, dirKey) {
  const d = SL.DIRS[dirKey];
  let r = from.r;
  let c = from.c;
  const path = [];
  while (!SL.isBlocked(board, r + d.dr, c + d.dc)) {
    r += d.dr;
    c += d.dc;
    path.push({ r, c });
    const tile = board.grid[r][c];
    if (tile === SL.HOLE) return { to: { r, c }, path, fell: true };
    if (tile === SL.SNOW) break;
  }
  return path.length ? { to: { r, c }, path, fell: false } : null;
};

// Alle Haltepunkte, die man vom Start aus erreichen kann, als Graph:
// nodes = Feld-Index (r * cols + c) -> [{ dir, to, path }]. Mehr Zustände gibt es nicht - Coins
// ändern am Rutschen nichts. Züge ins Loch sind keine Kanten: danach geht es nirgends weiter.
SL.buildGraph = function buildGraph(board) {
  const key = (p) => p.r * board.cols + p.c;
  const nodes = new Map();
  const queue = [board.start];
  nodes.set(key(board.start), null);
  for (let head = 0; head < queue.length; head++) {
    const pos = queue[head];
    const edges = [];
    for (const dir of SL.DIR_KEYS) {
      const move = SL.slide(board, pos, dir);
      if (!move || move.fell) continue;
      edges.push({ dir, to: key(move.to), path: move.path });
      if (!nodes.has(key(move.to))) {
        nodes.set(key(move.to), null);
        queue.push(move.to);
      }
    }
    nodes.set(key(pos), edges);
  }
  return nodes;
};

// Analyse einer Karte: kürzeste Lösung (Züge), welche Haltepunkte noch zum Ziel führen (alle
// anderen sind Sackgassen) und die schnellste Zeit mit einer Zugabe pro Zug (für die Sterne).
SL.analyzeBoard = function analyzeBoard(board) {
  const graph = SL.buildGraph(board);
  const startKey = board.start.r * board.cols + board.start.c;
  const goalKey = board.goal.r * board.cols + board.goal.c;

  // Rückwärts vom Ziel: wer kommt noch hin?
  const reverse = new Map();
  for (const [from, edges] of graph) {
    for (const e of edges) {
      if (!reverse.has(e.to)) reverse.set(e.to, []);
      reverse.get(e.to).push(from);
    }
  }
  const alive = new Set();
  if (graph.has(goalKey)) {
    const queue = [goalKey];
    alive.add(goalKey);
    for (let head = 0; head < queue.length; head++) {
      for (const prev of reverse.get(queue[head]) || []) {
        if (!alive.has(prev)) {
          alive.add(prev);
          queue.push(prev);
        }
      }
    }
  }

  // BFS: Züge bis zum Ziel + Anzahl verschiedener kürzester Lösungen
  const dist = new Map([[startKey, 0]]);
  const ways = new Map([[startKey, 1]]);
  const prevEdge = new Map();
  const queue = [startKey];
  for (let head = 0; head < queue.length; head++) {
    const node = queue[head];
    for (const e of graph.get(node)) {
      if (!dist.has(e.to)) {
        dist.set(e.to, dist.get(node) + 1);
        ways.set(e.to, ways.get(node));
        prevEdge.set(e.to, { from: node, dir: e.dir });
        queue.push(e.to);
      } else if (dist.get(e.to) === dist.get(node) + 1) {
        ways.set(e.to, ways.get(e.to) + ways.get(node));
      }
    }
  }
  const solution = [];
  if (dist.has(goalKey)) {
    for (let node = goalKey; node !== startKey; node = prevEdge.get(node).from) solution.unshift(prevEdge.get(node).dir);
  }

  // Züge, mit denen man von einem noch lösbaren Haltepunkt aus ins Loch rutschen würde - so viele
  // Gelegenheiten hat man, sich zu vertun
  let fallMoves = 0;
  for (const k of alive) {
    const pos = { r: Math.floor(k / board.cols), c: k % board.cols };
    for (const dir of SL.DIR_KEYS) if (SL.slide(board, pos, dir)?.fell) fallMoves++;
  }

  return {
    graph,
    alive,
    solvable: dist.has(goalKey),
    minMoves: dist.has(goalKey) ? dist.get(goalKey) : null,
    solution,
    shortestCount: ways.get(goalKey) || 0,
    states: graph.size,
    deadStates: graph.size - alive.size,
    fallMoves,
    // Schnellste Zeit, wenn pro Zug zusätzlich "allowMs" Bedenkzeit erlaubt ist (Dijkstra)
    fastestMs(allowMs) {
      return SL.fastestTime(graph, startKey, goalKey, allowMs);
    },
  };
};

// Dijkstra über die Rutsch-Dauer: lange Rutscher kosten mehr, deshalb ist die zeitlich schnellste
// Lösung nicht immer die mit den wenigsten Zügen. Die Graphen sind klein (< 100 Knoten).
SL.fastestTime = function fastestTime(graph, startKey, goalKey, allowMs) {
  const best = new Map([[startKey, 0]]);
  const done = new Set();
  while (true) {
    let node = null;
    for (const [k, v] of best) if (!done.has(k) && (node === null || v < best.get(node))) node = k;
    if (node === null) return null;
    if (node === goalKey) return best.get(node);
    done.add(node);
    for (const e of graph.get(node)) {
      const cost = best.get(node) + SL.slideDuration(e.path.length) + allowMs;
      if (!best.has(e.to) || cost < best.get(e.to)) best.set(e.to, cost);
    }
  }
};
