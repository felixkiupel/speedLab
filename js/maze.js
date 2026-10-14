// Maze-Generierung: klassisches Block-Grid, Wände sind immer ganze Zellen (nicht Linien zwischen Zellen).
// Das macht Kollisionsprüfung trivial: eine Nachbarzelle ist entweder WALL oder PATH.
window.SL = window.SL || {};

const DIRS = {
  N: { dr: -1, dc: 0, opposite: "S" },
  S: { dr: 1, dc: 0, opposite: "N" },
  E: { dr: 0, dc: 1, opposite: "W" },
  W: { dr: 0, dc: -1, opposite: "E" },
};
SL.DIRS = DIRS;
SL.WALL = 1;
SL.PATH = 0;

function inBounds(rows, cols, r, c) {
  return r >= 0 && r < rows && c >= 0 && c < cols;
}

// --- Schritt 1: "logisches" Perfect-Maze erzeugen (ein Raum pro Zelle, Wände als Kanten) ---

function makeRooms(rows, cols) {
  const rooms = [];
  for (let r = 0; r < rows; r++) {
    const row = [];
    for (let c = 0; c < cols; c++) row.push({ N: true, E: true, S: true, W: true, visited: false });
    rooms.push(row);
  }
  return rooms;
}

function carve(rooms, r1, c1, dirKey) {
  const d = DIRS[dirKey];
  const r2 = r1 + d.dr, c2 = c1 + d.dc;
  rooms[r1][c1][dirKey] = false;
  rooms[r2][c2][d.opposite] = false;
}

// Recursive backtracker, iterativ mit Stack (robust auch für größere Mazes)
function carveRooms(rows, cols, rand) {
  const rooms = makeRooms(rows, cols);
  const stack = [[0, 0]];
  rooms[0][0].visited = true;

  while (stack.length) {
    const [r, c] = stack[stack.length - 1];
    const options = [];
    for (const key of Object.keys(DIRS)) {
      const d = DIRS[key];
      const nr = r + d.dr, nc = c + d.dc;
      if (inBounds(rows, cols, nr, nc) && !rooms[nr][nc].visited) options.push(key);
    }
    if (options.length === 0) {
      stack.pop();
      continue;
    }
    const chosen = options[SL.randInt(rand, options.length)];
    carve(rooms, r, c, chosen);
    const d = DIRS[chosen];
    rooms[r + d.dr][c + d.dc].visited = true;
    stack.push([r + d.dr, c + d.dc]);
  }
  return rooms;
}

// Entfernt zusätzliche innere Wände um Loops/Abzweigungen zu erzeugen (höhere Level = schwerer zu "lesen")
function injectLoops(rooms, rows, cols, rand, loopFactor) {
  if (loopFactor <= 0) return;
  const attempts = Math.round(rows * cols * loopFactor);
  for (let i = 0; i < attempts; i++) {
    const r = SL.randInt(rand, rows);
    const c = SL.randInt(rand, cols);
    const keys = Object.keys(DIRS);
    const key = keys[SL.randInt(rand, keys.length)];
    const d = DIRS[key];
    const nr = r + d.dr, nc = c + d.dc;
    if (!inBounds(rows, cols, nr, nc)) continue;
    if (rooms[r][c][key]) {
      rooms[r][c][key] = false;
      rooms[nr][nc][d.opposite] = false;
    }
  }
}

// --- Schritt 2: in ein Block-Grid stempeln: jeder Raum + jede Tür wird eine eigene volle Zelle ---

function stampToGrid(rooms, rows, cols) {
  const gridRows = rows * 2 + 1;
  const gridCols = cols * 2 + 1;
  const grid = Array.from({ length: gridRows }, () => new Array(gridCols).fill(SL.WALL));

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const gr = r * 2 + 1, gc = c * 2 + 1;
      grid[gr][gc] = SL.PATH;
      if (!rooms[r][c].E) grid[gr][gc + 1] = SL.PATH; // Tür nach Osten
      if (!rooms[r][c].S) grid[gr + 1][gc] = SL.PATH; // Tür nach Süden
      // Türen nach N/W werden schon vom jeweiligen Nachbarn (dessen E/S) gesetzt.
    }
  }
  return { grid, gridRows, gridCols };
}

// BFS kürzester Pfad auf dem Grid, liefert Anzahl Schritte (Zellwechsel)
function bfsShortestPath(grid, rows, cols, start, end) {
  const dist = Array.from({ length: rows }, () => new Array(cols).fill(-1));
  const q = [[start.r, start.c]];
  dist[start.r][start.c] = 0;
  let head = 0;
  while (head < q.length) {
    const [r, c] = q[head++];
    if (r === end.r && c === end.c) return dist[r][c];
    for (const key of Object.keys(DIRS)) {
      const d = DIRS[key];
      const nr = r + d.dr, nc = c + d.dc;
      if (inBounds(rows, cols, nr, nc) && grid[nr][nc] === SL.PATH && dist[nr][nc] === -1) {
        dist[nr][nc] = dist[r][c] + 1;
        q.push([nr, nc]);
      }
    }
  }
  return dist[end.r][end.c];
}

// Platziert Coins deterministisch (gleicher Seed = gleiche Coins) auf begehbaren Zellen, nicht auf Start/Ziel
function placeCoins(grid, rows, cols, rand, start, end, count) {
  const candidates = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (grid[r][c] !== SL.PATH) continue;
      if (r === start.r && c === start.c) continue;
      if (r === end.r && c === end.c) continue;
      candidates.push({ r, c });
    }
  }
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = SL.randInt(rand, i + 1);
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  return candidates.slice(0, Math.min(count, candidates.length));
}

/**
 * Erzeugt ein komplettes Maze-Paket für ein Level: ein Block-Grid (grid[r][c] = SL.WALL | SL.PATH).
 * @param {{rows:number, cols:number, seed:number, loopFactor:number, coinCount:number}} opts
 *   rows/cols = Anzahl "Räume" (das fertige Grid ist dann rows*2+1 x cols*2+1 Zellen groß).
 */
SL.generateMaze = function generateMaze(opts) {
  const { rows, cols, seed, loopFactor = 0, coinCount = 6 } = opts;
  const rand = SL.createRng(seed);
  const rooms = carveRooms(rows, cols, rand);
  injectLoops(rooms, rows, cols, rand, loopFactor);

  const { grid, gridRows, gridCols } = stampToGrid(rooms, rows, cols);
  const start = { r: 1, c: 1 };
  const end = { r: gridRows - 2, c: gridCols - 2 };
  const optimalSteps = bfsShortestPath(grid, gridRows, gridCols, start, end);
  const coins = placeCoins(grid, gridRows, gridCols, rand, start, end, coinCount);

  return { rows: gridRows, cols: gridCols, grid, start, end, optimalSteps, coins };
};
