// Screen-Umschaltung, DOM-Bindings, Game-Loop, Kamera und Eingabe (Aufbau wie bei Maze)
window.SL = window.SL || {};

SL.UI = (function () {
  const VIEW_W = 720; // so viele Welt-Pixel sollen ungefähr in die Breite passen
  const FIG_AT = 0.27; // die Figur steht bei 27 % der Breite - die Welt zieht unter ihr durch
  const TRAIL_EVERY_MS = 45;
  const TRAIL_LENGTH = 9;
  const FLASH_MS = 420;

  let state; // Save-State (aus Storage)
  let currentLevelId = null;
  let currentMode = "level"; // "level" | "daily" | "endless"
  let currentConfig = null; // Level- bzw. Daily-Konfiguration des laufenden Spiels
  let session = null;
  let endlessRun = null; // Endlos: { course, extend } - die Strecke wächst beim Spielen
  let endlessBanked = new Set(); // Endlos: Coin-IDs, die schon gutgeschrieben sind
  const effects = new SL.Effects();
  let finishTimer = null; // kurze Pause mit Konfetti zwischen Zieleinlauf und Ergebnis
  let resultTimers = [];
  let resultAnimToken = 0;
  let rafId = null;
  let lastFrameTime = 0;
  let paused = false;
  let viewW = 0, viewH = 0; // Spielfeld in Bildschirm-Pixeln
  let scale = 1; // Bildschirm-Pixel pro Welt-Pixel
  let pixelRatio = 1;
  const cam = { x: 0, y: 0 };
  let camLockY = null; // beim Absturz bleibt die Kamera stehen, die Figur fällt aus dem Bild
  let trail = []; // zuletzt besuchte Positionen [{x, y, seed}] für die Spur
  let trailSeed = 0;
  let playerSkin = null; // ausgerüsteter Skin + Spur, beim Start des Laufs festgelegt
  let playerTrail = null;
  let lastTrailAt = 0;
  let hits = new Map(); // Punkt-ID -> Zeitpunkt des Absprungs (fürs Aufleuchten)
  let squash = null;
  let flashAt = -Infinity;
  let hudStarTier = null;
  let lastAccuracyText = "";

  const canvas = document.getElementById("game-canvas");
  const ctx = canvas.getContext("2d");
  const canvasWrap = document.querySelector(".canvas-wrap");
  const startHint = document.getElementById("start-hint");
  const hudAccuracy = document.getElementById("hud-accuracy");
  const hudCoins = document.getElementById("hud-coins");
  const hudLevel = document.getElementById("hud-level");
  const hudStars = document.getElementById("hud-stars");
  const hudCoinPill = document.querySelector(".hud .coin-pill");
  const pauseOverlay = document.getElementById("pause-overlay");

  const JUMP_KEYS = [" ", "ArrowUp", "w", "W"];

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

  // Coins sind spielübergreifend (Profil) - die Anzeigen zeigen also immer den Gesamtstand
  function refreshCoinDisplays() {
    const coins = SL.Profile.coins();
    for (const id of ["menu-coins", "levels-coins"]) document.getElementById(id).textContent = coins;
    hudCoins.textContent = session ? session.collected.size : 0;
  }

  // Icons als SVG/CSS statt Text-Glyphen - die sitzen je nach Schrift nie sauber mittig
  const COIN_ICON = `<span class="coin-icon" aria-hidden="true"></span>`;
  const STAR_ICON = `<svg class="icon star-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.05L14.91 9.05L22.46 9.65L16.71 14.58L18.47 21.95L12 18L5.53 21.95L7.29 14.58L1.54 9.65L9.09 9.05Z"/></svg>`;
  const LOCK_ICON = `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><rect x="5" y="10.5" width="14" height="10.5" rx="2.5"/></svg>`;
  const FLAME_ICON = `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5c.7 3.3-1.3 5-3 6.8C7.3 11 6 12.8 6 15.3 6 18.7 8.7 21.5 12 21.5s6-2.8 6-6.2c0-2.5-1.2-4.3-2.7-5.7.1 1.7-.6 3-1.7 3.6.5-3.9-.4-7.4-1.6-10.7z"/></svg>`;
  const PLAY_ICON = `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z"/></svg>`;
  const INFINITY_ICON = `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12c-1.8-2.2-3.4-3.5-5.2-3.5a3.5 3.5 0 0 0 0 7c1.8 0 3.4-1.3 5.2-3.5s3.4-3.5 5.2-3.5a3.5 3.5 0 0 1 0 7c-1.8 0-3.4-1.3-5.2-3.5z" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const FLAG_ICON = `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 21V4" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><path d="M6.5 4.2l12 4.6-12 4.6z"/></svg>`;
  const INLINE_COIN = `<span class="inline-icon">${COIN_ICON}</span>`;
  const INLINE_FLAME = `<span class="inline-icon">${FLAME_ICON}</span>`;

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

  function statRow(label, value) {
    return `<div class="lv-stat"><span>${label}</span><b>${value}</b></div>`;
  }

  // Alle Kacheln gleich aufgebaut (Kopf / Mitte / zwei Info-Zeilen) wie bei Maze
  function levelTileHtml(level, nextLevelId, coins) {
    const course = SL.getLevelCourse(level.id);
    const result = getResult(level.id);
    const coinStat = course.coins.length ? `${result ? result.bestCoins || 0 : 0}/${course.coins.length}` : "–";

    if (!SL.Economy.isLevelUnlocked(state, level.id)) {
      const affordable = coins >= level.unlockCost;
      const status = affordable
        ? `<div class="lv-stat lv-stat-center">Freischalten</div>`
        : `<div class="lv-stat lv-stat-center">Noch <b class="lv-inline-coin">${level.unlockCost - coins}${COIN_ICON}</b></div>`;
      return `<button type="button" class="level-tile locked ${affordable ? "affordable" : ""}" data-level="${level.id}" aria-label="Level ${level.id} freischalten für ${level.unlockCost} Coins">
        <div class="lv-head">${LOCK_ICON}</div>
        <div class="lv-mid lv-cost">${level.unlockCost}${COIN_ICON}</div>
        <div class="lv-stats">${status}${statRow("Sprünge", course.jumpCount)}</div>
      </button>`;
    }

    const classes = ["level-tile"];
    if (result && result.stars === 3) classes.push("perfect");
    if (result && result.bestAccuracy >= 100) classes.push("flawless"); // Sterne in Holo-Silber
    if (level.id === nextLevelId) classes.push("next");
    return `<button type="button" class="${classes.join(" ")}" data-level="${level.id}">
      ${level.id === nextLevelId ? `<span class="lv-badge">${result ? "Nochmal" : "Weiter"}</span>` : ""}
      <div class="lv-head lv-num">${level.id}</div>
      <div class="lv-mid lv-stars">${starsHtml(result ? result.stars : 0)}</div>
      <div class="lv-stats">
        ${statRow("Bestwert", result ? SL.formatAccuracy(result.bestAccuracy) : "–")}
        ${statRow("Coins", coinStat)}
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
    const coins = SL.Profile.coins();

    const summary = `<div class="levels-summary">
      <div class="summary-progress">
        <div class="summary-stars">${STAR_ICON}<b>${totalStars}</b><span>/ ${maxStars}</span></div>
        <div class="progress"><span style="width:${pct(totalStars, maxStars)}"></span></div>
        <div class="summary-sub">${completed} von ${SL.LEVELS.length} Level geschafft</div>
      </div>
      <div class="summary-rule">
        <div class="summary-rule-head">${starsHtml(3)}<b>ab ${SL.STAR_ACCURACY[3]} %</b></div>
        <p>Perfekt = 3, Gut = 2, OK = 1 Punkt pro Sprung. Treffsicherheit = Punkte von allen möglichen.</p>
      </div>
      ${next ? `<button type="button" class="btn btn-primary summary-continue" data-level="${next.id}">Weiterspielen<span class="btn-cost">Level ${next.id}</span></button>`
        : SL.Endless.isUnlocked(state) ? `<button type="button" class="btn btn-primary summary-continue" data-endless>Endlos spielen</button>` : ""}
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

    map.innerHTML = summary + chapters + endlessHtml(totalStars, maxStars);
    refreshCoinDisplays();
  }

  // Ganz unten: der Endlosmodus - gesperrt, bis alle Level 3 Sterne haben
  function endlessHtml(totalStars, maxStars) {
    const unlocked = SL.Endless.isUnlocked(state);
    const total = state.endless.checkpoints;
    const card = unlocked
      ? `<button type="button" class="endless-card" data-endless aria-label="Endlos spielen, ${total} Checkpoints geschafft">
          <span class="endless-icon">${INFINITY_ICON}</span>
          <span class="endless-text"><b>Endlos spielen</b><span>Abgestürzt? Weiter geht's am letzten Checkpoint</span></span>
          <span class="endless-stat"><span>Checkpoints</span><b>${total}</b></span>
        </button>`
      : `<button type="button" class="endless-card locked" data-endless aria-label="Endlosmodus, frei mit allen ${maxStars} Sternen">
          <span class="endless-icon">${LOCK_ICON}</span>
          <span class="endless-text"><b>Noch ${maxStars - totalStars} Sterne</b><span>Hol in jedem Level 3 Sterne, dann geht's los</span></span>
          <span class="endless-stat"><span>Sterne</span><b>${totalStars}/${maxStars}</b></span>
        </button>`;
    return `<section class="chapter ${unlocked ? "" : "chapter-locked"}">
      <header class="chapter-head">
        <div class="chapter-title">
          <span class="chapter-kicker">Bonus · Alle ${maxStars} Sterne</span>
          <h3>Endlos</h3>
          <p>Eine Strecke ohne Ende – mal ruhig, mal schnell, mit allen Sprüngen aus den drei Kapiteln. Jeder Checkpoint zählt, auch über mehrere Läufe.</p>
        </div>
      </header>
      ${card}
    </section>`;
  }

  function onEndlessClick(el) {
    if (SL.Endless.isUnlocked(state)) {
      openEndless();
      return;
    }
    SL.Audio.play("bump");
    restartAnimation(el, "shake");
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
      SL.Audio.play("bump");
      tileEl.classList.remove("shake");
      void tileEl.offsetWidth;
      tileEl.classList.add("shake");
    }
  }

  // ---------- Spielfeld ----------

  // Breites Spielfeld (Seitenansicht), höchstens 900 × 560. Auf schmalen Bildschirmen wird die Welt
  // kleiner gezeichnet, damit man trotzdem genug von der Strecke vor sich sieht.
  function sizeCanvas() {
    const availW = canvasWrap.clientWidth - 8;
    const availH = canvasWrap.clientHeight - 8;
    viewW = Math.floor(Math.max(200, Math.min(900, availW)));
    viewH = Math.floor(Math.max(160, Math.min(560, availH, viewW * 1.5)));
    pixelRatio = window.devicePixelRatio || 1;
    canvas.style.width = viewW + "px";
    canvas.style.height = viewH + "px";
    canvas.width = Math.round(viewW * pixelRatio);
    canvas.height = Math.round(viewH * pixelRatio);
    scale = Math.max(0.66, Math.min(1.15, viewW / VIEW_W));
  }

  // Kamera: x fest an der Figur (die Welt zieht durch), y folgt weich und schaut schon etwas zum
  // nächsten Punkt. Beim Absturz bleibt sie stehen.
  function updateCamera(dt, fig, instant) {
    cam.x = fig.x - (viewW / scale) * FIG_AT;
    let focusY = fig.y;
    if (session.mode === "air" && session.target) focusY = fig.y * 0.6 + session.target.y * 0.4;
    if (session.mode === "lost") focusY = camLockY ?? fig.y;
    const targetY = focusY - (viewH / scale) * 0.55;
    if (instant) cam.y = targetY;
    else cam.y += (targetY - cam.y) * (1 - Math.exp(-dt / 230));
  }

  const CONFETTI_COLORS = ["#ff8a5c", "#ffd166", "#c6f24a", "#8fd8ff", "#b084ff", "#ff6fa5", "#2b2420"];

  // Startet einen Lauf - für Level und Daily gleich
  function openSession(config, course, mode) {
    currentMode = mode;
    currentConfig = config;
    clearTimeout(finishTimer);
    showScreen("screen-game");

    session = new SL.LeapSession(course);
    effects.clear();
    trail = [];
    playerSkin = SL.Cosmetics.equipped("skin");
    playerTrail = SL.Cosmetics.equipped("trail");
    hits = new Map();
    squash = null;
    flashAt = -Infinity;
    camLockY = null;
    bindSessionEvents();
    sizeCanvas();
    updateCamera(0, session.figureAt(performance.now()), true);

    hudLevel.textContent = config.name;
    hudCoins.textContent = 0;
    hudStarTier = null;
    lastAccuracyText = "";
    hudStars.style.display = mode === "endless" ? "none" : "";
    updateHud();
    showStartHint(firstHintFor(config));
    pauseOverlay.classList.add("hidden");
    paused = false;
    document.getElementById("btn-quit").dataset.nav = mode === "daily" ? "screen-menu" : "screen-levels";
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();

    stopGameLoop();
    lastFrameTime = performance.now();
    rafId = requestAnimationFrame(gameLoop);
  }

  function openGame(levelId) {
    currentLevelId = levelId;
    const level = SL.getLevel(levelId);
    openSession({ ...level, chapterId: level.chapter }, SL.getLevelCourse(levelId), "level");
  }

  function openDaily() {
    const config = SL.Daily.getConfig();
    openSession({ ...config, chapterId: config.chapter }, SL.Daily.getCourse(config), "daily");
  }

  // Jeder Lauf ist eine neue, zufällige Strecke
  function openEndless() {
    endlessRun = SL.Endless.createRun();
    endlessBanked = new Set();
    openSession({ name: "Endlos" }, endlessRun.course, "endless");
  }

  const isTouch = () => window.matchMedia("(pointer: coarse)").matches;
  const tapControlsShown = () => document.getElementById("app").classList.contains("tap-controls");
  const pressWord = () => (tapControlsShown() ? "Knopf drücken" : isTouch() ? "Tippen" : "Leertaste");

  // Hinweis vor dem Start: beim allerersten Level die Regel, beim ersten Level eines Kapitels das
  // Neue (einmalig), sonst nur "zum Losrollen drücken". Liefert eine Funktion, damit der Text neu
  // gebaut werden kann, wenn man die Steuerung umstellt (Leertaste <-> Knopf).
  function firstHintFor(config) {
    const chapter = SL.CHAPTERS.find((ch) => ch.id === config.chapterId);
    if (currentMode === "level" && config.id === 1) {
      return () => `${pressWord()} zum Losrollen – und nochmal, wenn du <b>auf einem Punkt</b> bist`;
    }
    if (currentMode === "level" && chapter && chapter.coach && config.id === chapter.firstLevel && !state.coachSeen.includes(chapter.id)) {
      state.coachSeen.push(chapter.id);
      SL.Storage.save(state);
      return () => chapter.coach;
    }
    return () => `${pressWord()} zum Losrollen`;
  }

  let hintText = null; // Funktion, die den aktuellen Start-Hinweis baut
  function showStartHint(text) {
    hintText = text;
    startHint.innerHTML = text();
    startHint.classList.remove("hidden");
  }

  function restartAnimation(el, className) {
    el.classList.remove(className);
    void el.offsetWidth;
    el.classList.add(className);
  }

  // Kleiner Text neben einem Punkt (Wertung, "Verpasst!"): links oberhalb, also hinter der Figur -
  // sie fliegt nach rechts weiter und verdeckt ihn nicht. Abstand in Bildschirm-Pixeln.
  function textBehind(x, y, label) {
    effects.text(x - 28 / scale, y - 36 / scale, label);
  }

  // Spiel-Ereignisse -> Ton, Vibration, Partikel, HUD
  function bindSessionEvents() {
    session.onStart = () => startHint.classList.add("hidden");
    session.onJump = (p, rating) => {
      const now = performance.now();
      SL.Audio.play("jump", rating);
      SL.Haptics.vibrate(rating === "perfect" ? 18 : 10);
      hits.set(p.id, now);
      squash = { at: now, kind: "jump" };
      textBehind(p.x, p.y, SL.RATINGS[rating].label);
      if (rating === "perfect") {
        effects.burst(p.x, p.y, { count: 14, colors: ["#2b2420", "#85786a", "#ffd166"], speed: [80, 200], life: [250, 520], size: [1.5, 3] });
      }
      updateHud();
    };
    session.onWhiff = () => SL.Audio.play("whiff");
    session.onLaunch = () => SL.Audio.play("launch");
    // Staub an der Landestelle (die Figur steht in diesem Moment noch einen Frame in der Luft)
    session.onLand = (pl) => {
      SL.Audio.play("land");
      SL.Haptics.vibrate(12);
      squash = { at: performance.now(), kind: "land" };
      effects.burst(session.fig.x, pl.top, { count: 10, colors: ["#85786a", "#ddd3c2"], speed: [40, 120], life: [200, 420], size: [1.5, 3], angle: -Math.PI / 2, spread: Math.PI * 0.9 });
    };
    session.onCheckpoint = (pl) => {
      SL.Audio.play("checkpoint");
      SL.Haptics.vibrate(25);
      if (currentMode === "endless") onEndlessCheckpoint(pl);
      else effects.text(pl.flagX + 10, pl.top - 52, "Checkpoint!");
    };
    session.onCoin = (c) => {
      hudCoins.textContent = session.collected.size;
      restartAnimation(hudCoinPill, "pop");
      SL.Audio.play("coin");
      effects.burst(c.x, c.y, { count: 10, colors: ["#ffd166", "#f2a900", "#2b2420"], speed: [50, 150], life: [250, 500], size: [1.5, 3] });
    };
    session.onMiss = (p) => {
      SL.Audio.play("fall");
      SL.Haptics.vibrate([40, 30, 60]);
      flashAt = performance.now();
      camLockY = session.fig.y;
      if (p) textBehind(p.x, p.y, "Verpasst!");
    };
    session.onWall = () => {
      SL.Audio.play("crash");
      effects.shake(7, 260);
      const { x, y } = session.wall;
      effects.burst(x + SL.LEAP.FIG_R, y, { count: 14, colors: ["#2b2420", "#c0392b"], speed: [80, 200], life: [250, 500], size: [2, 3.5], angle: Math.PI, spread: Math.PI });
    };
    session.onRespawn = (pl) => {
      trail = [];
      camLockY = null;
      updateCamera(0, session.figureAt(performance.now()), true);
      updateHud();
      hudCoins.textContent = session.collected.size;
      showStartHint(() => `${pl.kind === "checkpoint" ? "Am Checkpoint" : "Nochmal"} – ${pressWord()} zum Losrollen`);
    };
    session.onFinish = (result) => onFinished(result);
  }

  // Endlos: Strecke weiterbauen, Zähler hoch, Coins gutschreiben. Coins zählen erst, wenn man sie
  // bis zum Checkpoint gebracht hat (im Level erst im Ziel) - bei einem Absturz davor liegen sie
  // wieder auf der Strecke. Jeder Coin ist 1 Coin.
  function onEndlessCheckpoint(pl) {
    endlessRun.extend(pl.index);
    let total;
    const unlocked = SL.Cosmetics.unlockedBy(() => {
      total = SL.Endless.addCheckpoint(state);
      SL.Economy.checkQuests(state);
    });
    effects.text(pl.flagX + 10, pl.top - 52, `Checkpoint ${total}!`);
    for (const cos of unlocked) effects.text(pl.flagX + 10, pl.top - 80, `Neu im Shop: ${cos.name}`);
    let coins = 0;
    for (const id of session.collected) {
      if (endlessBanked.has(id)) continue;
      endlessBanked.add(id);
      coins++;
    }
    if (coins) {
      SL.Profile.addCoins(coins);
      effects.text(pl.flagX + 10, pl.top - 24, `+${coins} Coins`);
    }
  }

  function gameLoop(now) {
    const dt = Math.min(60, now - lastFrameTime);
    lastFrameTime = now;

    if (session) {
      if (!paused) {
        session.update(now);
        effects.update(dt);
      }
      const fig = session.figureAt(now);
      if (!paused) {
        updateCamera(dt, fig, false);
        updateTrail(now, fig);
        updateHud();
      }
      SL.Renderer.render(ctx, {
        session,
        now,
        w: viewW,
        h: viewH,
        scale,
        pixelRatio,
        cam,
        effects,
        shake: effects.getShakeOffset(),
        flash: Math.max(0, 1 - (now - flashAt) / FLASH_MS),
        guide: state.settings.guide,
        trail,
        hits,
        squash: effects.enabled ? squash : null,
        skin: playerSkin,
        trailStyle: playerTrail,
      });
    }
    // Läuft weiter, solange der Spiel-Screen offen ist (auch nach dem Ziel fürs Konfetti)
    rafId = requestAnimationFrame(gameLoop);
  }

  // Spur: alle paar ms die Position merken, solange die Figur unterwegs ist
  function updateTrail(now, fig) {
    if (session.mode !== "air" && session.mode !== "ground") return;
    if (now - lastTrailAt < TRAIL_EVERY_MS) return;
    lastTrailAt = now;
    trail.push({ x: fig.x, y: fig.y, seed: trailSeed++ });
    if (trail.length > TRAIL_LENGTH) trail.shift();
  }

  // HUD: Treffsicherheit bisher und welche Sterne damit gerade drin sind. Nur neu schreiben, wenn
  // sich etwas ändert (nicht jeden Frame).
  function updateHud() {
    if (currentMode === "endless") {
      updateEndlessHud();
      return;
    }
    const acc = session.accuracy();
    const text = SL.formatAccuracy(acc);
    if (text !== lastAccuracyText) {
      hudAccuracy.textContent = text;
      lastAccuracyText = text;
    }
    const tier = acc == null ? 3 : SL.Economy.starsForAccuracy(acc);
    if (tier === hudStarTier) return;
    if (hudStarTier !== null && tier < hudStarTier) SL.Audio.play("starLost");
    const dropped = hudStarTier !== null && tier < hudStarTier;
    hudStarTier = tier;
    const label = tier === 3 ? `ab ${SL.STAR_ACCURACY[3]} %` : tier === 2 ? `ab ${SL.STAR_ACCURACY[2]} %` : "Ins Ziel!";
    hudStars.innerHTML = starsHtml(tier) + `<span>${label}</span>`;
    hudStars.classList.remove("dropped");
    if (dropped) {
      void hudStars.offsetWidth;
      hudStars.classList.add("dropped");
    }
  }

  // Endlos: alle je erreichten Checkpoints groß in der Mitte (statt Treffsicherheit)
  function updateEndlessHud() {
    const text = String(state.endless.checkpoints);
    if (text === lastAccuracyText) return;
    lastAccuracyText = text;
    hudAccuracy.innerHTML = `<span class="hud-flag">${FLAG_ICON}</span>${text}`;
  }

  function stopGameLoop() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
  }

  // ---------- Ziel & Ergebnis ----------

  function onFinished(result) {
    SL.Audio.play("finish");
    SL.Haptics.vibrate([20, 40, 20]);
    const pl = session.platform;
    effects.burst(pl.goalX, pl.top - SL.LEAP.FIG_R, { count: 70, colors: CONFETTI_COLORS, speed: [120, 320], life: [700, 1300], size: [2.5, 4.5], gravity: 380, shape: "confetti" });
    const outcome = currentMode === "daily" ? recordDailyRun(result) : recordLevelRun(result);
    finishTimer = setTimeout(() => {
      populateResults(result, outcome);
      showScreen("screen-results");
      playResultsAnimation(result, outcome);
    }, effects.enabled ? 900 : 300);
  }

  function recordLevelRun(result) {
    const prev = getResult(currentLevelId);
    const reward = SL.Economy.computeReward({
      levelId: currentLevelId,
      stars: result.stars,
      coinsCollected: result.coinsCollected,
    });
    const endlessBefore = state.endless.unlocked;
    // Eintragen erledigt evtl. Aufgaben -> Items, die dadurch im Shop neu freigeschaltet sind
    const unlocked = SL.Cosmetics.unlockedBy(() => SL.Economy.recordLevelResult(state, currentLevelId, result, reward.total));
    const endlessUnlocked = !endlessBefore && SL.Endless.isUnlocked(state);
    return { reward, isNewBest: !prev || result.accuracy > prev.bestAccuracy, endlessUnlocked, unlocked };
  }

  // Daily: Coins gibt es nur beim ersten Abschluss des Tages (als Bonus, der mit der Serie wächst)
  function recordDailyRun(result) {
    let daily;
    const unlocked = SL.Cosmetics.unlockedBy(() => { daily = SL.Daily.recordResult(state, currentConfig.dailyKey, result.accuracy, result.stars); });
    const parts = daily.coins ? [{ label: "Tagesbonus", coins: daily.coins }] : [];
    return { reward: { parts, total: daily.coins }, isNewBest: daily.isNewBest, daily, unlocked };
  }

  const RESULT_TITLES = { 3: "Perfekt!", 2: "Stark!", 1: "Geschafft!" };

  function populateResults(result, outcome) {
    const isDaily = currentMode === "daily";
    const { counts } = result;
    document.getElementById("results-title").textContent = (isDaily ? `${currentConfig.name}: ` : "") + RESULT_TITLES[result.stars];
    document.getElementById("results-badge").classList.add("hidden"); // erscheinen animiert
    document.getElementById("results-flawless").classList.add("hidden");
    const flawless = result.jumps > 0 && counts.perfect === result.jumps;
    document.querySelector(".results-badges").classList.toggle("hidden", !outcome.isNewBest && !flawless);
    document.getElementById("results-accuracy").textContent = SL.formatAccuracy(result.accuracy);
    document.getElementById("results-hits").textContent = `${counts.perfect} · ${counts.good} · ${counts.ok}`;
    document.getElementById("results-falls").textContent = result.falls;
    document.getElementById("results-coins").innerHTML = `+0${COIN_ICON}`; // zählt animiert hoch
    document.getElementById("results-stars").innerHTML = starsHtml(0); // ploppen animiert rein
    document.getElementById("results-breakdown").innerHTML = outcome.reward.parts
      .map((part) => `<li class="pending"><span>${part.label}</span><span>+${part.coins}</span></li>`).join("");

    const coinNote = result.coinsTotal ? ` · Coins ${result.coinsCollected}/${result.coinsTotal}` : "";
    const missing = Math.ceil(SL.STAR_ACCURACY[3] - Math.floor(result.accuracy));
    document.getElementById("results-note").innerHTML = result.stars === 3
      ? `3 Sterne ab ${SL.STAR_ACCURACY[3]} % – geschafft!${coinNote}`
      : `3 Sterne ab ${SL.STAR_ACCURACY[3]} %${coinNote}<br>Dir fehlen noch <b>${missing} %</b>`;

    // Infozeile: Daily -> Serie + nächstes Daily
    const infoEl = document.getElementById("results-unlock");
    let info = "";
    if (isDaily) {
      const { streak, firstClear } = outcome.daily;
      info = `${INLINE_FLAME} Serie: <b>${streak} ${streak === 1 ? "Tag" : "Tage"}</b>`
        + (firstClear ? ` · Tagesbonus +${outcome.reward.total}${INLINE_COIN}` : "")
        + `<br>Nächstes Daily in ${SL.Days.timeUntilNext()}`;
    } else if (outcome.endlessUnlocked) {
      info = `Alle ${SL.Endless.maxStars()} Sterne! Der <b>Endlosmodus</b> ist frei – ganz unten in der Level-Auswahl.`;
    }
    if (outcome.unlocked.length) {
      info += `${info ? "<br>" : ""}<span class="inline-icon">${STAR_ICON}</span> Neu im Shop freigeschaltet: <b>${outcome.unlocked.map((c) => c.name).join(", ")}</b>`;
    }
    infoEl.innerHTML = info;
    infoEl.classList.toggle("hidden", !info);

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
    if (result.jumps > 0 && result.counts.perfect === result.jumps) badges.push(document.getElementById("results-flawless"));
    badges.forEach((badge, i) => resultTimers.push(setTimeout(() => {
      badge.classList.remove("hidden");
      restartAnimation(badge, "pop");
    }, afterStars + i * 120)));

    document.querySelectorAll("#results-breakdown li").forEach((li, i) => resultTimers.push(setTimeout(() => {
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

  // Daily-Ergebnis teilen: am Handy über das Teilen-Menü, sonst in die Zwischenablage
  async function shareDaily() {
    const record = SL.Daily.getRecord(state, currentConfig.dailyKey);
    if (!record) return;
    const text = SL.Daily.shareText(currentConfig, record, SL.Profile.streak(currentConfig.dailyKey));
    try {
      if (navigator.share && isTouch()) {
        await navigator.share({ text });
        return;
      }
      await navigator.clipboard.writeText(text);
      showToast("Ergebnis kopiert – einfach einfügen!");
    } catch (e) {
      if (e && e.name === "AbortError") return; // Teilen-Menü abgebrochen
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

  // ---------- Menü ----------

  const MONTHS = ["JAN", "FEB", "MÄR", "APR", "MAI", "JUN", "JUL", "AUG", "SEP", "OKT", "NOV", "DEZ"];
  const DIFFICULTY_LEVEL = { Leicht: 1, Mittel: 2, Schwer: 3 };

  // Menü: Daily-Karte (Datum, Nummer, Schwierigkeit, heutiges Ergebnis) wie bei Maze
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
      ? `<span class="daily-stars">${starsHtml(record.stars)}</span><span>${SL.formatAccuracy(record.bestAccuracy)}</span>`
      : `<span class="daily-play">${PLAY_ICON}</span>`;
    document.getElementById("btn-daily").setAttribute("aria-label",
      `Tägliche Strecke ${config.number}, ${config.difficulty}` + (record ? `, Bestwert ${SL.formatAccuracy(record.bestAccuracy)}` : ", noch nicht gespielt"));
  }

  // ---------- Steuerung ----------

  function togglePause() {
    if (!session || session.finished) return;
    paused = !paused;
    pauseOverlay.classList.toggle("hidden", !paused);
    const now = performance.now();
    if (paused) {
      session.pause(now);
    } else {
      session.resume(now);
      lastFrameTime = now;
    }
    // Fokus vom geklickten Button nehmen - sonst löst eine spätere Taste ihn erneut aus
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  }

  function isGameActive() {
    return document.getElementById("screen-game").classList.contains("active");
  }

  function restartCurrentLevel() {
    if (currentMode === "daily") openDaily();
    else if (currentMode === "endless") openEndless();
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

  // Gemeinsamer Eingang für Tastatur und Tippen. timeStamp = wann wirklich gedrückt wurde.
  function inputJump(timeStamp) {
    if (!session || paused || !isGameActive() || SL.Settings.isOpen()) return;
    const now = performance.now();
    session.press(Math.min(timeStamp || now, now));
  }

  function handleKeydown(e) {
    // Browser-Shortcuts (Strg+R, ...) nicht abfangen
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (SL.Settings.isOpen()) {
      if (e.key === "Escape") { e.preventDefault(); SL.Settings.close(); }
      return;
    }
    const gameActive = isGameActive();
    if (!gameActive) return;
    if (e.key === "Escape" || e.key === "p" || e.key === "P") {
      e.preventDefault();
      togglePause();
      return;
    }
    if (e.key === "r" || e.key === "R") {
      e.preventDefault();
      restartCurrentLevel(); // schneller Neustart per Taste (wie bei Maze, auch aus der Pause)
      return;
    }
    if (!JUMP_KEYS.includes(e.key)) return;
    e.preventDefault();
    // Gehaltene Taste zählt nicht - jeder Sprung ist ein eigener Druck
    if (e.repeat) return;
    inputJump(e.timeStamp);
  }

  // Tippen: überall auf dem Spiel-Screen außer auf HUD-Knöpfen und Overlays. Ist der Sprung-Knopf
  // eingeblendet, sinkt er bei jedem Tipp ein (solange ein Finger drauf ist) und zeigt den Ring.
  function bindTap() {
    const screen = document.getElementById("screen-game");
    const button = document.querySelector(".tap-jump");
    const fingers = new Set(); // pointerIds, die gerade drücken
    screen.addEventListener("pointerdown", (e) => {
      if (e.target.closest(".hud, .overlay")) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      e.preventDefault();
      if (tapControlsShown()) {
        fingers.add(e.pointerId);
        button.classList.add("pressed");
        restartAnimation(button, "ring");
        SL.Haptics.vibrate(6);
      }
      inputJump(e.timeStamp);
    });
    const release = (e) => {
      fingers.delete(e.pointerId);
      if (!fingers.size) button.classList.remove("pressed");
    };
    for (const type of ["pointerup", "pointercancel", "pointerleave"]) screen.addEventListener(type, release);
    screen.addEventListener("contextmenu", (e) => {
      if (!e.target.closest(".hud, .overlay")) e.preventDefault();
    });
  }

  // "auto": Sprung-Knopf nur auf Geräten mit Touch als Hauptbedienung (wie bei Maze)
  function applyTouchControls() {
    const mode = state.settings.touchControls;
    const show = mode === "on" || (mode === "auto" && isTouch());
    document.getElementById("app").classList.toggle("tap-controls", show);
    if (isGameActive()) {
      sizeCanvas();
      // Wartet die Figur noch, passt der Hinweis zur neuen Steuerung
      if (session && session.mode === "wait" && hintText) showStartHint(hintText);
    }
  }

  // iOS-Safari: sichtbare Höhe als --app-height (siehe game.css)
  function syncViewportHeight() {
    const vv = window.visualViewport;
    if (vv && vv.scale > 1.01) return;
    const height = vv ? vv.height : window.innerHeight;
    document.documentElement.style.setProperty("--app-height", `${Math.round(height)}px`);
  }

  // Die Maskottchen (Pause/Ergebnis) tragen den ausgerüsteten Skin (CSS kommt vom Muster des Skins)
  function applyPlayerLook() {
    SL.CosmeticsDraw.applyMascotLook(SL.Cosmetics.equipped("skin"));
  }

  function init() {
    state = SL.Storage.load();
    // Aufgaben für den Shop: auch alles, was vor dem Update schon geschafft war
    SL.Economy.checkQuests(state);
    SL.Quests.sync();
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
    document.getElementById("level-map").addEventListener("click", (e) => {
      const endless = e.target.closest("[data-endless]");
      if (endless) {
        onEndlessClick(endless);
        return;
      }
      const el = e.target.closest("[data-level]");
      if (el) onLevelTileClick(Number(el.dataset.level), el);
    });
    bindTap();

    // Audio darf erst nach einer Nutzer-Geste starten; dazu ein leiser Klick auf Buttons
    document.addEventListener("pointerdown", (e) => {
      SL.Audio.ensure();
      if (e.target.closest(".btn, .daily-card, .level-tile, .toggle")) SL.Audio.play("click");
    }, true);
    window.addEventListener("keydown", () => SL.Audio.ensure(), true);

    window.addEventListener("keydown", handleKeydown);
    window.addEventListener("resize", () => {
      syncViewportHeight();
      if (isGameActive()) sizeCanvas();
    });
    // Tab im Hintergrund -> automatisch pausieren. Zurück im Tab: Menü neu einlesen (neues Daily?)
    const menuActive = () => document.getElementById("screen-menu").classList.contains("active");
    document.addEventListener("visibilitychange", () => {
      if (document.hidden && isGameActive() && !paused) togglePause();
      if (!document.hidden && menuActive()) refreshMenu();
    });
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
    applyPlayerLook();

    SL.Settings.init(state, (settings) => {
      effects.enabled = settings.effects;
      applyTouchControls();
    });
    refreshMenu();
  }

  return { init, showScreen };
})();
