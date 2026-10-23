// Zeichnet den Kampf im Stil eines alten Automaten: dunkler Bildschirm mit hellen Figuren,
// Pixel-Schrift, Lebensleisten oben, Scanlines. Welt = 400 × 400 Einheiten, skaliert auf die
// Canvas-Größe. Oben das Publikum und der Boss mit zwei Fäusten, unten die Figur auf drei Bahnen.
//
// Eigener Zustand (pro Kampf, reset()): Fäuste folgen ihren Zielpunkten weich, Leisten laufen
// verzögert nach, dazu Ansagen ("RUNDE 1"), kleine Einblendungen, Treffer-Funken, Blitz und Zoom.
// Diese Effekte laufen auf der Uhr des Renderers (dt von ui.js: steht in der Pause, langsam in der
// Zeitlupe) - Fäuste und Boss auf der Spielzeit, damit sie im Trefferstopp mit einfrieren.
window.SL = window.SL || {};

SL.Renderer = (function () {
  const SCREEN = "#191512";
  const FLOOR = "#211b17";
  const CROWD = "#2a231f";
  const LINE = "#3b332d";
  const ROPE = "#4a403a";
  const GREY = "#85786a";
  const INK = "#2b2420";
  const CREAM = "#fbf7f0";
  const cream = (a) => `rgba(251, 247, 240, ${a})`;

  const WORLD = 400;
  const BOSS = { x: 200, y: 136 };
  const LANE_X = { L: 100, C: 200, R: 300 };
  const PLAYER_Y = 334;
  const PLAYER_R = 24;
  const FIST_R = 21;
  const ZONE_TOP = 252;
  const ZONE_BOTTOM = 390;
  const LANE_HALF = 46;
  const SWEEP = { top: 282, bottom: 330 }; // Fegen trifft in Kopfhöhe - geduckt ist man darunter
  const LUNGE = { jab: 100, upper: 122 };

  // Wohin die Fäuste wollen: Deckung, Ausholen (je Angriff), Ziel des Schlags, offen (hängen tief)
  const GUARD = [{ x: 154, y: 192 }, { x: 246, y: 192 }];
  const OPEN = [{ x: 110, y: 224 }, { x: 290, y: 224 }];
  const WINDUP = {
    F: [{ x: 110, y: 126 }, { x: 290, y: 126 }],
    HL: [{ x: 90, y: 74 }, null],
    HR: [null, { x: 310, y: 74 }],
    S: [{ x: 30, y: 306 }, null],
    D: [{ x: 100, y: 70 }, { x: 300, y: 70 }],
  };
  const STRIKE = {
    F: [{ x: 200, y: 322 }, { x: 200, y: 322 }],
    HL: [{ x: 150, y: 334 }, null],
    HR: [null, { x: 250, y: 334 }],
    S: [{ x: 370, y: 306 }, null],
    D: [{ x: 100, y: 334 }, { x: 300, y: 334 }],
  };
  const HEAVY = { HL: true, HR: true, D: true }; // Hammer-Fäuste werden beim Ausholen größer

  // ---------- Pixel-Schrift (5 × 7) ----------
  // Jede Zeile ein 5-Bit-Muster, links = 16
  const FONT = {
    A: [14, 17, 17, 31, 17, 17, 17], B: [30, 17, 17, 30, 17, 17, 30], C: [14, 17, 16, 16, 16, 17, 14],
    D: [30, 17, 17, 17, 17, 17, 30], E: [31, 16, 16, 30, 16, 16, 31], F: [31, 16, 16, 30, 16, 16, 16],
    G: [14, 17, 16, 23, 17, 17, 15], H: [17, 17, 17, 31, 17, 17, 17], I: [14, 4, 4, 4, 4, 4, 14],
    J: [7, 2, 2, 2, 2, 18, 12], K: [17, 18, 20, 24, 20, 18, 17], L: [16, 16, 16, 16, 16, 16, 31],
    M: [17, 27, 21, 21, 17, 17, 17], N: [17, 25, 21, 19, 17, 17, 17], O: [14, 17, 17, 17, 17, 17, 14],
    P: [30, 17, 17, 30, 16, 16, 16], Q: [14, 17, 17, 17, 21, 18, 13], R: [30, 17, 17, 30, 20, 18, 17],
    S: [15, 16, 16, 14, 1, 1, 30], T: [31, 4, 4, 4, 4, 4, 4], U: [17, 17, 17, 17, 17, 17, 14],
    V: [17, 17, 17, 17, 17, 10, 4], W: [17, 17, 17, 21, 21, 21, 10], X: [17, 17, 10, 4, 10, 17, 17],
    Y: [17, 17, 10, 4, 4, 4, 4], Z: [31, 1, 2, 4, 8, 16, 31],
    Ä: [10, 0, 14, 17, 31, 17, 17], Ö: [10, 0, 14, 17, 17, 17, 14], Ü: [10, 0, 17, 17, 17, 17, 14],
    0: [14, 17, 19, 21, 25, 17, 14], 1: [4, 12, 4, 4, 4, 4, 14], 2: [14, 17, 1, 2, 4, 8, 31],
    3: [31, 2, 4, 2, 1, 17, 14], 4: [2, 6, 10, 18, 31, 2, 2], 5: [31, 16, 30, 1, 1, 17, 14],
    6: [6, 8, 16, 30, 17, 17, 14], 7: [31, 1, 2, 4, 8, 8, 8], 8: [14, 17, 17, 14, 17, 17, 14],
    9: [14, 17, 17, 15, 1, 2, 12],
    "!": [4, 4, 4, 4, 4, 0, 4], ".": [0, 0, 0, 0, 0, 12, 12], ":": [0, 12, 12, 0, 12, 12, 0],
    "-": [0, 0, 0, 31, 0, 0, 0], "+": [0, 4, 4, 31, 4, 4, 0], " ": [0, 0, 0, 0, 0, 0, 0],
  };

  function textPath(ctx, text, left, top, px) {
    let x = left;
    for (const ch of text) {
      (FONT[ch] || FONT[" "]).forEach((bits, row) => {
        for (let col = 0; col < 5; col++) if (bits & (16 >> col)) ctx.rect(x + col * px, top + row * px, px, px);
      });
      x += 6 * px;
    }
  }

  // Text mit dunklem Rand (wie auf alten Automaten). x/y = Mitte bzw. Kante je nach align
  function pixelText(ctx, text, x, y, px, { align = "center", color = CREAM, edge = SCREEN } = {}) {
    const w = (text.length * 6 - 1) * px;
    const left = align === "center" ? x - w / 2 : align === "right" ? x - w : x;
    const top = y - 3.5 * px;
    if (edge) {
      const o = Math.max(1.2, px * 0.5);
      ctx.beginPath();
      for (const [dx, dy] of [[-o, 0], [o, 0], [0, -o], [0, o], [o, o], [-o, o], [o, -o], [-o, -o]]) textPath(ctx, text, left + dx, top + dy, px);
      ctx.fillStyle = edge;
      ctx.fill();
    }
    ctx.beginPath();
    textPath(ctx, text, left, top, px);
    ctx.fillStyle = color;
    ctx.fill();
  }

  // ---------- Zustand pro Kampf ----------

  let fx = null;

  function reset() {
    fx = {
      clock: 0,
      fists: GUARD.map((p) => ({ x: p.x, y: p.y, r: FIST_R, px: p.x, py: p.y })),
      impactAt: -Infinity,
      impactKey: null,
      lagBoss: 1,
      lagPlayer: 1,
      announce: null, // { text, at, dur, px }
      popups: [], // { text, x, y, at }
      sparks: [], // { x, y, size, at }
      flashUntil: 0,
      zoom: 0,
      cheer: 0, // Publikum jubelt nach Treffern
      overlay: null, // Scanlines + Vignette, pro Größe einmal gebaut
      overlayKey: "",
    };
  }

  function announce(text, dur = 900, px = 9) {
    fx.announce = { text, at: fx.clock, dur, px };
  }

  function popup(text, x, y) {
    fx.popups.push({ text, x, y, at: fx.clock });
  }

  function spark(x, y, size = 1) {
    fx.sparks.push({ x, y, size, at: fx.clock });
  }

  function flash(ms = 60) {
    fx.flashUntil = fx.clock + ms;
  }

  function zoom(amount) {
    fx.zoom = Math.max(fx.zoom, amount);
  }

  function cheer() {
    fx.cheer = 1;
  }

  function impact(key) {
    fx.impactAt = fx.clock;
    fx.impactKey = key;
  }

  // ---------- Fäuste ----------

  function fistTargets(session) {
    const f = session.fight;
    const k = session.phaseProgress();
    const targets = GUARD.map((p) => ({ ...p, r: FIST_R, rate: 12 }));
    // Bei der Faust (F) schlägt abwechselnd links und rechts zu
    const only = f.key === "F" ? f.step % 2 : null;
    const pick = (table) => table[f.key].map((p, i) => (only != null && i !== only ? null : p));
    const heavyR = HEAVY[f.key] ? FIST_R + 9 : FIST_R;

    if (f.phase === "windup") {
      pick(WINDUP).forEach((p, i) => {
        if (p) targets[i] = { ...p, r: FIST_R + (heavyR - FIST_R) * k, rate: 11 };
      });
    } else if (f.phase === "strike" || f.phase === "recover" || (f.phase === "open" && k < 0.2 && f.attack)) {
      // Nach dem Schlag bleibt die Faust kurz liegen (bei Hammer/Doppel steckt sie fest)
      const stay = f.phase !== "recover" || f.attack.opens || k < 0.4;
      pick(STRIKE).forEach((p, i) => {
        if (p && stay) targets[i] = { ...p, r: heavyR, rate: f.phase === "strike" ? 60 : 16 };
      });
    } else if (f.phase === "open") {
      OPEN.forEach((p, i) => { targets[i] = { ...p, r: FIST_R, rate: 6 }; });
    } else if (f.phase === "counter") {
      targets[1] = { x: 200, y: 312, r: FIST_R + 3, rate: 34 };
    } else if (f.phase === "roar") {
      targets.forEach((t, i) => { t.x += (i ? 40 : -40); t.y -= 70; t.rate = 9; });
    } else if (f.phase === "down") {
      OPEN.forEach((p, i) => { targets[i] = { x: p.x + (i ? 30 : -30), y: p.y + 40, r: FIST_R, rate: 4 }; });
    } else if (f.phase === "taunt") {
      targets.forEach((t, i) => { t.y -= 50 + 10 * Math.sin(fx.clock / 110 + i * Math.PI); t.rate = 9; });
    }
    return targets;
  }

  function updateFists(session) {
    const targets = fistTargets(session);
    const dt = session.step;
    fx.fists.forEach((f, i) => {
      const t = targets[i];
      f.px = f.x;
      f.py = f.y;
      if (dt <= 0) return;
      const a = 1 - Math.exp(-t.rate * dt / 1000);
      f.x += (t.x - f.x) * a;
      f.y += (t.y - f.y) * a;
      f.r += (t.r - f.r) * Math.min(1, a * 1.5);
    });
  }

  // ---------- Hintergrund ----------

  function drawArena(ctx, session) {
    ctx.fillStyle = SCREEN;
    ctx.fillRect(0, 0, WORLD, WORLD);
    // Publikum: Köpfe und Schultern, hüpfen beim Jubeln
    ctx.fillStyle = CROWD;
    for (let row = 0; row < 2; row++) {
      for (let i = 0; i < 12; i++) {
        const x = 10 + i * 35 + (row ? 17 : 0);
        const base = 96 + row * 22;
        const hop = Math.abs(Math.sin(fx.clock / 90 + i * 1.7 + row)) * 7 * fx.cheer;
        const y = base - hop - (session.fight.phase === "taunt" ? Math.abs(Math.sin(fx.clock / 120 + i)) * 5 : 0);
        ctx.beginPath();
        ctx.arc(x, y - 22, 11, 0, Math.PI * 2);
        ctx.roundRect(x - 18, y - 12, 36, 30, 12);
        ctx.fill();
      }
    }
    // Seile + Pfosten
    ctx.fillStyle = FLOOR;
    ctx.fillRect(0, 150, WORLD, WORLD - 150);
    ctx.strokeStyle = ROPE;
    ctx.lineWidth = 3;
    for (const y of [168, 188, 208]) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(WORLD, y);
      ctx.stroke();
    }
    ctx.fillStyle = LINE;
    ctx.fillRect(0, 150, 10, 74);
    ctx.fillRect(WORLD - 10, 150, 10, 74);
    // Bahnen der Figur
    ctx.lineWidth = 2;
    ctx.strokeStyle = LINE;
    for (const lane of ["L", "C", "R"]) {
      ctx.beginPath();
      ctx.roundRect(LANE_X[lane] - LANE_HALF, ZONE_TOP, LANE_HALF * 2, ZONE_BOTTOM - ZONE_TOP, 12);
      ctx.stroke();
    }
  }

  // Wo der Angriff einschlägt: eine Bahn (stehend + geduckt) oder beim Fegen ein Band in Kopfhöhe
  function zoneRects(attack) {
    if (attack.hits.includes("C") && !attack.hits.includes("D")) {
      const lanes = ["L", "C", "R"].filter((l) => attack.hits.includes(l));
      const x0 = LANE_X[lanes[0]] - LANE_HALF;
      const x1 = LANE_X[lanes[lanes.length - 1]] + LANE_HALF;
      return [{ x: x0, y: SWEEP.top, w: x1 - x0, h: SWEEP.bottom - SWEEP.top, dir: "x" }];
    }
    return ["L", "C", "R"].filter((l) => attack.hits.includes(l))
      .map((l) => ({ x: LANE_X[l] - LANE_HALF, y: ZONE_TOP, w: LANE_HALF * 2, h: ZONE_BOTTOM - ZONE_TOP, dir: "y" }));
  }

  // Ausholen: Zone füllt sich in Schlagrichtung, Rand wird zum Ende hin durchgezogen.
  // Nach dem Einschlag blitzt sie kurz hell auf.
  function drawZones(ctx, session) {
    const f = session.fight;
    if (f.phase === "windup" || f.phase === "strike") {
      const k = f.phase === "strike" ? 1 : session.phaseProgress();
      for (const z of zoneRects(f.attack)) {
        ctx.fillStyle = cream(0.06 + 0.1 * k);
        ctx.beginPath();
        ctx.roundRect(z.x, z.y, z.w, z.h, 12);
        ctx.fill();
        ctx.save();
        ctx.clip();
        ctx.fillStyle = cream(0.17);
        if (z.dir === "y") ctx.fillRect(z.x, z.y, z.w, z.h * k);
        else ctx.fillRect(z.x, z.y, z.w * k, z.h);
        ctx.restore();
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = cream(0.3 + 0.6 * k);
        ctx.setLineDash(k < 0.75 ? [7, 6] : []);
        ctx.beginPath();
        ctx.roundRect(z.x, z.y, z.w, z.h, 12);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    const since = fx.clock - fx.impactAt;
    if (fx.impactKey && since < 220) {
      ctx.fillStyle = cream(0.45 * (1 - since / 220));
      for (const z of zoneRects(SL.ATTACKS[fx.impactKey])) {
        ctx.beginPath();
        ctx.roundRect(z.x, z.y, z.w, z.h, 12);
        ctx.fill();
      }
    }
  }

  // ---------- Boss ----------

  function roundedPoly(ctx, pts, radius) {
    const n = pts.length;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const p = pts[i];
      const next = pts[(i + 1) % n];
      const prev = pts[(i - 1 + n) % n];
      if (i === 0) ctx.moveTo((prev.x + p.x) / 2, (prev.y + p.y) / 2);
      ctx.arcTo(p.x, p.y, (p.x + next.x) / 2, (p.y + next.y) / 2, radius);
    }
    ctx.closePath();
  }

  function bodyPath(ctx) {
    const h = 56;
    roundedPoly(ctx, [{ x: -h, y: -h }, { x: h, y: -h }, { x: h, y: h }, { x: -h, y: h }], 18);
  }

  // Wie steht der Boss gerade da: Position, Neigung, Stauchung
  function bossPose(session) {
    const f = session.fight;
    const k = session.phaseProgress();
    const t = session.time;
    const pose = { x: BOSS.x, y: BOSS.y, rot: 0, sx: 1, sy: 1 };
    if (f.phase === "guard" || f.phase === "wait" || f.phase === "intro") {
      pose.y += Math.sin(fx.clock / 280) * 2.5;
      pose.sy += Math.sin(fx.clock / 280) * 0.015;
    } else if (f.phase === "windup") {
      // Holt aus: lehnt sich zurück, zittert zum Ende hin
      pose.y -= 9 * Math.sin(k * Math.PI / 2);
      pose.sx -= 0.04 * k;
      pose.sy += 0.06 * k;
      pose.x += Math.sin(fx.clock / 16) * k * (session.rage ? 2.6 : 1.6);
    } else if (f.phase === "strike") {
      pose.y += 12;
      pose.sx += 0.07;
      pose.sy -= 0.07;
    } else if (f.phase === "recover") {
      pose.y += 12 * (1 - k);
    } else if (f.phase === "open") {
      pose.rot = Math.sin(fx.clock / 150) * 0.07;
      pose.y += 6;
    } else if (f.phase === "roar") {
      pose.x += Math.sin(fx.clock / 12) * 3.5;
      pose.sx += 0.08 * Math.sin(k * Math.PI);
      pose.sy += 0.08 * Math.sin(k * Math.PI);
    } else if (f.phase === "down") {
      const d = Math.min(1, (t - f.start) / 700);
      pose.rot = -0.5 * d;
      pose.y += -24 * Math.sin(d * Math.PI) + 40 * d;
    } else if (f.phase === "taunt") {
      pose.y -= Math.abs(Math.sin(fx.clock / 120)) * 12;
    }
    // Getroffen: nach hinten weggedrückt, der Haken hebt ihn an
    if (session.lastHit && f.phase !== "down") {
      const since = t - session.lastHit.at;
      const dur = session.lastHit.kind === "upper" ? 260 : 160;
      if (since < dur) {
        const s = Math.sin((since / dur) * Math.PI);
        const power = session.lastHit.kind === "upper" ? 2 : 1;
        pose.y -= 9 * s * power;
        pose.sx += 0.07 * s;
        pose.sy -= 0.07 * s;
        pose.rot += (session.stats.landed % 2 ? 0.06 : -0.06) * s * power;
      }
    }
    return pose;
  }

  function drawBoss(ctx, session, playerX) {
    const f = session.fight;
    const open = session.isBossOpen();
    const down = f.phase === "down";
    const pose = bossPose(session);
    const hitFlash = session.lastHit && session.time - session.lastHit.at < 70 && !down;

    ctx.save();
    ctx.translate(pose.x, pose.y);
    ctx.rotate(pose.rot);
    ctx.scale(pose.sx, pose.sy);
    bodyPath(ctx);
    if (hitFlash) {
      // Treffer-Bild: kurz invertiert
      ctx.fillStyle = INK;
      ctx.fill();
      ctx.lineWidth = 5;
      ctx.strokeStyle = CREAM;
      ctx.stroke();
    } else if (open || down) {
      // Offen: hohl mit hellem Rand - "jetzt zuschlagen"
      ctx.fillStyle = SCREEN;
      ctx.fill();
      ctx.lineWidth = 5;
      ctx.strokeStyle = CREAM;
      ctx.stroke();
    } else {
      ctx.fillStyle = CREAM;
      ctx.fill();
    }
    drawBossFace(ctx, session, open || hitFlash, down, playerX - pose.x);
    if (session.rage && !down && !open && !hitFlash) drawAngerMark(ctx);
    ctx.restore();

    // Offen: Sternchen kreisen über dem Kopf
    if (open && !down) {
      for (let i = 0; i < 3; i++) {
        const a = fx.clock / 220 + (i * Math.PI * 2) / 3;
        drawSparkle(ctx, pose.x + Math.cos(a) * 34, pose.y - 74 + Math.sin(a) * 8, 6, CREAM);
      }
    }
  }

  function drawBossFace(ctx, session, hollow, down, lookX) {
    const f = session.fight;
    const eyeY = -6;
    for (const side of [-1, 1]) {
      const ex = side * 22;
      if (down) {
        // K.o.: Kreuze
        ctx.strokeStyle = CREAM;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(ex - 7, eyeY - 7); ctx.lineTo(ex + 7, eyeY + 7);
        ctx.moveTo(ex + 7, eyeY - 7); ctx.lineTo(ex - 7, eyeY + 7);
        ctx.stroke();
        continue;
      }
      if (hollow) {
        // Benommen: helle Ringe, Pupillen kreisen
        ctx.strokeStyle = CREAM;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(ex, eyeY, 12, 0, Math.PI * 2);
        ctx.stroke();
        const a = fx.clock / 110 + side;
        ctx.fillStyle = CREAM;
        ctx.beginPath();
        ctx.arc(ex + Math.cos(a) * 4.5, eyeY + Math.sin(a) * 4.5, 4.5, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }
      ctx.fillStyle = INK;
      ctx.beginPath();
      ctx.arc(ex, eyeY, 13, 0, Math.PI * 2);
      ctx.fill();
      const px = Math.max(-5, Math.min(5, lookX / 22));
      ctx.fillStyle = CREAM;
      ctx.beginPath();
      ctx.arc(ex + px, eyeY + 4, 5, 0, Math.PI * 2);
      ctx.fill();
      // Böses Lid: schräge Kante über dem Auge (wütend steiler)
      const tilt = session.rage ? 15 : 11;
      ctx.fillStyle = CREAM;
      ctx.beginPath();
      ctx.moveTo(ex - side * 17, eyeY - 3);
      ctx.lineTo(ex + side * 17, eyeY - 3 - tilt);
      ctx.lineTo(ex + side * 17, eyeY - 22);
      ctx.lineTo(ex - side * 17, eyeY - 22);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 4;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(ex - side * 15, eyeY - 4);
      ctx.lineTo(ex + side * 15, eyeY - 2 - tilt);
      ctx.stroke();
      ctx.lineCap = "butt";
    }
    // Mund: schmaler Strich, beim Ausholen zusammengebissen, beim Brüllen weit offen
    ctx.fillStyle = INK;
    if (!down && !hollow) {
      if (f.phase === "roar" || f.phase === "taunt") {
        ctx.beginPath();
        ctx.roundRect(-16, 18, 32, 18, 8);
        ctx.fill();
      } else {
        ctx.fillRect(-14, 26, 28, f.phase === "windup" ? 6 : 4);
      }
    }
    // Augenblitzen: kurz vor dem Einschlag - jetzt ausweichen!
    if (f.phase === "windup" && f.glinted) {
      const since = session.time - (f.start + f.dur + SL.DUEL.STRIKE_MS - SL.DUEL.GLINT_LEAD);
      const s = Math.sin(Math.min(1, since / 200) * Math.PI);
      if (s > 0) drawSparkle(ctx, 30, eyeY - 10, 16 * s, CREAM, INK);
    }
  }

  // Comic-Ärger-Zeichen oben rechts auf dem Kopf, pulsiert
  function drawAngerMark(ctx) {
    const s = 1 + 0.12 * Math.sin(fx.clock / 90);
    ctx.save();
    ctx.translate(34, -34);
    ctx.scale(s, s);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3.5;
    ctx.lineCap = "round";
    for (let i = 0; i < 4; i++) {
      ctx.rotate(Math.PI / 2);
      ctx.beginPath();
      ctx.moveTo(3, 4);
      ctx.quadraticCurveTo(4, 9, 10, 9);
      ctx.stroke();
    }
    ctx.lineCap = "butt";
    ctx.restore();
  }

  // Vierzackiger Glitzer
  function drawSparkle(ctx, x, y, r, color, edge) {
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.quadraticCurveTo(x, y, x, y + r);
    ctx.quadraticCurveTo(x, y, x - r, y);
    ctx.quadraticCurveTo(x, y, x, y - r);
    ctx.closePath();
    if (edge) {
      ctx.lineWidth = 3;
      ctx.strokeStyle = edge;
      ctx.stroke();
    }
    ctx.fillStyle = color;
    ctx.fill();
  }

  function drawFists(ctx, session) {
    const open = session.isBossOpen() || session.fight.phase === "down";
    fx.fists.forEach((f) => {
      // Schliere bei schneller Bewegung
      const dx = f.x - f.px;
      const dy = f.y - f.py;
      const len = Math.hypot(dx, dy);
      if (len > 6) {
        const nx = -dy / len;
        const ny = dx / len;
        ctx.fillStyle = cream(0.28);
        ctx.beginPath();
        ctx.moveTo(f.x + nx * f.r, f.y + ny * f.r);
        ctx.lineTo(f.px - dx * 1.5, f.py - dy * 1.5);
        ctx.lineTo(f.x - nx * f.r, f.y - ny * f.r);
        ctx.closePath();
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
      ctx.fillStyle = open ? SCREEN : CREAM;
      ctx.fill();
      ctx.lineWidth = open ? 4 : 3;
      ctx.strokeStyle = open ? CREAM : INK;
      ctx.stroke();
    });
  }

  // ---------- Figur ----------

  function playerPos(session, pose) {
    const lunge = pose.lunge * (pose.punch === "upper" ? LUNGE.upper : LUNGE.jab);
    return {
      x: LANE_X.C + pose.x * 100,
      y: PLAYER_Y + pose.duck * 18 - lunge + pose.recoil * 16,
    };
  }

  function drawFigureAt(ctx, x, y, pose, alpha, outlineOnly) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    ctx.rotate(pose.x * 0.18 * (1 - Math.abs(pose.x) * 0.4));
    // Ducken staucht, Zuschlagen streckt
    const stretch = pose.lunge * (pose.punch === "upper" ? 0.3 : 0.2);
    ctx.scale(1 + pose.duck * 0.22 - stretch * 0.5, 1 - pose.duck * 0.38 + stretch);
    if (outlineOnly) {
      ctx.strokeStyle = CREAM;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(0, 0, PLAYER_R, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      const dx = BOSS.x - x;
      const dy = BOSS.y - y;
      const len = Math.hypot(dx, dy) || 1;
      SL.CosmeticsDraw.drawFigure(ctx, 0, 0, PLAYER_R, { x: dx / len, y: dy / len });
      ctx.strokeStyle = CREAM;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, PLAYER_R, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawPlayer(ctx, session) {
    const pose = session.pose();
    const { x, y } = playerPos(session, pose);
    const f = session.fight;

    // Schatten am Boden
    ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
    ctx.beginPath();
    ctx.ellipse(x, PLAYER_Y + PLAYER_R + 8, PLAYER_R * (1 - pose.lunge * 0.4), 5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Nachbilder bei schnellen Bewegungen (Ausweichen, Zuschlagen)
    for (let i = 3; i >= 1; i--) {
      const past = session.pose(session.time - i * 22);
      const pp = playerPos(session, past);
      if (Math.hypot(pp.x - x, pp.y - y) > 8) drawFigureAt(ctx, pp.x, pp.y, past, 0.32 - i * 0.08, true);
    }

    // Speed-Linien beim Zuschlagen
    if (pose.lunge > 0.3) {
      ctx.strokeStyle = cream(0.5 * pose.lunge);
      ctx.lineWidth = 2;
      for (const ox of [-14, 0, 14]) {
        ctx.beginPath();
        ctx.moveTo(x + ox, y + PLAYER_R + 8);
        ctx.lineTo(x + ox, y + PLAYER_R + 8 + 30 * pose.lunge);
        ctx.stroke();
      }
    }

    // Nach einem Treffer blinkt die Figur, solange sie unverwundbar ist
    const invuln = session.time < session.invulnUntil;
    if (invuln && Math.floor(session.time / 80) % 2 === 0) return;
    // Verloren: kippt um
    if (f.phase === "taunt" && session.endReason === "lost") {
      const d = Math.min(1, (session.time - f.start) / 400);
      drawFigureAt(ctx, x, y + 12 * d, { ...pose, x: 0, duck: 0.6 * d }, 1, false);
      return;
    }
    // Gewonnen: hüpft
    if (f.phase === "down") {
      const hop = Math.abs(Math.sin(fx.clock / 140)) * 16;
      drawFigureAt(ctx, x, y - hop, pose, 1, false);
      return;
    }
    // Kampfhaltung: wippt leicht
    const bob = pose.lunge === 0 && pose.duck === 0 ? Math.abs(Math.sin(fx.clock / 170)) * 3 : 0;
    drawFigureAt(ctx, x, y - bob, pose, 1, false);
  }

  // ---------- Anzeigen ----------

  function drawHud(ctx, session, dt) {
    const boss = session.boss;
    const bossFrac = session.bossHp / boss.hp;
    const playerFrac = session.hearts / boss.hearts;
    // Rote Nachlauf-Leiste wie im Automaten - hier hellgrau, läuft verzögert hinterher
    const settle = 1 - Math.exp(-dt * 0.004);
    if (!session.lastHit || session.time - session.lastHit.at > 250) fx.lagBoss += (bossFrac - fx.lagBoss) * settle;
    if (session.time - session.lastHurtAt > 250) fx.lagPlayer += (playerFrac - fx.lagPlayer) * settle;
    fx.lagBoss = Math.max(fx.lagBoss, bossFrac);
    fx.lagPlayer = Math.max(fx.lagPlayer, playerFrac);

    const W = 150;
    const H = 12;
    const Y = 12;
    // Figur links (füllt von rechts nach links leer), Boss rechts (gespiegelt)
    const bar = (x, frac, lag, mirror, segments) => {
      ctx.fillStyle = INK;
      ctx.fillRect(x, Y, W, H);
      ctx.fillStyle = GREY;
      ctx.fillRect(mirror ? x + W * (1 - lag) : x, Y, W * lag, H);
      ctx.fillStyle = CREAM;
      ctx.fillRect(mirror ? x + W * (1 - frac) : x, Y, W * frac, H);
      ctx.fillStyle = SCREEN;
      for (let i = 1; i < segments; i++) ctx.fillRect(x + (W / segments) * i - 1.5, Y, 3, H);
      ctx.strokeStyle = CREAM;
      ctx.lineWidth = 2;
      ctx.strokeRect(x - 1, Y - 1, W + 2, H + 2);
    };
    bar(14, playerFrac, fx.lagPlayer, true, boss.hearts);
    bar(WORLD - 14 - W, bossFrac, fx.lagBoss, false, 1);
    pixelText(ctx, "DU", 14, 39, 2, { align: "left" });
    const angry = session.rage && Math.floor(fx.clock / 300) % 2 === 0;
    pixelText(ctx, angry ? boss.name + "!" : boss.name, WORLD - 14, 39, 2, { align: "right" });

    // Rundenuhr in der Mitte, blinkt in den letzten 10 Sekunden
    const secs = Math.ceil(session.timeLeft() / 1000);
    const blink = secs <= 10 && session.endAt == null && Math.floor(fx.clock / 250) % 2 === 0;
    pixelText(ctx, String(secs).padStart(2, "0"), WORLD / 2, 20, 3.4, { color: blink ? GREY : CREAM });

    // Combo-Zähler links
    if (session.combo >= 2 && session.endAt == null && session.lastHit && session.time - session.lastHit.at < 1300) {
      const since = session.time - session.lastHit.at;
      const pop = since < 120 ? 1 + 0.4 * (1 - since / 120) : 1;
      ctx.save();
      ctx.translate(58, 150);
      ctx.scale(pop, pop);
      pixelText(ctx, String(session.combo), 0, 0, 5);
      pixelText(ctx, "TREFFER", 0, 30, 1.6);
      ctx.restore();
    }
  }

  function drawPopups(ctx) {
    fx.popups = fx.popups.filter((p) => fx.clock - p.at < 700);
    for (const p of fx.popups) {
      const t = (fx.clock - p.at) / 700;
      const pop = t < 0.12 ? 0.6 + 0.4 * (t / 0.12) * 1.25 : 1;
      ctx.save();
      ctx.globalAlpha = t > 0.75 ? 1 - (t - 0.75) / 0.25 : 1;
      ctx.translate(p.x, p.y - 26 * t);
      ctx.scale(pop, pop);
      pixelText(ctx, p.text, 0, 0, 2.6);
      ctx.restore();
    }
  }

  // Treffer-Funken: Strahlen nach außen, lang/kurz im Wechsel
  function drawSparks(ctx) {
    fx.sparks = fx.sparks.filter((s) => fx.clock - s.at < 160);
    ctx.strokeStyle = CREAM;
    ctx.lineCap = "round";
    for (const s of fx.sparks) {
      const t = (fx.clock - s.at) / 160;
      ctx.lineWidth = 4 * (1 - t) + 1;
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4 + s.size;
        const r0 = (10 + 14 * t) * s.size;
        const r1 = r0 + (i % 2 ? 12 : 24) * s.size * (1 - t * 0.5);
        ctx.beginPath();
        ctx.moveTo(s.x + Math.cos(a) * r0, s.y + Math.sin(a) * r0);
        ctx.lineTo(s.x + Math.cos(a) * r1, s.y + Math.sin(a) * r1);
        ctx.stroke();
      }
    }
    ctx.lineCap = "butt";
  }

  // Große Ansage in der Mitte ("RUNDE 1", "LOS!", "K.O.") - springt rein, blendet aus
  function drawAnnounce(ctx) {
    const a = fx.announce;
    if (!a) return;
    const t = fx.clock - a.at;
    if (t > a.dur) { fx.announce = null; return; }
    const pop = t < 140 ? 1.7 - 0.7 * (t / 140) : 1;
    ctx.save();
    ctx.globalAlpha = t > a.dur - 160 ? (a.dur - t) / 160 : 1;
    ctx.translate(WORLD / 2, 214);
    ctx.scale(pop, pop);
    pixelText(ctx, a.text, 0, 0, a.px, { edge: SCREEN });
    ctx.restore();
  }

  // Scanlines + dunkle Ecken wie auf einem alten Röhrenbildschirm - einmal pro Größe gebaut
  function overlayFor(w, h, pixelRatio) {
    const key = `${w}x${h}`;
    if (fx.overlayKey === key) return fx.overlay;
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const o = c.getContext("2d");
    const step = Math.max(2, Math.round(1.5 * pixelRatio));
    o.fillStyle = "rgba(0, 0, 0, 0.22)";
    for (let y = 0; y < h; y += step * 2) o.fillRect(0, y, w, step);
    const g = o.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
    g.addColorStop(0, "rgba(0, 0, 0, 0)");
    g.addColorStop(1, "rgba(0, 0, 0, 0.55)");
    o.fillStyle = g;
    o.fillRect(0, 0, w, h);
    fx.overlay = c;
    fx.overlayKey = key;
    return c;
  }

  // state: { session, viewSize, pixelRatio, dt, effects, shake }
  function render(ctx, state) {
    const { session, viewSize, pixelRatio, dt, effects, shake } = state;
    if (!fx) reset();
    fx.clock += dt;
    fx.zoom *= Math.exp(-dt * 0.012);
    fx.cheer *= Math.exp(-dt * 0.0015);
    updateFists(session);
    const scale = viewSize / WORLD;
    const z = 1 + fx.zoom;

    // Welt: Zoom um die Mitte, Wackeln obendrauf
    ctx.setTransform(pixelRatio * scale * z, 0, 0, pixelRatio * scale * z,
      pixelRatio * (shake.x + (viewSize / 2) * (1 - z)), pixelRatio * (shake.y + (viewSize / 2) * (1 - z)));
    drawArena(ctx, session);
    drawZones(ctx, session);
    const pose = session.pose();
    const playerX = LANE_X.C + pose.x * 100;
    // Beim Zuschlagen ist die Figur vorne, über den Fäusten
    if (pose.lunge > 0) {
      drawBoss(ctx, session, playerX);
      drawFists(ctx, session);
      drawPlayer(ctx, session);
    } else {
      drawPlayer(ctx, session);
      drawBoss(ctx, session, playerX);
      drawFists(ctx, session);
    }
    drawSparks(ctx);
    drawPopups(ctx);

    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    effects.render(ctx, (x, y) => [x * scale + shake.x, y * scale + shake.y]);

    // Anzeigen ohne Zoom und Wackeln
    ctx.setTransform(pixelRatio * scale, 0, 0, pixelRatio * scale, 0, 0);
    drawHud(ctx, session, dt);
    drawAnnounce(ctx);

    // Blitz: invertiert das ganze Bild für einen Moment
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const w = ctx.canvas.width;
    const h = ctx.canvas.height;
    if (fx.clock < fx.flashUntil) {
      ctx.globalCompositeOperation = "difference";
      ctx.fillStyle = CREAM;
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = "source-over";
    }
    ctx.drawImage(overlayFor(w, h, pixelRatio), 0, 0);
  }

  return {
    render, reset, announce, popup, spark, flash, zoom, cheer, impact,
    BOSS,
    fistPos: (i) => (fx ? fx.fists[i] : GUARD[i]),
    playerPos: (session) => playerPos(session, session.pose()),
  };
})();
