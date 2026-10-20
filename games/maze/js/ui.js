// Screen-Umschaltung, DOM-Bindings, Game-Loop-Steuerung
window.SL = window.SL || {};

SL.UI = (function () {
  // Zellen sind jetzt immer gleich groß, egal wie groß das Level-Grid ist - die Kamera
  // zeigt nur einen Ausschnitt um den Spieler, statt das ganze Maze reinzuquetschen.
  const CELL_SIZE = 40;

  let state; // Save-State (aus Storage)
  let currentLevelId = null;
  let currentMode = "level"; // "level" | "daily"
  let currentConfig = null; // Level- bzw. Daily-Konfiguration des laufenden Spiels
  let session = null;
  const effects = new SL.Effects();
  let stepCombo = 0; // Schritte in schneller Folge -> Schritt-Ton wird leicht höher
  let lastStepAt = 0;
  let finishTimer = null; // kurze Pause mit Konfetti zwischen Zieleinlauf und Ergebnis
  let resultTimers = []; // gestaffelte Sterne-Animation im Ergebnis
  let mazeLayer = null;
  let playerSkin = null; // ausgerüsteter Skin + Spur, beim Levelstart festgelegt
  let playerTrail = null;
  let rafId = null;
  let lastFrameTime = 0;
  let paused = false;
  let viewSize = 0; // Kantenlänge des Viewports in logischen (CSS-)Pixeln
  let pixelRatio = 1; // devicePixelRatio, mit dem Canvas und mazeLayer gerade gebaut sind

  const canvas = document.getElementById("game-canvas");
  const ctx = canvas.getContext("2d");
  const canvasWrap = document.querySelector(".canvas-wrap");
  const startHint = document.getElementById("start-hint");
  const hudTimer = document.getElementById("hud-timer");
  const hudCoins = document.getElementById("hud-coins");
  const hudLevel = document.getElementById("hud-level");
  const hudStars = document.getElementById("hud-stars");
  const hudCoinPill = document.querySelector(".hud .coin-pill");
  let hudStarTier = null; // zuletzt angezeigte Sterne-Stufe im HUD
  const pauseOverlay = document.getElementById("pause-overlay");

  const KEY_MAP = {
    ArrowUp: "N", w: "N", W: "N",
    ArrowDown: "S", s: "S", S: "S",
    ArrowLeft: "W", a: "W", A: "W",
    ArrowRight: "E", d: "E", D: "E",
  };

  function formatTime(ms) {
    const totalSeconds = ms / 1000;
    if (totalSeconds < 60) return totalSeconds.toFixed(2) + "s";
    const m = Math.floor(totalSeconds / 60);
    const s = (totalSeconds % 60).toFixed(2).padStart(5, "0");
    return `${m}:${s}`;
  }

  function showScreen(id) {
    document.querySelectorAll(".screen").forEach((el) => el.classList.remove("active"));
    document.getElementById(id).classList.add("active");
    if (id !== "screen-game") stopGameLoop();
    if (id !== "screen-results") clearResultTimers();
    if (id === "screen-levels") {
      renderLevelMap();
      // Bei 30 Leveln liegt das aktuelle schnell außerhalb des Sichtbereichs
      const nextTile = document.querySelector(".level-tile.next");
      if (nextTile) nextTile.scrollIntoView({ block: "nearest" });
    }
    if (id === "screen-menu") refreshMenu();
  }

  // Coins sind spielübergreifend (Profil) - die Anzeigen zeigen also immer den Gesamtstand
  function refreshCoinDisplays() {
    const coins = SL.Profile.coins();
    for (const id of ["menu-coins", "levels-coins"]) document.getElementById(id).textContent = coins;
    hudCoins.textContent = session ? session.coinsCollected : 0;
  }

  // Icons als SVG/CSS statt Text-Glyphen (●, ★, 🔒): Glyphen sitzen je nach Schrift
  // unterschiedlich auf der Grundlinie und lassen sich nie sauber mittig ausrichten.
  const COIN_ICON = `<span class="coin-icon" aria-hidden="true"></span>`;
  const STAR_ICON = `<svg class="icon star-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.05L14.91 9.05L22.46 9.65L16.71 14.58L18.47 21.95L12 18L5.53 21.95L7.29 14.58L1.54 9.65L9.09 9.05Z"/></svg>`;
  const LOCK_ICON = `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><rect x="5" y="10.5" width="14" height="10.5" rx="2.5"/></svg>`;

  const FLAME_ICON = `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5c.7 3.3-1.3 5-3 6.8C7.3 11 6 12.8 6 15.3 6 18.7 8.7 21.5 12 21.5s6-2.8 6-6.2c0-2.5-1.2-4.3-2.7-5.7.1 1.7-.6 3-1.7 3.6.5-3.9-.4-7.4-1.6-10.7z"/></svg>`;

  // Icons mitten im Fließtext (die normalen sind display:block für Flex-Layouts)
  const INLINE_STAR = `<span class="inline-icon">${STAR_ICON}</span>`;
  const INLINE_COIN = `<span class="inline-icon">${COIN_ICON}</span>`;
  const INLINE_FLAME = `<span class="inline-icon">${FLAME_ICON}</span>`;

  function starsHtml(count) {
    return [1, 2, 3].map((i) => `<span class="star ${i <= count ? "on" : "off"}">${STAR_ICON}</span>`).join("");
  }

  function getThresholds(levelId) {
    return SL.Economy.computeThresholds(SL.getLevelMaze(levelId).optimalSteps);
  }

  function getResult(levelId) {
    return state.levelResults[String(levelId)] || null;
  }

  // "Als Nächstes": erstes freigeschaltetes Level ohne Ergebnis, sonst das erste ohne 3 Sterne
  function findNextLevel() {
    const unlocked = SL.LEVELS.filter((l) => SL.Economy.isLevelUnlocked(state, l.id));
    return unlocked.find((l) => !getResult(l.id)) || unlocked.find((l) => getResult(l.id).stars < 3) || null;
  }

  function statRow(label, value) {
    return `<div class="lv-stat"><span>${label}</span><b>${value}</b></div>`;
  }

  // Alle Kacheln haben denselben Aufbau (Kopf / Mitte / zwei Info-Zeilen), damit Inhalte
  // in jeder Kachel auf derselben Höhe sitzen - egal ob gesperrt, gespielt oder neu.
  function levelTileHtml(level, nextLevelId, coins) {
    const target = `&lt; ${formatTime(getThresholds(level.id).t3)}`;

    if (!SL.Economy.isLevelUnlocked(state, level.id)) {
      const affordable = coins >= level.unlockCost;
      const status = affordable
        ? `<div class="lv-stat lv-stat-center">Freischalten</div>`
        : `<div class="lv-stat lv-stat-center">Noch <b class="lv-inline-coin">${level.unlockCost - coins}${COIN_ICON}</b></div>`;
      return `<button type="button" class="level-tile locked ${affordable ? "affordable" : ""}" data-level="${level.id}" aria-label="Level ${level.id} freischalten für ${level.unlockCost} Coins">
        <div class="lv-head">${LOCK_ICON}</div>
        <div class="lv-mid lv-cost">${level.unlockCost}${COIN_ICON}</div>
        <div class="lv-stats">${status}${statRow("3 Sterne", target)}</div>
      </button>`;
    }

    const result = getResult(level.id);
    const classes = ["level-tile"];
    if (result && result.stars === 3) classes.push("perfect");
    if (level.id === nextLevelId) classes.push("next");
    return `<button type="button" class="${classes.join(" ")}" data-level="${level.id}">
      ${level.id === nextLevelId ? `<span class="lv-badge">${result ? "Nochmal" : "Weiter"}</span>` : ""}
      <div class="lv-head lv-num">${level.id}</div>
      <div class="lv-mid lv-stars">${starsHtml(result ? result.stars : 0)}</div>
      <div class="lv-stats">
        ${statRow("Bestzeit", result ? formatTime(result.bestTimeMs) : "–")}
        ${statRow("3 Sterne", target)}
      </div>
    </button>`;
  }

  function renderLevelMap() {
    const map = document.getElementById("level-map");
    const next = findNextLevel();
    const starsOf = (levels) => levels.reduce((sum, l) => sum + (getResult(l.id)?.stars || 0), 0);
    const totalStars = starsOf(SL.LEVELS);
    const maxStars = SL.LEVELS.length * 3;
    const completed = SL.LEVELS.filter((l) => getResult(l.id)).length;
    const pct = (part, whole) => `${Math.round((part / whole) * 100)}%`;
    const msPerTile = (SL.STAR_MS_PER_TILE[3] / 1000).toFixed(1).replace(".", ",");
    const coins = SL.Profile.coins();

    const summary = `<div class="levels-summary">
      <div class="summary-progress">
        <div class="summary-stars">${STAR_ICON}<b>${totalStars}</b><span>/ ${maxStars}</span></div>
        <div class="progress"><span style="width:${pct(totalStars, maxStars)}"></span></div>
        <div class="summary-sub">${completed} von ${SL.LEVELS.length} Level geschafft</div>
      </div>
      <div class="summary-rule">
        <div class="summary-rule-head">${starsHtml(3)}<b>Felder × ${msPerTile} s</b></div>
        <p>Felder = kürzester Weg zum Ziel. Nur wer schneller ist, holt 3 Sterne.</p>
      </div>
      ${next ? `<button type="button" class="btn btn-primary summary-continue" data-level="${next.id}">Weiterspielen<span class="btn-cost">Level ${next.id}</span></button>` : ""}
    </div>`;

    const chapters = SL.CHAPTERS.map((ch) => {
      const levels = SL.LEVELS.filter((l) => l.chapter === ch.id);
      const chStars = starsOf(levels);
      const anyUnlocked = levels.some((l) => SL.Economy.isLevelUnlocked(state, l.id));
      return `<section class="chapter ${anyUnlocked ? "" : "chapter-locked"}">
        <header class="chapter-head">
          <div class="chapter-title">
            <span class="chapter-kicker">Kapitel ${ch.id} · Level ${ch.firstLevel}–${ch.lastLevel}${ch.checkpoints ? ` · ${ch.checkpoints} Checkpoint${ch.checkpoints > 1 ? "s" : ""}` : ""}</span>
            <h3>${ch.name}</h3>
            <p>${ch.description}</p>
          </div>
          <div class="chapter-progress">
            <div class="chapter-stars">${STAR_ICON}<b>${chStars}</b><span>/ ${levels.length * 3}</span></div>
            <div class="progress"><span style="width:${pct(chStars, levels.length * 3)}"></span></div>
          </div>
        </header>
        <div class="level-grid">${levels.map((l) => levelTileHtml(l, next?.id, coins)).join("")}</div>
      </section>`;
    }).join("");

    map.innerHTML = summary + chapters;
    refreshCoinDisplays();
  }

  function onLevelTileClick(levelId, tileEl) {
    if (SL.Economy.isLevelUnlocked(state, levelId)) {
      openGame(levelId);
      return;
    }
    if (SL.Economy.canAffordUnlock(levelId)) {
      SL.Economy.unlockLevel(state, levelId);
      SL.Audio.play("unlock");
      openGame(levelId);
    } else {
      // Kurzes Schütteln als "zu wenig Coins"-Feedback; Klasse neu setzen, damit es
      // auch bei schnellen Mehrfachklicks jedes Mal wieder abspielt.
      SL.Audio.play("bump");
      tileEl.classList.remove("shake");
      void tileEl.offsetWidth;
      tileEl.classList.add("shake");
    }
  }

  // Die Maskottchen (Pause/Ergebnis) tragen den ausgerüsteten Skin (CSS kommt vom Muster des Skins)
  function applyPlayerLook() {
    SL.CosmeticsDraw.applyMascotLook(SL.Cosmetics.equipped("skin"));
  }

  // Fester quadratischer Ausschnitt (Viewport) - unabhängig von der Maze-Größe,
  // zeigt immer nur die Umgebung um den Spieler statt des ganzen Levels. Wird auch bei
  // Fenster-Resize/Zoom neu berechnet; die Pixelpuffer werden mit devicePixelRatio
  // hochskaliert, damit es auf HiDPI-Displays nicht verschwommen aussieht.
  function sizeCanvas() {
    const availW = canvasWrap.clientWidth - 8;
    const availH = canvasWrap.clientHeight - 8;
    viewSize = Math.floor(Math.max(120, Math.min(560, availW, availH)));
    const newRatio = window.devicePixelRatio || 1;
    canvas.style.width = viewSize + "px";
    canvas.style.height = viewSize + "px";
    canvas.width = Math.round(viewSize * newRatio);
    canvas.height = Math.round(viewSize * newRatio);
    if (session && newRatio !== pixelRatio) {
      mazeLayer = SL.Renderer.buildMazeLayer(session.maze, CELL_SIZE, newRatio);
    }
    pixelRatio = newRatio;
  }

  function cellCenter(cell) {
    return { x: cell.c * CELL_SIZE + CELL_SIZE / 2, y: cell.r * CELL_SIZE + CELL_SIZE / 2 };
  }

  const CONFETTI_COLORS = ["#ff8a5c", "#ffd166", "#c6f24a", "#8fd8ff", "#b084ff", "#ff6fa5", "#2b2420"];

  // Startet einen Lauf - für Level und Daily gleich, nur Konfiguration/Maze/Modus unterscheiden sich
  function openSession(config, maze, mode) {
    currentMode = mode;
    currentConfig = config;
    clearTimeout(finishTimer);
    showScreen("screen-game");

    session = new SL.GameSession(config, maze);
    effects.clear();
    stepCombo = 0;
    sizeCanvas();
    mazeLayer = SL.Renderer.buildMazeLayer(session.maze, CELL_SIZE, pixelRatio);
    bindSessionEvents();

    hudLevel.textContent = config.name;
    hudCoins.textContent = 0;
    hudTimer.textContent = "0.00s";
    hudStarTier = null;
    updateHudStars(0);
    startHint.classList.remove("hidden");
    pauseOverlay.classList.add("hidden");
    paused = false;
    // Look wird beim Start festgelegt und ändert sich während des Laufs nicht
    playerSkin = SL.Cosmetics.equipped("skin");
    playerTrail = SL.Cosmetics.equipped("trail");
    // "Verlassen" führt dorthin zurück, wo man herkam
    document.getElementById("btn-quit").dataset.nav = mode === "daily" ? "screen-menu" : "screen-levels";

    stopGameLoop();
    lastFrameTime = performance.now();
    rafId = requestAnimationFrame(gameLoop);
  }

  function openGame(levelId) {
    currentLevelId = levelId;
    openSession(SL.getLevel(levelId), SL.getLevelMaze(levelId), "level");
  }

  function openDaily() {
    const config = SL.Daily.getConfig();
    openSession(config, SL.Daily.getMaze(config), "daily");
  }

  // Spiel-Ereignisse -> Ton, Vibration, Partikel, HUD
  function bindSessionEvents() {
    session.onFirstMove = () => startHint.classList.add("hidden");
    session.onStep = () => {
      const now = performance.now();
      stepCombo = now - lastStepAt < 280 ? stepCombo + 1 : 0;
      lastStepAt = now;
      SL.Audio.play("step", stepCombo);
    };
    session.onBump = () => SL.Audio.play("bump");
    session.onCoinCollected = (cell) => {
      hudCoins.textContent = session.coinsCollected;
      restartAnimation(hudCoinPill, "pop");
      SL.Audio.play("coin");
      const p = cellCenter(cell);
      effects.burst(p.x, p.y, { count: 10, colors: ["#ffd166", "#f2a900", "#2b2420"], speed: [50, 150], life: [250, 500], size: [1.5, 3] });
    };
    session.onCheckpoint = (cell) => {
      SL.Audio.play("checkpoint");
      SL.Haptics.vibrate(25);
      const p = cellCenter(cell);
      effects.burst(p.x, p.y, { count: 16, colors: ["#2b2420", "#85786a"], speed: [80, 190], life: [300, 600], size: [2, 3.5], shape: "square" });
      effects.text(p.x, p.y - CELL_SIZE * 0.75, "Checkpoint!");
    };
    // Die Kamera springt beim Crash sofort zum Respawn - deshalb "Puff" + Wackeln dort
    session.onCrash = () => {
      SL.Audio.play("crash");
      SL.Haptics.vibrate([40, 30, 60]);
      stepCombo = 0;
      const p = cellCenter(session.cur);
      const accent = playerSkin.accent || playerSkin.colors[0];
      effects.burst(p.x, p.y, { count: 18, colors: [accent, "#2b2420", "#c0392b"], speed: [90, 220], life: [300, 650], size: [2, 4] });
      effects.shake(7, 260);
      if (session.respawnIndex >= 0) effects.text(p.x, p.y - CELL_SIZE * 0.75, "Zurück zum Checkpoint");
    };
    session.onFinish = (result) => onFinished(result);
  }

  function restartAnimation(el, className) {
    el.classList.remove(className);
    void el.offsetWidth;
    el.classList.add(className);
  }

  function gameLoop(now) {
    // dt treibt nur Crash-Flash und Effekte - die Stoppuhr misst selbst per performance.now(),
    // damit niedrige FPS die Zeit nicht verfälschen.
    const dt = Math.min(60, now - lastFrameTime);
    lastFrameTime = now;

    if (session) {
      if (!paused) {
        session.update(dt);
        effects.update(dt);
        if (!session.finished) {
          const elapsed = session.getElapsedMs();
          hudTimer.textContent = formatTime(elapsed);
          updateHudStars(elapsed);
        }
      }

      const sinceMove = now - session.lastMoveAt;
      SL.Renderer.render(ctx, {
        mazeLayer,
        cellSize: CELL_SIZE,
        viewSize,
        pixelRatio,
        coins: session.maze.coins,
        collectedSet: session.collectedSet,
        checkpoints: session.checkpoints,
        player: session.getPlayerPixel(CELL_SIZE),
        trail: session.trail,
        skin: playerSkin,
        trailStyle: playerTrail,
        time: now,
        direction: session.currentDir,
        flashStrength: session.getCrashFlashStrength(),
        effects,
        shake: effects.getShakeOffset(),
        squash: effects.enabled && sinceMove < 120 && !session.finished ? 1 - sinceMove / 120 : 0,
        finishMs: session.finishedAt != null ? now - session.finishedAt : null,
      });
    }

    // Läuft weiter, solange der Spiel-Screen offen ist (auch nach dem Ziel fürs Konfetti)
    rafId = requestAnimationFrame(gameLoop);
  }

  // Sterne-Anzeige unter dem Timer: welche Wertung gerade noch drin ist und bis wann.
  // Nur neu zeichnen, wenn sich die Stufe ändert (nicht jeden Frame).
  function updateHudStars(elapsedMs) {
    const tier = SL.Economy.starsForTime(elapsedMs, session.thresholds);
    if (tier === hudStarTier) return;
    if (hudStarTier !== null && tier < hudStarTier) SL.Audio.play("starLost");
    hudStarTier = tier;
    const deadline = tier === 3 ? session.thresholds.t3 : tier === 2 ? session.thresholds.t2 : null;
    hudStars.innerHTML = starsHtml(tier) + `<span>${deadline != null ? `&lt; ${formatTime(deadline)}` : "Ins Ziel!"}</span>`;
    // Kurzer Puls, wenn ein Stern verloren geht (Klasse neu setzen, damit es auch bei 2 -> 1 abspielt)
    hudStars.classList.remove("dropped");
    if (tier < 3) {
      void hudStars.offsetWidth;
      hudStars.classList.add("dropped");
    }
  }

  function stopGameLoop() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
  }

  // Zieleinlauf: Ergebnis sofort speichern, kurz Konfetti zeigen, dann Ergebnis-Screen
  function onFinished(result) {
    SL.Audio.play("finish");
    SL.Haptics.vibrate([20, 40, 20]);
    const p = session.getPlayerPixel(CELL_SIZE);
    effects.burst(p.x, p.y, { count: 70, colors: CONFETTI_COLORS, speed: [120, 320], life: [700, 1300], size: [2.5, 4.5], gravity: 380, shape: "confetti" });
    const outcome = currentMode === "daily" ? recordDailyRun(result) : recordLevelRun(result);
    finishTimer = setTimeout(() => {
      populateResults(result, outcome);
      showScreen("screen-results");
      playResultsAnimation(result, outcome);
    }, effects.enabled ? 850 : 250);
  }

  function recordLevelRun(result) {
    const prev = getResult(currentLevelId);
    const coinsEarned = SL.Economy.computeReward({
      levelId: currentLevelId,
      stars: result.stars,
      coinsCollected: result.coinsCollected,
    });
    // Eintragen erledigt evtl. Aufgaben -> Items, die dadurch im Shop neu freigeschaltet sind
    const unlocked = SL.Cosmetics.unlockedBy(() => SL.Economy.recordLevelResult(state, currentLevelId, result.timeMs, result.stars, coinsEarned));
    return { coinsEarned, isNewBest: !prev || result.timeMs < prev.bestTimeMs, unlocked };
  }

  // Daily: Coins gibt es nur beim ersten Abschluss des Tages (als Bonus, der mit der Serie wächst)
  function recordDailyRun(result) {
    let daily;
    const unlocked = SL.Cosmetics.unlockedBy(() => { daily = SL.Daily.recordResult(state, currentConfig.dailyKey, result.timeMs, result.stars); });
    return { coinsEarned: daily.coins, isNewBest: daily.isNewBest, unlocked, daily };
  }

  const RESULT_TITLES = { 3: "Perfekt!", 2: "Stark!", 1: "Geschafft!" };

  function populateResults(result, outcome) {
    const isDaily = currentMode === "daily";
    const { optimalSteps, t3 } = session.thresholds;
    const secPerTile = (SL.STAR_MS_PER_TILE[3] / 1000).toFixed(1).replace(".", ",");
    document.getElementById("results-title").textContent = (isDaily ? `${currentConfig.name}: ` : "") + RESULT_TITLES[result.stars];
    document.getElementById("results-badge").classList.add("hidden"); // erscheint animiert
    document.getElementById("results-time").textContent = formatTime(result.timeMs);
    document.getElementById("results-target").textContent = `< ${formatTime(t3)}`;
    document.getElementById("results-crashes").textContent = result.crashCount;
    document.getElementById("results-coins").innerHTML = `+0${COIN_ICON}`; // zählt animiert hoch
    document.getElementById("results-stars").innerHTML = starsHtml(0); // ploppen animiert rein
    // Auf 10 ms aufrunden: 3 Sterne gibt es erst echt UNTER der Grenze
    const missingMs = Math.floor((result.timeMs - t3) / 10) * 10 + 10;
    document.getElementById("results-note").innerHTML = result.stars === 3
      ? `${optimalSteps} Felder × ${secPerTile} s = ${formatTime(t3)} – geschafft!`
      : `${optimalSteps} Felder × ${secPerTile} s = ${formatTime(t3)}<br>Für 3 Sterne fehlen noch <b>${formatTime(missingMs)}</b>`;

    // Infozeile: Daily -> Serie + nächstes Daily; dazu neu im Shop freigeschaltete Items
    const infoEl = document.getElementById("results-unlock");
    const lines = [];
    if (isDaily) {
      const { streak, firstClear } = outcome.daily;
      lines.push(`${INLINE_FLAME} Serie: <b>${streak} ${streak === 1 ? "Tag" : "Tage"}</b>`
        + (firstClear ? ` · Tagesbonus +${outcome.coinsEarned}${INLINE_COIN}` : ""), `Nächstes Daily in ${SL.Days.timeUntilNext()}`);
    }
    if (outcome.unlocked.length) lines.push(`${INLINE_STAR} Neu im Shop freigeschaltet: <b>${outcome.unlocked.map((c) => c.name).join(", ")}</b>`);
    const info = lines.join("<br>");
    infoEl.innerHTML = info;
    infoEl.classList.toggle("hidden", !info);

    // Buttons: Level -> "Nächstes Level", Daily -> "Ergebnis teilen"; Zurück je nach Modus
    const nextBtn = document.getElementById("btn-next-level");
    const shareBtn = document.getElementById("btn-share");
    const backBtn = document.getElementById("btn-back-levels");
    shareBtn.classList.toggle("hidden", !isDaily);
    backBtn.dataset.nav = isDaily ? "screen-menu" : "screen-levels";
    backBtn.textContent = isDaily ? "Menü" : "Level-Auswahl";
    const nextLevel = isDaily ? null : SL.getNextLevel(currentLevelId);
    nextBtn.classList.toggle("hidden", !nextLevel);
    if (nextLevel) {
      nextBtn.innerHTML = SL.Economy.isLevelUnlocked(state, nextLevel.id)
        ? "Nächstes Level"
        : `Nächstes Level <span class="btn-cost">${nextLevel.unlockCost}${COIN_ICON}</span>`;
    }
  }

  // Sterne ploppen nacheinander rein (mit steigendem Ton), Coins zählen hoch, danach das Badge
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
    const afterStars = 200 + result.stars * step;
    if (outcome.isNewBest) {
      resultTimers.push(setTimeout(() => {
        const badge = document.getElementById("results-badge");
        badge.classList.remove("hidden");
        restartAnimation(badge, "pop");
      }, afterStars));
    }
    if (outcome.unlocked.length) resultTimers.push(setTimeout(() => SL.Audio.play("unlock"), afterStars + 150));

    const coinsEl = document.getElementById("results-coins");
    const total = outcome.coinsEarned;
    const startAt = performance.now() + 150;
    const token = resultAnimToken;
    const countUp = (now) => {
      if (token !== resultAnimToken) return; // Screen inzwischen verlassen
      const t = Math.min(1, Math.max(0, (now - startAt) / 600));
      coinsEl.innerHTML = `+${Math.round(total * (1 - Math.pow(1 - t, 3)))}${COIN_ICON}`;
      if (t < 1) requestAnimationFrame(countUp);
    };
    requestAnimationFrame(countUp);
  }

  // Bricht die gestaffelte Ergebnis-Animation ab (Timeouts + Coin-Zähler über das Token)
  let resultAnimToken = 0;
  function clearResultTimers() {
    resultTimers.forEach(clearTimeout);
    resultTimers = [];
    resultAnimToken++;
  }

  // Daily-Ergebnis teilen: am Handy über das Teilen-Menü, sonst in die Zwischenablage
  async function shareDaily() {
    const record = SL.Daily.getRecord(state, currentConfig.dailyKey);
    if (!record) return;
    const text = SL.Daily.shareText(currentConfig, record, SL.Profile.streak(currentConfig.dailyKey), formatTime);
    try {
      if (navigator.share && window.matchMedia("(pointer: coarse)").matches) {
        await navigator.share({ text });
        return;
      }
      await navigator.clipboard.writeText(text);
      showToast("Ergebnis kopiert – einfach einfügen!");
    } catch (e) {
      if (e && e.name === "AbortError") return; // Teilen-Menü abgebrochen
      // Fallback ohne Clipboard-API (z.B. Datei direkt geöffnet)
      const area = document.createElement("textarea");
      area.value = text;
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand("copy");
      area.remove();
      showToast(ok ? "Ergebnis kopiert – einfach einfügen!" : text);
    }
  }

  let toastTimer = null;
  function showToast(message) {
    const toast = document.getElementById("toast");
    toast.textContent = message;
    toast.classList.remove("hidden");
    restartAnimation(toast, "show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.add("hidden"), 2200);
  }

  const MONTHS = ["JAN", "FEB", "MÄR", "APR", "MAI", "JUN", "JUL", "AUG", "SEP", "OKT", "NOV", "DEZ"];
  const DIFFICULTY_LEVEL = { Leicht: 1, Mittel: 2, Schwer: 3 };
  const PLAY_ICON = `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z"/></svg>`;

  // Menü: Daily-Karte (Datum, Nummer, Schwierigkeit, heutiges Ergebnis). Die Serie steht nur auf
  // der Startseite, weil sie für alle Spiele gilt.
  function refreshMenu() {
    refreshCoinDisplays();
    const config = SL.Daily.getConfig();
    const record = SL.Daily.getRecord(state, config.dailyKey);
    const [, month, day] = config.dailyKey.split("-").map(Number);
    const level = DIFFICULTY_LEVEL[config.difficulty] || 1;

    document.getElementById("daily-month").textContent = MONTHS[month - 1];
    document.getElementById("daily-day").textContent = day;
    document.getElementById("daily-title").innerHTML =
      `#${config.number} · ${config.difficulty}<span class="daily-pips">${[1, 2, 3].map((i) => `<i class="${i <= level ? "on" : ""}"></i>`).join("")}</span>`;
    document.getElementById("daily-status").innerHTML = record
      ? `<span class="daily-stars">${starsHtml(record.stars)}</span><span>${formatTime(record.bestTimeMs)}</span>`
      : `<span class="daily-play">${PLAY_ICON}</span>`;
    document.getElementById("btn-daily").setAttribute("aria-label",
      `Tägliches Labyrinth ${config.number}, ${config.difficulty}` + (record ? `, Bestzeit ${formatTime(record.bestTimeMs)}` : ", noch nicht gespielt"));
  }

  function togglePause() {
    if (!session || session.finished) return;
    paused = !paused;
    pauseOverlay.classList.toggle("hidden", !paused);
    if (paused) {
      session.pauseClock();
    } else {
      session.resumeClock();
      lastFrameTime = performance.now();
    }
    // Fokus vom geklickten Button (⏸ / Weiter) nehmen - sonst löst ein späteres Enter
    // diesen Button erneut aus und pausiert das Spiel ungewollt.
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  }

  function isGameActive() {
    return document.getElementById("screen-game").classList.contains("active");
  }

  function restartCurrentLevel() {
    if (currentMode === "daily") openDaily();
    else if (currentLevelId != null) openGame(currentLevelId);
  }

  function goToNextLevel() {
    const nextLevel = SL.getNextLevel(currentLevelId);
    if (!nextLevel) { showScreen("screen-levels"); return; }
    if (SL.Economy.isLevelUnlocked(state, nextLevel.id)) {
      openGame(nextLevel.id);
    } else if (SL.Economy.canAffordUnlock(nextLevel.id)) {
      SL.Economy.unlockLevel(state, nextLevel.id);
      SL.Audio.play("unlock");
      openGame(nextLevel.id);
    } else {
      showScreen("screen-levels");
    }
  }

  // Gemeinsamer Eingang für Tastatur und Tipp-Steuerung
  function inputDirection(dir) {
    if (!session || paused || !isGameActive() || SL.Settings.isOpen()) return;
    session.requestDirection(dir);
  }

  function handleKeydown(e) {
    // Browser-Shortcuts (Strg+R, Strg+S, Strg+D, ...) nicht abfangen
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    // Offene Einstellungen fangen alles ab; Escape schließt sie
    if (SL.Settings.isOpen()) {
      if (e.key === "Escape") { e.preventDefault(); SL.Settings.close(); }
      return;
    }
    const dir = KEY_MAP[e.key];
    const gameActive = isGameActive();

    if (e.key === " " || e.key === "Escape") {
      if (gameActive) { e.preventDefault(); togglePause(); }
      return;
    }
    if ((e.key === "r" || e.key === "R") && gameActive) {
      e.preventDefault();
      restartCurrentLevel(); // schneller Reset per Taste, z.B. direkt nachdem man gestorben ist
      return;
    }
    if (!dir || !gameActive || paused || !session) return;
    e.preventDefault();
    // OS-Auto-Repeat (gehaltene Taste) ignorieren - jeder Schritt soll ein bewusster,
    // einzelner Tastendruck sein. Schnell sein geht per Spammen, nicht per Halten.
    if (e.repeat) return;
    inputDirection(dir);
  }

  // Tipp-Steuerung: Richtung = welcher Knopf der Raute in Tipp-Richtung liegt, von der Mitte aus
  // gesehen (Grenzen sind die 45°-Diagonalen). So zählt jeder Tipp in der unteren Fläche, nicht nur
  // ein Treffer genau auf den Knopf. Reagiert auf pointerdown (beim Berühren, nicht erst beim
  // Loslassen); mehrere Finger gehen, die Gedrückt-Optik wird pro Finger (pointerId) verwaltet.
  function bindTapPad() {
    const pad = document.querySelector(".tap-pad");
    const activePointers = new Map(); // pointerId -> Richtung
    const setPressed = (dir, on) => {
      pad.querySelectorAll(`[data-zone="${dir}"]`).forEach((el) => el.classList.toggle("pressed", on));
    };
    pad.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      const rect = pad.getBoundingClientRect();
      const dx = e.clientX - (rect.left + rect.width / 2);
      const dy = e.clientY - (rect.top + rect.height / 2);
      const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "E" : "W") : (dy > 0 ? "S" : "N");
      activePointers.set(e.pointerId, dir);
      setPressed(dir, true);
      restartAnimation(pad.querySelector(`.tap-btn[data-zone="${dir}"]`), "ring");
      SL.Haptics.vibrate(6);
      inputDirection(dir);
    });
    const release = (e) => {
      const dir = activePointers.get(e.pointerId);
      if (!dir) return;
      activePointers.delete(e.pointerId);
      if (![...activePointers.values()].includes(dir)) setPressed(dir, false);
    };
    for (const type of ["pointerup", "pointercancel", "pointerleave"]) pad.addEventListener(type, release);
    // Langes Drücken soll kein Kontextmenü öffnen
    pad.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  // "auto": Tipp-Steuerung nur auf Geräten mit Touch als Hauptbedienung
  function applyTouchControls() {
    const mode = state.settings.touchControls;
    const show = mode === "on" || (mode === "auto" && window.matchMedia("(pointer: coarse)").matches);
    document.getElementById("app").classList.toggle("tap-controls", show);
    startHint.textContent = show ? "Tippe unten, um zu starten" : "Pfeiltaste oder WASD drücken, um zu starten";
    if (isGameActive()) sizeCanvas();
  }

  // iOS-Safari: Die Adress-/Tab-Leiste liegt unten über der Seite. visualViewport.height ist die
  // wirklich sichtbare Höhe -> als --app-height für #app (CSS-Fallback: 100dvh). Beim Reinzoomen
  // (scale > 1) nicht nachziehen, sonst schrumpft das Layout mit.
  function syncViewportHeight() {
    const vv = window.visualViewport;
    if (vv && vv.scale > 1.01) return;
    const height = vv ? vv.height : window.innerHeight;
    document.documentElement.style.setProperty("--app-height", `${Math.round(height)}px`);
  }

  function init() {
    state = SL.Storage.load();
    // Aufgaben für den Shop: auch alles, was vor dem Update schon geschafft war
    SL.Economy.checkQuests(state);
    SL.Quests.sync();
    syncViewportHeight();
    if (window.visualViewport) {
      // Leiste fährt ein/aus -> sichtbare Höhe ändert sich -> Spielfeld neu einpassen
      window.visualViewport.addEventListener("resize", () => {
        syncViewportHeight();
        if (isGameActive()) sizeCanvas();
      });
    }

    document.querySelectorAll("[data-nav]").forEach((btn) => {
      btn.addEventListener("click", () => showScreen(btn.dataset.nav));
    });
    document.getElementById("btn-play").addEventListener("click", () => showScreen("screen-levels"));
    document.getElementById("btn-daily").addEventListener("click", openDaily);
    document.getElementById("btn-settings").addEventListener("click", () => SL.Settings.open());
    document.getElementById("btn-pause").addEventListener("click", togglePause);
    document.getElementById("btn-resume").addEventListener("click", togglePause);
    document.getElementById("btn-restart").addEventListener("click", restartCurrentLevel);
    document.getElementById("btn-pause-settings").addEventListener("click", () => SL.Settings.open());
    document.getElementById("btn-retry").addEventListener("click", restartCurrentLevel);
    document.getElementById("btn-next-level").addEventListener("click", goToNextLevel);
    document.getElementById("btn-share").addEventListener("click", shareDaily);
    // Ein Listener für alle Level-Kacheln + "Weiterspielen" (Inhalt wird bei jedem Öffnen neu gerendert)
    document.getElementById("level-map").addEventListener("click", (e) => {
      const el = e.target.closest("[data-level]");
      if (el) onLevelTileClick(Number(el.dataset.level), el);
    });
    bindTapPad();

    // Audio darf erst nach einer Nutzer-Geste starten; dazu ein leiser Klick auf Buttons
    document.addEventListener("pointerdown", (e) => {
      SL.Audio.ensure();
      if (e.target.closest(".btn, .daily-card, .level-tile, .toggle, .segmented button")) {
        SL.Audio.play("click");
      }
    }, true);
    window.addEventListener("keydown", () => SL.Audio.ensure(), true);

    window.addEventListener("keydown", handleKeydown);
    window.addEventListener("resize", () => {
      syncViewportHeight();
      if (isGameActive()) sizeCanvas();
    });
    // Tab im Hintergrund -> automatisch pausieren, die Uhr misst ja echte Zeit. Zurück im Tab:
    // Menü neu einlesen, falls inzwischen Mitternacht war (neues Daily).
    const menuActive = () => document.getElementById("screen-menu").classList.contains("active");
    document.addEventListener("visibilitychange", () => {
      if (document.hidden && isGameActive() && !paused) togglePause();
      if (!document.hidden && menuActive()) refreshMenu();
    });
    // Zurück-Button von der Startseite: Seite kommt evtl. aus dem Cache -> Coins/Menü neu einlesen
    window.addEventListener("pageshow", (e) => {
      if (!e.persisted) return;
      applyPlayerLook();
      if (menuActive()) refreshMenu();
      else refreshCoinDisplays();
    });
    // Coins und Skins können sich auch in einem anderen Tab ändern (Startseite, Shop, anderes Spiel)
    SL.Profile.onChange(() => {
      refreshCoinDisplays();
      applyPlayerLook();
    });

    SL.Settings.init(state, (settings) => {
      effects.enabled = settings.effects;
      applyTouchControls();
    });
    applyPlayerLook();
    refreshMenu();
  }

  return { init, showScreen };
})();
