// Canvas-Rendering im Stil von Maze: warmes Creme mit dezentem Gitter, Felsen als dunkle Blöcke,
// Ziel als Quadrat-Rahmen, Coins als dunkle Punkte. Der Boden (Gitter, Schnee) liegt vorgerendert
// in einer Offscreen-Canvas; Felsen, Ziel, Coins, Kufenspuren und die Figur werden jeden Frame
// gezeichnet, weil sie animiert sind. Alle Koordinaten in logischen (CSS-)Pixeln.
window.SL = window.SL || {};

const INK = "#2b2420";
const CREAM = "#fbf7f0";
const GRID_LINE = "#efe7da";
const SNOW_FILL = "#eee7db";
const SNOW_DOT = "#d3c9b7";
const SKATE_MARK = "#ddd3c2";

const INTRO_MS = 520; // Einblendung beim Levelstart (rein optisch, die Uhr startet erst beim ersten Zug)
const MARK_FADE_MS = 900; // so lange bleiben Kufenspuren nach der Landung sichtbar

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}

SL.Renderer = {
  // Boden: Creme mit leichtem Lichtschein, Gitterlinien, Schneefelder (gepunktet), Löcher
  buildFloorLayer(board, cell, pixelRatio = 1) {
    const width = board.cols * cell;
    const height = board.rows * cell;
    const layer = document.createElement("canvas");
    layer.width = Math.round(width * pixelRatio);
    layer.height = Math.round(height * pixelRatio);
    const ctx = layer.getContext("2d");
    ctx.scale(pixelRatio, pixelRatio);

    ctx.fillStyle = CREAM;
    ctx.fillRect(0, 0, width, height);
    // Ganz leichter Lichtschein von oben links - die Fläche wirkt glatt statt matt
    const light = ctx.createRadialGradient(width * 0.2, height * 0.1, 0, width * 0.2, height * 0.1, Math.max(width, height) * 0.9);
    light.addColorStop(0, "rgba(255,255,255,0.75)");
    light.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = light;
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = GRID_LINE;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let c = 1; c < board.cols; c++) {
      ctx.moveTo(c * cell + 0.5, 0);
      ctx.lineTo(c * cell + 0.5, height);
    }
    for (let r = 1; r < board.rows; r++) {
      ctx.moveTo(0, r * cell + 0.5);
      ctx.lineTo(width, r * cell + 0.5);
    }
    ctx.stroke();

    for (let r = 0; r < board.rows; r++) {
      for (let c = 0; c < board.cols; c++) {
        if (board.grid[r][c] === SL.SNOW) drawSnow(ctx, c * cell, r * cell, cell);
        else if (board.grid[r][c] === SL.HOLE) drawHole(ctx, c * cell, r * cell, cell, r * 7 + c * 13);
      }
    }
    return layer;
  },

  // state: { board, layer, cell, width, height, pixelRatio, now, session, effects, introStart,
  //          marks, goalFlashAt, hit: { key|edge, start }, guide, highlight }
  //   guide: { dir, path, start } - Tutorial-Pfeil: wohin der nächste Zug rutscht
  //   highlight: Feldtyp (z.B. SL.SNOW), dessen Felder pulsieren - "Neu"-Hinweis eines Kapitels
  render(ctx, s) {
    const { board, cell, width, height, pixelRatio, now, session, effects } = s;
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const shake = effects.getShakeOffset();
    ctx.save();
    ctx.translate(shake.x, shake.y);

    // Einblendung: Boden blendet auf, Felsen ploppen gestaffelt rein (vom Start aus gesehen)
    const introT = s.introStart == null ? 1 : Math.min(1, (now - s.introStart) / INTRO_MS);
    ctx.globalAlpha = Math.min(1, introT * 2.5);
    ctx.drawImage(s.layer, 0, 0, width, height);
    ctx.globalAlpha = 1;

    if (s.highlight != null) drawHighlight(ctx, board, s.highlight, cell, now);
    drawMarks(ctx, s.marks, cell, now);

    const maxDist = board.rows + board.cols;
    for (let r = 0; r < board.rows; r++) {
      for (let c = 0; c < board.cols; c++) {
        if (board.grid[r][c] !== SL.ROCK) continue;
        const dist = Math.abs(r - board.start.r) + Math.abs(c - board.start.c);
        let scale = popScale((introT - (dist / maxDist) * 0.55) / 0.45);
        // Der Fels, gegen den man gerade geknallt ist, federt kurz nach
        if (s.hit && s.hit.key === r * board.cols + c) {
          const t = (now - s.hit.start) / 220;
          if (t >= 0 && t < 1) scale *= 1 - 0.07 * Math.sin(t * Math.PI) * (1 - t);
        }
        if (scale > 0.01) drawRock(ctx, c * cell, r * cell, cell, scale);
      }
    }

    const itemScale = popScale((introT - 0.55) / 0.45);
    drawGoal(ctx, board.goal, cell, now, itemScale, s.goalFlashAt, session.finished);

    for (const coin of board.coins) {
      if (session.collected.has(coin.r * board.cols + coin.c)) continue;
      const bob = Math.sin(now / 320 + coin.r * 1.7 + coin.c) * cell * 0.025;
      ctx.fillStyle = INK;
      ctx.beginPath();
      ctx.arc((coin.c + 0.5) * cell, (coin.r + 0.5) * cell + bob, cell * 0.105 * itemScale, 0, Math.PI * 2);
      ctx.fill();
    }

    if (s.guide && !session.anim) {
      const coinAt = (r, c) => board.coins.some((co) => co.r === r && co.c === c) && !session.collected.has(r * board.cols + c);
      drawGuide(ctx, session.pos, s.guide, cell, now, board.goal, coinAt);
    }
    if (s.hit && s.hit.edge) drawEdgeHit(ctx, s.hit, width, height, now);

    const pos = session.getPlayerPos(now);
    let radius = cell * 0.32 * popScale((introT - 0.35) / 0.5);
    // Ins Loch gefallen: Figur schrumpft weg
    const fall = session.getFallProgress(now);
    if (fall != null) radius *= 1 - fall * fall;
    if (session.anim) drawMotionGhosts(ctx, session.anim, pos, cell, radius, now);
    drawPlayer(ctx, (pos.c + 0.5) * cell, (pos.r + 0.5) * cell, radius, session.dir, session.getDeform(now));

    effects.render(ctx, (x, y) => [x, y], { w: width, h: height });
    ctx.restore();
  },
};

// 0..1 -> Skalierung mit kleinem Überschwinger (Ploppen)
function popScale(t) {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

function drawSnow(ctx, x, y, s) {
  const inset = s * 0.07;
  roundRectPath(ctx, x + inset, y + inset, s - inset * 2, s - inset * 2, s * 0.2);
  ctx.fillStyle = SNOW_FILL;
  ctx.fill();
  ctx.fillStyle = SNOW_DOT;
  const n = 4;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const dx = (i + 0.5 + (j % 2) * 0.5) / n;
      if (dx > 0.95) continue;
      ctx.beginPath();
      ctx.arc(x + inset + (s - inset * 2) * dx, y + inset + (s - inset * 2) * ((j + 0.5) / n), Math.max(1, s * 0.035), 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// Loch im Eis: helle Bruchkante mit feinen Rissen, darin eine dunkle runde Grube - rund und
// vertieft, damit man es nie mit einem (eckigen, erhabenen) Felsen verwechselt
function drawHole(ctx, x, y, s, seed) {
  const cx = x + s / 2, cy = y + s / 2;
  const r = s * 0.34;
  ctx.save();
  ctx.strokeStyle = SNOW_DOT;
  ctx.lineWidth = Math.max(1, s * 0.03);
  ctx.lineCap = "round";
  for (let i = 0; i < 4; i++) {
    const a = seed * 0.9 + i * (Math.PI / 2) + (i % 2) * 0.5;
    const len = s * (0.08 + ((seed + i * 3) % 4) * 0.025);
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * r * 1.08, cy + Math.sin(a) * r * 1.08);
    ctx.lineTo(cx + Math.cos(a + 0.15) * (r * 1.08 + len), cy + Math.sin(a + 0.15) * (r * 1.08 + len));
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(cx, cy, r * 1.12, 0, Math.PI * 2);
  ctx.fillStyle = "#e6ddcd";
  ctx.fill();
  const g = ctx.createRadialGradient(cx, cy + r * 0.3, r * 0.1, cx, cy, r);
  g.addColorStop(0, "#120e0c");
  g.addColorStop(1, "#3a302a");
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = g;
  ctx.fill();
  // Innenkante oben im Schatten -> wirkt wie eine Vertiefung
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.86, Math.PI * 1.1, Math.PI * 1.9);
  ctx.strokeStyle = "rgba(0,0,0,0.45)";
  ctx.lineWidth = Math.max(1.5, s * 0.05);
  ctx.stroke();
  ctx.restore();
}

// Neue Feldart pulsiert: Rahmen, der um jedes dieser Felder atmet (bei Löchern rund)
function drawHighlight(ctx, board, tile, s, now) {
  const t = (now % 1200) / 1200;
  const grow = s * (0.02 + 0.08 * t);
  ctx.save();
  ctx.strokeStyle = `rgba(43,36,32,${0.55 * (1 - t)})`;
  ctx.lineWidth = Math.max(2, s * 0.05);
  for (let r = 0; r < board.rows; r++) {
    for (let c = 0; c < board.cols; c++) {
      if (board.grid[r][c] !== tile) continue;
      if (tile === SL.HOLE) {
        ctx.beginPath();
        ctx.arc((c + 0.5) * s, (r + 0.5) * s, s * 0.42 + grow, 0, Math.PI * 2);
      } else {
        roundRectPath(ctx, c * s + s * 0.07 - grow, r * s + s * 0.07 - grow, s * 0.86 + grow * 2, s * 0.86 + grow * 2, s * 0.2 + grow);
      }
      ctx.stroke();
    }
  }
  ctx.restore();
}

// Felsen: schlichte dunkle Blöcke mit weichem Schatten darunter, damit sie auf dem Eis "stehen"
function drawRock(ctx, x, y, s, scale) {
  const size = s * 0.88 * scale;
  const cx = x + s / 2, cy = y + s / 2;
  const radius = s * 0.18 * scale;
  roundRectPath(ctx, cx - size / 2, cy - size / 2 + s * 0.05, size, size, radius);
  ctx.fillStyle = "rgba(43,36,32,0.14)";
  ctx.fill();
  roundRectPath(ctx, cx - size / 2, cy - size / 2, size, size, radius);
  ctx.fillStyle = INK;
  ctx.fill();
}

// Ziel: Quadrat-Rahmen wie bei Maze, dazu ein Puls nach außen. Kurz getönt, wenn man nur
// drübergerutscht ist ("knapp vorbei"). Im Ziel bleibt nur der Rahmen - die Figur soll drauf
// sichtbar bleiben, das Konfetti macht die UI.
function drawGoal(ctx, goal, s, now, scale, flashAt, finished) {
  if (scale <= 0) return;
  const cx = (goal.c + 0.5) * s, cy = (goal.r + 0.5) * s;
  const gs = s * 0.3 * scale;
  const lw = Math.max(2, s * 0.085);
  ctx.save();
  if (!finished) {
    const t = (now % 1700) / 1700;
    const grow = gs * (1 + t * 0.5);
    ctx.strokeStyle = `rgba(43,36,32,${0.3 * (1 - t)})`;
    ctx.lineWidth = lw * 0.7;
    ctx.strokeRect(cx - grow, cy - grow, grow * 2, grow * 2);
  }
  const flash = flashAt != null ? Math.max(0, 1 - (now - flashAt) / 450) : 0;
  if (flash > 0) {
    ctx.fillStyle = `rgba(43,36,32,${0.3 * flash})`;
    ctx.fillRect(cx - gs, cy - gs, gs * 2, gs * 2);
  }
  ctx.strokeStyle = INK;
  ctx.lineWidth = lw;
  ctx.strokeRect(cx - gs, cy - gs, gs * 2, gs * 2);
  ctx.restore();
}

// Kufenspuren: zwei feine Linien entlang des Rutschers, die nach der Landung ausblenden.
// marks: [{ from, to, dir, start, duration, cutAt? }] - cutAt = Rutscher wurde mittendrin
// zurückgenommen, die Spur wächst dann nicht weiter
function drawMarks(ctx, marks, s, now) {
  ctx.save();
  ctx.lineCap = "round";
  ctx.strokeStyle = SKATE_MARK;
  ctx.lineWidth = Math.max(1, s * 0.035);
  for (const m of marks) {
    const end = m.cutAt != null ? m.cutAt : m.start + m.duration;
    const alpha = now <= end ? 1 : Math.max(0, 1 - (now - end) / MARK_FADE_MS);
    if (alpha <= 0) continue;
    const t = Math.min(1, Math.max(0, (Math.min(now, end) - m.start) / m.duration));
    const p = SL.slideEase(t);
    const x0 = (m.from.c + 0.5) * s, y0 = (m.from.r + 0.5) * s;
    const x1 = x0 + (m.to.c - m.from.c) * s * p, y1 = y0 + (m.to.r - m.from.r) * s * p;
    const d = SL.DIRS[m.dir];
    const ox = -d.dr * s * 0.11, oy = d.dc * s * 0.11; // quer zur Fahrtrichtung
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.moveTo(x0 + ox, y0 + oy);
    ctx.lineTo(x1 + ox, y1 + oy);
    ctx.moveTo(x0 - ox, y0 - oy);
    ctx.lineTo(x1 - ox, y1 - oy);
    ctx.stroke();
  }
  ctx.restore();
}

// Bewegungs-Schatten: ein paar blasse Kopien der Figur hinter ihr, nie weiter zurück als bis zum
// Startfeld (sonst lägen sie über dem Fels, von dem sie gerade wegrutscht)
function drawMotionGhosts(ctx, anim, pos, s, radius, now) {
  const t = Math.min(1, Math.max(0, (now - anim.start) / anim.duration));
  const traveled = SL.slideEase(t) * anim.path.length;
  const d = SL.DIRS[anim.dir];
  const fade = t > 0.85 ? (1 - t) / 0.15 : 1;
  ctx.save();
  for (let k = 1; k <= 3; k++) {
    const back = Math.min(traveled, k * 0.3);
    if (back <= 0.02) break;
    ctx.globalAlpha = (0.16 / k) * fade;
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.arc((pos.c + 0.5 - d.dc * back) * s, (pos.r + 0.5 - d.dr * back) * s, radius * (1 - k * 0.12), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// Tutorial-Pfeil: Pfeilspitzen wandern vom Spieler bis zum Haltepunkt, dort ein Zielring (außer
// auf dem Ziel - das ist schon markiert). Auf Coin-Feldern keine Spitzen, sonst verschwimmen beide.
function drawGuide(ctx, from, guide, s, now, goal, coinAt) {
  const d = SL.DIRS[guide.dir];
  const to = guide.path[guide.path.length - 1];
  const len = guide.path.length;
  const appear = Math.min(1, (now - guide.start) / 250);
  ctx.save();
  ctx.globalAlpha = appear;
  ctx.strokeStyle = INK;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(2, s * 0.06);
  const phase = (now % 900) / 900;
  const step = 0.5; // Abstand der Pfeilspitzen in Feldern
  for (let k = 0; k * step < len; k++) {
    const dist = 0.55 + (k + phase) * step;
    if (dist > len - 0.35) break;
    const onR = Math.round(from.r + d.dr * dist), onC = Math.round(from.c + d.dc * dist);
    if (coinAt(onR, onC) && Math.abs(dist - Math.round(dist)) < 0.3) continue;
    const fadeEnds = Math.min(1, (dist - 0.55) / 0.4, (len - 0.35 - dist) / 0.4);
    ctx.globalAlpha = appear * 0.7 * Math.max(0, fadeEnds);
    const cx = (from.c + 0.5 + d.dc * dist) * s;
    const cy = (from.r + 0.5 + d.dr * dist) * s;
    const a = s * 0.12;
    ctx.beginPath();
    // Spitze zeigt in Fahrtrichtung
    ctx.moveTo(cx - d.dc * a - d.dr * a, cy - d.dr * a + d.dc * a);
    ctx.lineTo(cx, cy);
    ctx.lineTo(cx - d.dc * a + d.dr * a, cy - d.dr * a - d.dc * a);
    ctx.stroke();
  }
  if (to.r === goal.r && to.c === goal.c) {
    ctx.restore();
    return;
  }
  const pulse = 0.5 + 0.5 * Math.sin(now / 180);
  ctx.globalAlpha = appear * (0.45 + 0.35 * pulse);
  ctx.setLineDash([s * 0.08, s * 0.07]);
  ctx.beginPath();
  ctx.arc((to.c + 0.5) * s, (to.r + 0.5) * s, s * (0.34 + 0.03 * pulse), 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

// Aufprall am Spielfeldrand: kurzer dunkler Balken an der getroffenen Kante
function drawEdgeHit(ctx, hit, w, h, now) {
  const t = (now - hit.start) / 300;
  if (t < 0 || t >= 1) return;
  const { x, y, dir } = hit;
  const len = 60;
  const thick = 5 * (1 - t);
  ctx.fillStyle = `rgba(43,36,32,${0.5 * (1 - t)})`;
  if (dir === "N") ctx.fillRect(x - len / 2, 0, len, thick);
  else if (dir === "S") ctx.fillRect(x - len / 2, h - thick, len, thick);
  else if (dir === "W") ctx.fillRect(0, y - len / 2, thick, len);
  else ctx.fillRect(w - thick, y - len / 2, thick, len);
}

// ---------- Figur ----------

// deform: { dir, along } - along > 0 streckt in Fahrtrichtung, < 0 staucht (Aufprall). Beim
// Stauchen rückt die Mitte zur Wand, damit die Figur an der Wand plattgedrückt wird statt von ihr
// wegzuschrumpfen.
function drawPlayer(ctx, x, y, radius, dir, deform) {
  if (radius <= 0.5) return;
  ctx.save();
  if (deform && deform.along) {
    const d = SL.DIRS[deform.dir];
    const horizontal = d.dc !== 0;
    const a = 1 + deform.along;
    const q = 1 - deform.along * 0.6;
    const shift = deform.along < 0 ? -deform.along * radius : 0;
    ctx.translate(x + d.dc * shift, y + d.dr * shift);
    ctx.scale(horizontal ? a : q, horizontal ? q : a);
    ctx.translate(-x, -y);
  }
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = INK;
  ctx.fill();
  drawFace(ctx, x, y, dir, radius);
  ctx.restore();
}

// Zwei Augen wie bei Maze, die Pupillen schauen in Rutschrichtung
function drawFace(ctx, cx, cy, dir, radius) {
  const d = dir ? SL.DIRS[dir] : null;
  const shiftX = d ? d.dc * radius * 0.14 : 0;
  const shiftY = d ? d.dr * radius * 0.14 : 0;
  const eyeR = radius * 0.32;
  const pupilR = radius * 0.14;
  const eyeY = cy - radius * 0.08;
  for (const side of [-1, 1]) {
    const eyeX = cx + side * radius * 0.4;
    ctx.beginPath();
    ctx.arc(eyeX, eyeY, eyeR, 0, Math.PI * 2);
    ctx.fillStyle = CREAM;
    ctx.fill();
    ctx.lineWidth = Math.max(0.75, radius * 0.05);
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(eyeX + shiftX, eyeY + shiftY, pupilR, 0, Math.PI * 2);
    ctx.fillStyle = INK;
    ctx.fill();
  }
}
