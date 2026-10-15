// Erzeugt preview.svg (Kachelbild auf der Startseite) mit dem echten Maze-Generator und denselben
// Farben wie renderer.js. Wie im Spiel zeigt die Kamera nur die Umgebung der Figur - die Vorschau
// sieht also aus wie ein laufendes Level. Der Ausschnitt ist genau 8 x 5 ganze Felder und liegt
// immer komplett im Labyrinth: keine angeschnittenen Felder, kein "Außen" an den Rändern.
//
//   npm run maze-preview                              -> Standard-Seed
//   node games/maze/tools/maze-preview.js 1234        -> anderen Seed ausprobieren
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const outFile = path.join(root, "preview.svg");

globalThis.window = globalThis;
for (const f of ["rng", "maze"]) {
  eval(fs.readFileSync(path.join(root, "js", f + ".js"), "utf8"));
}

const COLOR_BG = "#fbf7f0";
const COLOR_OUTSIDE = "#ebe3d5";
const COLOR_WALL = "#2b2420";
const COLOR_GRID_LINE = "#e8e0d2";
const COLOR_TRAIL = "#c7bcaa";

const SEED = Number(process.argv[2]) || 4242;
const CELL = 50;
const VIEW_COLS = 8, VIEW_ROWS = 5;
const W = VIEW_COLS * CELL, H = VIEW_ROWS * CELL; // 400 x 250 = 16:10 wie die Kachel
const TRAIL_LENGTH = 6;

const maze = SL.generateMaze({ rows: 6, cols: 9, seed: SEED, loopFactor: 0.06, coinCount: 14 });
const route = SL.findShortestPath(maze);
const checkpoints = SL.computeCheckpoints(maze, 2);
const at = Math.round((route.length - 1) * 0.5); // Figur steht auf halber Strecke
const player = route[at];
const before = route[at - 1];
const dir = { dr: Math.sign(player.r - before.r), dc: Math.sign(player.c - before.c) };
const walked = new Set(route.slice(0, at + 1).map((p) => p.r + "," + p.c));

// Kamera: Ausschnitt möglichst mittig um die Figur, aber auf ganze Felder gerundet und am
// Labyrinth-Rand festgehalten. Der Rest wird vom viewBox abgeschnitten.
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const viewC = clamp(player.c - Math.floor(VIEW_COLS / 2), 0, maze.cols - VIEW_COLS);
const viewR = clamp(player.r - Math.floor(VIEW_ROWS / 2), 0, maze.rows - VIEW_ROWS);
const ox = -viewC * CELL;
const oy = -viewR * CELL;
const cx = (cell) => +(cell.c * CELL + CELL / 2).toFixed(2);
const cy = (cell) => +(cell.r * CELL + CELL / 2).toFixed(2);
const n = (v) => +v.toFixed(2);

// Gitterlinien vor den Wänden (wie im Spiel)
let grid = "";
for (let c = 0; c <= maze.cols; c++) grid += `M${c * CELL + 0.5} 0V${maze.rows * CELL}`;
for (let r = 0; r <= maze.rows; r++) grid += `M0 ${r * CELL + 0.5}H${maze.cols * CELL}`;

// Wände als waagerechte Läufe in EINEM Pfad - so gibt es keine hellen Nähte zwischen den Blöcken
let walls = "";
for (let r = 0; r < maze.rows; r++) {
  for (let c = 0; c < maze.cols; c++) {
    if (maze.grid[r][c] !== SL.WALL) continue;
    let len = 1;
    while (c + len < maze.cols && maze.grid[r][c + len] === SL.WALL) len++;
    walls += `M${c * CELL} ${r * CELL}h${len * CELL}v${CELL}h${-len * CELL}z`;
    c += len - 1;
  }
}

const parts = [];
parts.push(`<rect width="${W}" height="${H}" fill="${COLOR_OUTSIDE}"/>`);
parts.push(`<g transform="translate(${ox} ${oy})">`);
parts.push(`<rect width="${maze.cols * CELL}" height="${maze.rows * CELL}" fill="${COLOR_BG}"/>`);
parts.push(`<path d="${grid}" stroke="${COLOR_GRID_LINE}" stroke-width="1" fill="none"/>`);
parts.push(`<path d="${walls}" fill="${COLOR_WALL}"/>`);

// Ziel: Quadrat-Outline
const gs = CELL * 0.32;
parts.push(`<rect x="${n(cx(maze.end) - gs)}" y="${n(cy(maze.end) - gs)}" width="${n(gs * 2)}" height="${n(gs * 2)}" fill="none" stroke="${COLOR_WALL}" stroke-width="2"/>`);

// Coins, die schon eingesammelt wären (auf dem gelaufenen Weg), fehlen - wie im Spiel
for (const coin of maze.coins) {
  if (walked.has(coin.r + "," + coin.c)) continue;
  parts.push(`<circle cx="${cx(coin)}" cy="${cy(coin)}" r="${n(CELL * 0.12)}" fill="${COLOR_WALL}"/>`);
}

// Checkpoint-Fahnen: hinter der Figur erreicht (gefüllt), davor offen
const routeIndex = (cell) => route.findIndex((p) => p.r === cell.r && p.c === cell.c);
for (const cp of checkpoints) {
  const x = cx(cp), y = cy(cp), s = CELL;
  const poleX = n(x - s * 0.16), top = n(y - s * 0.3), bottom = n(y + s * 0.3);
  const reached = routeIndex(cp) <= at;
  parts.push(`<path d="M${poleX} ${bottom}V${top}" stroke="${COLOR_WALL}" stroke-width="2" stroke-linecap="round"/>`);
  parts.push(`<path d="M${poleX} ${top}L${n(x + s * 0.26)} ${n(top + s * 0.13)}L${poleX} ${n(top + s * 0.27)}Z" fill="${reached ? COLOR_WALL : COLOR_BG}" stroke="${COLOR_WALL}" stroke-width="2" stroke-linejoin="round"/>`);
}

// Spur ("Punkte"): die letzten Felder vor der Figur, ausblassend
const trail = route.slice(Math.max(0, at - TRAIL_LENGTH), at);
trail.forEach((cell, i) => {
  const a = (i + 1) / (trail.length + 1);
  parts.push(`<circle cx="${cx(cell)}" cy="${cy(cell)}" r="${n(CELL * 0.18)}" fill="${COLOR_TRAIL}" fill-opacity="${n(0.75 * a)}"/>`);
});

// Figur wie im Spiel (Radius 0,3 Felder), Pupillen schauen in Laufrichtung
const pr = CELL * 0.32;
const px = cx(player), py = cy(player);
parts.push(`<circle cx="${px}" cy="${py}" r="${n(pr)}" fill="${COLOR_WALL}" stroke="rgba(43,36,32,0.55)" stroke-width="${n(pr * 0.07)}"/>`);
for (const side of [-1, 1]) {
  const ex = px + side * pr * 0.4, ey = py - pr * 0.08;
  parts.push(`<circle cx="${n(ex)}" cy="${n(ey)}" r="${n(pr * 0.32)}" fill="${COLOR_BG}" stroke="${COLOR_WALL}" stroke-width="${n(pr * 0.05)}"/>`);
  parts.push(`<circle cx="${n(ex + dir.dc * pr * 0.14)}" cy="${n(ey + dir.dr * pr * 0.14)}" r="${n(pr * 0.14)}" fill="${COLOR_WALL}"/>`);
}
parts.push(`</g>`);

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">\n${parts.join("\n")}\n</svg>\n`;
fs.writeFileSync(outFile, svg);
console.log(`preview.svg geschrieben (Seed ${SEED}, ${maze.cols}x${maze.rows} Felder, Weg ${route.length - 1} Schritte)`);
