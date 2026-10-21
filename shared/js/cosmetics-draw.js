// Zeichnet die Figur und die Spuren (Katalog: cosmetics.js) - gemeinsam für den Shop und alle Spiele,
// damit der Shop exakt zeigt, was man im Spiel bekommt. Gezeichnet wird in den Koordinaten des
// Aufrufers.
//
// Für die Spiele:
//   SL.CosmeticsDraw.drawFigure(ctx, x, y, radius, look, body?)   Kugel mit Augen
//   SL.CosmeticsDraw.drawTrail(ctx, points, radius, trail)         Spur (radius = Radius der Figur)
//   SL.CosmeticsDraw.drawStreak(ctx, points, halfWidth, maxLen?)   der Schweif aus Drift
//   look = Blickrichtung {x, y} (Länge 1) oder null; body = Form im Ziel { half, corner } statt Kreis
window.SL = window.SL || {};

(function () {
  const INK = "#2b2420";
  const CREAM = "#fbf7f0";
  const GRID_LINE = "#e8e0d2";
  const TRAIL_GRAY = "199, 188, 170"; // #c7bcaa als RGB für rgba()

  function circle(ctx, x, y, r) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // ---------- Figur ----------

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

  // Zwei einfache Augen, die Pupillen rücken in Blickrichtung
  function drawFace(ctx, cx, cy, radius, look) {
    const shiftX = look ? look.x * radius * 0.14 : 0;
    const shiftY = look ? look.y * radius * 0.14 : 0;
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

  function drawFigure(ctx, x, y, radius, look, body = null) {
    bodyPath(ctx, x, y, radius, body);
    ctx.fillStyle = INK;
    ctx.fill();
    drawFace(ctx, x, y, radius, look);
  }

  // ---------- Spuren ----------

  // Schweif aus Drift: vorne fast so breit wie die Figur, hinten spitz und durchsichtig. Folgt dem
  // Weg durch points (ältester zuerst, der letzte liegt unter der Figur), höchstens maxLen lang.
  // Die Form ist eine quadratische Kurve: bleibt lange breit und läuft dann spitz aus.
  function drawStreak(ctx, points, halfWidth, maxLen = Infinity) {
    if (points.length < 2 || halfWidth <= 0) return;
    // Weg von der Spitze zurück, dist = Abstand jedes Knicks von der Spitze
    const path = [points[points.length - 1]];
    const dist = [0];
    for (let i = points.length - 2; i >= 0 && dist[dist.length - 1] < maxLen; i--) {
      const a = path[path.length - 1], b = points[i];
      const d = Math.hypot(b.x - a.x, b.y - a.y);
      if (d < 0.01) continue;
      const k = Math.min(1, (maxLen - dist[dist.length - 1]) / d);
      path.push({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });
      dist.push(dist[dist.length - 1] + d * k);
    }
    const len = dist[dist.length - 1];
    if (len < 1) return;

    // Punkt im Abstand s hinter der Spitze + Richtung des Wegs dort (zur Spitze hin, Länge 1)
    function at(s) {
      let j = 1;
      while (j < dist.length - 1 && dist[j] < s) j++;
      const a = path[j - 1], b = path[j];
      const seg = dist[j] - dist[j - 1];
      const k = Math.min(1, Math.max(0, (s - dist[j - 1]) / seg));
      return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, dx: (a.x - b.x) / seg, dy: (a.y - b.y) / seg };
    }

    const left = [], right = [];
    const N = 14;
    for (let n = 0; n <= N; n++) {
      const t = n / N; // 0 = Ende, 1 = Spitze
      const p = at(len - len * (1.1 * t - 0.1 * t * t));
      const w = halfWidth * (2 * t - t * t);
      left.push([p.x - p.dy * w, p.y + p.dx * w]);
      right.push([p.x + p.dy * w, p.y - p.dx * w]);
    }
    const tail = path[path.length - 1], head = path[0];
    const g = ctx.createLinearGradient(tail.x, tail.y, head.x, head.y);
    g.addColorStop(0, "rgba(43,36,32,0)");
    g.addColorStop(1, "rgba(43,36,32,0.2)");
    ctx.fillStyle = g;
    ctx.beginPath();
    left.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i][0], right[i][1]);
    ctx.closePath();
    ctx.fill();
  }

  // draw(ctx, points, r): points = [{x, y}], ältester zuerst, der letzte liegt unter der Figur.
  // r = Radius der Figur - alle Spuren richten ihre Größe danach, so passen sie in jedes Spiel.
  // Ausblenden nach Alter: a = 0..1 (1 = neuester Punkt).
  SL.TrailStyles = {
    // Maze: graue Punkte auf den zuletzt besuchten Feldern. Liegen die Punkte dichter (Leap merkt
    // sich alle paar ms die Position), bleibt etwa ein Feld Abstand zwischen zwei Punkten.
    dots: {
      draw(ctx, points, r) {
        let last = null;
        for (let i = points.length - 1; i >= 0; i--) {
          const p = points[i];
          if (last && Math.hypot(p.x - last.x, p.y - last.y) < r * 2.5) continue;
          last = p;
          ctx.fillStyle = `rgba(${TRAIL_GRAY}, ${0.5 * ((i + 1) / points.length)})`;
          circle(ctx, p.x, p.y, r * 0.6);
        }
      },
    },

    // Drift: der Schweif, etwa zweieinhalb Drift-Felder lang
    streak: {
      draw(ctx, points, r) {
        drawStreak(ctx, points, r * 0.85, r * 7.5);
      },
    },

    // Leap: graue Punkte, die zur Figur hin größer werden
    growing: {
      draw(ctx, points, r) {
        points.forEach((p, i) => {
          const a = (i + 1) / points.length;
          ctx.fillStyle = `rgba(${TRAIL_GRAY}, ${0.55 * a})`;
          circle(ctx, p.x, p.y, r * (0.25 + 0.2 * a));
        });
      },
    },
  };

  function drawTrail(ctx, points, radius, trail) {
    if (!points.length || !trail) return;
    (SL.TrailStyles[trail.style] || SL.TrailStyles.dots).draw(ctx, points, radius);
  }

  // ---------- Shop-Vorschauen ----------

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

  // Mini-Korridor (max. 40px pro Feld): ein Weg-Streifen mit schmalen Wandkanten oben/unten, die
  // Spur läuft von links auf die Figur zu. Spur + Figur stehen zusammen mittig.
  const TRAIL_PREVIEW_LENGTH = 6;

  function drawScenePreview(canvas, trail) {
    const { ctx, w, h } = prepareCanvas(canvas);
    const n = TRAIL_PREVIEW_LENGTH;
    const cell = Math.min(w / (n + 0.5), h / 1.7, 40);
    const pathTop = (h - cell) / 2;
    const wall = Math.min(cell * 0.5, pathTop);
    const playerX = w / 2 + ((n - 1) * cell) / 2;
    const y = pathTop + cell / 2;

    ctx.fillStyle = INK;
    ctx.fillRect(0, pathTop - wall, w, wall);
    ctx.fillRect(0, pathTop + cell, w, wall);
    ctx.fillStyle = CREAM;
    ctx.fillRect(0, pathTop, w, cell);
    // Gitterlinien auf die Zellgrenzen rund um die Spur ausrichten
    ctx.strokeStyle = GRID_LINE;
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

    const radius = cell * 0.3;
    const points = [];
    for (let i = 0; i < n; i++) points.push({ x: playerX - (n - 1 - i) * cell, y });
    drawTrail(ctx, points, radius, trail);
    drawFigure(ctx, playerX, y, radius, { x: 1, y: 0 });
  }

  function drawSkinPreview(canvas) {
    const { ctx, w, h } = prepareCanvas(canvas);
    drawFigure(ctx, w / 2, h / 2, Math.min(w, h) * 0.36, null);
  }

  SL.CosmeticsDraw = { drawFigure, drawTrail, drawStreak, drawSkinPreview, drawScenePreview };
})();
