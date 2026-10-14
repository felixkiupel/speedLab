// Canvas-Rendering: schlichtes Schwarz-Weiß-Grid. Wände sind volle schwarze Zellen,
// Wege sind weiß - die Kollisionslogik und das Bild stimmen dadurch 1:1 überein.
window.SL = window.SL || {};

const COLOR_BG = "#ffffff";
const COLOR_WALL = "#111111";
const COLOR_GRID_LINE = "#e2e2e2";
const COLOR_GOAL = "#111111";
const COLOR_COIN = "#111111";
const COLOR_TRAIL = "#bbbbbb";

SL.Renderer = {
  // Baut eine statische Offscreen-Canvas mit dem Grid + Ziel (wird nur einmal pro Maze gezeichnet)
  buildMazeLayer(maze, cellSize) {
    const { rows, cols, grid, end } = maze;
    const layer = document.createElement("canvas");
    layer.width = cols * cellSize;
    layer.height = rows * cellSize;
    const ctx = layer.getContext("2d");

    ctx.fillStyle = COLOR_BG;
    ctx.fillRect(0, 0, layer.width, layer.height);

    ctx.fillStyle = COLOR_WALL;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (grid[r][c] === SL.WALL) {
          ctx.fillRect(c * cellSize, r * cellSize, cellSize, cellSize);
        }
      }
    }

    // Dezente Gitterlinien, damit das Raster als solches erkennbar bleibt
    ctx.strokeStyle = COLOR_GRID_LINE;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let c = 0; c <= cols; c++) {
      ctx.moveTo(c * cellSize + 0.5, 0);
      ctx.lineTo(c * cellSize + 0.5, layer.height);
    }
    for (let r = 0; r <= rows; r++) {
      ctx.moveTo(0, r * cellSize + 0.5);
      ctx.lineTo(layer.width, r * cellSize + 0.5);
    }
    ctx.stroke();

    // Ziel: schlichtes Quadrat-Outline in der Zielzelle
    const gx = end.c * cellSize + cellSize / 2;
    const gy = end.r * cellSize + cellSize / 2;
    const gs = cellSize * 0.32;
    ctx.strokeStyle = COLOR_GOAL;
    ctx.lineWidth = Math.max(2, cellSize * 0.1);
    ctx.strokeRect(gx - gs, gy - gs, gs * 2, gs * 2);

    return layer;
  },

  render(ctx, canvas, state) {
    const { mazeLayer, cellSize, coins, collectedSet, player, trail, color, direction, flashCrash } = state;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(mazeLayer, 0, 0);

    // Coins: kleine ausgefüllte Punkte
    ctx.fillStyle = COLOR_COIN;
    for (const coin of coins) {
      const key = coin.r + "," + coin.c;
      if (collectedSet.has(key)) continue;
      const cx = coin.c * cellSize + cellSize / 2;
      const cy = coin.r * cellSize + cellSize / 2;
      ctx.beginPath();
      ctx.arc(cx, cy, cellSize * 0.1, 0, Math.PI * 2);
      ctx.fill();
    }

    // Trail: zuletzt besuchte Zellen, ausblassend (keine Zwischenpositionen - der Punkt teleportiert)
    for (let i = 0; i < trail.length; i++) {
      const t = trail[i];
      const tx = t.c * cellSize + cellSize / 2;
      const ty = t.r * cellSize + cellSize / 2;
      const alpha = ((i + 1) / trail.length) * 0.5;
      ctx.fillStyle = hexToRgba(COLOR_TRAIL, alpha);
      ctx.beginPath();
      ctx.arc(tx, ty, cellSize * 0.18, 0, Math.PI * 2);
      ctx.fill();
    }

    // Spieler: kleine Nase in Fahrtrichtung (zuerst, damit der Kreis die Überlappung
    // glattzieht) + Kreis obendrauf, beides in derselben Farbe - wirkt wie eine Form.
    const radius = cellSize * 0.3;
    ctx.fillStyle = color;
    drawDirectionNose(ctx, player.x, player.y, direction, radius);
    ctx.beginPath();
    ctx.arc(player.x, player.y, radius, 0, Math.PI * 2);
    ctx.fill();

    if (flashCrash) {
      ctx.fillStyle = "rgba(220,40,40,0.25)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  },
};

// Zeichnet + füllt eine kleine dreieckige Nase am Rand des Spielers in Fahrtrichtung.
// Nutzt SL.DIRS direkt als Richtungsvektor statt einer eigenen Winkel-Tabelle.
function drawDirectionNose(ctx, cx, cy, direction, radius) {
  if (!direction) return;
  const d = SL.DIRS[direction];
  const px = -d.dr, py = d.dc; // senkrecht zur Bewegungsrichtung, für die Basisbreite der Nase
  const tipX = cx + d.dc * radius * 1.55;
  const tipY = cy + d.dr * radius * 1.55;
  const baseX = cx + d.dc * radius * 0.6;
  const baseY = cy + d.dr * radius * 0.6;
  const half = radius * 0.45;

  ctx.beginPath();
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(baseX + px * half, baseY + py * half);
  ctx.lineTo(baseX - px * half, baseY - py * half);
  ctx.closePath();
  ctx.fill();
}

function hexToRgba(hex, alpha) {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
