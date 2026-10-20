// Canvas-Rendering von Leap im Stil von Maze: warmes Creme, dunkles Braun, feine Gitterlinien.
// Land ist ein dunkler Block bis zum unteren Bildrand (man sieht sofort: da ist Boden), Sprungpunkte
// sind Ringe, die Figur ist die Kugel mit Augen. Gezeichnet wird in Welt-Pixeln; die Kamera
// (cam, scale) legt fest, welcher Ausschnitt zu sehen ist. Effekte und Fortschritt in Bildschirm-Pixeln.
window.SL = window.SL || {};

const INK = "#2b2420";
const CREAM = "#fbf7f0";
const GRID_LINE = "#e8e0d2";
const SOFT = "#ddd3c2";
const DIM = "#85786a";
const DANGER = "#c0392b";
const GRID = 40;

const HIT_MS = 320; // Aufleuchten eines Punkts beim Absprung
const GUIDE_MS = 520; // so lange vor der Mitte erscheint der Annäherungs-Ring
const GOAL_HALF = 1.3; // halbe Seitenlänge des Ziel-Rahmens in Figur-Radien

SL.Renderer = {
  // v: { session, now (performance.now), w, h (Bildschirm-Pixel), scale, pixelRatio, cam {x,y},
  //      effects, shake {x,y}, flash 0..1, guide (Ring an), trail [{x,y,seed}],
  //      skin, trailStyle (ausgerüstet im Shop, shared/js/cosmetics.js),
  //      hits Map(pointId -> Zeit des Absprungs), squash {at, kind: "jump" | "land"} }
  render(ctx, v) {
    const { session, now, w, h, scale: s, pixelRatio: pr, cam } = v;
    const course = session.course;
    const L = SL.LEAP;
    const left = cam.x, right = cam.x + w / s, top = cam.y, bottom = cam.y + h / s;

    ctx.setTransform(pr, 0, 0, pr, 0, 0);
    ctx.fillStyle = CREAM;
    ctx.fillRect(0, 0, w, h);

    // Ab hier Welt-Koordinaten
    ctx.setTransform(pr * s, 0, 0, pr * s, (-cam.x * s + v.shake.x) * pr, (-cam.y * s + v.shake.y) * pr);
    const px = 1 / s; // eine Bildschirm-Linie

    // Gitter, das mit der Welt mitläuft - so spürt man die Bewegung
    ctx.strokeStyle = GRID_LINE;
    ctx.lineWidth = px;
    ctx.beginPath();
    for (let x = Math.floor(left / GRID) * GRID; x <= right; x += GRID) {
      ctx.moveTo(x, top);
      ctx.lineTo(x, bottom);
    }
    for (let y = Math.floor(top / GRID) * GRID; y <= bottom; y += GRID) {
      ctx.moveTo(left, y);
      ctx.lineTo(right, y);
    }
    ctx.stroke();

    const visible = (x, r = 60) => x > left - r && x < right + r;
    const xFig = session.fig.x;

    // Schienen der bewegten Punkte (gepunktet, so weit wie sie schwingen)
    ctx.fillStyle = SOFT;
    for (const p of course.points) {
      if (!p.move || !visible(p.x)) continue;
      for (let y = p.move.yc - p.move.amp; y <= p.move.yc + p.move.amp; y += 7) {
        ctx.beginPath();
        ctx.arc(p.x, y, 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Coins: kleine dunkle Punkte wie in Maze
    ctx.fillStyle = INK;
    for (const c of course.coins) {
      if (session.collected.has(c.id) || !visible(c.x)) continue;
      ctx.beginPath();
      ctx.arc(c.x, c.y, L.COIN_R, 0, Math.PI * 2);
      ctx.fill();
    }

    // Sprungpunkte
    const candidates = session.mode === "air" && session.trace ? session.trace.candidates : [];
    for (const p of course.points) {
      if (!visible(p.x)) continue;
      const y = SL.leapPointY(p, xFig);
      if (session.used.has(p.id)) {
        drawUsedPoint(ctx, p.x, y, v.hits.get(p.id), now);
        continue;
      }
      if (v.guide && candidates.includes(p)) {
        const msLeft = ((p.x - xFig) / session.vx) * 1000;
        if (msLeft > -40 && msLeft < GUIDE_MS) drawGuide(ctx, p.x, y, msLeft, px);
      }
      drawPoint(ctx, p.x, y, p.kind);
    }

    // Spur aus dem Shop über die zuletzt besuchten Positionen (Maßstab: etwa zwei Figur-Breiten,
    // damit die Standard-Punkte so groß sind wie früher die eigene Spur)
    SL.CosmeticsDraw.drawTrail(ctx, v.trail, L.FIG_R * 2.2, v.trailStyle, v.skin, now);

    // Land
    for (const pl of course.platforms) {
      if (pl.x1 < left - 20 || pl.x0 > right + 20) continue;
      drawPlatform(ctx, pl, bottom + 20);
      if (pl.kind === "checkpoint") drawFlag(ctx, pl.flagX, pl.top, session.respawnIndex >= pl.index);
      if (pl.kind === "goal") drawGoal(ctx, pl.goalX, pl.top - L.FIG_R);
    }

    // Figur: im Ziel wird sie zum Quadrat (wie in Maze), sonst Kugel mit Blick in Flugrichtung
    const fig = session.figureAt(now);
    const slope = session.slopeAt();
    const body = session.finishedAt != null ? goalBody(L.FIG_R, now - session.finishedAt) : null;
    drawPlayer(ctx, fig.x, fig.y, L.FIG_R, slope, deform(v.squash, now, slope), body, v.skin, now);

    // Erschöpfung: kleine Leiste unter der Figur, läuft ab - leer = man kann wieder
    const tired = session.cooldownLeft(now);
    if (tired > 0 && session.mode !== "done") drawCooldown(ctx, fig.x, fig.y + L.FIG_R + 8, tired);

    // Effekte und Fortschritt in Bildschirm-Pixeln
    ctx.setTransform(pr, 0, 0, pr, 0, 0);
    const toScreen = (wx, wy) => [(wx - cam.x) * s + v.shake.x, (wy - cam.y) * s + v.shake.y];
    v.effects.render(ctx, toScreen, { w, h });
    drawProgress(ctx, session, w);

    if (v.flash > 0) {
      ctx.fillStyle = hexToRgba(DANGER, 0.28 * v.flash);
      ctx.fillRect(0, 0, w, h);
    }
  },
};

// ---------- Punkte ----------

// Ring mit Symbol: Punkt = normaler Sprung, Pfeil = hoher Sprung, Strich = flacher Hüpfer,
// bewegte Punkte haben zusätzlich ihre gepunktete Schiene.
function drawPoint(ctx, x, y, kind) {
  const r = SL.LEAP.POINT_R;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = CREAM;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = INK;
  ctx.stroke();

  ctx.fillStyle = INK;
  ctx.strokeStyle = INK;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = 3;
  if (kind === "high") {
    ctx.beginPath();
    ctx.moveTo(x - 6, y + 3);
    ctx.lineTo(x, y - 4);
    ctx.lineTo(x + 6, y + 3);
    ctx.stroke();
  } else if (kind === "hop") {
    ctx.beginPath();
    ctx.moveTo(x - 6, y);
    ctx.lineTo(x + 6, y);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.arc(x, y, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

// Schon benutzt: kurz dunkel aufploppen, danach nur noch ein blasser Ring
function drawUsedPoint(ctx, x, y, hitAt, now) {
  const r = SL.LEAP.POINT_R;
  const t = hitAt != null ? (now - hitAt) / HIT_MS : 1;
  if (t < 1) {
    ctx.globalAlpha = 1 - t;
    ctx.beginPath();
    ctx.arc(x, y, r * (1 + 0.35 * t), 0, Math.PI * 2);
    ctx.fillStyle = INK;
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.lineWidth = 2;
  ctx.strokeStyle = SOFT;
  ctx.stroke();
}

// Annäherungs-Ring: zieht sich zusammen und liegt genau dann auf dem Punkt, wenn die Figur in der
// Mitte ist - dann drücken
function drawGuide(ctx, x, y, msLeft, px) {
  const r = SL.LEAP.POINT_R;
  const k = Math.max(0, msLeft) / GUIDE_MS; // 1 weit weg, 0 = jetzt
  ctx.globalAlpha = Math.min(1, (1 - k) * 1.6);
  ctx.beginPath();
  ctx.arc(x, y, r + 4 + k * r * 1.5, 0, Math.PI * 2);
  ctx.lineWidth = Math.max(2 * px, 2);
  ctx.strokeStyle = DIM;
  ctx.stroke();
  ctx.globalAlpha = 1;
}

// ---------- Land ----------

// Block von der Oberkante bis unter den Bildrand. Mit Schanze: Oberfläche steigt am Ende als
// Parabel an (dieselbe Form, der die Figur folgt).
function drawPlatform(ctx, pl, yBottom) {
  const { RAMP_W, RAMP_H } = SL.LEAP;
  const r = 6;
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.moveTo(pl.x0, yBottom);
  ctx.lineTo(pl.x0, pl.top + r);
  ctx.quadraticCurveTo(pl.x0, pl.top, pl.x0 + r, pl.top);
  if (pl.ramp) {
    const rx = pl.x1 - RAMP_W;
    ctx.lineTo(rx, pl.top);
    for (let i = 1; i <= 12; i++) {
      const u = i / 12;
      ctx.lineTo(rx + RAMP_W * u, pl.top - RAMP_H * u * u);
    }
    ctx.lineTo(pl.x1, yBottom);
  } else {
    ctx.lineTo(pl.x1 - r, pl.top);
    ctx.quadraticCurveTo(pl.x1, pl.top, pl.x1, pl.top + r);
    ctx.lineTo(pl.x1, yBottom);
  }
  ctx.closePath();
  ctx.fill();
}

// Checkpoint-Fahne auf der Plattform: offen (Umriss) = noch nicht erreicht, gefüllt = erreicht
function drawFlag(ctx, x, groundY, reached) {
  const poleTop = groundY - 34;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = INK;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x, groundY);
  ctx.lineTo(x, poleTop);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x, poleTop);
  ctx.lineTo(x + 18, poleTop + 7);
  ctx.lineTo(x, poleTop + 14);
  ctx.closePath();
  ctx.fillStyle = reached ? INK : CREAM;
  ctx.fill();
  ctx.stroke();
}

// Ziel: schlichter Quadrat-Rahmen wie in Maze, auf der Zielplattform
function drawGoal(ctx, x, y) {
  const half = SL.LEAP.FIG_R * GOAL_HALF;
  ctx.lineWidth = 3;
  ctx.strokeStyle = INK;
  ctx.strokeRect(x - half, y - half, half * 2, half * 2);
}

// ---------- Figur ----------

// Streckung/Stauchung: kurz nach dem Absprung in Flugrichtung gestreckt, bei der Landung gestaucht
function deform(squash, now, slope) {
  if (!squash) return null;
  const t = (now - squash.at) / 140;
  if (t >= 1 || t < 0) return null;
  const k = (1 - t) * (squash.kind === "land" ? 0.28 : 0.22);
  return { kind: squash.kind, k, angle: Math.atan(slope) };
}

// Ziel-Verwandlung wie in Maze: die Kugel wächst zum Quadrat, das den Rahmen ausfüllt
const GOAL_MORPH_MS = 360;
function goalBody(radius, ms) {
  const t = Math.min(1, Math.max(0, ms / GOAL_MORPH_MS));
  const c1 = 1.4, c3 = c1 + 1;
  const m = 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  const corner = radius * 0.15;
  const half = radius * GOAL_HALF + 1.5 + corner * 0.3;
  return { half: radius + (half - radius) * m, corner: radius + (corner - radius) * Math.min(1, m) };
}

// Körper im Skin-Muster + Augen kommen aus shared/js/cosmetics-draw.js, wie im Shop. Die Pupillen
// schauen in Flugrichtung (Steigung -> Vektor).
function drawPlayer(ctx, x, y, radius, slope, def, body, skin, now) {
  ctx.save();
  if (def) {
    ctx.translate(x, y);
    if (def.kind === "land") {
      ctx.translate(0, radius);
      ctx.scale(1 + def.k, 1 - def.k);
      ctx.translate(0, -radius);
    } else {
      ctx.rotate(def.angle);
      ctx.scale(1 + def.k, 1 - def.k * 0.6);
      ctx.rotate(-def.angle);
    }
    ctx.translate(-x, -y);
  }
  const len = Math.hypot(1, slope);
  SL.CosmeticsDraw.drawFigure(ctx, x, y, radius, skin, { x: 1 / len, y: slope / len }, now, body);
  ctx.restore();
}

function drawCooldown(ctx, x, y, left) {
  const w = 30, h = 5;
  ctx.globalAlpha = Math.min(1, left * 4);
  ctx.fillStyle = SOFT;
  roundRect(ctx, x - w / 2, y, w, h, h / 2);
  ctx.fill();
  ctx.fillStyle = INK;
  roundRect(ctx, x - w / 2, y, w * left, h, h / 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

// ---------- Bildschirm ----------

// Fortschritt oben im Spielfeld: dünne Linie vom Start bis zum Ziel, Checkpoints als Striche.
// Endlos gibt es kein Ziel - dort reicht die Linie vom letzten bis zum nächsten Checkpoint.
function drawProgress(ctx, session, w) {
  const { platforms, endless } = session.course;
  let { startX, goalX } = session.course;
  if (endless) {
    startX = platforms[session.respawnIndex].spawnX;
    goalX = platforms[session.respawnIndex + 1].x0;
  }
  const x0 = 14, x1 = w - 14, y = 12;
  const at = (x) => x0 + (x1 - x0) * Math.max(0, Math.min(1, (x - startX) / (goalX - startX)));
  ctx.lineCap = "round";
  ctx.lineWidth = 3;
  ctx.strokeStyle = SOFT;
  ctx.beginPath();
  ctx.moveTo(x0, y);
  ctx.lineTo(x1, y);
  ctx.stroke();
  ctx.strokeStyle = INK;
  ctx.beginPath();
  ctx.moveTo(x0, y);
  ctx.lineTo(at(session.fig.x), y);
  ctx.stroke();
  for (const pl of platforms) {
    if (endless || pl.kind !== "checkpoint") continue;
    const x = at(pl.x0);
    ctx.fillStyle = session.respawnIndex >= pl.index ? INK : SOFT;
    ctx.fillRect(x - 1.5, y - 5, 3, 10);
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, Math.max(0, w), h, r);
  else ctx.rect(x, y, Math.max(0, w), h);
}

function hexToRgba(hex, alpha) {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
