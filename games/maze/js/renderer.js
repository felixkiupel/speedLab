// Canvas-Rendering: schlichtes Grid in warmem Creme/Dunkelbraun statt kaltem Schwarz-Weiß.
// Wände sind volle Zellen, Wege leer - die Kollisionslogik und das Bild stimmen 1:1 überein.
window.SL = window.SL || {};

const COLOR_BG = "#fbf7f0";
const COLOR_OUTSIDE = "#ebe3d5";
const COLOR_WALL = "#2b2420";
const COLOR_GRID_LINE = "#e8e0d2";
const COLOR_GOAL = "#2b2420";
const COLOR_COIN = "#2b2420";
const COLOR_TRAIL = "#c7bcaa";
const COLOR_DANGER = "#c0392b";
const COLOR_SPARK = "#f2a900";

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
    const { mazeLayer, cellSize, viewSize, pixelRatio, coins, collectedSet, checkpoints, player, trail, skin, trailStyle, time, direction, flashStrength, effects, shake, squash, finishMs } = state;
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

    // Trail: zuletzt besuchte Zellen, ausblassend (keine Zwischenpositionen - der Punkt teleportiert)
    const points = trail.map((t) => {
      const [x, y] = toScreen(t.c * cellSize + cellSize / 2, t.r * cellSize + cellSize / 2);
      return { x, y, seed: t.r * 31 + t.c * 17 };
    });
    drawTrail(ctx, points, cellSize, trailStyle, skin, time);

    // Spieler: immer exakt in der Canvas-Mitte. Die Pupillen schauen in "direction",
    // die Richtung des letzten erfolgreichen Schritts. Im Ziel wird er zum Quadrat.
    const radius = cellSize * 0.3;
    const body = finishMs == null ? null : goalBody(radius, cellSize, finishMs);
    drawPlayer(ctx, viewSize / 2, viewSize / 2, radius, skin, direction, time, squash, body);

    effects.render(ctx, toScreen);
    ctx.restore();

    // Crash-Flash: setzt voll ein und blendet dann aus (flashStrength 1 -> 0)
    if (flashStrength > 0) {
      ctx.fillStyle = hexToRgba(COLOR_DANGER, 0.3 * flashStrength);
      ctx.fillRect(0, 0, viewSize, viewSize);
    }
  },
};

// ---------- Shop-Vorschauen ----------
// Zeichnen mit denselben Funktionen wie das Spiel, damit der Shop exakt zeigt, was man bekommt.

// Canvas auf seine CSS-Größe × devicePixelRatio bringen, Kontext in CSS-Pixeln zurückgeben
function prepareCanvas(canvas) {
  const ratio = window.devicePixelRatio || 1;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (canvas.width !== Math.round(w * ratio) || canvas.height !== Math.round(h * ratio)) {
    canvas.width = Math.round(w * ratio);
    canvas.height = Math.round(h * ratio);
  }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, w, h);
  return { ctx, w, h };
}

// Mini-Korridor in Spielgröße (max. 40px pro Feld): ein Weg-Streifen mit schmalen Wandkanten
// oben/unten, die Spur läuft von links auf die Figur zu. Spur + Figur stehen zusammen mittig.
const TRAIL_PREVIEW_LENGTH = 6;

function drawCorridorScene(canvas, skin, trail, time) {
  const { ctx, w, h } = prepareCanvas(canvas);
  const n = TRAIL_PREVIEW_LENGTH;
  const cell = Math.min(w / (n + 0.5), h / 1.7, 40);
  const pathTop = (h - cell) / 2;
  const wall = Math.min(cell * 0.5, pathTop);
  const playerX = w / 2 + ((n - 1) * cell) / 2;
  const y = pathTop + cell / 2;

  ctx.fillStyle = COLOR_WALL;
  ctx.fillRect(0, pathTop - wall, w, wall);
  ctx.fillRect(0, pathTop + cell, w, wall);
  ctx.fillStyle = COLOR_BG;
  ctx.fillRect(0, pathTop, w, cell);
  // Gitterlinien auf die Zellgrenzen rund um die Spur ausrichten
  ctx.strokeStyle = COLOR_GRID_LINE;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = playerX + cell / 2; x > 0; x -= cell) {
    ctx.moveTo(Math.round(x) + 0.5, pathTop);
    ctx.lineTo(Math.round(x) + 0.5, pathTop + cell);
  }
  for (let x = playerX + cell * 1.5; x < w; x += cell) {
    ctx.moveTo(Math.round(x) + 0.5, pathTop);
    ctx.lineTo(Math.round(x) + 0.5, pathTop + cell);
  }
  ctx.stroke();

  const points = [];
  for (let i = 0; i < n; i++) {
    points.push({ x: playerX - (n - 1 - i) * cell, y, seed: i * 17 + 3 });
  }
  drawTrail(ctx, points, cell, trail, skin, time);
  drawPlayer(ctx, playerX, y, cell * 0.3, skin, "E", time);
}

SL.Renderer.drawSkinPreview = function drawSkinPreview(canvas, skin, time = 0) {
  const { ctx, w, h } = prepareCanvas(canvas);
  drawPlayer(ctx, w / 2, h / 2, Math.min(w, h) * 0.36, skin, null, time);
};

SL.Renderer.drawScenePreview = drawCorridorScene;

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

// Pfad der Figur: Kreis, oder mit body das Quadrat mit runden Ecken (corner >= half = Kreis)
function bodyPath(ctx, x, y, r, body) {
  ctx.beginPath();
  if (!body) {
    ctx.arc(x, y, r, 0, Math.PI * 2);
    return;
  }
  const { half } = body;
  const k = Math.max(0, Math.min(body.corner, half));
  ctx.moveTo(x, y - half);
  ctx.arcTo(x + half, y - half, x + half, y + half, k);
  ctx.arcTo(x + half, y + half, x - half, y + half, k);
  ctx.arcTo(x - half, y + half, x - half, y - half, k);
  ctx.arcTo(x - half, y - half, x + half, y - half, k);
  ctx.closePath();
}

// squash (0..1): direkt nach einem Schritt wird die Figur kurz in Laufrichtung gestreckt und
// quer dazu gestaucht - gibt dem "Teleport" pro Feld einen spürbaren Ruck. body: Form im Ziel
// (goalBody), sonst Kreis.
function drawPlayer(ctx, x, y, radius, skin, direction, time, squash = 0, body = null) {
  const d = direction ? SL.DIRS[direction] : null;
  const k = d ? squash * 0.22 : 0;
  ctx.save();
  if (k) {
    const horizontal = d.dc !== 0;
    ctx.translate(x, y);
    ctx.scale(horizontal ? 1 + k : 1 - k * 0.6, horizontal ? 1 - k * 0.6 : 1 + k);
    ctx.translate(-x, -y);
  }
  fillBody(ctx, x, y, radius, skin, time, body);
  drawFace(ctx, x, y, direction, radius);
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

// Feste "Sterne" für den Galaxie-Skin: [dx, dy, Größe] relativ zum Radius
const GALAXY_STARS = [[-0.45, 0.35, 0.07], [0.5, -0.1, 0.06], [0.15, 0.55, 0.05], [-0.1, -0.55, 0.045], [0.55, 0.42, 0.04], [-0.62, -0.15, 0.04]];

// Füllt den Körper je nach Skin-Muster. Alles wird auf die Form geclippt (Kreis, im Ziel das
// Quadrat), danach kommt eine feine dunkle Kontur, damit helle Skins auf dem cremefarbenen Weg
// nicht verschwimmen. Muster richten sich nach der halben Breite der Form.
function fillBody(ctx, x, y, radius, skin, time, body = null) {
  const colors = skin.colors;
  const [c0, c1 = c0, c2 = c1] = colors;
  const r = body ? body.half : radius;
  ctx.save();
  bodyPath(ctx, x, y, radius, body);
  ctx.fillStyle = c0;
  ctx.fill();
  ctx.clip();

  switch (skin.pattern) {
    case "split": {
      // Diagonal geteilt: untere rechte Hälfte in der zweiten Farbe
      ctx.fillStyle = c1;
      ctx.beginPath();
      ctx.moveTo(x + r, y - r);
      ctx.lineTo(x + r, y + r);
      ctx.lineTo(x - r, y + r);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case "stripes": {
      ctx.strokeStyle = c1;
      ctx.lineWidth = r * 0.3;
      ctx.beginPath();
      for (let o = -2 * r; o <= 2 * r; o += r * 0.66) {
        ctx.moveTo(x + o - r, y + r);
        ctx.lineTo(x + o + r, y - r);
      }
      ctx.stroke();
      break;
    }
    case "ring": {
      // Band entlang des Rands: doppelt so breit gezogen, die Hälfte außen schneidet der Clip weg
      ctx.lineWidth = r * 0.44;
      ctx.strokeStyle = c1;
      bodyPath(ctx, x, y, radius, body);
      ctx.stroke();
      break;
    }
    case "gradient": {
      const g = ctx.createLinearGradient(x - r, y - r, x + r, y + r);
      colors.forEach((c, i) => g.addColorStop(i / (colors.length - 1), c));
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
      break;
    }
    case "galaxy": {
      const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.05, x, y, r);
      g.addColorStop(0, c1);
      g.addColorStop(1, c0);
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
      ctx.fillStyle = c2;
      for (const [dx, dy, s] of GALAXY_STARS) {
        ctx.beginPath();
        ctx.arc(x + dx * r, y + dy * r, Math.max(0.8, r * s), 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case "prism": {
      // Farbkreis, der sich langsam dreht (Fallback ohne Conic-Gradient: Verlauf, der rotiert)
      const angle = (time || 0) * 0.0012;
      let g;
      if (ctx.createConicGradient) {
        g = ctx.createConicGradient(angle, x, y);
        [...colors, colors[0]].forEach((c, i) => g.addColorStop(i / colors.length, c));
      } else {
        g = ctx.createLinearGradient(x + Math.cos(angle) * r, y + Math.sin(angle) * r, x - Math.cos(angle) * r, y - Math.sin(angle) * r);
        colors.forEach((c, i) => g.addColorStop(i / (colors.length - 1), c));
      }
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
      break;
    }
    default:
      break; // solid: Grundfüllung reicht
  }
  ctx.restore();

  if (skin.pattern !== "ring") {
    bodyPath(ctx, x, y, radius, body);
    ctx.lineWidth = Math.max(1, radius * 0.07);
    ctx.strokeStyle = "rgba(43, 36, 32, 0.55)";
    ctx.stroke();
  }
}

// ---------- Spuren ----------

// Farbe für farbige Spuren: explizite Akzentfarbe des Skins, sonst seine Hauptfarbe
function skinAccent(skin) {
  return skin.accent || skin.colors[0];
}

// points: Bildschirmkoordinaten, ältester Punkt zuerst; der letzte liegt unter der Figur.
// a = 0..1 (Alter, 1 = neuester), damit alle Stile gleichmäßig ausblenden.
function drawTrail(ctx, points, cellSize, trail, skin, time) {
  const n = points.length;
  if (!n) return;
  const tint = skinAccent(skin);
  const t = time || 0;

  if (trail.style === "line") {
    ctx.lineCap = "round";
    for (let i = 1; i < n; i++) {
      const a = (i + 1) / n;
      ctx.strokeStyle = hexToRgba(tint, 0.65 * a);
      ctx.lineWidth = cellSize * (0.06 + 0.2 * a);
      ctx.beginPath();
      ctx.moveTo(points[i - 1].x, points[i - 1].y);
      ctx.lineTo(points[i].x, points[i].y);
      ctx.stroke();
    }
    return;
  }

  for (let i = 0; i < n; i++) {
    const { x, y, seed } = points[i];
    const a = (i + 1) / n;
    switch (trail.style) {
      case "tint":
        ctx.fillStyle = hexToRgba(tint, 0.6 * a);
        circle(ctx, x, y, cellSize * 0.18);
        break;
      case "pixels": {
        const s = cellSize * (0.14 + 0.16 * a);
        ctx.fillStyle = hexToRgba(tint, 0.7 * a);
        ctx.fillRect(Math.round(x - s / 2), Math.round(y - s / 2), Math.round(s), Math.round(s));
        break;
      }
      case "sparks": {
        // Vierzackige Funken, pro Feld fest gedreht + leichtes Funkeln über die Zeit
        const twinkle = 0.85 + 0.15 * Math.sin(t * 0.008 + seed);
        ctx.fillStyle = hexToRgba(COLOR_SPARK, 0.95 * a);
        drawSpark(ctx, x, y, cellSize * (0.12 + 0.16 * a) * twinkle, seed * 0.7);
        break;
      }
      case "rainbow": {
        const hue = (i * 40 + t * 0.12) % 360;
        ctx.fillStyle = `hsla(${hue}, 85%, 62%, ${0.8 * a})`;
        circle(ctx, x, y, cellSize * (0.12 + 0.08 * a));
        break;
      }
      default: // "dots": dezente graue Punkte
        ctx.fillStyle = hexToRgba(COLOR_TRAIL, 0.5 * a);
        circle(ctx, x, y, cellSize * 0.18);
    }
  }
}

function circle(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function drawSpark(ctx, x, y, r, rotation) {
  const inner = r * 0.32;
  ctx.beginPath();
  for (let k = 0; k < 8; k++) {
    const ang = rotation + (k * Math.PI) / 4;
    const rad = k % 2 === 0 ? r : inner;
    const px = x + Math.cos(ang) * rad, py = y + Math.sin(ang) * rad;
    if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
}

// Zwei einfache Augen, Pupillen verschieben sich Richtung "direction" (SL.DIRS-Vektor, kein
// eigenes Winkel-Mapping nötig). Ohne Richtung schauen sie zentriert geradeaus. Die feine
// Kontur hält das Augenweiß auch auf hellen Skins (Geist, Zebra) sichtbar.
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
    ctx.lineWidth = Math.max(0.75, radius * 0.05);
    ctx.strokeStyle = COLOR_WALL;
    ctx.stroke();
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
