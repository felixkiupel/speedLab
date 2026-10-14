// Canvas-Rendering: schlichtes Grid in warmem Creme/Dunkelbraun statt kaltem Schwarz-Weiß.
// Wände sind volle Zellen, Wege leer - die Kollisionslogik und das Bild stimmen 1:1 überein.
window.SL = window.SL || {};

const COLOR_BG = "#fbf7f0";
const COLOR_WALL = "#2b2420";
const COLOR_GRID_LINE = "#e8e0d2";
const COLOR_GOAL = "#2b2420";
const COLOR_COIN = "#2b2420";
const COLOR_TRAIL = "#c7bcaa";
const COLOR_DANGER = "#c0392b";

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

  // Kamera-Rendering: der Spieler steht fest in der Canvas-Mitte, die Welt scrollt
  // drunter weg. "player" ist seine Position in Welt-Pixeln (aus getPlayerPixel) -
  // daraus ergibt sich die Kameraecke (camX/camY), mit der alles andere in
  // Bildschirmkoordinaten umgerechnet wird. Kein Scrollen/Lerp - die Kamera "teleportiert"
  // mit dem Punkt zusammen, passend zum Rest der Bewegung.
  render(ctx, canvas, state) {
    const { mazeLayer, cellSize, coins, collectedSet, player, trail, color, direction, flashCrash } = state;
    const camX = player.x - canvas.width / 2;
    const camY = player.y - canvas.height / 2;
    const toScreen = (wx, wy) => [wx - camX, wy - camY];

    ctx.fillStyle = COLOR_BG;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // Ausschnitt des vorgerenderten Maze-Layers - darf über den Rand hinausragen,
    // der Browser clippt das automatisch auf den tatsächlich vorhandenen Bereich.
    ctx.drawImage(mazeLayer, camX, camY, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);

    // Coins: kleine ausgefüllte Punkte
    ctx.fillStyle = COLOR_COIN;
    for (const coin of coins) {
      const key = coin.r + "," + coin.c;
      if (collectedSet.has(key)) continue;
      const [cx, cy] = toScreen(coin.c * cellSize + cellSize / 2, coin.r * cellSize + cellSize / 2);
      ctx.beginPath();
      ctx.arc(cx, cy, cellSize * 0.1, 0, Math.PI * 2);
      ctx.fill();
    }

    // Trail: zuletzt besuchte Zellen, ausblassend (keine Zwischenpositionen - der Punkt teleportiert)
    for (let i = 0; i < trail.length; i++) {
      const t = trail[i];
      const [tx, ty] = toScreen(t.c * cellSize + cellSize / 2, t.r * cellSize + cellSize / 2);
      const alpha = ((i + 1) / trail.length) * 0.5;
      ctx.fillStyle = hexToRgba(COLOR_TRAIL, alpha);
      ctx.beginPath();
      ctx.arc(tx, ty, cellSize * 0.18, 0, Math.PI * 2);
      ctx.fill();
    }

    // Spieler: immer exakt in der Canvas-Mitte. Die Pupillen schauen in "direction" -
    // bewusst der zuletzt angeforderte Tastendruck, nicht erst die vom Tick bestätigte
    // Bewegung, damit der Blick sofort reagiert statt dem Tick nachzuhängen.
    const px = canvas.width / 2, py = canvas.height / 2;
    const radius = cellSize * 0.3;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(px, py, radius, 0, Math.PI * 2);
    ctx.fill();
    drawFace(ctx, px, py, direction, radius);

    if (flashCrash) {
      ctx.fillStyle = hexToRgba(COLOR_DANGER, 0.25);
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  },
};

// Zwei einfache Augen, Pupillen verschieben sich Richtung "direction" (SL.DIRS-Vektor, kein
// eigenes Winkel-Mapping nötig). Ohne Richtung schauen sie zentriert geradeaus.
function drawFace(ctx, cx, cy, direction, radius) {
  const d = direction ? SL.DIRS[direction] : null;
  const shiftX = d ? d.dc * radius * 0.14 : 0;
  const shiftY = d ? d.dr * radius * 0.14 : 0;
  const eyeR = radius * 0.32;
  const pupilR = radius * 0.14;
  const eyeY = cy - radius * 0.08;

  for (const side of [-1, 1]) {
    const eyeX = cx + side * radius * 0.4;
    ctx.beginPath();
    ctx.arc(eyeX, eyeY, eyeR, 0, Math.PI * 2);
    ctx.fillStyle = COLOR_BG;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(eyeX + shiftX, eyeY + shiftY, pupilR, 0, Math.PI * 2);
    ctx.fillStyle = COLOR_WALL;
    ctx.fill();
  }
}

function hexToRgba(hex, alpha) {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
