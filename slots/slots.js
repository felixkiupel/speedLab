// Slots-Seite: der Automat, an dem man Coins gegen Kristalle tauscht - die zweite Währung, mit der
// es später Skins gibt. Logik und Quoten: machine.js, Töne: sounds.js. Hier: Walzen bewegen und
// zeichnen, Knopf, Einsatz und die Gewinn-Show. Erreichbar nur über den Shop (?from= wird
// durchgereicht, damit "Zurück" wieder im richtigen Spiel landet).
//
// Ein Dreh steht beim Drücken fest und ist sofort gebucht (Coins weg, Kristalle gutgeschrieben -
// SL.Profile.playSlots). Die Walzen spielen das Ergebnis nur noch vor; die Kristall-Anzeige zählt
// erst hoch, wenn alle stehen.
(function () {
  const S = SL.Slots;
  const SAVE_KEY = "speedlab_slots_v1"; // nur Einsatz-Stufe und Ton - die Währungen liegen im Profil
  const INK = "#2b2420";
  const CREAM = "#fbf7f0";
  const BAND = "#ede5d8"; // äußere Reihen im Walzenfenster (--panel in slots.css)

  // ---------- Bewegung der Walzen ----------
  // Kurz zurückziehen, anlaufen, volle Fahrt, abbremsen genau aufs Ziel-Feld mit kleinem
  // Nachfedern. Positionen (in Feldern) sind Funktionen der Zeit: niedrige FPS oder ein Tab im
  // Hintergrund verschieben nichts, die Walzen stehen dann einfach schon.
  const VMAX = 34; // Felder pro Sekunde in voller Fahrt
  const WINDUP_MS = 120;
  const WINDUP = 0.28; // so weit holt die Walze vor dem Losdrehen aus
  const ACCEL_MS = 220;
  const DECEL_MS = 480;
  const BACK = 0.9; // Überschwinger beim Einrasten (easeOutBack)
  // Bremsweg so, dass das Tempo nahtlos übergeht (Anfangssteigung der Bremskurve = BACK + 3)
  const DECEL_DIST = (VMAX * DECEL_MS) / 1000 / (BACK + 3);
  const FIRST_STOP_MS = 420; // so lange dreht Walze 1 mindestens
  const STOP_GAP_MS = 200; // Abstand, bis die nächste Walze bremst
  const SLAM_GAP_MS = 110; // ... nach "Stopp"
  // Walze 3 dreht länger, wenn 1 und 2 schon gleich sind - bei wertvollen Symbolen noch länger
  const TEASE_MS = 800;
  const TEASE_BIG_MS = 1400;
  const REVEAL_MS = 160; // Pause zwischen letztem Einrasten und Gewinn
  const WIN_PULSE_MS = 2400; // so lange pulsieren die Gewinn-Symbole

  const easeOutBack = (u) => 1 + (BACK + 1) * Math.pow(u - 1, 3) + BACK * Math.pow(u - 1, 2);
  const easeOutBackSlope = (u) => 3 * (BACK + 1) * Math.pow(u - 1, 2) + 2 * BACK * (u - 1);
  const mod = (k, n) => ((k % n) + n) % n;

  const reels = S.REELS.map((strip, i) => {
    const pos = Math.floor(Math.random() * strip.length);
    return { i, strip, n: strip.length, pos, v: 0, cell: pos, phase: "idle" };
  });

  // Position + Tempo einer Walze zur Zeit t
  function motion(r, t) {
    if (r.phase !== "spin") return { pos: r.pos, v: 0 };
    if (r.decelAt != null && t >= r.decelAt) {
      const u = Math.min(1, (t - r.decelAt) / DECEL_MS);
      return { pos: r.decelFrom + DECEL_DIST * easeOutBack(u), v: (DECEL_DIST * easeOutBackSlope(u) * 1000) / DECEL_MS };
    }
    const e = t - r.startAt;
    if (e < WINDUP_MS) {
      const u = e / WINDUP_MS;
      return { pos: r.from - WINDUP * (1 - (1 - u) * (1 - u)), v: (-2 * WINDUP * (1 - u) * 1000) / WINDUP_MS };
    }
    if (e < WINDUP_MS + ACCEL_MS) {
      const s = (e - WINDUP_MS) / 1000;
      const a = VMAX / (ACCEL_MS / 1000);
      return { pos: r.from - WINDUP + 0.5 * a * s * s, v: a * s };
    }
    return { pos: r.cruiseFrom + (VMAX * (t - r.cruiseAt)) / 1000, v: VMAX };
  }

  // Bremsen planen: ab Zeitpunkt rq das nächste Mal, wenn das Ziel-Feld genau einen Bremsweg vor
  // der Gewinnlinie liegt. Darum stoppen die Walzen nicht im exakt gleichen Takt - wie echte.
  function planStop(r, rq) {
    const t = Math.max(rq, r.cruiseAt);
    const p = r.cruiseFrom + (VMAX * (t - r.cruiseAt)) / 1000;
    const final = r.target + r.n * Math.ceil((p + DECEL_DIST - r.target) / r.n);
    r.decelFrom = final - DECEL_DIST;
    r.decelAt = r.cruiseAt + ((r.decelFrom - r.cruiseFrom) / VMAX) * 1000;
  }

  // ---------- Zustand ----------

  let settings = loadSettings();
  let round = null; // laufender bzw. letzter Dreh: { result, tease, slammed, revealAt, revealed, winAt }
  let booking = false; // gerade wird ein Dreh im Profil gebucht (siehe onChange unten)
  let lightsTimer = null;
  let lastTickAt = 0;
  let teaseStep = 0, lastTeaseAt = 0;

  const machine = document.getElementById("slot-machine");
  const stage = document.getElementById("slot-stage");
  const canvas = document.getElementById("slot-reels");
  const ctx = canvas.getContext("2d");
  const fxCanvas = document.getElementById("slot-fx");
  const fxCtx = fxCanvas.getContext("2d");
  const spinBtn = document.getElementById("slot-spin");
  const messageEl = document.getElementById("slot-message");
  const winEl = document.getElementById("slot-win");
  const winBox = document.getElementById("slot-win-box");
  const coinsEl = document.getElementById("wallet-coins");
  const crystalsEl = document.getElementById("wallet-crystals");
  const fx = new SL.Effects();
  fx.enabled = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const CRYSTAL_ICON = `<span class="crystal-icon" aria-hidden="true"></span>`;

  function loadSettings() {
    const fallback = { level: S.STAKES[0], sound: true };
    try {
      const s = Object.assign(fallback, JSON.parse(localStorage.getItem(SAVE_KEY) || "{}"));
      if (!S.STAKES.includes(s.level)) s.level = S.STAKES[0];
      return s;
    } catch (e) {
      return fallback;
    }
  }

  function saveSettings() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(settings));
    } catch (e) {
      console.warn("Slots-Einstellungen konnten nicht gespeichert werden.", e);
    }
  }

  const stakeOf = (level) => S.BASE_STAKE * level;
  const spinning = () => Boolean(round && !round.revealed);

  // ---------- Dreh ----------

  // Knopf, Leertaste: neuer Dreh - oder, wenn die Walzen schon laufen, schneller stoppen
  function press() {
    SL.Audio.ensure();
    if (spinning()) slam();
    else startSpin();
  }

  function startSpin() {
    const level = settings.level;
    const result = S.spin(level);
    booking = true;
    const paid = SL.Profile.playSlots(result.stake, result.win);
    booking = false;
    if (!paid) {
      nope();
      return;
    }
    const now = performance.now();
    const lit = veilAt(now);
    veilOut = lit > 0 ? { from: lit, start: now } : null;
    const pair = result.symbols[0] === result.symbols[1];
    const big = ["hexagon", "star", "seven"].includes(result.symbols[0]);
    round = { result, tease: pair ? (big ? TEASE_BIG_MS : TEASE_MS) : 0, slammed: false, revealAt: null, revealed: false };
    teaseStep = 0;
    reels.forEach((r, i) => {
      r.phase = "spin";
      r.startAt = now;
      r.from = r.pos;
      r.cruiseAt = now + WINDUP_MS + ACCEL_MS;
      r.cruiseFrom = r.from - WINDUP + (VMAX * ACCEL_MS) / 2000;
      r.stopAt = now + FIRST_STOP_MS + i * STOP_GAP_MS;
      r.target = result.stops[i];
      r.decelAt = null;
    });
    clearTimeout(lightsTimer);
    machine.classList.remove("win", "jackpot");
    machine.classList.add("spinning");
    winBox.classList.remove("flash");
    winEl.textContent = "…";
    setMessage("");
    tweenNumber(coinsEl, SL.Profile.coins(), 350);
    SL.Audio.play("slotPull");
    SL.Haptics.vibrate(15);
    updateControls();
    kick();
  }

  // "Stopp": alle Walzen, die noch nicht bremsen, bremsen jetzt - kurz nacheinander
  function slam() {
    if (!round || round.slammed) return;
    round.slammed = true;
    round.tease = Math.min(round.tease, 300);
    const now = performance.now();
    for (const r of reels) if (r.phase === "spin" && r.decelAt == null) r.stopAt = Math.min(r.stopAt, now);
  }

  function updateReels(now) {
    if (!spinning()) return;
    // Bremsen der Reihe nach planen: jede Walze erst, wenn die davor schon bremst
    for (let i = 0; i < reels.length; i++) {
      const r = reels[i];
      if (r.phase !== "spin" || r.decelAt != null) continue;
      const prev = reels[i - 1];
      if (prev && prev.decelAt == null) break;
      let rq = r.stopAt;
      if (prev) rq = Math.max(rq, prev.decelAt + (round.slammed ? SLAM_GAP_MS : STOP_GAP_MS));
      if (i === reels.length - 1 && round.tease) rq = Math.max(rq, prev.decelAt + DECEL_MS + round.tease);
      if (now < rq) break;
      planStop(r, rq);
    }
    for (const r of reels) {
      if (r.phase !== "spin") continue;
      const m = motion(r, now);
      r.pos = m.pos;
      r.v = m.v;
      // Tick, wann immer ein Feld die Gewinnlinie kreuzt
      const cell = Math.floor(m.pos + 0.5);
      if (cell !== r.cell) {
        r.cell = cell;
        tick(r, now);
      }
      if (r.decelAt != null && now >= r.decelAt + DECEL_MS) {
        r.phase = "stopped";
        r.pos = r.cell = r.target;
        r.v = 0;
        onReelStop(r, now);
      }
    }
  }

  // In voller Fahrt nur ein leises Rattern (gedrosselt), beim Bremsen einzelne, deutliche Ticks
  function tick(r, now) {
    const loud = Math.abs(r.v) < 14;
    if (now - lastTickAt < (loud ? 22 : 45)) return;
    lastTickAt = now;
    SL.Audio.play("slotTick", { reel: r.i, loud });
  }

  function onReelStop(r, now) {
    SL.Audio.play("slotStop", r.i);
    SL.Haptics.vibrate(10);
    fx.shake(1.6, 90);
    if (reels.every((x) => x.phase === "stopped")) round.revealAt = now + REVEAL_MS;
    else if (r.i === 1 && round.tease) setMessage("Noch einer …");
  }

  // Spannung: Walze 1 und 2 sind gleich, Walze 3 läuft noch - Piepen, das immer höher wird
  function teasing(now) {
    const last = reels[reels.length - 1];
    return spinning() && round.tease > 0 && reels[1].phase === "stopped" && last.phase === "spin" && !(last.decelAt != null && now >= last.decelAt + DECEL_MS * 0.4);
  }

  function updateTease(now) {
    if (!teasing(now) || now - lastTeaseAt < 150) return;
    lastTeaseAt = now;
    SL.Audio.play("slotTease", teaseStep++);
  }

  // ---------- Gewinn ----------

  function tierOf(result) {
    if (result.kind === "three" && result.symbol === "seven") return 5;
    if (result.pay >= 40) return 4;
    if (result.pay >= 10) return 3;
    if (result.pay >= 2) return 2;
    return 1;
  }

  function reveal(now) {
    const result = round.result;
    round.revealed = true;
    round.winAt = now;
    machine.classList.remove("spinning");
    if (!result.win) {
      const [a, b, c] = result.symbols;
      if (SL.Profile.coins() < stakeOf(settings.level)) setMessage(nopeText(), true);
      else setMessage(a === c || b === c ? "Knapp daneben!" : "Leider nichts – nochmal?");
      winEl.textContent = "--";
      updateControls();
      return;
    }
    const tier = tierOf(result);
    const symbol = S.symbol(result.symbol);
    machine.classList.add(tier >= 5 ? "jackpot" : "win");
    lightsTimer = setTimeout(() => machine.classList.remove("win", "jackpot"), tier >= 5 ? 5000 : 2600);
    setMessage(tier >= 5 ? "JACKPOT!" : result.kind === "three" ? `3× ${symbol.name}!` : `2× ${symbol.name} von links`);
    if (tier >= 5) SL.Audio.play("slotJackpot");
    else SL.Audio.play("slotWin", Math.min(4, tier));
    SL.Haptics.vibrate(tier >= 3 ? [30, 40, 30, 40, 70] : [20, 40, 20]);

    // Gewinn-Anzeige und Kristalle zählen hoch (mit Blips), danach ploppt die Anzeige
    winBox.classList.remove("flash");
    void winBox.offsetWidth;
    winBox.classList.add("flash");
    const ms = Math.min(1600, 350 + result.win * 60);
    tweenNumber(winEl, result.win, ms, { from: 0, prefix: "+", suffix: CRYSTAL_ICON });
    let lastBlip = 0;
    const blip = (i) => {
      const t = performance.now();
      if (t - lastBlip < 40) return;
      lastBlip = t;
      SL.Audio.play("crystalTick", i);
    };
    tweenNumber(crystalsEl, SL.Profile.crystals(), ms, { onStep: blip, pop: true });

    // Konfetti aus den Gewinn-Symbolen, bei großen Gewinnen regnet es von oben
    const rect = canvas.getBoundingClientRect();
    for (const i of result.reels) {
      const x = rect.left + canvas.clientLeft + view.reelX(i) + view.reelW / 2;
      const y = rect.top + canvas.clientTop + view.cy;
      fx.burst(x, y, { count: 10 + tier * 8, colors: CONFETTI, speed: [120, 220 + tier * 70], life: [500, 1000], size: [2.5, 4.5], gravity: 520, shape: "confetti" });
    }
    if (tier >= 3) rain(tier >= 5 ? 10 : tier >= 4 ? 8 : 5);
    if (tier >= 5) {
      fx.shake(9, 700);
      setTimeout(() => rain(8), 600);
      setTimeout(() => rain(8), 1200);
    }
    updateControls();
  }

  // Konfetti in Dunkel und Holo-Silber - passend zu den Gewinn-Symbolen
  const CONFETTI = [INK, "#85786a", "#a6b3cb", "#cdd7e8", "#e4ddff", "#d1f1eb"];
  function rain(bursts) {
    for (let k = 0; k < bursts; k++) {
      fx.burst(Math.random() * window.innerWidth, -10, { count: 12, colors: CONFETTI, speed: [80, 260], life: [1200, 2200], size: [3, 5], gravity: 260, shape: "confetti", angle: Math.PI / 2, spread: 1.4 });
    }
    kick();
  }

  // Zu wenig Coins: Knopf schüttelt sich
  function nope() {
    SL.Audio.play("bump");
    spinBtn.classList.remove("shake");
    void spinBtn.offsetWidth;
    spinBtn.classList.add("shake");
    setMessage(nopeText(), true);
  }

  // ---------- Zahlen, die hochzählen ----------

  const tweens = new Map(); // Element -> { from, to, start, ms, last, opts }
  const shown = new Map(); // Element -> angezeigte Zahl

  function setNumber(el, value, opts = {}) {
    shown.set(el, value);
    el.innerHTML = `${opts.prefix || ""}${value}${opts.suffix || ""}`;
  }

  function tweenNumber(el, to, ms, opts = {}) {
    const from = opts.from ?? shown.get(el) ?? to;
    tweens.set(el, { from, to, start: performance.now(), ms, last: from, opts });
    kick();
  }

  function updateTweens(now) {
    for (const [el, tw] of tweens) {
      const u = Math.min(1, (now - tw.start) / tw.ms);
      const value = Math.round(tw.from + (tw.to - tw.from) * (1 - Math.pow(1 - u, 3)));
      if (value !== tw.last) {
        if (tw.opts.onStep && value > tw.last) tw.opts.onStep(value - tw.from);
        tw.last = value;
      }
      setNumber(el, value, tw.opts);
      if (u < 1) continue;
      tweens.delete(el);
      if (tw.opts.pop) {
        el.parentElement.classList.remove("pop");
        void el.offsetWidth;
        el.parentElement.classList.add("pop");
      }
    }
  }

  // Anzeigen auf den echten Stand bringen (z.B. wenn sich das Profil in einem anderen Tab ändert)
  function syncWallet() {
    setNumber(coinsEl, SL.Profile.coins());
    setNumber(crystalsEl, SL.Profile.crystals());
  }

  // ---------- Zeichnen ----------

  let view = null;
  let dpr = 0; // 0 = noch nicht vermessen (erstes layout() baut alles)
  let fxDpr = 1; // Konfetti braucht keine 3-fache Auflösung - spart auf Handys viel Arbeit

  // Größen setzen. Auf dem Handy feuert "resize" bei jedem Ein-/Ausfahren der Adressleiste - die
  // Walzen (Breite) und die Gewinntabelle (Pixeldichte) baut es nur neu, wenn sich das geändert hat,
  // sonst nur die Konfetti-Ebene (Höhe des Fensters).
  function layout() {
    fxDpr = Math.min(2, window.devicePixelRatio || 1);
    fxCanvas.width = Math.round(window.innerWidth * fxDpr);
    fxCanvas.height = Math.round(window.innerHeight * fxDpr);
    fxDirty = true;
    const newDpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    if (!w) return; // Seite (noch) unsichtbar - das nächste resize baut alles
    if (view && view.w === w && dpr === newDpr) return;
    const dprChanged = dpr !== newDpr;
    dpr = newDpr;
    const h = Math.round(Math.min(270, Math.max(150, w * 0.62)));
    canvas.style.height = h + (canvas.offsetHeight - canvas.clientHeight) + "px"; // + Rahmen
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const gap = 3;
    const reelW = (w - gap * 2) / 3;
    view = { w, h, gap, reelW, cy: h / 2, cellH: h / 3, reelX: (i) => i * (reelW + gap) };
    if (dprChanged) renderPaytable();
    draw(performance.now());
  }

  // Holo-Silber wie die Sterne eines Leap-Levels mit 100 % (games/leap/css/style.css): kühler
  // Verlauf von Weiß zu Silberblau, über den ab und zu ein Lichtschein zieht - von Walze zu Walze
  // leicht versetzt (POP_STAGGER_MS). Bekommen die Symbole bei drei gleichen.
  const HOLO_BASE = [[0, "#ffffff"], [0.3, "#eef3fb"], [0.65, "#cdd7e8"], [1, "#a6b3cb"]];
  const HOLO_SHINE = [[0, "rgba(242,247,255,0)"], [0.32, "#f2f7ff"], [0.45, "#ffffff"], [0.58, "#efe9ff"], [0.72, "#e0f8f3"], [1, "rgba(224,248,243,0)"]];
  const SHINE_MS = 2600; // ein Durchgang: Schein läuft durch, dann Pause
  const SHINE_ROUNDS = 3; // danach steht das Silber ruhig (die Schleife darf schlafen)
  const HOLO_DIR = [0.906, 0.423]; // Laufrichtung des Scheins (115° wie im CSS)

  // Gewinn-Show: Das Walzenfenster dimmt ab wie ein Saal, wenn das Licht ausgeht, und nur die
  // Gewinner leuchten - sie ploppen nacheinander rein, mit Lichthof dahinter. Bei drei gleichen
  // blitzt es kurz auf.
  const VEIL = { pair: 0.8, three: 0.84, jackpot: 0.9 }; // so dunkel wird es (halb dunkel wirkt nur grau)
  const VEIL_IN_MS = 260;
  const VEIL_OUT_MS = 200; // beim nächsten Dreh geht das Licht wieder an
  const POP_MS = 380;
  const POP_STAGGER_MS = 80; // Gewinner ploppen von links nach rechts
  const FLASH_MS = 200;

  function gradient(c, x0, y0, x1, y1, stops) {
    const g = c.createLinearGradient(x0, y0, x1, y1);
    for (const [at, color] of stops) g.addColorStop(at, color);
    return g;
  }

  // Lichtschein t ms nach dem Gewinn als schmaler Verlauf schräg übers Symbol - null = gerade keiner
  function shine(c, s, t) {
    if (!Number.isFinite(t) || t < 0) return null;
    const u = (t % SHINE_MS) / (SHINE_MS * 0.45);
    if (u >= 1) return null;
    const p = -1.7 + 3.4 * u;
    const [dx, dy] = HOLO_DIR;
    return gradient(c, (p - 0.6) * s * dx, (p - 0.6) * s * dy, (p + 0.6) * s * dx, (p + 0.6) * s * dy, HOLO_SHINE);
  }

  // Vieleck mit runden Ecken - pts und r in Einheiten von s
  function roundedPoly(c, pts, s, r) {
    const n = pts.length;
    const [ax, ay] = pts[n - 1], [bx, by] = pts[0];
    c.moveTo(((ax + bx) / 2) * s, ((ay + by) / 2) * s);
    for (let i = 0; i < n; i++) {
      const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % n];
      c.arcTo(x1 * s, y1 * s, x2 * s, y2 * s, r * s);
    }
    c.closePath();
  }

  function regular(corners, outer, inner = 0) {
    const n = inner ? corners * 2 : corners;
    return Array.from({ length: n }, (_, k) => {
      const a = -Math.PI / 2 + (k * Math.PI * 2) / n;
      const r = inner && k % 2 ? inner : outer;
      return [Math.cos(a) * r, Math.sin(a) * r];
    });
  }

  // Die Symbole: Mittelpunkt (0, 0), s = halbe Größe. Weiche, runde Ecken - bis auf die Sieben.
  const SHAPES = {
    triangle: { pts: [[0, -0.8], [0.86, 0.62], [-0.86, 0.62]], r: 0.22 },
    square: { pts: [[-0.62, -0.62], [0.62, -0.62], [0.62, 0.62], [-0.62, 0.62]], r: 0.24 },
    hexagon: { pts: regular(6, 0.76), r: 0.18 },
    star: { pts: regular(5, 0.94, 0.44), r: 0.11 },
  };
  // Die Sieben wie auf echten Walzen: fetter Querbalken mit rundem Ohr links, darunter ein
  // geschwungener Schaft - oben schmal, unten ein breiter Fuß, die rechte Kante hohl. Gezeichnet
  // wird sie umrandet mit dunklem 3D-Versatz (drawSymbol), so sticht sie aus den Formen heraus.
  function sevenPath(c, s) {
    const P = (x, y) => [x * s, y * s];
    c.moveTo(...P(-0.62, -0.84));
    c.lineTo(...P(0.58, -0.84));
    c.quadraticCurveTo(...P(0.68, -0.84), ...P(0.64, -0.72)); // obere rechte Ecke
    c.bezierCurveTo(...P(0.42, -0.38), ...P(0.2, 0.22), ...P(0.24, 0.84)); // rechte Kante, hohl
    c.lineTo(...P(-0.36, 0.84)); // breiter Fuß
    c.bezierCurveTo(...P(-0.36, 0.28), ...P(-0.08, -0.2), ...P(0.22, -0.5)); // linke Kante, bauchig
    c.lineTo(...P(-0.3, -0.5)); // Unterkante des Balkens
    c.bezierCurveTo(...P(-0.31, -0.4), ...P(-0.38, -0.32), ...P(-0.48, -0.32)); // Ohr
    c.bezierCurveTo(...P(-0.57, -0.32), ...P(-0.62, -0.38), ...P(-0.62, -0.47));
    c.closePath();
  }
  const SEVEN_DEPTH = [0.07, 0.09]; // 3D-Versatz nach rechts unten (in Einheiten von s)

  function symbolPath(c, id, s) {
    c.beginPath();
    if (id === "dot") c.arc(0, 0, s * 0.62, 0, Math.PI * 2);
    else if (id === "seven") sevenPath(c, s);
    else roundedPoly(c, SHAPES[id].pts, s, SHAPES[id].r);
  }

  // paint: null = dunkel (wie alles auf speedLab), "light" = hell, eine Zahl = Holo-Silber, t ms nach
  // dem Gewinn (für den Schein; Infinity = ohne Schein)
  function drawSymbol(c, id, s, paint = null) {
    const holo = typeof paint === "number";
    const seven = id === "seven";
    // Sieben: erst der 3D-Versatz (auf dunklem Grund als Schatten), Füllung hell bzw. Holo
    if (seven) {
      c.save();
      c.translate(SEVEN_DEPTH[0] * s, SEVEN_DEPTH[1] * s);
      symbolPath(c, id, s);
      c.fillStyle = paint == null ? INK : "rgba(0, 0, 0, 0.45)";
      c.fill();
      c.restore();
    }
    symbolPath(c, id, s);
    c.fillStyle = holo ? gradient(c, -s, -s, s, s, HOLO_BASE) : seven || paint === "light" ? CREAM : INK;
    c.fill();
    const band = holo ? shine(c, s, paint) : null;
    if (band) {
      c.fillStyle = band;
      c.fill();
    }
    if (seven) {
      c.lineWidth = s * 0.09;
      c.lineJoin = "round";
      c.strokeStyle = INK;
      c.stroke();
    }
  }

  const easeOut = (u) => 1 - Math.pow(1 - Math.min(1, Math.max(0, u)), 3);
  const popEase = (u) => 1 + 2.4 * Math.pow(u - 1, 3) + 1.4 * Math.pow(u - 1, 2);

  // Wie dunkel das Fenster gerade ist: beim Gewinn wird es dunkel, beim nächsten Dreh wieder hell
  let veilOut = null; // { from, start } - Licht geht wieder an
  function veilAt(now) {
    if (round && round.revealed && round.result.kind) {
      const r = round.result;
      const target = r.kind === "pair" ? VEIL.pair : r.symbol === "seven" ? VEIL.jackpot : VEIL.three;
      return target * easeOut((now - round.winAt) / VEIL_IN_MS);
    }
    if (veilOut) {
      const u = (now - veilOut.start) / VEIL_OUT_MS;
      if (u < 1) return veilOut.from * (1 - easeOut(u));
      veilOut = null;
    }
    return 0;
  }

  function draw(now) {
    if (!view) return;
    const { w, h, gap, reelW, cy, cellH } = view;
    const top = cy - cellH / 2; // Oberkante der Gewinnlinie (mittlere Reihe)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = BAND;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = CREAM;
    ctx.fillRect(0, top, w, cellH);
    const s = Math.min(reelW * 0.24, cellH * 0.33);
    const result = round && round.revealed && round.result.kind ? round.result : null;
    const since = result ? now - round.winAt : Infinity;
    const tease = teasing(now);

    reels.forEach((r, i) => {
      const x0 = view.reelX(i);
      const cx = x0 + reelW / 2;
      const winning = result && result.reels.includes(i);
      ctx.save();
      ctx.beginPath();
      ctx.rect(x0, 0, reelW, h);
      ctx.clip();
      // Spannung: die letzte Walze blinkt - ihre ganze Fläche dunkelt im Takt ab, hinter den Symbolen
      if (tease && i === reels.length - 1) {
        const t = 0.5 + 0.5 * Math.sin(now / 70);
        ctx.fillStyle = `rgba(43, 36, 32, ${(0.05 + 0.25 * t).toFixed(3)})`;
        ctx.fillRect(x0, 0, reelW, h);
      }
      // Bewegungsunschärfe: in voller Fahrt verwischen die Symbole in Laufrichtung
      const speed = Math.abs(r.v);
      const ghosts = Math.min(3, Math.floor(speed / 8));
      const alpha = 1 / (1 + speed / 22);
      const smear = (r.v / 60) * 0.8; // Weg eines Frames in Feldern
      const base = Math.floor(r.pos);
      for (let k = base - 2; k <= base + 3; k++) {
        if (winning && k === r.pos) continue; // Gewinner kommen erst über den Schleier
        const id = r.strip[mod(k, r.n)];
        const d = k - r.pos;
        for (let g = ghosts; g >= 0; g--) {
          drawCell(cx, d + (g ? (smear * g) / ghosts : 0), id, s, (g ? 0.45 / g : 1) * alpha);
        }
      }
      ctx.restore();
    });

    // Obere und untere Reihe liegen im Halbschatten: ihre Symbole werden grau
    ctx.fillStyle = "rgba(237, 229, 216, 0.6)";
    ctx.fillRect(0, 0, w, top);
    ctx.fillRect(0, top + cellH, w, h - top - cellH);

    // Licht aus ...
    const veil = veilAt(now);
    if (veil > 0) {
      ctx.fillStyle = `rgba(43, 36, 32, ${veil.toFixed(3)})`;
      ctx.fillRect(0, 0, w, h);
    }
    // ... nur die Gewinner leuchten: Lichthof, dann das Symbol, das reinploppt und pulsiert
    if (result) {
      const holo = result.kind === "three";
      result.reels.forEach((i) => {
        const cx = view.reelX(i) + reelW / 2;
        const t = since - i * POP_STAGGER_MS;
        if (t < 0) return;
        const pop = 0.7 + 0.38 * popEase(Math.min(1, t / POP_MS));
        const pulse = t < WIN_PULSE_MS ? 0.5 - 0.5 * Math.cos((t / 1000) * Math.PI * 2 * 1.7) : 0;
        const scale = pop + 0.06 * pulse;
        const halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, s * 1.7 * scale);
        halo.addColorStop(0, holo ? "rgba(225, 236, 255, 0.5)" : "rgba(251, 247, 240, 0.28)");
        halo.addColorStop(1, "rgba(225, 236, 255, 0)");
        ctx.fillStyle = halo;
        ctx.fillRect(cx - s * 2, cy - s * 2, s * 4, s * 4);
        const shineAt = t < SHINE_MS * SHINE_ROUNDS ? t - POP_MS : Infinity;
        drawCell(cx, 0, result.symbol, s, Math.min(1, t / 120), holo ? shineAt : "light", scale);
      });
      // Bei drei gleichen blitzt es einmal hell auf
      if (holo && since < FLASH_MS) {
        ctx.fillStyle = `rgba(251, 247, 240, ${(0.55 * (1 - since / FLASH_MS)).toFixed(3)})`;
        ctx.fillRect(0, 0, w, h);
      }
    }

    // Trennstege zwischen den Walzen (die Pfeile der Gewinnlinie sind CSS, slots.css)
    ctx.fillStyle = INK;
    for (let i = 1; i < reels.length; i++) ctx.fillRect(view.reelX(i) - gap, 0, gap, h);
  }

  // Ein Feld der Walze: d = Abstand zur Gewinnlinie in Feldern (positiv = darüber)
  function drawCell(cx, d, id, s, alpha, paint = null, scale = 1) {
    if (Math.abs(d) > 2) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(cx, view.cy - d * view.cellH);
    ctx.scale(scale, scale);
    drawSymbol(ctx, id, s, paint);
    ctx.restore();
  }

  // Die Effekt-Canvas liegt über der ganzen Seite - gelöscht und gezeichnet wird nur, solange dort
  // Konfetti fliegt (plus ein letztes Mal zum Leeren). Wackeln nur setzen, wenn es sich ändert.
  let fxDirty = false;
  let lastShake = "";
  function drawFx() {
    const active = fx.particles.length > 0 || fx.texts.length > 0;
    if (active || fxDirty) {
      fxCtx.setTransform(fxDpr, 0, 0, fxDpr, 0, 0);
      fxCtx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      if (active) fx.render(fxCtx, (x, y) => [x, y]);
      fxDirty = active;
    }
    const shake = fx.getShakeOffset();
    const transform = shake.x || shake.y ? `translate(${shake.x.toFixed(1)}px, ${shake.y.toFixed(1)}px)` : "";
    if (transform !== lastShake) {
      stage.style.transform = transform;
      lastShake = transform;
    }
  }

  // ---------- Bedienung ----------

  // hint = Hinweis (Bedienung, zu wenig Coins) - wird bei jeder Änderung neu gesetzt. Meldungen zum
  // letzten Dreh bleiben stehen, bis man wieder dreht.
  let messageIsHint = false;
  function setMessage(text, hint = false) {
    messageEl.textContent = text;
    messageIsHint = hint;
  }

  const nopeText = () => (SL.Profile.coins() >= stakeOf(S.STAKES[0]) ? "Zu wenig Coins für diesen Einsatz" : "Zu wenig Coins – hol dir welche in den Spielen");

  function updateControls() {
    const busy = spinning();
    const coins = SL.Profile.coins();
    const stake = stakeOf(settings.level);
    document.getElementById("slot-spin-label").textContent = busy ? "Stopp" : "Dreh";
    spinBtn.setAttribute("aria-label", busy ? "Stopp" : `Drehen für ${stake} Coins`);
    spinBtn.classList.toggle("is-stop", busy);
    spinBtn.disabled = !busy && coins < stake;
    document.getElementById("slot-stake").textContent = stake;
    document.querySelectorAll("#slot-stakes button").forEach((btn) => {
      const level = Number(btn.dataset.level);
      btn.classList.toggle("active", level === settings.level);
      btn.setAttribute("aria-pressed", String(level === settings.level));
      btn.disabled = busy;
    });
    const sound = document.getElementById("slot-sound");
    sound.innerHTML = `<span class="slot-toggle-knob"></span>${settings.sound ? "Ton an" : "Ton aus"}`;
    sound.setAttribute("aria-pressed", String(settings.sound));
    if (!busy && (messageIsHint || !messageEl.textContent)) setMessage(coins >= stake ? "Drück Dreh" : nopeText(), true);
  }

  function renderStakes() {
    document.getElementById("slot-stakes").innerHTML = S.STAKES
      .map((level) => `<button type="button" data-level="${level}" aria-label="${stakeOf(level)} Coins">${stakeOf(level)}</button>`).join("");
  }

  // Gewinntabelle: drei gleiche je Symbol, dazu "2 gleiche von links" - Beträge für den Einsatz
  function renderPaytable() {
    const level = settings.level;
    const row = (ids, label, pay) => `<div class="pay-row">
      <span class="pay-symbols">${ids.map((id) => (id ? `<canvas class="pay-symbol" data-symbol="${id}"></canvas>` : `<span class="pay-any"></span>`)).join("")}</span>
      <span class="pay-label">${label}</span>
      <span class="pay-dots" aria-hidden="true"></span>
      <b class="pay-amount">${pay * level}${CRYSTAL_ICON}</b>
    </div>`;
    const rows = [...S.SYMBOLS].reverse().map((sym) => row([sym.id, sym.id, sym.id], `3× ${sym.name}`, sym.pay3));
    rows.push(row(["dot", "dot", null], "2 gleiche", S.evaluate(["dot", "dot", "star"]).pay));
    document.getElementById("paytable-stake").textContent = `bei ${stakeOf(level)} Einsatz`;
    document.getElementById("paytable").innerHTML = rows.join("");
    document.querySelectorAll(".pay-symbol").forEach((c) => {
      const size = c.clientWidth;
      c.width = Math.round(size * dpr);
      c.height = Math.round(size * dpr);
      const x = c.getContext("2d");
      x.setTransform(dpr, 0, 0, dpr, size / 2 * dpr, size / 2 * dpr);
      drawSymbol(x, c.dataset.symbol, size * 0.46);
    });
    const odds = S.odds();
    document.getElementById("paytable-note").textContent = `Mittlere Reihe zählt · Gewinnchance ≈${Math.round(odds.hitRate * 100)} %`;
  }

  function onKeydown(e) {
    if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
    if (e.key !== " " && e.key !== "Enter") return;
    // Auf einem fokussierten Knopf löst der Browser selbst aus
    if (e.target.closest && e.target.closest("button, a, input")) return;
    e.preventDefault();
    press();
  }

  // So lange bewegt sich nach einem Gewinn noch etwas (Puls, bei drei gleichen der Holo-Schein)
  const winShowMs = (result) => Math.max(WIN_PULSE_MS, result.kind === "three" ? SHINE_MS * SHINE_ROUNDS : 0) + 2 * POP_STAGGER_MS;

  // ---------- Schleife ----------
  // Läuft nur, solange sich etwas bewegt (Walzen, Zahlen, Konfetti, Gewinn-Puls)

  let rafId = null;
  let lastFrame = 0;

  function kick() {
    if (rafId) return;
    lastFrame = performance.now();
    rafId = requestAnimationFrame(frame);
  }

  function frame(now) {
    const dt = Math.min(50, now - lastFrame);
    lastFrame = now;
    updateReels(now);
    if (round && !round.revealed && round.revealAt != null && now >= round.revealAt) reveal(now);
    updateTease(now);
    updateTweens(now);
    fx.update(dt);
    draw(now);
    drawFx();
    const busy = spinning() || tweens.size || fx.particles.length || fx.texts.length || fx.shakeMs > 0
      || (round && round.revealed && round.result.kind && now - round.winAt < winShowMs(round.result));
    rafId = busy ? requestAnimationFrame(frame) : null;
  }

  // ---------- Start ----------

  document.addEventListener("DOMContentLoaded", () => {
    // "Zurück" in den Shop - und von dort ins Spiel, aus dem man kam
    const from = new URLSearchParams(location.search).get("from");
    if (from) document.getElementById("slots-back").href = `../shop/?from=${encodeURIComponent(from)}`;

    SL.Audio.setEnabled(settings.sound);
    syncWallet();
    renderStakes();
    layout(); // zeichnet beim ersten Mal auch die Gewinntabelle
    updateControls();

    spinBtn.addEventListener("click", () => {
      spinBtn.blur();
      press();
    });
    document.getElementById("slot-stakes").addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-level]");
      if (!btn || spinning()) return;
      settings.level = Number(btn.dataset.level);
      saveSettings();
      SL.Audio.play("click");
      setMessage("");
      updateControls();
      renderPaytable();
    });
    document.getElementById("slot-sound").addEventListener("click", () => {
      settings.sound = !settings.sound;
      saveSettings();
      SL.Audio.setEnabled(settings.sound);
      updateControls();
    });
    // Audio darf erst nach einer Nutzer-Geste starten
    document.addEventListener("pointerdown", () => SL.Audio.ensure(), true);
    window.addEventListener("keydown", onKeydown);
    window.addEventListener("resize", layout);
    // Coins/Kristalle können sich in einem anderen Tab ändern. Nicht mitten in einer Show und nicht
    // beim eigenen Buchen - sonst stünde der Gewinn schon da, bevor die Walzen anhalten.
    SL.Profile.onChange(() => {
      if (booking || spinning() || tweens.size) return;
      syncWallet();
      updateControls();
    });
    window.addEventListener("pageshow", (e) => {
      if (!e.persisted) return;
      if (!spinning()) syncWallet();
      updateControls();
    });
  });
})();
