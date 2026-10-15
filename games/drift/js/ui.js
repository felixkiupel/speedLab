// Screen-Umschaltung, DOM-Bindings, Game-Loop, Eingabe (Tasten + Wischen). Aufbau wie bei Maze.
window.SL = window.SL || {};

SL.UI = (function () {
  const MAX_CELL = 76; // größer wird ein Feld auch auf riesigen Bildschirmen nicht
  const SWIPE_PX = 22; // so weit muss der Finger, bis ein Wischer als Zug zählt
  const MARK_KEEP_MS = 2000; // Kufenspuren danach aus der Liste werfen (Renderer blendet sie vorher aus)
  const FALL_RESTART_MS = 1000; // nach dem Reinfallen so lange zeigen, dann startet das Level neu

  let state; // Save-State (aus Storage)
  let currentLevelId = null;
  let puzzle = null; // { board, analysis, thresholds } des laufenden Levels
  let session = null;
  const effects = new SL.Effects();
  let floorLayer = null;
  let cell = 40;
  let boardW = 0;
  let boardH = 0;
  let pixelRatio = 1;
  let rafId = null;
  let lastFrameTime = 0;
  let paused = false;
  let pausedAt = 0;
  let mode = "level"; // "level" | "tutorial"
  let tutorialStep = 0;
  let guide = null; // Tutorial-Pfeil { dir, path, start }
  let highlight = null; // Feldtyp, der als "Neu" pulsiert (bis zum ersten Zug)
  let introStart = null; // Beginn der Brett-Einblendung
  let marks = []; // Kufenspuren
  let goalFlashAt = null; // übers Ziel gerutscht
  let hit = null; // zuletzt getroffener Fels / Rand
  let passHintShown = false;
  let firstMoveDone = false;
  let finishTimer = null;
  let fallTimer = null; // Neustart kurz nach dem Reinfallen
  let resultTimers = [];
  let resultAnimToken = 0;
  let hudStarTier = null;
  let messageTimer = null;

  const canvas = document.getElementById("game-canvas");
  const ctx = canvas.getContext("2d");
  const canvasWrap = document.querySelector(".canvas-wrap");
  const hint = document.getElementById("start-hint");
  const hudTimer = document.getElementById("hud-timer");
  const hudCoins = document.getElementById("hud-coins");
  const hudLevel = document.getElementById("hud-level");
  const hudStars = document.getElementById("hud-stars");
  const hudCoinPill = document.querySelector(".hud .coin-pill");
  const hudMoves = document.getElementById("hud-moves");
  const moveCounter = document.querySelector(".move-counter");
  const undoBtn = document.getElementById("btn-undo");
  const pauseOverlay = document.getElementById("pause-overlay");
  const tutorialOverlay = document.getElementById("tutorial-overlay");
  const gameScreen = document.getElementById("screen-game");

  const KEY_MAP = {
    ArrowUp: "N", w: "N", W: "N",
    ArrowDown: "S", s: "S", S: "S",
    ArrowLeft: "W", a: "W", A: "W",
    ArrowRight: "E", d: "E", D: "E",
  };

  const isTouch = () => window.matchMedia("(pointer: coarse)").matches;

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
      const nextTile = document.querySelector(".level-tile.next");
      if (nextTile) nextTile.scrollIntoView({ block: "nearest" });
    }
    if (id === "screen-menu") refreshMenu();
  }

  // Coins sind spielübergreifend (Profil) - die Anzeigen zeigen immer den Gesamtstand
  function refreshCoinDisplays() {
    const coins = SL.Profile.coins();
    for (const id of ["menu-coins", "levels-coins"]) document.getElementById(id).textContent = coins;
    hudCoins.textContent = session ? session.collected.size : 0;
  }

  // Icons als SVG/CSS statt Text-Glyphen (wie bei Maze)
  const COIN_ICON = `<span class="coin-icon" aria-hidden="true"></span>`;
  const STAR_ICON = `<svg class="icon star-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.05L14.91 9.05L22.46 9.65L16.71 14.58L18.47 21.95L12 18L5.53 21.95L7.29 14.58L1.54 9.65L9.09 9.05Z"/></svg>`;
  const LOCK_ICON = `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><rect x="5" y="10.5" width="14" height="10.5" rx="2.5"/></svg>`;

  const CHECK_ICON = `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const PLAY_ICON = `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z"/></svg>`;
  const UNDO_ICON = `<span class="msg-icon"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 14L4.5 9.5 9 5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 9.5h9a5 5 0 0 1 0 10h-3" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg></span>`;
  // "Zug zurück" in Meldungen: am PC die Taste, am Handy das Symbol der Taste
  const undoHint = () => (isTouch() ? `tippe auf ${UNDO_ICON}` : "<kbd>Z</kbd>");
  const ARROW_TURN = { E: 0, S: 90, W: 180, N: -90 };
  // Pfeil als SVG statt Text-Glyphe (← → sind in vielen Schriften winzig)
  const arrowKey = (dir) => `<kbd class="kbd-arrow"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true" style="transform:rotate(${ARROW_TURN[dir]}deg)"><path d="M5 12h13M13 6.5l5.5 5.5-5.5 5.5" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/></svg></kbd>`;

  function starsHtml(count) {
    return [1, 2, 3].map((i) => `<span class="star ${i <= count ? "on" : "off"}">${STAR_ICON}</span>`).join("");
  }

  function getResult(levelId) {
    return state.levelResults[String(levelId)] || null;
  }

  // "Als Nächstes": erstes freigeschaltetes Level ohne Ergebnis, sonst das erste ohne 3 Sterne
  function findNextLevel() {
    const unlocked = SL.LEVELS.filter((l) => SL.Economy.isLevelUnlocked(state, l.id));
    return unlocked.find((l) => !getResult(l.id)) || unlocked.find((l) => getResult(l.id).stars < 3) || null;
  }

  const secPerMove = () => (SL.STAR_ALLOWANCE[3].perMoveMs / 1000).toFixed(2).replace(".", ",");

  // ---------- LEVEL-AUSWAHL ----------

  function statRow(label, value) {
    return `<div class="lv-stat"><span>${label}</span><b>${value}</b></div>`;
  }

  function levelTileHtml(level, nextLevelId, coins) {
    const target = `&lt; ${formatTime(SL.getLevelPuzzle(level.id).thresholds.t3)}`;

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

  // Tutorial-Zeile über den Kacheln von Kapitel 1
  function tutorialTileHtml() {
    const done = state.tutorialDone;
    return `<button type="button" class="tutorial-tile ${done ? "done" : "next"}" data-tutorial>
      <span class="mascot face" aria-hidden="true"><span class="eye left"></span><span class="eye right"></span></span>
      <span class="tutorial-tile-text"><b>Tutorial</b><span>Rutschen, Coins, Ziel und Zug zurück – in einer Minute</span></span>
      <span class="tutorial-tile-status">${done ? `${CHECK_ICON}Geschafft` : `Starten${PLAY_ICON}`}</span>
    </button>`;
  }

  function renderLevelMap() {
    const map = document.getElementById("level-map");
    // Solange das Tutorial offen ist, ist es "als Nächstes dran" - nicht Level 1
    const next = state.tutorialDone ? findNextLevel() : null;
    const starsOf = (levels) => levels.reduce((sum, l) => sum + (getResult(l.id)?.stars || 0), 0);
    const totalStars = starsOf(SL.LEVELS);
    const maxStars = SL.LEVELS.length * 3;
    const completed = SL.LEVELS.filter((l) => getResult(l.id)).length;
    const pct = (part, whole) => `${Math.round((part / whole) * 100)}%`;
    const coins = SL.Profile.coins();

    const summary = `<div class="levels-summary">
      <div class="summary-progress">
        <div class="summary-stars">${STAR_ICON}<b>${totalStars}</b><span>/ ${maxStars}</span></div>
        <div class="progress"><span style="width:${pct(totalStars, maxStars)}"></span></div>
        <div class="summary-sub">${completed} von ${SL.LEVELS.length} Level geschafft</div>
      </div>
      <div class="summary-rule">
        <div class="summary-rule-head">${starsHtml(3)}<b>Rutschzeit + ${secPerMove()} s/Zug</b></div>
        <p>Gemessen an der schnellsten Lösung. Die Uhr startet mit deinem ersten Zug – vorher in Ruhe planen.</p>
      </div>
      ${!state.tutorialDone
        ? `<button type="button" class="btn btn-primary summary-continue" data-tutorial>Tutorial starten</button>`
        : next ? `<button type="button" class="btn btn-primary summary-continue" data-level="${next.id}">Weiterspielen<span class="btn-cost">Level ${next.id}</span></button>` : ""}
    </div>`;

    const chapters = SL.CHAPTERS.map((ch) => {
      const levels = SL.LEVELS.filter((l) => l.chapter === ch.id);
      const chStars = starsOf(levels);
      const anyUnlocked = levels.some((l) => SL.Economy.isLevelUnlocked(state, l.id));
      return `<section class="chapter ${anyUnlocked ? "" : "chapter-locked"}">
        <header class="chapter-head">
          <div class="chapter-title">
            <span class="chapter-kicker">Kapitel ${ch.id} · Level ${ch.firstLevel}–${ch.lastLevel}</span>
            <h3>${ch.name}</h3>
            <p>${ch.description}</p>
          </div>
          <div class="chapter-progress">
            <div class="chapter-stars">${STAR_ICON}<b>${chStars}</b><span>/ ${levels.length * 3}</span></div>
            <div class="progress"><span style="width:${pct(chStars, levels.length * 3)}"></span></div>
          </div>
        </header>
        ${ch.id === 1 ? tutorialTileHtml() : ""}
        <div class="level-grid">${levels.map((l) => levelTileHtml(l, next?.id, coins)).join("")}</div>
      </section>`;
    }).join("");

    map.innerHTML = summary + chapters;
    refreshCoinDisplays();
  }

  // Freischalten kostet Coins; zu wenig -> Kachel schüttelt sich
  function tryOpenLevel(levelId, tileEl) {
    if (SL.Economy.isLevelUnlocked(state, levelId)) {
      openGame(levelId);
      return true;
    }
    if (SL.Economy.canAffordUnlock(levelId)) {
      SL.Economy.unlockLevel(state, levelId);
      SL.Audio.play("unlock");
      openGame(levelId);
      return true;
    }
    SL.Audio.play("bump");
    if (tileEl) restartAnimation(tileEl, "shake");
    return false;
  }

  // ---------- MENÜ ----------

  function refreshMenu() {
    refreshCoinDisplays();
    const totalStars = SL.Economy.totalStars(state);
    const done = SL.LEVELS.filter((l) => getResult(l.id)).length;
    const btn = document.getElementById("btn-continue");
    document.getElementById("continue-status").innerHTML =
      `<span class="continue-stars">${STAR_ICON}${totalStars}</span><span class="continue-sub">${done} / ${SL.LEVELS.length} Level</span>`;
    if (!state.tutorialDone) {
      document.getElementById("continue-num-kicker").textContent = "Start";
      document.getElementById("continue-level").innerHTML = PLAY_ICON;
      document.getElementById("continue-kicker").textContent = "Los geht's";
      document.getElementById("continue-title").textContent = "Tutorial";
      btn.dataset.level = "tutorial";
      btn.setAttribute("aria-label", "Tutorial starten");
      return;
    }
    const level = findNextLevel() || SL.LEVELS[SL.LEVELS.length - 1];
    const chapter = SL.CHAPTERS.find((ch) => ch.id === level.chapter);
    const result = getResult(level.id);
    document.getElementById("continue-num-kicker").textContent = "Level";
    document.getElementById("continue-level").textContent = level.id;
    document.getElementById("continue-kicker").textContent = result ? "Für 3 Sterne" : "Weiterspielen";
    document.getElementById("continue-title").textContent = chapter.name;
    btn.dataset.level = level.id;
    btn.setAttribute("aria-label", `Level ${level.id} spielen, ${totalStars} Sterne gesammelt`);
  }

  // ---------- SPIEL ----------

  // Brett so groß wie möglich ins freie Feld einpassen (Seitenverhältnis der Karte bleibt).
  // Pixelpuffer mit devicePixelRatio, damit es auf HiDPI-Displays scharf bleibt.
  function sizeCanvas() {
    if (!puzzle) return;
    const { board } = puzzle;
    const border = 8; // 4px Rahmen links + rechts
    const availW = canvasWrap.clientWidth - border - 4;
    const availH = canvasWrap.clientHeight - border - 4;
    const newCell = Math.max(14, Math.floor(Math.min(availW / board.cols, availH / board.rows, MAX_CELL)));
    const newRatio = window.devicePixelRatio || 1;
    if (newCell === cell && newRatio === pixelRatio && floorLayer) return;
    // Effekte liegen in Brett-Pixeln - bei neuer Feldgröße mitskalieren wäre Aufwand ohne Nutzen
    effects.clear();
    cell = newCell;
    pixelRatio = newRatio;
    boardW = cell * board.cols;
    boardH = cell * board.rows;
    canvas.style.width = boardW + "px";
    canvas.style.height = boardH + "px";
    canvas.width = Math.round(boardW * pixelRatio);
    canvas.height = Math.round(boardH * pixelRatio);
    floorLayer = SL.Renderer.buildFloorLayer(board, cell, pixelRatio);
  }

  const cellCenter = (p) => ({ x: (p.c + 0.5) * cell, y: (p.r + 0.5) * cell });

  const CONFETTI_COLORS = ["#ff8a5c", "#ffd166", "#c6f24a", "#8fd8ff", "#b084ff", "#ff6fa5", "#2b2420"];

  // Startet einen Lauf - Level und Tutorial teilen sich Brett, Session und Effekte
  function openSession(level, puzzleData, newMode) {
    mode = newMode;
    puzzle = puzzleData;
    clearTimeout(finishTimer);
    clearTimeout(fallTimer);
    showScreen("screen-game");

    session = new SL.GameSession(level, puzzle);
    effects.clear();
    marks = [];
    hit = null;
    goalFlashAt = null;
    guide = null;
    highlight = null;
    passHintShown = false;
    firstMoveDone = false;
    floorLayer = null;
    sizeCanvas();
    bindSessionEvents();

    gameScreen.classList.toggle("is-tutorial", mode === "tutorial");
    hudLevel.textContent = level.name;
    hudCoins.textContent = 0;
    document.getElementById("hud-ideal").textContent = puzzle.analysis.minMoves;
    updateMoveCounter(false);
    undoBtn.classList.remove("nudge");
    pauseOverlay.classList.add("hidden");
    tutorialOverlay.classList.add("hidden");
    paused = false;
    document.getElementById("btn-quit").dataset.nav = "screen-levels";
    hudStarTier = null;
    if (mode === "tutorial") {
      tutorialStep = 0;
      hudTimer.textContent = "So geht's";
      showTutorialStep();
    } else {
      hudTimer.textContent = "0.00s";
      updateHudStars(0);
    }

    introStart = performance.now();
    stopGameLoop();
    lastFrameTime = performance.now();
    rafId = requestAnimationFrame(gameLoop);
  }

  function openGame(levelId) {
    currentLevelId = levelId;
    const level = SL.getLevel(levelId);
    openSession(level, SL.getLevelPuzzle(levelId), "level");
    // Kapitel mit neuer Feldart: beim allerersten Mal pulsieren die neuen Felder bis zum ersten Zug
    const chapter = SL.CHAPTERS.find((ch) => ch.id === level.chapter);
    if (chapter.coach && chapter.firstLevel === levelId && !state.coachSeen.includes(chapter.id)) {
      state.coachSeen.push(chapter.id);
      SL.Storage.save(state);
      highlight = chapter.coach.tile;
      showMessage(chapter.coach.text, { dark: true });
    } else {
      showControlsHint();
    }
  }

  let tutorialPuzzle = null;
  function openTutorial() {
    if (!tutorialPuzzle) {
      const board = SL.parseBoard(SL.TUTORIAL.map);
      const analysis = SL.analyzeBoard(board);
      // Keine Uhr, keine Sterne: Grenzen unendlich, damit die Session trotzdem rechnen kann
      tutorialPuzzle = { board, analysis, thresholds: { minMoves: analysis.minMoves, t3: Infinity, t2: Infinity } };
    }
    openSession({ id: 0, name: SL.TUTORIAL.name }, tutorialPuzzle, "tutorial");
  }

  // ---------- TUTORIAL ----------
  // Geführte Schritte: Pfeil auf dem Brett zeigt, wohin der nächste Zug rutscht, die Meldezeile
  // sagt, warum. Falsche Richtungen stupsen nur an. Ein Schritt rutscht absichtlich übers Ziel,
  // danach ist "Zurück" dran.

  const tutorialStepData = () => SL.TUTORIAL.steps[tutorialStep] || null;

  function showTutorialStep() {
    const step = tutorialStepData();
    const total = SL.TUTORIAL.steps.length;
    hudStars.innerHTML = `<span class="tut-steps">${SL.TUTORIAL.steps.map((_, i) =>
      `<i class="${i < tutorialStep ? "done" : i === tutorialStep ? "now" : ""}"></i>`).join("")}</span>`;
    hudStars.setAttribute("aria-label", `Tutorial, Schritt ${Math.min(tutorialStep + 1, total)} von ${total}`);
    if (!step) {
      guide = null;
      return;
    }
    if (step.undo) {
      guide = null;
      undoBtn.classList.add("nudge");
      showMessage(`${step.text} · ${undoHint()}`, { dark: true });
      return;
    }
    const move = SL.slide(puzzle.board, session.pos, step.move);
    guide = { dir: step.move, path: move.path, start: performance.now() };
    // Beim allerersten Schritt erklären, WIE man zieht - danach reicht der Pfeil
    const text = tutorialStep === 0 ? (isTouch() ? "Wische nach <b>rechts</b>" : "Drück die Pfeiltaste nach <b>rechts</b>") : step.text;
    showMessage(`${text} ${arrowKey(step.move)}`, { dark: true });
  }

  function onTutorialFinished() {
    SL.Audio.play("finish");
    SL.Haptics.vibrate([20, 40, 20]);
    hideMessage();
    const p = cellCenter(puzzle.board.goal);
    effects.burst(p.x, p.y, { count: 70, colors: CONFETTI_COLORS, speed: [120, 320], life: [700, 1300], size: [2.5, 4.5], gravity: 380, shape: "confetti" });
    // Belohnung nur beim ersten Mal
    const first = !state.tutorialDone;
    if (first) {
      state.tutorialDone = true;
      SL.Storage.save(state);
      SL.Profile.addCoins(SL.TUTORIAL.reward);
    }
    const rewardEl = document.getElementById("tutorial-reward");
    rewardEl.innerHTML = `+${SL.TUTORIAL.reward}${COIN_ICON}`;
    rewardEl.classList.toggle("hidden", !first);
    finishTimer = setTimeout(() => {
      tutorialOverlay.classList.remove("hidden");
      if (first) SL.Audio.play("unlock");
    }, effects.enabled ? 900 : 250);
  }

  const tutorialOverlayOpen = () => !tutorialOverlay.classList.contains("hidden");

  // Spiel-Ereignisse -> Ton, Vibration, Partikel, HUD
  function bindSessionEvents() {
    session.onSlide = (anim) => {
      marks.push({ from: anim.from, to: anim.to, dir: anim.dir, start: anim.start, duration: anim.duration });
      SL.Audio.play("slide", anim.path.length);
      updateMoveCounter(true);
      onFirstMove();
    };
    session.onBump = () => {
      SL.Audio.play("bump");
      onFirstMove();
    };
    session.onCoin = (c) => {
      hudCoins.textContent = session.collected.size;
      restartAnimation(hudCoinPill, "pop");
      SL.Audio.play("coin");
      const p = cellCenter(c);
      effects.burst(p.x, p.y, { count: 12, colors: ["#ffd166", "#f2a900", "#2b2420"], speed: [60, 170], life: [250, 520], size: [1.5, 3] });
    };
    session.onPassGoal = () => {
      goalFlashAt = performance.now();
      SL.Audio.play("goalPass");
      if (mode === "tutorial") {
        const p = cellCenter(puzzle.board.goal);
        effects.text(p.x, p.y - cell * 0.75, "Genau drauf stoppen!");
        return;
      }
      if (!passHintShown) {
        passHintShown = true;
        showMessage("Vorbei – du musst <b>auf</b> dem Ziel stoppen", { dark: true, ms: 2600 });
      }
    };
    session.onStop = (impact) => {
      if (mode === "tutorial") showTutorialStep();
      const p = cellCenter(impact.cell);
      if (impact.snow) {
        SL.Audio.play("snow");
        SL.Haptics.vibrate(8);
        effects.burst(p.x, p.y, { count: 14, colors: ["#ffffff", "#e4dccb", "#c7bcaa"], speed: [30, 110], life: [300, 600], size: [1.5, 3.2] });
        return;
      }
      SL.Audio.play("thud", impact.tiles);
      SL.Haptics.vibrate(Math.min(30, 8 + impact.tiles * 3));
      const d = SL.DIRS[impact.dir];
      const next = { r: impact.cell.r + d.dr, c: impact.cell.c + d.dc };
      const board = puzzle.board;
      const onEdge = next.r < 0 || next.r >= board.rows || next.c < 0 || next.c >= board.cols;
      // Kontaktpunkt = Kante zwischen Figur und Hindernis; Splitter fliegen zurück
      const cx = p.x + d.dc * cell * 0.42;
      const cy = p.y + d.dr * cell * 0.42;
      hit = onEdge ? { edge: true, dir: impact.dir, x: cx, y: cy, start: impact.start } : { key: next.r * board.cols + next.c, start: impact.start };
      const backAngle = Math.atan2(-d.dr, -d.dc);
      effects.burst(cx, cy, {
        count: 6 + Math.min(14, impact.tiles * 2), colors: ["#c7bcaa", "#ddd3c2", "#2b2420"],
        speed: [50, 90 + impact.tiles * 20], life: [220, 480], size: [1.5, 3], angle: backAngle, spread: 2.4,
      });
      if (impact.tiles >= 2) effects.shake(Math.min(5, 0.8 + impact.tiles * 0.55), 170);
    };
    session.onStuck = () => {
      if (!state.settings.hints || mode === "tutorial") return;
      SL.Audio.play("stuck");
      undoBtn.classList.add("nudge");
      // Über der Figur - außer in der obersten Reihe, da wäre der Text abgeschnitten
      const p = cellCenter(session.pos);
      effects.text(p.x, session.pos.r === 0 ? p.y + cell * 0.8 : p.y - cell * 0.75, "Sackgasse!");
      showMessage(`Sackgasse – ${isTouch() ? undoHint() : "<kbd>Z</kbd> nimmt den Zug zurück"}`, { dark: true, stuck: true });
    };
    // Ins Loch: kurz zeigen, dann startet das Level neu (neuer Versuch, Uhr wieder auf 0)
    session.onFall = (cellPos) => {
      SL.Audio.play("fall");
      SL.Haptics.vibrate([30, 40, 70]);
      undoBtn.classList.remove("nudge");
      const p = cellCenter(cellPos);
      effects.burst(p.x, p.y, { count: 14, colors: ["#e6ddcd", "#c7bcaa", "#2b2420"], speed: [40, 120], life: [250, 500], size: [1.5, 3] });
      effects.shake(3, 200);
      showMessage("Reingefallen! Neuer Versuch …", { dark: true });
      fallTimer = setTimeout(restartCurrentLevel, FALL_RESTART_MS);
    };
    session.onUnstuck = () => {
      undoBtn.classList.remove("nudge");
      if (hint.classList.contains("stuck")) hideMessage();
    };
    session.onUndo = () => {
      SL.Audio.play("undo");
      hudCoins.textContent = session.collected.size;
      // Mitten im Rutschen zurückgenommen: die Spur wächst nicht weiter
      const now = performance.now();
      const last = marks[marks.length - 1];
      if (last && now < last.start + last.duration) last.cutAt = now;
    };
    session.onFinish = (result) => (mode === "tutorial" ? onTutorialFinished() : onFinished(result));
  }

  // Erster Zug im Level: Steuerungs-/Neu-Hinweis ausblenden, die neuen Felder hören auf zu pulsieren
  function onFirstMove() {
    if (firstMoveDone || mode === "tutorial") return;
    firstMoveDone = true;
    highlight = null;
    hideMessage();
  }

  function updateMoveCounter(animate) {
    hudMoves.textContent = session.moveCount;
    moveCounter.classList.toggle("over", session.moveCount > puzzle.analysis.minMoves);
    if (animate) restartAnimation(moveCounter, "bump");
  }

  // Meldezeile unter dem Brett
  function showMessage(html, { dark = false, stuck = false, ms = 0 } = {}) {
    clearTimeout(messageTimer);
    hint.innerHTML = html;
    hint.classList.toggle("soft", !dark);
    hint.classList.toggle("stuck", stuck);
    hint.classList.remove("hidden");
    restartAnimation(hint, "pop");
    if (ms) messageTimer = setTimeout(hideMessage, ms);
  }

  function hideMessage() {
    clearTimeout(messageTimer);
    hint.classList.add("hidden");
    hint.classList.remove("stuck");
  }

  // Steuerung zeigen die Tasten unter dem Brett - hier nur, wann die Uhr losläuft
  function showControlsHint() {
    showMessage("Die Uhr startet mit deinem ersten Zug");
  }

  // Tastatur-Druck auf Z/R auch an der Bildschirm-Taste zeigen
  function flashKey(btn) {
    btn.classList.add("pressed");
    setTimeout(() => btn.classList.remove("pressed"), 120);
  }

  function restartAnimation(el, className) {
    el.classList.remove(className);
    void el.offsetWidth;
    el.classList.add(className);
  }

  function gameLoop(now) {
    // dt treibt nur die Partikel - Uhr und Rutschen rechnen selbst mit performance.now()
    const dt = Math.min(60, now - lastFrameTime);
    lastFrameTime = now;

    if (session) {
      if (!paused) {
        session.update(now);
        effects.update(dt);
        if (!session.finished && mode === "level") {
          const elapsed = session.getElapsedMs(now);
          hudTimer.textContent = formatTime(elapsed);
          updateHudStars(elapsed);
        }
        if (marks.length) marks = marks.filter((m) => now < (m.cutAt ?? m.start + m.duration) + MARK_KEEP_MS);
      }
      SL.Renderer.render(ctx, {
        board: puzzle.board,
        layer: floorLayer,
        cell,
        width: boardW,
        height: boardH,
        pixelRatio,
        now: paused ? pausedAt : now,
        session,
        effects,
        introStart,
        marks,
        goalFlashAt,
        hit,
        guide,
        highlight,
      });
    }
    rafId = requestAnimationFrame(gameLoop);
  }

  // Sterne-Anzeige unter dem Timer: welche Wertung gerade noch drin ist und bis wann
  function updateHudStars(elapsedMs) {
    const tier = SL.Economy.starsForTime(elapsedMs, session.thresholds);
    if (tier === hudStarTier) return;
    if (hudStarTier !== null && tier < hudStarTier) SL.Audio.play("starLost");
    hudStarTier = tier;
    const deadline = tier === 3 ? session.thresholds.t3 : tier === 2 ? session.thresholds.t2 : null;
    hudStars.innerHTML = starsHtml(tier) + `<span>${deadline != null ? `&lt; ${formatTime(deadline)}` : "Ins Ziel!"}</span>`;
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
    hideMessage();
    undoBtn.classList.remove("nudge");
    const p = cellCenter(puzzle.board.goal);
    effects.burst(p.x, p.y, { count: 70, colors: CONFETTI_COLORS, speed: [120, 320], life: [700, 1300], size: [2.5, 4.5], gravity: 380, shape: "confetti" });
    const outcome = recordLevelRun(result);
    finishTimer = setTimeout(() => {
      populateResults(result, outcome);
      showScreen("screen-results");
      playResultsAnimation(result, outcome);
    }, effects.enabled ? 850 : 250);
  }

  function recordLevelRun(result) {
    const prev = getResult(currentLevelId);
    const reward = SL.Economy.computeReward({
      levelId: currentLevelId,
      stars: result.stars,
      moves: result.moves,
      minMoves: result.minMoves,
      coinsCollected: result.coinsCollected,
      prevStars: prev ? prev.stars : null,
    });
    SL.Economy.recordLevelResult(state, currentLevelId, result, reward.total);
    return { reward, isNewBest: !prev || result.timeMs < prev.bestTimeMs };
  }

  const RESULT_TITLES = { 3: "Perfekt!", 2: "Stark!", 1: "Geschafft!" };

  function populateResults(result, outcome) {
    const { t3, minMoves } = session.thresholds;
    document.getElementById("results-title").textContent = RESULT_TITLES[result.stars];
    document.getElementById("results-badge").classList.add("hidden"); // erscheinen animiert
    document.getElementById("results-ideal").classList.add("hidden");
    document.querySelector(".results-badges").classList.toggle("hidden", !outcome.isNewBest && result.moves !== minMoves);
    document.getElementById("results-time").textContent = formatTime(result.timeMs);
    document.getElementById("results-target").textContent = `< ${formatTime(t3)}`;
    document.getElementById("results-moves").textContent = `${result.moves} · ideal ${minMoves}`;
    document.getElementById("results-coins").innerHTML = `+0${COIN_ICON}`; // zählt animiert hoch
    document.getElementById("results-stars").innerHTML = starsHtml(0); // ploppen animiert rein
    document.getElementById("results-breakdown").innerHTML = outcome.reward.parts
      .map((part) => `<li class="pending"><span>${part.label}</span><span>+${part.coins}</span></li>`).join("");

    // Auf 10 ms aufrunden: 3 Sterne gibt es erst echt UNTER der Grenze
    const missingMs = Math.floor((result.timeMs - t3) / 10) * 10 + 10;
    const coinNote = result.coinsTotal ? ` · Coins ${result.coinsCollected}/${result.coinsTotal}` : "";
    document.getElementById("results-note").innerHTML = result.stars === 3
      ? `Schnellste Lösung: ${minMoves} Züge${coinNote}`
      : `Schnellste Lösung: ${minMoves} Züge${coinNote}<br>Für 3 Sterne fehlen noch <b>${formatTime(missingMs)}</b>`;

    const nextBtn = document.getElementById("btn-next-level");
    const nextLevel = SL.getNextLevel(currentLevelId);
    nextBtn.classList.toggle("hidden", !nextLevel);
    if (nextLevel) {
      nextBtn.innerHTML = SL.Economy.isLevelUnlocked(state, nextLevel.id)
        ? "Nächstes Level"
        : `Nächstes Level <span class="btn-cost">${nextLevel.unlockCost}${COIN_ICON}</span>`;
    }
  }

  // Sterne ploppen nacheinander rein, Badges danach, Coins zählen hoch und die Posten erscheinen
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
    const badges = [];
    if (outcome.isNewBest) badges.push(document.getElementById("results-badge"));
    if (result.moves === result.minMoves) badges.push(document.getElementById("results-ideal"));
    badges.forEach((badge, i) => resultTimers.push(setTimeout(() => {
      badge.classList.remove("hidden");
      restartAnimation(badge, "pop");
    }, afterStars + i * 120)));

    const items = document.querySelectorAll("#results-breakdown li");
    items.forEach((li, i) => resultTimers.push(setTimeout(() => {
      li.classList.remove("pending");
      if (effects.enabled) li.classList.add("pop");
    }, 150 + i * (effects.enabled ? 90 : 0))));

    const coinsEl = document.getElementById("results-coins");
    const total = outcome.reward.total;
    const startAt = performance.now() + 150;
    const token = resultAnimToken;
    const countUp = (now) => {
      if (token !== resultAnimToken) return; // Screen inzwischen verlassen
      const t = Math.min(1, Math.max(0, (now - startAt) / 700));
      coinsEl.innerHTML = `+${Math.round(total * (1 - Math.pow(1 - t, 3)))}${COIN_ICON}`;
      if (t < 1) requestAnimationFrame(countUp);
    };
    requestAnimationFrame(countUp);
  }

  function clearResultTimers() {
    resultTimers.forEach(clearTimeout);
    resultTimers = [];
    resultAnimToken++;
  }

  // Pause hält auch die Einblendung, Spuren und Treffer-Effekte an
  function togglePause() {
    if (!session || session.finished || session.fall || tutorialOverlayOpen()) return;
    const now = performance.now();
    paused = !paused;
    pauseOverlay.classList.toggle("hidden", !paused);
    if (paused) {
      pausedAt = now;
      session.pause(now);
    } else {
      const shift = now - pausedAt;
      if (introStart != null) introStart += shift;
      for (const m of marks) {
        m.start += shift;
        if (m.cutAt != null) m.cutAt += shift;
      }
      if (guide) guide.start += shift;
      if (hit) hit.start += shift;
      if (goalFlashAt != null) goalFlashAt += shift;
      session.resume(now);
      lastFrameTime = now;
    }
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  }

  function isGameActive() {
    return document.getElementById("screen-game").classList.contains("active");
  }

  function restartCurrentLevel() {
    if (mode === "tutorial") openTutorial();
    else if (currentLevelId != null) openGame(currentLevelId);
  }

  function goToNextLevel() {
    const nextLevel = SL.getNextLevel(currentLevelId);
    if (!nextLevel || !tryOpenLevel(nextLevel.id, null)) showScreen("screen-levels");
  }

  function undoMove() {
    if (!session || paused || tutorialOverlayOpen() || !isGameActive()) return;
    const now = performance.now();
    if (mode === "tutorial") {
      // Im Tutorial nur dann, wenn "Zurück" gerade dran ist
      const step = tutorialStepData();
      if (!step || !step.undo || session.anim || !session.undo(now)) {
        SL.Audio.play("bump");
        return;
      }
      tutorialStep++;
      undoBtn.classList.remove("nudge");
      showTutorialStep();
      return;
    }
    if (!session.undo(now)) SL.Audio.play("bump");
  }

  // Gemeinsamer Eingang für Tastatur und Wischen. Der erste Zug startet die Uhr.
  function inputDirection(dir) {
    if (!session || paused || !isGameActive() || SL.Settings.isOpen() || tutorialOverlayOpen()) return;
    const now = performance.now();
    if (mode === "tutorial") {
      // Nur die angezeigte Richtung zählt, alles andere stupst bloß an
      const step = tutorialStepData();
      if (!step || session.anim || session.finished) return;
      if (step.move !== dir) {
        session.nudge(dir, now);
        SL.Audio.play("bump");
        restartAnimation(hint, "pop");
        return;
      }
      tutorialStep++;
      guide = null;
    }
    session.requestMove(dir, now);
  }

  function handleKeydown(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (SL.Settings.isOpen()) {
      if (e.key === "Escape") { e.preventDefault(); SL.Settings.close(); }
      return;
    }
    const gameActive = isGameActive();
    const resultsActive = document.getElementById("screen-results").classList.contains("active");

    if (gameActive && tutorialOverlayOpen()) {
      if (e.key === "Enter") { e.preventDefault(); startLevelOne(); }
      return;
    }
    if (e.key === " " || e.key === "Escape") {
      if (gameActive) { e.preventDefault(); togglePause(); }
      return;
    }
    // R = sofort neu, auch direkt aus dem Ergebnis heraus (schnelles Wiederholen für Bestzeiten)
    if ((e.key === "r" || e.key === "R") && (gameActive || resultsActive)) {
      e.preventDefault();
      if (e.repeat) return;
      if (gameActive) flashKey(document.getElementById("btn-restart-quick"));
      restartCurrentLevel();
      return;
    }
    if (resultsActive && e.key === "Enter") {
      const nextBtn = document.getElementById("btn-next-level");
      if (!nextBtn.classList.contains("hidden") && document.activeElement === document.body) {
        e.preventDefault();
        goToNextLevel();
      }
      return;
    }
    if (!gameActive || paused || !session) return;
    if (e.key === "z" || e.key === "Z" || e.key === "Backspace") {
      e.preventDefault();
      flashKey(undoBtn);
      undoMove();
      return;
    }
    const dir = KEY_MAP[e.key];
    if (!dir) return;
    e.preventDefault();
    if (e.repeat) return; // gehaltene Taste = ein Zug, nicht Dauerfeuer
    inputDirection(dir);
  }

  // Wischen: überall auf dem Spiel-Screen (außer auf Buttons). Ein Zug zählt, sobald der Finger
  // SWIPE_PX weit gekommen ist - nicht erst beim Loslassen. Danach wird der Startpunkt neu gesetzt:
  // Wer ohne abzusetzen die Richtung wechselt (z.B. ein "L"), macht damit gleich den nächsten Zug.
  function bindSwipe() {
    const area = document.getElementById("screen-game");
    const gestures = new Map(); // pointerId -> { x, y, lastDir }
    area.addEventListener("pointerdown", (e) => {
      if (e.target.closest("button, .overlay")) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      gestures.set(e.pointerId, { x: e.clientX, y: e.clientY, lastDir: null });
      try { area.setPointerCapture(e.pointerId); } catch (err) { /* egal */ }
    });
    area.addEventListener("pointermove", (e) => {
      const g = gestures.get(e.pointerId);
      if (!g) return;
      const dx = e.clientX - g.x;
      const dy = e.clientY - g.y;
      if (Math.hypot(dx, dy) < SWIPE_PX) return;
      const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "E" : "W") : (dy > 0 ? "S" : "N");
      g.x = e.clientX;
      g.y = e.clientY;
      if (dir === g.lastDir) return; // Weiterwischen in dieselbe Richtung ist kein neuer Zug
      g.lastDir = dir;
      inputDirection(dir);
    });
    const end = (e) => gestures.delete(e.pointerId);
    for (const type of ["pointerup", "pointercancel"]) area.addEventListener(type, end);
    area.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  function startLevelOne() {
    tutorialOverlay.classList.add("hidden");
    tryOpenLevel(1, null);
  }

  // iOS-Safari: sichtbare Höhe als --app-height (siehe Maze)
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
    // Ganz neu (kein Tutorial, kein Level geschafft): "Spielen" führt direkt ins Tutorial
    document.getElementById("btn-play").addEventListener("click", () => {
      if (!state.tutorialDone && !Object.keys(state.levelResults).length) openTutorial();
      else showScreen("screen-levels");
    });
    document.getElementById("btn-continue").addEventListener("click", (e) => {
      const target = e.currentTarget.dataset.level;
      if (target === "tutorial") openTutorial();
      else if (!tryOpenLevel(Number(target), null)) showScreen("screen-levels");
    });
    document.getElementById("btn-settings").addEventListener("click", () => SL.Settings.open());
    document.getElementById("btn-pause").addEventListener("click", togglePause);
    document.getElementById("btn-resume").addEventListener("click", togglePause);
    document.getElementById("btn-restart").addEventListener("click", restartCurrentLevel);
    document.getElementById("btn-restart-quick").addEventListener("click", (e) => {
      e.currentTarget.blur();
      restartCurrentLevel();
    });
    document.getElementById("btn-undo").addEventListener("click", (e) => {
      e.currentTarget.blur();
      undoMove();
    });
    document.getElementById("btn-tutorial-next").addEventListener("click", startLevelOne);
    document.getElementById("btn-tutorial-again").addEventListener("click", openTutorial);
    document.getElementById("btn-pause-settings").addEventListener("click", () => SL.Settings.open());
    document.getElementById("btn-retry").addEventListener("click", restartCurrentLevel);
    document.getElementById("btn-next-level").addEventListener("click", goToNextLevel);
    document.getElementById("level-map").addEventListener("click", (e) => {
      if (e.target.closest("[data-tutorial]")) {
        openTutorial();
        return;
      }
      const el = e.target.closest("[data-level]");
      if (el) tryOpenLevel(Number(el.dataset.level), el.classList.contains("level-tile") ? el : null);
    });
    bindSwipe();

    // Audio darf erst nach einer Nutzer-Geste starten; dazu ein leiser Klick auf Buttons
    document.addEventListener("pointerdown", (e) => {
      SL.Audio.ensure();
      if (e.target.closest(".btn, .keycap-btn, .continue-card, .level-tile, .tutorial-tile, .toggle")) SL.Audio.play("click");
    }, true);
    window.addEventListener("keydown", () => SL.Audio.ensure(), true);

    window.addEventListener("keydown", handleKeydown);
    window.addEventListener("resize", () => {
      syncViewportHeight();
      if (isGameActive()) sizeCanvas();
    });
    // Tab im Hintergrund -> automatisch pausieren, sobald die Uhr läuft (sie misst echte Zeit)
    document.addEventListener("visibilitychange", () => {
      if (document.hidden && isGameActive() && !paused && session && session.started && !session.finished) togglePause();
    });
    window.addEventListener("pageshow", (e) => {
      if (!e.persisted) return;
      if (document.getElementById("screen-menu").classList.contains("active")) refreshMenu();
      else refreshCoinDisplays();
    });
    // Coins können sich auch in einem anderen Tab ändern (Startseite, anderes Spiel)
    SL.Profile.onChange(refreshCoinDisplays);

    SL.Settings.init(state, (settings) => {
      effects.enabled = settings.effects;
      if (!settings.hints) undoBtn.classList.remove("nudge");
    });
    showScreen("screen-menu");
  }

  return { init, showScreen };
})();
