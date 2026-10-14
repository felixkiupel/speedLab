// Screen-Umschaltung, DOM-Bindings, Game-Loop-Steuerung
window.SL = window.SL || {};

SL.UI = (function () {
  let state; // Save-State (aus Storage)
  let currentLevelId = null;
  let session = null;
  let mazeLayer = null;
  let cellSize = 28;
  let playerColor = "#111111";
  let rafId = null;
  let lastFrameTime = 0;
  let paused = false;

  const canvas = document.getElementById("game-canvas");
  const ctx = canvas.getContext("2d");
  const canvasWrap = document.querySelector(".canvas-wrap");
  const startHint = document.getElementById("start-hint");
  const crashFlash = document.getElementById("crash-flash");
  const hudTimer = document.getElementById("hud-timer");
  const hudCoins = document.getElementById("hud-coins");
  const hudLevel = document.getElementById("hud-level");
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
    if (id === "screen-levels") renderLevelGrid();
    if (id === "screen-shop") renderShopGrid();
    if (id === "screen-menu") refreshCoinDisplays();
  }

  function refreshCoinDisplays() {
    document.getElementById("menu-coins").textContent = state.coins;
    document.getElementById("levels-coins").textContent = state.coins;
    document.getElementById("shop-coins").textContent = state.coins;
    hudCoins.textContent = session ? session.coinsCollected : 0;
  }

  function starsHtml(count) {
    return [1, 2, 3].map((i) => `<span class="star ${i <= count ? "on" : "off"}">★</span>`).join("");
  }

  function renderLevelGrid() {
    const grid = document.getElementById("level-grid");
    grid.innerHTML = SL.LEVELS.map((level) => {
      const unlocked = SL.Economy.isLevelUnlocked(state, level.id);
      if (!unlocked) {
        return `<div class="level-tile locked" data-level="${level.id}">
          <div class="lv-num">🔒</div>
          <div class="lv-cost">${level.unlockCost} ●</div>
        </div>`;
      }
      const result = state.levelResults[String(level.id)];
      const bestHtml = result ? `<div class="lv-best">Beste Zeit: ${formatTime(result.bestTimeMs)}</div>` : "";
      return `<div class="level-tile" data-level="${level.id}">
        <div class="lv-num">${level.id}</div>
        <div class="lv-stars">${starsHtml(result ? result.stars : 0)}</div>
        ${bestHtml}
      </div>`;
    }).join("");

    grid.querySelectorAll(".level-tile").forEach((tile) => {
      tile.addEventListener("click", () => onLevelTileClick(Number(tile.dataset.level), tile));
    });
    refreshCoinDisplays();
  }

  function onLevelTileClick(levelId, tileEl) {
    if (SL.Economy.isLevelUnlocked(state, levelId)) {
      openGame(levelId);
      return;
    }
    if (SL.Economy.canAffordUnlock(state, levelId)) {
      SL.Economy.unlockLevel(state, levelId);
      renderLevelGrid();
      openGame(levelId);
    } else {
      tileEl.style.transition = "none";
      tileEl.style.borderColor = "var(--danger)";
      setTimeout(() => { tileEl.style.borderColor = ""; }, 400);
    }
  }

  function renderShopGrid() {
    const grid = document.getElementById("shop-grid");
    grid.innerHTML = SL.COSMETICS.map((cos) => {
      const owned = state.ownedCosmetics.includes(cos.id);
      const equipped = state.equippedCosmetic === cos.id;
      const label = equipped ? "Ausgerüstet" : owned ? "Ausrüsten" : `${cos.price} ●`;
      const disabled = equipped || (!owned && state.coins < cos.price);
      return `<div class="shop-tile ${equipped ? "equipped" : ""}">
        <div class="shop-swatch" style="background:${cos.color}"></div>
        <div>${cos.name}</div>
        <button class="btn" data-cosmetic="${cos.id}" data-owned="${owned}" ${disabled ? "disabled" : ""}>${label}</button>
      </div>`;
    }).join("");

    grid.querySelectorAll("button[data-cosmetic]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.cosmetic;
        const owned = btn.dataset.owned === "true";
        const ok = owned ? SL.Economy.equipCosmetic(state, id) : SL.Economy.purchaseCosmetic(state, id);
        if (ok) renderShopGrid();
      });
    });
    refreshCoinDisplays();
  }

  function sizeCanvas(rows, cols) {
    const availW = canvasWrap.clientWidth - 8;
    const availH = canvasWrap.clientHeight - 8;
    cellSize = Math.floor(Math.min(availW / cols, availH / rows));
    cellSize = Math.max(12, Math.min(48, cellSize));
    canvas.width = cols * cellSize;
    canvas.height = rows * cellSize;
  }

  function openGame(levelId) {
    currentLevelId = levelId;
    const levelConfig = SL.getLevel(levelId);
    showScreen("screen-game");

    session = new SL.GameSession(levelConfig);
    // Canvas-Größe richtet sich nach dem fertigen Grid (Räume + Türen als eigene Zellen),
    // nicht nach der rohen Level-Config - das Grid ist größer als levelConfig.rows/cols.
    sizeCanvas(session.maze.rows, session.maze.cols);
    mazeLayer = SL.Renderer.buildMazeLayer(session.maze, cellSize);

    session.onFirstMove = () => startHint.classList.add("hidden");
    session.onCoinCollected = () => { hudCoins.textContent = session.coinsCollected; };
    session.onFinish = (result) => onLevelFinished(result);

    hudLevel.textContent = levelConfig.name;
    hudCoins.textContent = 0;
    hudTimer.textContent = "0.00s";
    startHint.classList.remove("hidden");
    pauseOverlay.classList.add("hidden");
    paused = false;
    playerColor = SL.getCosmetic(state.equippedCosmetic).color; // ändert sich nicht mehr während des Laufs
    renderSpeedMeter(levelConfig.tickMs);

    stopGameLoop();
    lastFrameTime = performance.now();
    rafId = requestAnimationFrame(gameLoop);
  }

  function renderSpeedMeter(tickMs) {
    const level = SL.speedLevelFor(tickMs);
    const bar = document.getElementById("speed-bar");
    bar.innerHTML = Array.from({ length: SL.SPEED_SEGMENTS })
      .map((_, i) => `<span class="speed-seg ${i < level ? "on" : ""}"></span>`)
      .join("");
  }

  function gameLoop(now) {
    const dt = Math.min(60, now - lastFrameTime); // dt-Spitzen (Tab-Wechsel etc.) kappen
    lastFrameTime = now;

    if (!paused && session && !session.finished) {
      session.update(dt);
      hudTimer.textContent = formatTime(session.simElapsedMs);
      crashFlash.classList.toggle("show", session.crashFlashMs > 0);
    }

    if (session) {
      SL.Renderer.render(ctx, canvas, {
        mazeLayer,
        cellSize,
        coins: session.maze.coins,
        collectedSet: session.collectedSet,
        player: session.getPlayerPixel(cellSize),
        trail: session.trail,
        color: playerColor,
        direction: session.currentDir,
        flashCrash: session.crashFlashMs > 0,
      });
    }

    if (!session || !session.finished) {
      rafId = requestAnimationFrame(gameLoop);
    }
  }

  function stopGameLoop() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
  }

  function onLevelFinished(result) {
    const coinsEarned = SL.Economy.computeReward({
      levelId: currentLevelId,
      stars: result.stars,
      crashCount: result.crashCount,
      coinsCollected: result.coinsCollected,
    });
    SL.Economy.recordLevelResult(state, currentLevelId, result.timeMs, result.stars, coinsEarned);
    populateResults(result, coinsEarned);
    showScreen("screen-results");
  }

  function populateResults(result, coinsEarned) {
    document.getElementById("results-time").textContent = formatTime(result.timeMs);
    document.getElementById("results-crashes").textContent = result.crashCount;
    document.getElementById("results-coins").textContent = "+" + coinsEarned + " ●";
    document.getElementById("results-stars").innerHTML = starsHtml(result.stars);

    const nextLevel = SL.getNextLevel(currentLevelId);
    const nextBtn = document.getElementById("btn-next-level");
    if (nextLevel) {
      nextBtn.style.display = "";
      nextBtn.textContent = SL.Economy.isLevelUnlocked(state, nextLevel.id)
        ? "Nächstes Level"
        : `Nächstes Level (${nextLevel.unlockCost} ●)`;
    } else {
      nextBtn.style.display = "none";
    }
  }

  function togglePause() {
    if (!session || session.finished) return;
    paused = !paused;
    pauseOverlay.classList.toggle("hidden", !paused);
    if (!paused) lastFrameTime = performance.now();
  }

  function restartCurrentLevel() {
    if (currentLevelId != null) openGame(currentLevelId);
  }

  function goToNextLevel() {
    const nextLevel = SL.getNextLevel(currentLevelId);
    if (!nextLevel) { showScreen("screen-levels"); return; }
    if (SL.Economy.isLevelUnlocked(state, nextLevel.id)) {
      openGame(nextLevel.id);
    } else if (SL.Economy.canAffordUnlock(state, nextLevel.id)) {
      SL.Economy.unlockLevel(state, nextLevel.id);
      openGame(nextLevel.id);
    } else {
      showScreen("screen-levels");
    }
  }

  function handleKeydown(e) {
    const dir = KEY_MAP[e.key];
    const gameActive = document.getElementById("screen-game").classList.contains("active");

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
    session.requestDirection(dir);
  }

  function init() {
    state = SL.Storage.load();

    document.querySelectorAll("[data-nav]").forEach((btn) => {
      btn.addEventListener("click", () => showScreen(btn.dataset.nav));
    });
    document.getElementById("btn-play").addEventListener("click", () => showScreen("screen-levels"));
    document.getElementById("btn-shop").addEventListener("click", () => showScreen("screen-shop"));
    document.getElementById("btn-pause").addEventListener("click", togglePause);
    document.getElementById("btn-resume").addEventListener("click", togglePause);
    document.getElementById("btn-restart").addEventListener("click", restartCurrentLevel);
    document.getElementById("btn-retry").addEventListener("click", restartCurrentLevel);
    document.getElementById("btn-next-level").addEventListener("click", goToNextLevel);

    window.addEventListener("keydown", handleKeydown);

    refreshCoinDisplays();
  }

  return { init, showScreen };
})();
