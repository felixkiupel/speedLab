// Zeichnet die Angelstelle als Querschnitt: oben Himmel mit Steg, Figur und Rute, darunter das
// Wasser in Tiefen-Ebenen (heller oben, dunkler unten, Meter-Marken links), Fische in ihren
// Ebenen, unten Grund mit Steinen und Seegras. Ebenen, die die Schnur nicht erreicht, sind
// schraffiert. Beim Ziehen zeigt oben rechts die Spannungs-Anzeige. Welt = 400 × 560 Einheiten.
// Ab und zu eine Brise: das Seegras wiegt sich stärker, ui.js spielt dazu leises Rauschen (onGust).
// Eigener Zustand (reset()): Uhr, Brise, Luftblasen, gerissene Schnur.
window.SL = window.SL || {};

SL.Renderer = (function () {
  const INK = "#2b2420";
  const CREAM = "#fbf7f0";
  const ink = (a) => `rgba(43, 36, 32, ${a})`;
  const cream = (a) => `rgba(251, 247, 240, ${a})`;

  const W = 400;
  const H = 560;
  const SURFACE = 120;
  const BOTTOM = 500; // Grund
  const HOOK_X = SL.FISHING.HOOK_X * W;
  const FIGURE = { x: 92, y: 78, r: 18 };
  const ROD_BASE = { x: 104, y: 88 };
  const ROD_TIP = { x: HOOK_X, y: 28 };
  // Wasserfarbe oben und ganz unten (warm, je tiefer desto dunkler)
  const TOP = [240, 232, 217];
  const DEEP = { teich: [214, 201, 178], fluss: [208, 196, 174], meer: [191, 177, 153] };
  const GUST_EVERY = [7000, 12000];
  const GUST_MS = 2800;
  const GAUGE = { x: 196, y: 10, w: 190, h: 14 };

  let fx = null;

  function reset(spotId) {
    fx = { clock: 0, spot: spotId, gustAt: -Infinity, nextGust: 3500, bubbles: [], nextBubble: 1200, snapAt: -Infinity };
  }

  // Schnur gerissen: Stück hängt kurz an der Rute
  function snap() {
    fx.snapAt = fx.clock;
  }

  const layerH = (session) => (BOTTOM - SURFACE) / session.spot.layers;
  const depthY = (session, d) => SURFACE + d * layerH(session);

  // Welche Ebene liegt bei dieser Höhe (Welt-Einheiten)? 0 = über Wasser
  function layerAt(session, y) {
    if (y < SURFACE) return 0;
    return Math.min(session.spot.layers, Math.max(1, Math.ceil((y - SURFACE) / layerH(session))));
  }

  function gust() {
    const t = (fx.clock - fx.gustAt) / GUST_MS;
    return t >= 0 && t <= 1 ? Math.sin(t * Math.PI) : 0;
  }

  function updateGust(onGust) {
    if (fx.clock < fx.nextGust) return;
    fx.gustAt = fx.clock;
    fx.nextGust = fx.clock + GUST_MS + GUST_EVERY[0] + Math.random() * (GUST_EVERY[1] - GUST_EVERY[0]);
    if (onGust) onGust();
  }

  // ---------- Himmel ----------

  function drawSky(ctx) {
    ctx.fillStyle = CREAM;
    ctx.fillRect(0, 0, W, SURFACE);
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.arc(350, 64, 20, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    const x = ((236 + fx.clock * 0.002) % (W + 120)) - 60;
    ctx.beginPath();
    ctx.moveTo(x, 50);
    ctx.lineTo(x + 52, 50);
    ctx.moveTo(x + 14, 58);
    ctx.lineTo(x + 70, 58);
    ctx.stroke();

    // Ufer bzw. Boot am Horizont
    ctx.fillStyle = INK;
    if (fx.spot === "meer") {
      const bx = 296;
      ctx.beginPath();
      ctx.moveTo(bx - 11, SURFACE - 4);
      ctx.lineTo(bx + 11, SURFACE - 4);
      ctx.lineTo(bx + 7, SURFACE);
      ctx.lineTo(bx - 7, SURFACE);
      ctx.closePath();
      ctx.moveTo(bx, SURFACE - 24);
      ctx.lineTo(bx + 9, SURFACE - 6);
      ctx.lineTo(bx, SURFACE - 6);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo(250, SURFACE);
      ctx.quadraticCurveTo(310, SURFACE - 22, 360, SURFACE - 8);
      ctx.quadraticCurveTo(384, SURFACE - 16, W, SURFACE - 12);
      ctx.lineTo(W, SURFACE);
      ctx.closePath();
      ctx.fill();
      if (fx.spot === "fluss") {
        for (const [tx, s] of [[300, 1], [318, 1.3], [336, 0.9]]) {
          ctx.beginPath();
          ctx.moveTo(tx - 7 * s, SURFACE - 12);
          ctx.lineTo(tx, SURFACE - 12 - 26 * s);
          ctx.lineTo(tx + 7 * s, SURFACE - 12);
          ctx.closePath();
          ctx.fill();
        }
      }
    }
  }

  // ---------- Wasser ----------

  function drawWater(ctx, session) {
    const n = session.spot.layers;
    const h = layerH(session);
    const deep = DEEP[fx.spot] || DEEP.teich;
    for (let i = 1; i <= n; i++) {
      const k = n > 1 ? (i - 1) / (n - 1) : 0;
      const c = TOP.map((v, j) => Math.round(v + (deep[j] - v) * k));
      ctx.fillStyle = `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
      ctx.fillRect(0, SURFACE + (i - 1) * h, W, h + 1);
    }
    ctx.fillStyle = `rgb(${deep.join(", ")})`;
    ctx.fillRect(0, BOTTOM, W, H - BOTTOM);

    // Strömung im Fluss
    if (fx.spot === "fluss") {
      ctx.strokeStyle = ink(0.12);
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      for (let i = 0; i < 10; i++) {
        const y = SURFACE + 24 + i * 36;
        const x = ((i * 71 + fx.clock * 0.015) % (W + 60)) - 30;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + 20, y);
        ctx.stroke();
      }
    }

    // Trennlinien mit Meter-Angabe (Unterkante der Ebene darüber)
    ctx.font = '700 11px "Segoe UI", system-ui, sans-serif';
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    for (let i = 1; i < n; i++) {
      const y = SURFACE + i * h;
      ctx.strokeStyle = ink(0.28);
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.moveTo(48, y);
      ctx.lineTo(W, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = ink(0.55);
      ctx.fillText(`${i * session.spot.layerM} m`, 40, y);
    }
    // Gewählte Ebene: Pfeil am linken Rand
    const sy = SURFACE + (session.targetLayer - 0.5) * h;
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.moveTo(40, sy - 7);
    ctx.lineTo(50, sy);
    ctx.lineTo(40, sy + 7);
    ctx.closePath();
    ctx.fill();
  }

  // Ebenen, die die Schnur nicht erreicht: schraffiert + Hinweis
  function drawLocked(ctx, session) {
    const n = session.spot.layers;
    if (session.reach >= n) return;
    const h = layerH(session);
    const y0 = SURFACE + session.reach * h;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, y0, W, BOTTOM - y0);
    ctx.clip();
    ctx.strokeStyle = ink(0.1);
    ctx.lineWidth = 2;
    for (let x = -BOTTOM; x < W; x += 14) {
      ctx.beginPath();
      ctx.moveTo(x, BOTTOM);
      ctx.lineTo(x + BOTTOM - y0 + 20, y0 - 20);
      ctx.stroke();
    }
    ctx.restore();
    const text = `Schnur reicht nur bis ${session.reach * session.spot.layerM} m – Rolle aufrüsten`;
    ctx.font = '700 11px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = "center";
    const w = ctx.measureText(text).width + 34;
    const y = y0 + Math.min(h, BOTTOM - y0) / 2;
    ctx.fillStyle = cream(0.9);
    ctx.beginPath();
    ctx.roundRect(W / 2 + 20 - w / 2, y - 12, w, 24, 12);
    ctx.fill();
    ctx.fillStyle = INK;
    // Schloss
    const lx = W / 2 + 20 - w / 2 + 14;
    ctx.fillRect(lx - 5, y - 2, 10, 8);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(lx, y - 2, 3.5, Math.PI, 0);
    ctx.stroke();
    ctx.fillText(text, W / 2 + 20 + 8, y + 1);
  }

  function drawBottom(ctx) {
    // Seegras (wiegt sich, in der Brise etwas mehr)
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    for (const [x, h, p] of [[70, 60, 0], [82, 42, 1], [326, 70, 2], [342, 50, 3], [356, 34, 4], [214, 30, 5]]) {
      const sway = Math.sin(fx.clock / 1400 + p) * 5 + gust() * 4;
      ctx.beginPath();
      ctx.moveTo(x, BOTTOM + 12);
      ctx.bezierCurveTo(x + sway, BOTTOM - h * 0.35, x - sway, BOTTOM - h * 0.7, x + sway * 1.2, BOTTOM - h);
      ctx.stroke();
    }
    // Grund mit Hügeln + Steine
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.moveTo(0, H);
    ctx.lineTo(0, BOTTOM + 14);
    ctx.quadraticCurveTo(70, BOTTOM - 6, 150, BOTTOM + 8);
    ctx.quadraticCurveTo(240, BOTTOM + 22, 300, BOTTOM + 4);
    ctx.quadraticCurveTo(360, BOTTOM - 10, W, BOTTOM + 10);
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = cream(0.18);
    for (const [x, y, rx] of [[60, 532, 14], [176, 540, 10], [262, 528, 16], [348, 544, 9]]) {
      ctx.beginPath();
      ctx.ellipse(x, y, rx, rx * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawDock(ctx) {
    ctx.fillStyle = INK;
    ctx.fillRect(22, 104, 8, BOTTOM - 96);
    ctx.fillRect(132, 104, 8, BOTTOM - 96);
    ctx.fillRect(-4, 96, 154, 10);
  }

  // ---------- Fische ----------

  function drawFishes(ctx, session) {
    const reel = session.reel;
    for (const f of session.fishes) {
      const t = session.time - f.modeAt;
      const len = f.fish.len * (0.8 + 0.4 * f.size);
      let x = f.x * W;
      let y = depthY(session, f.d) + Math.sin(fx.clock / 700 + f.id) * 2;
      let wiggle = Math.sin(fx.clock / 160 + f.id) * 0.06;
      let alpha = f.layer > session.reach ? 0.45 : 1;
      if (f.mode === "nibble") {
        // zupft: kurz vor, wieder zurück
        x += f.dir * (Math.sin(Math.min(1, t / 450) * Math.PI) * 7 - 7);
      } else if (f.mode === "bite") {
        x += Math.sin(fx.clock / 25) * 2;
        wiggle = Math.sin(fx.clock / 40) * 0.25;
      } else if (f.mode === "hooked" && reel) {
        const phase = reel.phase();
        const thrash = phase === "surge" ? 0.5 : phase === "tell" ? 0.3 : 0.15;
        wiggle = Math.sin(fx.clock / (phase === "calm" ? 90 : 35)) * thrash - f.dir * 0.35;
        if (phase === "surge") x += Math.sin(fx.clock / 50) * 4;
        y = depthY(session, session.hook) + len * 0.15;
      } else if (f.mode === "flee") {
        wiggle = Math.sin(fx.clock / 40) * 0.2;
      }
      SL.FishArt.draw(ctx, f.fish, x, y, len, { flip: f.dir > 0, detail: true, wiggle, alpha });
    }
  }

  // ---------- Rute, Schnur, Haken ----------

  function drawRigging(ctx, session) {
    const s = session.state;
    const reel = session.reel;
    const tension = s === "reel" && reel ? reel.tension : 0;
    // Rute biegt sich mit der Spannung
    const tip = { x: ROD_TIP.x - tension * 10, y: ROD_TIP.y + tension * 26 + (s === "bite" ? 6 : 0) };
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3.5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(ROD_BASE.x, ROD_BASE.y);
    ctx.quadraticCurveTo(ROD_BASE.x + 40, ROD_TIP.y - 8 + tension * 6, tip.x, tip.y);
    ctx.stroke();
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.arc(ROD_BASE.x + 7, ROD_BASE.y - 6, 4.5, 0, Math.PI * 2);
    ctx.fill();

    // Gerissen: ein Stück Schnur pendelt an der Spitze
    const sinceSnap = fx.clock - fx.snapAt;
    if (s === "escaped" && sinceSnap < 1200) {
      const swing = Math.sin(sinceSnap / 120) * 10 * (1 - sinceSnap / 1200);
      ctx.strokeStyle = ink(0.8);
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(tip.x, tip.y);
      ctx.quadraticCurveTo(tip.x + swing, tip.y + 30, tip.x + swing * 1.5, tip.y + 55);
      ctx.stroke();
      return;
    }

    const hookY = depthY(session, session.hook);
    const shake = tension > SL.FISHING.HIGH ? Math.sin(fx.clock / 15) * 1.5 : 0;
    ctx.strokeStyle = ink(0.75 + tension * 0.25);
    ctx.lineWidth = 1.2 + tension * 1.3;
    ctx.beginPath();
    ctx.moveTo(tip.x, tip.y);
    ctx.lineTo(HOOK_X + shake, hookY - 9);
    ctx.stroke();

    // Haken: kleines J + Gewicht
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(HOOK_X, hookY - 9);
    ctx.lineTo(HOOK_X, hookY + 2);
    ctx.arc(HOOK_X - 4, hookY + 2, 4, 0, Math.PI * 0.95);
    ctx.stroke();
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.arc(HOOK_X, hookY - 12, 3, 0, Math.PI * 2);
    ctx.fill();

    // Biss: Ausrufezeichen neben dem Haken
    if (s === "bite") bubble(ctx, HOOK_X + 22, hookY - 22, "!");
    if (s === "reel" && reel && reel.phase() !== "calm") bubble(ctx, HOOK_X + 26, hookY - 20, reel.phase() === "surge" ? "!!" : "!");
  }

  function bubble(ctx, x, y, text) {
    ctx.font = '800 14px "Segoe UI", system-ui, sans-serif';
    const w = Math.max(22, ctx.measureText(text).width + 12);
    ctx.fillStyle = INK;
    ctx.strokeStyle = CREAM;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(x - w / 2, y - 12, w, 24, 10);
    ctx.stroke();
    ctx.fill();
    ctx.fillStyle = CREAM;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, x, y + 1);
  }

  // Luftblasen steigen vom wartenden Haken auf
  function drawBubbles(ctx, session) {
    if (session.state === "wait" && fx.clock >= fx.nextBubble) {
      fx.bubbles.push({ x: HOOK_X + 4, y: depthY(session, session.hook) - 6, r: 2 + Math.random() * 2, at: fx.clock });
      fx.nextBubble = fx.clock + 1500 + Math.random() * 2000;
    }
    ctx.strokeStyle = ink(0.45);
    ctx.lineWidth = 1.2;
    const rise = (b) => b.y - ((fx.clock - b.at) / 1000) * 38;
    fx.bubbles = fx.bubbles.filter((b) => rise(b) > SURFACE + 4);
    for (const b of fx.bubbles) {
      const t = (fx.clock - b.at) / 1000;
      ctx.beginPath();
      ctx.arc(b.x + Math.sin(t * 4) * 3, rise(b), b.r, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function drawFigure(ctx, session) {
    let y = FIGURE.y;
    let lean = 0;
    if (session.state === "reel") lean = session.holding ? -0.2 : -0.08;
    if (session.state === "landed") {
      const t = session.time - session.stateAt;
      if (t < 700) y -= Math.abs(Math.sin(t / 150)) * 8; // freut sich
    }
    const hookY = depthY(session, session.hook);
    const dx = HOOK_X - FIGURE.x;
    const dy = hookY - y;
    const len = Math.hypot(dx, dy) || 1;
    ctx.save();
    ctx.translate(FIGURE.x, y + FIGURE.r);
    ctx.rotate(lean);
    SL.CosmeticsDraw.drawFigure(ctx, 0, -FIGURE.r, FIGURE.r, { x: dx / len, y: dy / len });
    ctx.restore();
  }

  // Gefangen: der Fisch springt aus dem Wasser zur Figur
  function drawLanding(ctx, session) {
    if (session.state !== "landed" || !session.result) return;
    const t = Math.min(1, (session.time - session.stateAt) / 520);
    if (t >= 1) return;
    const x = HOOK_X + (FIGURE.x + 30 - HOOK_X) * t;
    const y = SURFACE + (FIGURE.y - SURFACE) * t - Math.sin(t * Math.PI) * 60;
    const len = session.result.fish.len * (0.8 + 0.4 * session.result.size);
    SL.FishArt.draw(ctx, session.result.fish, x, y, len, { detail: true, wiggle: Math.sin(fx.clock / 45) * 0.35 });
  }

  // Spannung: links locker (schraffiert), Mitte gut, rechts reißt (dunkel). Nadel = jetzt.
  function drawGauge(ctx, session) {
    if (session.state !== "reel" || !session.reel) return;
    const g = GAUGE;
    const { LOW, HIGH } = SL.FISHING;
    const T = session.reel.tension;
    ctx.fillStyle = CREAM;
    ctx.beginPath();
    ctx.roundRect(g.x - 8, g.y - 6, g.w + 16, g.h + 26, 10);
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(g.x, g.y, g.w, g.h, g.h / 2);
    ctx.clip();
    ctx.fillStyle = CREAM;
    ctx.fillRect(g.x, g.y, g.w, g.h);
    ctx.strokeStyle = ink(0.35);
    ctx.lineWidth = 1.5;
    for (let x = g.x - g.h; x < g.x + g.w * LOW; x += 6) {
      ctx.beginPath();
      ctx.moveTo(x, g.y + g.h);
      ctx.lineTo(x + g.h, g.y);
      ctx.stroke();
    }
    const danger = T > HIGH && Math.floor(fx.clock / 120) % 2 === 0;
    ctx.fillStyle = danger ? ink(0.6) : INK;
    ctx.fillRect(g.x + g.w * HIGH, g.y, g.w * (1 - HIGH), g.h);
    ctx.restore();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(g.x, g.y, g.w, g.h, g.h / 2);
    ctx.stroke();
    // Nadel
    const nx = g.x + g.w * Math.min(1, T);
    ctx.fillStyle = INK;
    ctx.strokeStyle = CREAM;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(nx - 3, g.y - 4, 6, g.h + 8, 3);
    ctx.stroke();
    ctx.fill();
    ctx.font = '700 9px "Segoe UI", system-ui, sans-serif';
    ctx.textBaseline = "top";
    ctx.fillStyle = ink(0.6);
    ctx.textAlign = "left";
    ctx.fillText("locker", g.x, g.y + g.h + 4);
    ctx.textAlign = "right";
    ctx.fillText("reißt", g.x + g.w, g.y + g.h + 4);
    ctx.textAlign = "center";
    ctx.fillText(`${(session.hook * session.spot.layerM).toFixed(1).replace(".", ",")} m`, g.x + g.w / 2, g.y + g.h + 4);
  }

  // state: { session, viewW, viewH, pixelRatio, dt, effects, shake, onGust }
  function render(ctx, state) {
    const { session, viewW, pixelRatio, dt, effects, shake } = state;
    if (!fx) reset(session.spot.id);
    fx.clock += dt;
    if (dt > 0) updateGust(state.onGust);
    const scale = viewW / W;
    ctx.setTransform(pixelRatio * scale, 0, 0, pixelRatio * scale, pixelRatio * shake.x, pixelRatio * shake.y);

    drawSky(ctx);
    drawWater(ctx, session);
    drawBottom(ctx);
    drawFishes(ctx, session);
    drawLocked(ctx, session);
    drawBubbles(ctx, session);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, SURFACE);
    ctx.lineTo(W, SURFACE);
    ctx.stroke();
    drawDock(ctx);
    drawFigure(ctx, session);
    drawRigging(ctx, session);
    drawLanding(ctx, session);
    drawGauge(ctx, session);

    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    effects.render(ctx, (x, y) => [x * scale + shake.x, y * scale + shake.y], { w: viewW, h: state.viewH });
  }

  return {
    render,
    reset,
    snap,
    layerAt,
    W,
    H,
    SURFACE,
    HOOK_X,
    hookY: (session) => depthY(session, session.hook),
  };
})();
