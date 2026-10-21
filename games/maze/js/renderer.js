// Canvas-Rendering: schlichtes Grid in warmem Creme/Dunkelbraun statt kaltem Schwarz-Weiß.
// Wände sind volle Zellen, Wege leer - die Kollisionslogik und das Bild stimmen 1:1 überein.
window.SL = window.SL || {};

const COLOR_BG = "#fbf7f0";
const COLOR_OUTSIDE = "#ebe3d5";
const COLOR_WALL = "#2b2420";
const COLOR_GRID_LINE = "#e8e0d2";
const COLOR_GOAL = "#2b2420";
const COLOR_COIN = "#2b2420";
const COLOR_DANGER = "#c0392b";

const GOAL_HALF = 0.32; // halbe Seitenlänge des Ziel-Rahmens in Feldgrößen (Mitte der Linie)
const goalLineWidth = (cellSize) => Math.max(2, cellSize * 0.1);

SL.Renderer = {
  // Baut eine statische Offscreen-Canvas mit dem Grid + Ziel (wird nur einmal pro Maze gezeichnet).
  // pixelRatio = devicePixelRatio, damit das Bild auf HiDPI-Displays scharf bleibt; gezeichnet
  // wird trotzdem in logischen Pixeln (cellSize), die Skalierung übernimmt der Kontext.
  buildMazeLayer(maze, cellSize, pixelRatio = 1) {
    const { rows, cols, grid, end } = maze;
    const width = cols * cellSize;
    const height = rows * cellSize;
    const layer = document.createElement("canvas");
    layer.width = Math.round(width * pixelRatio);
    layer.height = Math.round(height * pixelRatio);
    const ctx = layer.getContext("2d");
    ctx.scale(pixelRatio, pixelRatio);

    ctx.fillStyle = COLOR_BG;
    ctx.fillRect(0, 0, width, height);

    // Dezente Gitterlinien, damit das Raster als solches erkennbar bleibt. Werden VOR den
    // Wänden gezeichnet, sonst ziehen sich helle Nähte quer durch die dunklen Wandblöcke.
    ctx.strokeStyle = COLOR_GRID_LINE;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let c = 0; c <= cols; c++) {
      ctx.moveTo(c * cellSize + 0.5, 0);
      ctx.lineTo(c * cellSize + 0.5, height);
    }
    for (let r = 0; r <= rows; r++) {
      ctx.moveTo(0, r * cellSize + 0.5);
      ctx.lineTo(width, r * cellSize + 0.5);
    }
    ctx.stroke();

    ctx.fillStyle = COLOR_WALL;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (grid[r][c] === SL.WALL) {
          ctx.fillRect(c * cellSize, r * cellSize, cellSize, cellSize);
        }
      }
    }

    // Ziel: schlichtes Quadrat-Outline in der Zielzelle
    const gx = end.c * cellSize + cellSize / 2;
    const gy = end.r * cellSize + cellSize / 2;
    const gs = cellSize * GOAL_HALF;
    ctx.strokeStyle = COLOR_GOAL;
    ctx.lineWidth = goalLineWidth(cellSize);
    ctx.strokeRect(gx - gs, gy - gs, gs * 2, gs * 2);

    return layer;
  },

  // Kamera-Rendering: der Spieler steht fest in der Canvas-Mitte, die Welt scrollt
  // drunter weg. "player" ist seine Position in Welt-Pixeln (aus getPlayerPixel) -
  // daraus ergibt sich die Kameraecke (camX/camY), mit der alles andere in
  // Bildschirmkoordinaten umgerechnet wird. Kein Scrollen/Lerp - die Kamera "teleportiert"
  // mit dem Punkt zusammen, passend zum Rest der Bewegung.
  // Alle Koordinaten sind logische Pixel (viewSize); pixelRatio skaliert nur die Ausgabe.
  // shake = Versatz fürs Bildschirm-Wackeln, squash = 0..1 Stärke des Schritt-Squashs,
  // finishMs = Zeit seit dem Zieleinlauf (null = noch unterwegs) für die Verwandlung der Figur.
  render(ctx, state) {
    const { mazeLayer, cellSize, viewSize, pixelRatio, coins, collectedSet, checkpoints, player, trail, trailStyle, direction, flashStrength, effects, shake, squash, finishMs } = state;
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    const camX = player.x - viewSize / 2;
    const camY = player.y - viewSize / 2;
    const toScreen = (wx, wy) => [wx - camX, wy - camY];

    // Außerhalb des Mazes etwas dunkler als der Boden, damit die Fläche hinter dem
    // Außenrand nicht wie begehbarer Weg aussieht
    ctx.fillStyle = COLOR_OUTSIDE;
    ctx.fillRect(0, 0, viewSize, viewSize);
    ctx.save();
    ctx.translate(shake.x, shake.y);
    // Ausschnitt des vorgerenderten Maze-Layers - darf über den Rand hinausragen,
    // der Browser clippt das automatisch auf den tatsächlich vorhandenen Bereich.
    // Quell-Rechteck in Layer-Pixeln (also * pixelRatio), Ziel in logischen Pixeln.
    ctx.drawImage(
      mazeLayer,
      camX * pixelRatio, camY * pixelRatio, viewSize * pixelRatio, viewSize * pixelRatio,
      0, 0, viewSize, viewSize
    );

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

    for (const cp of checkpoints) {
      const [fx, fy] = toScreen(cp.c * cellSize + cellSize / 2, cp.r * cellSize + cellSize / 2);
      drawFlag(ctx, fx, fy, cellSize, cp.reached);
    }

    // Spur über die zuletzt besuchten Zellen (keine Zwischenpositionen - der Punkt teleportiert).
    // Welche, legt der Shop fest (shared/js/cosmetics.js) - Standard sind die Maze-Punkte.
    const radius = cellSize * 0.3;
    const points = trail.map((t) => {
      const [x, y] = toScreen(t.c * cellSize + cellSize / 2, t.r * cellSize + cellSize / 2);
      return { x, y };
    });
    SL.CosmeticsDraw.drawTrail(ctx, points, radius, trailStyle);

    // Spieler: immer exakt in der Canvas-Mitte. Die Pupillen schauen in "direction",
    // die Richtung des letzten erfolgreichen Schritts. Im Ziel wird er zum Quadrat.
    const body = finishMs == null ? null : goalBody(radius, cellSize, finishMs);
    drawPlayer(ctx, viewSize / 2, viewSize / 2, radius, direction, squash, body);

    effects.render(ctx, toScreen);
    ctx.restore();

    // Crash-Flash: setzt voll ein und blendet dann aus (flashStrength 1 -> 0)
    if (flashStrength > 0) {
      ctx.fillStyle = hexToRgba(COLOR_DANGER, 0.3 * flashStrength);
      ctx.fillRect(0, 0, viewSize, viewSize);
    }
  },
};

// ---------- Figur ----------

// Ziel-Verwandlung wie in Drift: Im Ziel wächst die Figur vom Kreis zum Quadrat, bis sie den
// Rahmen komplett ausfüllt - mit einem kleinen Überschwinger am Ende. Die Augen bleiben.
const GOAL_MORPH_MS = 360;
function goalMorph(ms) {
  const t = Math.min(1, Math.max(0, ms / GOAL_MORPH_MS));
  const c1 = 1.4, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

// Körperform im Ziel: { half, corner } - halbe Seitenlänge und Eckenradius (corner = half ist
// ein Kreis). Am Ende so groß wie der Rahmen außen; die runden Ecken ragen ein Stück darüber,
// damit keine dunkle Rahmenspitze hervorschaut.
function goalBody(radius, cellSize, ms) {
  const m = goalMorph(ms);
  const corner = cellSize * 0.05;
  const half = cellSize * GOAL_HALF + goalLineWidth(cellSize) / 2 + corner * 0.3;
  return {
    half: radius + (half - radius) * m,
    corner: radius + (corner - radius) * Math.min(1, m),
  };
}

// squash (0..1): direkt nach einem Schritt wird die Figur kurz in Laufrichtung gestreckt und
// quer dazu gestaucht - gibt dem "Teleport" pro Feld einen spürbaren Ruck. body: Form im Ziel
// (goalBody), sonst Kreis. Körper + Augen kommen aus shared/js/cosmetics-draw.js, wie im Shop.
function drawPlayer(ctx, x, y, radius, direction, squash = 0, body = null) {
  const d = direction ? SL.DIRS[direction] : null;
  const k = d ? squash * 0.22 : 0;
  ctx.save();
  if (k) {
    const horizontal = d.dc !== 0;
    ctx.translate(x, y);
    ctx.scale(horizontal ? 1 + k : 1 - k * 0.6, horizontal ? 1 - k * 0.6 : 1 + k);
    ctx.translate(-x, -y);
  }
  SL.CosmeticsDraw.drawFigure(ctx, x, y, radius, d ? { x: d.dc, y: d.dr } : null, body);
  ctx.restore();
}

// Checkpoint-Fahne: offen (Umriss) = noch nicht erreicht, gefüllt = erreicht (Respawn-Punkt)
function drawFlag(ctx, x, y, cellSize, reached) {
  const s = cellSize;
  const poleX = x - s * 0.16;
  const top = y - s * 0.3, bottom = y + s * 0.3;
  ctx.lineCap = "round";
  ctx.strokeStyle = COLOR_WALL;
  ctx.lineWidth = Math.max(2, s * 0.06);
  ctx.beginPath();
  ctx.moveTo(poleX, bottom);
  ctx.lineTo(poleX, top);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(poleX, top);
  ctx.lineTo(x + s * 0.26, top + s * 0.13);
  ctx.lineTo(poleX, top + s * 0.27);
  ctx.closePath();
  ctx.lineJoin = "round";
  if (reached) {
    ctx.fillStyle = COLOR_WALL;
    ctx.fill();
  } else {
    ctx.fillStyle = COLOR_BG;
    ctx.fill();
    ctx.stroke();
  }
}

function hexToRgba(hex, alpha) {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
