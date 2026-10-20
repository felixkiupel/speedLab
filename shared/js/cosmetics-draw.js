// Zeichnet Skins und Spuren (Katalog: cosmetics.js) - gemeinsam für den Shop und die Spiele, damit
// der Shop exakt zeigt, was man im Spiel bekommt. Gezeichnet wird in den Koordinaten des Aufrufers.
//
// Jedes Aussehen ist ein Eintrag in einer der beiden Listen unten:
//   SL.SkinPatterns[name]  = { draw, css, ring?, outline?, animated? }   (Muster für Skins)
//   SL.TrailStyles[name]   = { draw, animated? }                          (Stile für Spuren)
// Ein neues Muster / ein neuer Stil = ein neuer Eintrag hier, danach kann ihn jeder Katalog-Eintrag
// in cosmetics.js benutzen. Sonst muss nirgends etwas angepasst werden.
//
// Für die Spiele:
//   SL.CosmeticsDraw.drawFigure(ctx, x, y, radius, skin, look, time, body?)  Körper + Augen
//   SL.CosmeticsDraw.fillBody(ctx, x, y, radius, skin, time, body?)          nur der Körper
//   SL.CosmeticsDraw.drawTrail(ctx, points, cell, trail, skin, time)         Spur
//   SL.CosmeticsDraw.applyMascotLook(skin)   Maskottchen (Pause/Ergebnis) per CSS im Skin
//   look = Blickrichtung {x, y} (Länge 1) oder null; body = Form im Ziel { half, corner } statt Kreis
window.SL = window.SL || {};

(function () {
  const INK = "#2b2420";
  const CREAM = "#fbf7f0";
  const GRID_LINE = "#e8e0d2";
  const TRAIL_GRAY = "#c7bcaa";

  function hexToRgba(hex, alpha) {
    const h = hex.replace("#", "");
    const r = parseInt(h.substring(0, 2), 16);
    const g = parseInt(h.substring(2, 4), 16);
    const b = parseInt(h.substring(4, 6), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  function circle(ctx, x, y, r) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // ---------- Muster für Skins ----------
  // draw(ctx, x, y, r, colors, time, shape): malt in die Körperform, auf die schon geclippt ist und
  //   die schon in colors[0] gefüllt ist. r = halbe Breite der Form, shape() legt ihren Pfad neu an.
  //   Die Augen kommen danach obendrauf (etwas über der Mitte).
  // css(colors): CSS-Hintergrund für die Maskottchen im Fenster (Pause, Ergebnis ...)
  // ring(colors): CSS-Rand der Maskottchen (optional), outline: false = keine dunkle Kontur
  //   (das Muster ist selbst ein Rand), animated: true = bewegt sich mit der Zeit
  SL.SkinPatterns = {
    // Einfarbig - die Grundfüllung reicht
    solid: {
      draw() {},
      css: ([c0]) => c0,
    },

    // Morgenrot (erstes Daily): Himmel von Rosa zu Gold, unten geht die Sonne auf
    sunrise: {
      draw(ctx, x, y, r, [sky, horizon, sun]) {
        const g = ctx.createLinearGradient(x, y - r, x, y + r);
        g.addColorStop(0, sky);
        g.addColorStop(0.78, horizon);
        ctx.fillStyle = g;
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
        ctx.fillStyle = hexToRgba(sun, 0.45);
        circle(ctx, x, y + r * 0.66, r * 0.58);
        ctx.fillStyle = sun;
        circle(ctx, x, y + r * 0.66, r * 0.4);
        // zwei feine Lichtstreifen über dem Horizont
        ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
        ctx.fillRect(x - r, y + r * 0.16, r * 2, r * 0.06);
        ctx.fillRect(x - r, y + r * 0.3, r * 2, r * 0.04);
      },
      css: ([sky, horizon, sun]) => `radial-gradient(circle at 50% 92%, ${sun} 0 24%, transparent 26%), linear-gradient(180deg, ${sky}, ${horizon} 78%)`,
    },

    // Frost (Drift-Ideallösung): eisiger Glanz mit einem Eiskristall
    frost: {
      draw(ctx, x, y, r, [base, light, deep]) {
        const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.05, x, y, r * 1.05);
        g.addColorStop(0, light);
        g.addColorStop(0.45, base);
        g.addColorStop(1, deep);
        ctx.fillStyle = g;
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
        ctx.strokeStyle = "rgba(255, 255, 255, 0.7)";
        ctx.lineWidth = Math.max(1, r * 0.07);
        ctx.lineCap = "round";
        ctx.beginPath();
        for (let k = 0; k < 6; k++) {
          const a = (k * Math.PI) / 3 + Math.PI / 6;
          const dx = Math.cos(a), dy = Math.sin(a);
          ctx.moveTo(x, y);
          ctx.lineTo(x + dx * r * 0.9, y + dy * r * 0.9);
          // kleine Äste in der Mitte jedes Arms
          for (const side of [-1, 1]) {
            const b = a + side * 0.75;
            ctx.moveTo(x + dx * r * 0.52, y + dy * r * 0.52);
            ctx.lineTo(x + dx * r * 0.52 + Math.cos(b) * r * 0.22, y + dy * r * 0.52 + Math.sin(b) * r * 0.22);
          }
        }
        ctx.stroke();
      },
      css: ([base, light, deep]) => `radial-gradient(circle at 35% 30%, ${light}, ${base} 45%, ${deep})`,
    },

    // Flamme (7 Tage Serie): Glut von unten, darüber züngeln drei Flammen
    flame: {
      animated: true,
      draw(ctx, x, y, r, [deep, orange, amber, core], time) {
        const t = time || 0;
        const flicker = Math.sin(t * 0.009) * 0.06 + Math.sin(t * 0.017 + 1) * 0.04;
        const g = ctx.createRadialGradient(x, y + r * (0.6 + flicker), r * 0.05, x, y + r * 0.2, r * 1.3);
        g.addColorStop(0, core);
        g.addColorStop(0.3, amber);
        g.addColorStop(0.62, orange);
        g.addColorStop(1, deep);
        ctx.fillStyle = g;
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
        ctx.fillStyle = hexToRgba(amber, 0.55);
        for (const k of [-0.5, 0, 0.5]) {
          const h = r * (0.95 + 0.2 * Math.sin(t * 0.012 + k * 5));
          const sway = r * 0.08 * Math.sin(t * 0.008 + k * 3);
          const w = r * 0.32;
          const bx = x + k * r, tipX = bx + sway, tipY = y + r - h;
          ctx.beginPath();
          ctx.moveTo(bx - w, y + r);
          ctx.quadraticCurveTo(bx - w * 0.5, tipY + h * 0.4, tipX, tipY);
          ctx.quadraticCurveTo(bx + w * 0.5, tipY + h * 0.4, bx + w, y + r);
          ctx.fill();
        }
      },
      css: ([deep, orange, amber, core]) => `radial-gradient(circle at 50% 85%, ${core}, ${amber} 32%, ${orange} 60%, ${deep})`,
    },

    // Zwilling (zwei Dailys an einem Tag): zwei Hälften, die ineinandergreifen
    twin: {
      draw(ctx, x, y, r, [c0, c1]) {
        ctx.fillStyle = c1;
        ctx.beginPath();
        ctx.arc(x, y, r, -Math.PI / 2, Math.PI / 2);
        ctx.fill();
        circle(ctx, x, y - r / 2, r / 2);
        ctx.fillStyle = c0;
        circle(ctx, x, y + r / 2, r / 2);
        circle(ctx, x, y - r / 2, r * 0.11);
        ctx.fillStyle = c1;
        circle(ctx, x, y + r / 2, r * 0.11);
      },
      css: ([c0, c1]) => `linear-gradient(90deg, ${c0} 50%, ${c1} 50%)`,
    },

    // Blitz (Maze unter 3 Sekunden): gelber Blitz auf Nachtblau
    bolt: {
      draw(ctx, x, y, r, [, yellow]) {
        const BOLT = [[0.32, -1.1], [-0.3, 0.1], [0.05, 0.1], [-0.32, 1.1], [0.36, -0.16], [0.01, -0.16]];
        ctx.fillStyle = yellow;
        ctx.beginPath();
        BOLT.forEach(([px, py], i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, x + px * r, y + py * r));
        ctx.closePath();
        ctx.fill();
      },
      css: ([navy, yellow]) => `linear-gradient(115deg, ${navy} 0 42%, ${yellow} 42% 58%, ${navy} 58%)`,
    },

    // Volltreffer (schweres Leap-Level auf 100 %): Zielscheibe
    target: {
      draw(ctx, x, y, r, [red, cream]) {
        [0.8, 0.6, 0.4, 0.2].forEach((k, i) => {
          ctx.fillStyle = i % 2 ? red : cream;
          circle(ctx, x, y, r * k);
        });
      },
      css: ([red, cream]) => `radial-gradient(circle, ${red} 0 18%, ${cream} 18% 38%, ${red} 38% 58%, ${cream} 58% 78%, ${red} 78%)`,
    },

    // Polarlicht (alle Drift-Level 3 Sterne): Nachthimmel mit zwei wogenden Lichtbändern
    aurora: {
      animated: true,
      draw(ctx, x, y, r, [, green, violet], time) {
        const t = time || 0;
        ctx.fillStyle = "rgba(251, 247, 240, 0.8)";
        for (const [sx, sy, s] of [[-0.5, -0.6, 0.05], [0.45, -0.7, 0.04], [0.15, -0.85, 0.035], [-0.75, -0.2, 0.035]]) {
          circle(ctx, x + sx * r, y + sy * r, Math.max(0.6, r * s));
        }
        ctx.lineCap = "round";
        for (const [color, yBase, speed, offset] of [[green, -0.05, 0.0016, 0], [violet, 0.4, 0.0011, 2]]) {
          ctx.beginPath();
          for (let i = 0; i <= 20; i++) {
            const u = i / 20;
            const px = x - r + u * r * 2;
            const py = y + r * yBase + Math.sin(u * Math.PI * 2 + t * speed + offset) * r * 0.22;
            if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
          }
          ctx.strokeStyle = hexToRgba(color, 0.45);
          ctx.lineWidth = r * 0.4;
          ctx.stroke();
          ctx.strokeStyle = hexToRgba(color, 0.9);
          ctx.lineWidth = r * 0.1;
          ctx.stroke();
        }
      },
      css: ([night, green, violet]) => `linear-gradient(165deg, transparent 25%, ${hexToRgba(green, 0.6)} 55%, ${hexToRgba(violet, 0.75)} 85%), ${night}`,
    },

    // Goldlabyrinth (alle Maze-Level 3 Sterne): goldene Gänge auf Dunkel
    maze: {
      draw(ctx, x, y, r, [, gold]) {
        // Wände im 6×6-Raster (0..6), passend auf die Form gestreckt
        const WALLS = [[0, 1, 4, 1], [5, 0, 5, 3], [1, 1, 1, 4], [2, 2, 4, 2], [4, 2, 4, 4], [2, 2, 2, 5],
          [2, 5, 6, 5], [3, 3, 3, 4], [0, 5, 1, 5], [5, 4, 6, 4], [3, 0, 3, 1], [1, 6, 1, 5]];
        const at = (v) => (v / 3 - 1) * r * 1.05;
        ctx.strokeStyle = gold;
        ctx.lineWidth = r * 0.12;
        ctx.lineCap = "square";
        ctx.beginPath();
        for (const [x0, y0, x1, y1] of WALLS) {
          ctx.moveTo(x + at(x0), y + at(y0));
          ctx.lineTo(x + at(x1), y + at(y1));
        }
        ctx.stroke();
      },
      css: ([ink, gold]) => `repeating-linear-gradient(0deg, transparent 0 8px, ${gold} 8px 10px), repeating-linear-gradient(90deg, ${ink} 0 8px, ${gold} 8px 10px)`,
      ring: ([, gold]) => `inset 0 0 0 3px ${gold}`,
    },

    // Holo (alle Leap-Level auf 100 %): bläuliches Silber, über das ein schillernder Schein zieht -
    // wie die Sterne eines 100-%-Levels
    holo: {
      animated: true,
      draw(ctx, x, y, r, [light, mid, deep], time) {
        const g = ctx.createLinearGradient(x - r, y - r, x + r, y + r);
        g.addColorStop(0, light);
        g.addColorStop(0.5, mid);
        g.addColorStop(1, deep);
        ctx.fillStyle = g;
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
        // Schein auf einem schräg gedrehten Streifen, läuft von links nach rechts durch (mit Pause)
        const phase = ((time || 0) * 0.0003) % 1;
        const bx = -1.6 * r + phase * 4.2 * r;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(-Math.PI / 5);
        const band = ctx.createLinearGradient(bx - r * 0.5, 0, bx + r * 0.5, 0);
        band.addColorStop(0, "rgba(255, 255, 255, 0)");
        band.addColorStop(0.3, "rgba(233, 242, 255, 0.85)");
        band.addColorStop(0.5, "#ffffff");
        band.addColorStop(0.65, "rgba(228, 221, 255, 0.9)");
        band.addColorStop(0.8, "rgba(209, 241, 235, 0.85)");
        band.addColorStop(1, "rgba(209, 241, 235, 0)");
        ctx.fillStyle = band;
        ctx.fillRect(bx - r * 0.5, -r * 1.6, r, r * 3.2);
        ctx.restore();
      },
      css: () => "linear-gradient(135deg, #ffffff, #e4ddff 35%, #d1f1eb 55%, #a6b3cb)",
    },
  };

  // ---------- Stile für Spuren ----------
  // draw(ctx, points, cell, tint, time): points = [{x, y, seed}], ältester zuerst, der letzte liegt
  //   unter der Figur. cell = Größe eines Felds (Maßstab), tint = Akzentfarbe des Skins.
  // Die meisten Stile malen pro Punkt etwas - perPoint gibt ihnen dafür a = 0..1 (1 = neuester),
  // damit alle gleichmäßig ausblenden.
  const perPoint = (paint) => function draw(ctx, points, cell, tint, time) {
    points.forEach((p, i) => paint(ctx, p, (i + 1) / points.length, cell, tint, time || 0, i));
  };

  SL.TrailStyles = {
    // Dezente graue Punkte (Standard)
    dots: {
      draw: perPoint((ctx, p, a, cell) => {
        ctx.fillStyle = hexToRgba(TRAIL_GRAY, 0.5 * a);
        circle(ctx, p.x, p.y, cell * 0.18);
      }),
    },

    // Zielringe (einfaches Leap-Level auf 100 %): kleine Ringe wie die Sprungpunkte, in Skin-Farbe
    rings: {
      draw: perPoint((ctx, p, a, cell, tint) => {
        ctx.strokeStyle = hexToRgba(tint, 0.8 * a);
        ctx.lineWidth = Math.max(1, cell * 0.05);
        ctx.beginPath();
        ctx.arc(p.x, p.y, cell * (0.08 + 0.1 * a), 0, Math.PI * 2);
        ctx.stroke();
      }),
    },

    // Ariadnefaden (schweres Maze mit 3 Sternen): ein roter Faden, der locker durchhängt
    thread: {
      draw(ctx, points, cell) {
        ctx.lineCap = "round";
        ctx.lineWidth = Math.max(1.5, cell * 0.06);
        for (let i = 1; i < points.length; i++) {
          const p0 = points[i - 1], p1 = points[i];
          const a = (i + 1) / points.length;
          const len = Math.hypot(p1.x - p0.x, p1.y - p0.y) || 1;
          const sag = Math.sin(i * 1.7) * cell * 0.12;
          ctx.strokeStyle = `rgba(214, 69, 61, ${0.9 * a})`;
          ctx.beginPath();
          ctx.moveTo(p0.x, p0.y);
          ctx.quadraticCurveTo((p0.x + p1.x) / 2 - ((p1.y - p0.y) / len) * sag, (p0.y + p1.y) / 2 + ((p1.x - p0.x) / len) * sag, p1.x, p1.y);
          ctx.stroke();
        }
      },
    },

    // Fahnen (100 Checkpoints im Endlosmodus): kleine Checkpoint-Fahnen an jedem zweiten Punkt
    flags: {
      draw: perPoint((ctx, p, a, cell, tint, t, i) => {
        if (i % 2) return;
        const s = cell * (0.8 + 0.45 * a);
        ctx.strokeStyle = hexToRgba(INK, 0.8 * a);
        ctx.lineWidth = Math.max(1, s * 0.06);
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(p.x - s * 0.08, p.y + s * 0.22);
        ctx.lineTo(p.x - s * 0.08, p.y - s * 0.24);
        ctx.stroke();
        ctx.fillStyle = hexToRgba(tint, 0.9 * a);
        ctx.beginPath();
        ctx.moveTo(p.x - s * 0.08, p.y - s * 0.24);
        ctx.lineTo(p.x + s * 0.2, p.y - s * 0.14);
        ctx.lineTo(p.x - s * 0.08, p.y - s * 0.04);
        ctx.closePath();
        ctx.fill();
      }),
    },

    // Komet (alle Leap-Level 3 Sterne): leuchtender Schweif mit funkelnden Splittern
    comet: {
      animated: true,
      draw: perPoint((ctx, p, a, cell, tint, t) => {
        const rad = cell * (0.12 + 0.3 * a);
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, rad);
        g.addColorStop(0, `rgba(255, 255, 255, ${a})`);
        g.addColorStop(0.35, `rgba(124, 200, 255, ${0.85 * a})`);
        g.addColorStop(0.7, `rgba(70, 140, 230, ${0.35 * a})`);
        g.addColorStop(1, "rgba(70, 140, 230, 0)");
        ctx.fillStyle = g;
        circle(ctx, p.x, p.y, rad);
        // funkelnder Splitter neben dem Schweif
        const twinkle = 0.5 + 0.5 * Math.sin(t * 0.012 + p.seed);
        ctx.fillStyle = `rgba(90, 160, 240, ${0.9 * a * twinkle})`;
        circle(ctx, p.x + Math.cos(p.seed) * cell * 0.3, p.y + Math.sin(p.seed * 1.3) * cell * 0.3, cell * 0.05);
      }),
    },

    // Phönix (30 Tage Serie): Flammen, die aufsteigen und flackern
    phoenix: {
      animated: true,
      draw: perPoint((ctx, p, a, cell, tint, t) => {
        const flicker = 1 + 0.18 * Math.sin(t * 0.02 + p.seed);
        const w = cell * (0.1 + 0.12 * a);
        const h = w * 2.6 * flicker;
        const px = p.x + Math.sin(t * 0.006 + p.seed) * cell * 0.04;
        const py = p.y - (1 - a) * cell * 0.3; // ältere Flammen sind schon etwas aufgestiegen
        const g = ctx.createRadialGradient(px, py + w * 0.3, 0, px, py, h);
        g.addColorStop(0, `rgba(255, 243, 176, ${a})`);
        g.addColorStop(0.45, `rgba(255, 155, 43, ${0.9 * a})`);
        g.addColorStop(1, `rgba(232, 52, 28, ${0.7 * a})`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(px, py - h);
        ctx.bezierCurveTo(px + w, py - h * 0.3, px + w, py + w, px, py + w);
        ctx.bezierCurveTo(px - w, py + w, px - w, py - h * 0.3, px, py - h);
        ctx.fill();
      }),
    },
  };

  // Unbekannte Namen (Tippfehler im Katalog) fallen auf den Standard zurück statt abzustürzen
  const patternOf = (skin) => SL.SkinPatterns[skin.pattern] || SL.SkinPatterns.solid;
  const styleOf = (trail) => SL.TrailStyles[trail.style] || SL.TrailStyles.dots;

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

  // Körper im Muster des Skins: Grundfarbe, Muster auf die Form geclippt, dann eine feine dunkle
  // Kontur, damit helle Skins auf hellem Boden nicht verschwimmen
  function fillBody(ctx, x, y, radius, skin, time, body = null) {
    const pattern = patternOf(skin);
    const shape = () => bodyPath(ctx, x, y, radius, body);
    ctx.save();
    shape();
    ctx.fillStyle = skin.colors[0];
    ctx.fill();
    ctx.clip();
    pattern.draw(ctx, x, y, body ? body.half : radius, skin.colors, time, shape);
    ctx.restore();

    if (pattern.outline !== false) {
      shape();
      ctx.lineWidth = Math.max(1, radius * 0.07);
      ctx.strokeStyle = "rgba(43, 36, 32, 0.55)";
      ctx.stroke();
    }
  }

  // Zwei einfache Augen, die Pupillen rücken in Blickrichtung. Die feine Kontur hält das Augenweiß
  // auch auf hellen Skins (Geist, Zebra) sichtbar.
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

  function drawFigure(ctx, x, y, radius, skin, look, time, body = null) {
    fillBody(ctx, x, y, radius, skin, time, body);
    drawFace(ctx, x, y, radius, look);
  }

  // Farbige Spuren nehmen die Akzentfarbe des Skins, sonst seine Hauptfarbe
  function drawTrail(ctx, points, cell, trail, skin, time) {
    if (!points.length) return;
    styleOf(trail).draw(ctx, points, cell, skin.accent || skin.colors[0], time);
  }

  // Bewegt sich das Item (Shop zeichnet dann laufend neu)?
  function isAnimated(cos) {
    return Boolean(cos.type === "skin" ? patternOf(cos).animated : styleOf(cos).animated);
  }

  // Maskottchen in den Fenstern (Pause, Ergebnis ...) tragen den Skin als CSS - base.css liest
  // --player-bg und --player-ring
  function applyMascotLook(skin) {
    const pattern = patternOf(skin);
    const root = document.documentElement.style;
    root.setProperty("--player-bg", pattern.css(skin.colors));
    root.setProperty("--player-ring", pattern.ring ? pattern.ring(skin.colors) : "inset 0 0 0 2px rgba(43, 36, 32, 0.45)");
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

  function drawScenePreview(canvas, skin, trail, time) {
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

    const points = [];
    for (let i = 0; i < n; i++) {
      points.push({ x: playerX - (n - 1 - i) * cell, y, seed: i * 17 + 3 });
    }
    drawTrail(ctx, points, cell, trail, skin, time);
    drawFigure(ctx, playerX, y, cell * 0.3, skin, { x: 1, y: 0 }, time);
  }

  function drawSkinPreview(canvas, skin, time = 0) {
    const { ctx, w, h } = prepareCanvas(canvas);
    drawFigure(ctx, w / 2, h / 2, Math.min(w, h) * 0.36, skin, null, time);
  }

  SL.CosmeticsDraw = { fillBody, drawFigure, drawTrail, isAnimated, applyMascotLook, drawSkinPreview, drawScenePreview };
})();
