// Screens, Game-Loop, Eingabe, Ergebnis. Prototyp: ein einziger Kampf (SL.BOSS), keine Level,
// keine Coins. Die Anzeigen im Kampf (Leisten, Uhr, Ansagen) zeichnet der Renderer selbst.
window.SL = window.SL || {};

SL.UI = (function () {
  let state; // Save-State (aus Storage)
  let session = null;
  const effects = new SL.Effects();
  let finishTimer = null;
  let resultTimers = [];
  let rafId = null;
  let lastFrameTime = 0;
  let paused = false;
  let viewSize = 0;
  let pixelRatio = 1;
  let slowUntil = 0; // Zeitlupe (echte Zeit, performance.now)
  let slowFactor = 1;
  let lastTickSec = null;

  const canvas = document.getElementById("game-canvas");
  const ctx = canvas.getContext("2d");
  const canvasWrap = document.querySelector(".canvas-wrap");
  const startHint = document.getElementById("start-hint");
  const pauseOverlay = document.getElementById("pause-overlay");
  const R = SL.Renderer;

  // N = zuschlagen, W/E = ausweichen, S = ducken
  const KEY_MAP = {
    ArrowUp: "N", w: "N", W: "N", " ": "N",
    ArrowDown: "S", s: "S", S: "S",
    ArrowLeft: "W", a: "W", A: "W",
    ArrowRight: "E", d: "E", D: "E",
  };

  function formatTime(ms) {
    return (ms / 1000).toFixed(1) + "s";
  }

  function showScreen(id) {
    document.querySelectorAll(".screen").forEach((el) => el.classList.remove("active"));
    document.getElementById(id).classList.add("active");
    if (id !== "screen-game") stopGameLoop();
    if (id !== "screen-results") clearResultTimers();
    if (id === "screen-menu") refreshMenu();
  }

  const STAR_ICON = `<svg class="icon star-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.05L14.91 9.05L22.46 9.65L16.71 14.58L18.47 21.95L12 18L5.53 21.95L7.29 14.58L1.54 9.65L9.09 9.05Z"/></svg>`;
  const HEART_ICON = `<svg class="icon heart-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-7.5-10.2C4.5 7.4 6.7 5.3 9.2 5.3c1.3 0 2.2.6 2.8 1.6.6-1 1.5-1.6 2.8-1.6 2.5 0 4.7 2.1 4.7 5 0 5.6-7.5 10.2-7.5 10.2z"/></svg>`;

  function starsHtml(count) {
    return [1, 2, 3].map((i) => `<span class="star ${i <= count ? "on" : "off"}">${STAR_ICON}</span>`).join("");
  }

  function heartsHtml(count, max) {
    return Array.from({ length: max }, (_, i) => `<span class="heart ${i < count ? "on" : "off"}">${HEART_ICON}</span>`).join("");
  }

  // Menü: bisher bestes Ergebnis
  function refreshMenu() {
    const r = state.record;
    document.getElementById("menu-best").innerHTML = r.wins
      ? `<span class="menu-best-stars">${starsHtml(r.stars)}</span><span>Bestzeit <b>${formatTime(r.bestTimeMs)}</b> · Combo <b>${r.bestCombo}</b></span>`
      : `<span>${r.tries ? `${r.tries} ${r.tries === 1 ? "Versuch" : "Versuche"} – noch nicht besiegt` : "Noch nicht gekämpft"}</span>`;
  }

  // Quadratisches Spielfeld, so groß wie Platz ist
  function sizeCanvas() {
    const availW = canvasWrap.clientWidth - 16;
    const availH = canvasWrap.clientHeight - 16;
    viewSize = Math.floor(Math.max(120, Math.min(560, availW, availH)));
    pixelRatio = window.devicePixelRatio || 1;
    canvas.style.width = viewSize + "px";
    canvas.style.height = viewSize + "px";
    canvas.width = Math.round(viewSize * pixelRatio);
    canvas.height = Math.round(viewSize * pixelRatio);
  }

  const LIGHT = ["#fbf7f0", "#c7bcaa"];
  const CONFETTI = ["#fbf7f0", "#c7bcaa", "#85786a"];

  function openFight() {
    clearTimeout(finishTimer);
    showScreen("screen-game");
    session = new SL.DuelSession(SL.BOSS);
    R.reset();
    effects.clear();
    slowUntil = 0;
    lastTickSec = null;
    sizeCanvas();
    bindSessionEvents();
    startHint.classList.remove("hidden");
    pauseOverlay.classList.add("hidden");
    paused = false;
    stopGameLoop();
    lastFrameTime = performance.now();
    rafId = requestAnimationFrame(gameLoop);
  }

  // Blitz und Zoom gehören zu den abschaltbaren Effekten
  function flash(ms) {
    if (effects.enabled) R.flash(ms);
  }

  function zoom(amount) {
    if (effects.enabled) R.zoom(amount);
  }

  function slowMo(ms, factor) {
    slowUntil = performance.now() + ms;
    slowFactor = factor;
  }

  // Spiel-Ereignisse -> Ton, Vibration, Effekte, Ansagen
  function bindSessionEvents() {
    const bossFoot = () => ({ x: R.BOSS.x, y: R.BOSS.y + 52 });
    session.onStart = () => {
      startHint.classList.add("hidden");
      R.announce("RUNDE 1", 1000, 8);
      SL.Audio.play("announce", "round");
    };
    session.onFight = () => {
      R.announce("LOS!", 650, 11);
      flash(50);
      SL.Audio.play("announce", "fight");
    };
    session.onWindup = (key) => SL.Audio.play("windup", key);
    session.onGlint = () => SL.Audio.play("glint");
    session.onStrike = () => SL.Audio.play("whoosh");
    session.onImpact = (key, attack, hit) => {
      R.impact(key);
      if (!hit) {
        SL.Audio.play("slam");
        effects.shake(attack.opens ? 5 : 3, 140);
      }
    };
    session.onOpen = () => {
      SL.Audio.play("open");
      R.popup("OFFEN!", R.BOSS.x, R.BOSS.y + 96);
    };
    session.onPerfect = () => {
      SL.Audio.play("perfect");
      SL.Haptics.vibrate(15);
      const p = R.playerPos(session);
      R.popup("PERFEKT!", p.x, p.y - 44);
      flash(60);
      zoom(0.05);
      slowMo(260, 0.3);
    };
    session.onDodge = () => SL.Audio.play("dodge");
    session.onSwing = (kind) => SL.Audio.play("swing", kind);
    session.onBossHit = (kind, combo) => {
      const upper = kind === "upper";
      const p = bossFoot();
      SL.Audio.play("bossHit", { kind, combo });
      SL.Haptics.vibrate(upper ? 30 : 12);
      R.spark(p.x + (Math.random() - 0.5) * 30, p.y - 10, upper ? 1.5 : 1);
      zoom(upper ? 0.06 : 0.02);
      R.cheer();
      if (upper) flash(45);
      effects.burst(p.x, p.y, { count: upper ? 18 : 8, colors: LIGHT, speed: [90, upper ? 260 : 180], life: [200, 450], size: [1.5, 3.5], angle: -Math.PI / 2, spread: Math.PI * 1.3, shape: "square" });
      effects.shake(upper ? 7 : 3, upper ? 200 : 100);
    };
    session.onBlocked = () => {
      SL.Audio.play("blocked");
      const f = R.fistPos(0);
      const g = R.fistPos(1);
      R.spark((f.x + g.x) / 2, (f.y + g.y) / 2 + 12, 0.7);
      R.popup("BLOCK!", R.BOSS.x, R.BOSS.y + 96);
    };
    session.onPlayerHit = () => {
      SL.Audio.play("crash");
      SL.Haptics.vibrate([40, 30, 60]);
      const p = R.playerPos(session);
      R.spark(p.x, p.y - 10, 1.2);
      zoom(0.04);
      effects.burst(p.x, p.y, { count: 16, colors: LIGHT, speed: [90, 220], life: [300, 600], size: [2, 4], shape: "square" });
      effects.shake(10, 320);
    };
    session.onRage = () => {
      SL.Audio.play("roar");
      R.announce("RASEND!", 900, 8);
      flash(70);
      effects.shake(6, 700);
    };
    session.onBossDown = () => {
      SL.Audio.play("announce", "ko");
      SL.Haptics.vibrate([30, 40, 60]);
      R.announce("K.O.", 1700, 13);
      flash(90);
      zoom(0.08);
      R.cheer();
      slowMo(900, 0.3);
      effects.burst(R.BOSS.x, R.BOSS.y, { count: 70, colors: CONFETTI, speed: [120, 320], life: [700, 1300], size: [2.5, 4.5], gravity: 380, shape: "confetti" });
    };
    session.onLose = (reason) => {
      SL.Audio.play("lose");
      R.announce(reason === "time" ? "ZEIT!" : "BESIEGT", 1400, 8);
    };
    session.onFinish = (result) => onFinished(result);
  }

  function gameLoop(now) {
    const realDt = Math.min(60, now - lastFrameTime);
    lastFrameTime = now;
    if (session) {
      const dt = paused ? 0 : realDt * (now < slowUntil ? slowFactor : 1);
      if (!paused) {
        session.update(dt);
        effects.update(dt);
        tickClock();
      }
      R.render(ctx, { session, viewSize, pixelRatio, dt, effects, shake: effects.getShakeOffset() });
    }
    rafId = requestAnimationFrame(gameLoop);
  }

  // Die letzten 5 Sekunden der Rundenuhr piepen
  function tickClock() {
    if (!session.started || session.endAt != null) return;
    const secs = Math.ceil(session.timeLeft() / 1000);
    if (secs <= 5 && secs !== lastTickSec) SL.Audio.play("tick");
    lastTickSec = secs;
  }

  function stopGameLoop() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
  }

  function onFinished(result) {
    const outcome = SL.Storage.recordResult(state, result);
    finishTimer = setTimeout(() => {
      populateResults(result);
      showScreen("screen-results");
      playResultsAnimation(result, outcome);
    }, 100);
  }

  const WIN_TITLES = { 3: "Perfekt!", 2: "K.o.-Sieg!", 1: "Knapp!" };

  function populateResults(result) {
    const boss = SL.BOSS;
    document.getElementById("results-title").textContent = result.won
      ? WIN_TITLES[result.stars]
      : result.reason === "time" ? "Zeit um" : "Besiegt";
    document.getElementById("results-badge").classList.add("hidden");
    document.getElementById("results-stars").innerHTML = starsHtml(0);
    document.getElementById("results-time").textContent = formatTime(result.timeMs);
    document.getElementById("results-hearts").innerHTML = `<span class="result-hearts">${heartsHtml(result.hearts, boss.hearts)}</span>`;
    document.getElementById("results-combo").textContent = result.maxCombo;
    document.getElementById("results-perfects").textContent = result.perfects;
    document.getElementById("results-blocked").textContent = result.blocked;
    document.getElementById("results-note").innerHTML = result.won
      ? (result.stars === 3 ? "Kein Treffer kassiert." : "Jedes behaltene Leben ist ein Stern.")
      : `Klotz hatte noch <b>${result.bossHpLeft}</b> von ${boss.hp} Energie.`;
  }

  function playResultsAnimation(result, outcome) {
    clearResultTimers();
    const stars = document.querySelectorAll("#results-stars .star");
    const step = effects.enabled ? 260 : 120;
    for (let i = 0; i < result.stars; i++) {
      resultTimers.push(setTimeout(() => {
        stars[i].classList.replace("off", "on");
        stars[i].classList.add("pop");
        SL.Audio.play("star", i);
      }, 200 + i * step));
    }
    if (outcome.isNewBest) {
      resultTimers.push(setTimeout(() => {
        const badge = document.getElementById("results-badge");
        badge.classList.remove("hidden");
        badge.classList.remove("pop");
        void badge.offsetWidth;
        badge.classList.add("pop");
      }, 200 + result.stars * step));
    }
  }

  function clearResultTimers() {
    resultTimers.forEach(clearTimeout);
    resultTimers = [];
  }

  function togglePause() {
    if (!session || session.finished) return;
    paused = !paused;
    pauseOverlay.classList.toggle("hidden", !paused);
    if (!paused) lastFrameTime = performance.now();
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  }

  function isGameActive() {
    return document.getElementById("screen-game").classList.contains("active");
  }

  // Gemeinsamer Eingang für Tastatur und Tipp-Steuerung
  function input(dir) {
    if (!session || paused || !isGameActive() || SL.Settings.isOpen()) return;
    session.press(dir);
  }

  function handleKeydown(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (SL.Settings.isOpen()) {
      if (e.key === "Escape") { e.preventDefault(); SL.Settings.close(); }
      return;
    }
    const gameActive = isGameActive();
    if (e.key === "Escape" || e.key === "p" || e.key === "P") {
      if (gameActive) { e.preventDefault(); togglePause(); }
      return;
    }
    if ((e.key === "r" || e.key === "R") && gameActive) {
      e.preventDefault();
      openFight();
      return;
    }
    // Ergebnis: Leertaste/Enter = nochmal
    if ((e.key === " " || e.key === "Enter") && document.getElementById("screen-results").classList.contains("active")) {
      e.preventDefault();
      openFight();
      return;
    }
    const dir = KEY_MAP[e.key];
    if (!dir || !gameActive || paused || !session) return;
    e.preventDefault();
    if (e.repeat) return; // gehaltene Taste zählt nicht
    input(dir);
  }

  function restartAnimation(el, className) {
    el.classList.remove(className);
    void el.offsetWidth;
    el.classList.add(className);
  }

  // Tipp-Steuerung: wie in Maze zählt jeder Tipp in der unteren Fläche für den Knopf in dieser
  // Richtung - gemessen vom Punkt zwischen den Ausweich-Knöpfen, darüber liegt der große Schlag-Knopf
  function bindTapPad() {
    const pad = document.querySelector(".tap-pad");
    const field = pad.querySelector(".tap-field");
    const activePointers = new Map();
    const setPressed = (dir, on) => {
      pad.querySelectorAll(`[data-zone="${dir}"]`).forEach((el) => el.classList.toggle("pressed", on));
    };
    pad.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      const rect = field.getBoundingClientRect();
      const dx = e.clientX - (rect.left + rect.width / 2);
      const dy = e.clientY - (rect.top + rect.height * 0.62);
      const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "E" : "W") : (dy > 0 ? "S" : "N");
      activePointers.set(e.pointerId, dir);
      setPressed(dir, true);
      restartAnimation(pad.querySelector(`.tap-btn[data-zone="${dir}"]`), "ring");
      SL.Haptics.vibrate(6);
      input(dir);
    });
    const release = (e) => {
      const dir = activePointers.get(e.pointerId);
      if (!dir) return;
      activePointers.delete(e.pointerId);
      if (![...activePointers.values()].includes(dir)) setPressed(dir, false);
    };
    for (const type of ["pointerup", "pointercancel", "pointerleave"]) pad.addEventListener(type, release);
    pad.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  function applyTouchControls() {
    const mode = state.settings.touchControls;
    const show = mode === "on" || (mode === "auto" && window.matchMedia("(pointer: coarse)").matches);
    document.getElementById("app").classList.toggle("tap-controls", show);
    startHint.innerHTML = show
      ? "Pfeile weichen aus, Stern schlägt zu<br><b>Tippe, um zu starten</b>"
      : "← → ausweichen · ↓ ducken · ↑ zuschlagen<br><b>Taste drücken, um zu starten</b>";
    if (isGameActive()) sizeCanvas();
  }

  function syncViewportHeight() {
    const vv = window.visualViewport;
    if (vv && vv.scale > 1.01) return;
    const height = vv ? vv.height : window.innerHeight;
    document.documentElement.style.setProperty("--app-height", `${Math.round(height)}px`);
  }

  function init() {
    state = SL.Storage.load();
    syncViewportHeight();
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", () => {
        syncViewportHeight();
        if (isGameActive()) sizeCanvas();
      });
    }

    document.querySelectorAll("[data-nav]").forEach((btn) => {
      btn.addEventListener("click", () => showScreen(btn.dataset.nav));
    });
    document.getElementById("btn-play").addEventListener("click", openFight);
    document.getElementById("btn-settings").addEventListener("click", () => SL.Settings.open());
    document.getElementById("btn-pause").addEventListener("click", togglePause);
    document.getElementById("btn-resume").addEventListener("click", togglePause);
    document.getElementById("btn-restart").addEventListener("click", openFight);
    document.getElementById("btn-pause-settings").addEventListener("click", () => SL.Settings.open());
    document.getElementById("btn-retry").addEventListener("click", openFight);
    bindTapPad();

    document.addEventListener("pointerdown", (e) => {
      SL.Audio.ensure();
      if (e.target.closest(".btn, .toggle, .segmented button")) SL.Audio.play("click");
    }, true);
    window.addEventListener("keydown", () => SL.Audio.ensure(), true);
    window.addEventListener("keydown", handleKeydown);
    window.addEventListener("resize", () => {
      syncViewportHeight();
      if (isGameActive()) sizeCanvas();
    });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden && isGameActive() && !paused) togglePause();
    });

    SL.Settings.init(state, (settings) => {
      effects.enabled = settings.effects;
      applyTouchControls();
    });
    refreshMenu();
  }

  return { init, showScreen };
})();
