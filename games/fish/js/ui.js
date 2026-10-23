// Screens (Menü, Angeln, Markt, Fischbuch), Game-Loop, Eingabe, Fang-Karte. Angeln: aufs Wasser
// tippen (oder ↑/↓) wählt die Tiefe, der große Knopf (oder Leertaste) schlägt an und zieht.
window.SL = window.SL || {};

SL.UI = (function () {
  let state; // Save-State (aus Storage)
  let session = null;
  const effects = new SL.Effects();
  let rafId = null;
  let lastFrameTime = 0;
  let viewW = 0;
  let viewH = 0;
  let pixelRatio = 1;
  let lastPrompt = null; // Hinweis + Knopf nur bei Wechsel neu setzen
  let lastState = null;
  let lastTick = 0; // Rolle klickt
  let lastCreak = 0; // Schnur knarzt
  let lastPhase = "calm"; // Zappeln -> Warnton einmal pro Aufbäumen
  let cardTimer = null;
  let marketReturn = "screen-menu";
  const R = SL.Renderer;

  const canvas = document.getElementById("game-canvas");
  const ctx = canvas.getContext("2d");
  const canvasWrap = document.querySelector(".canvas-wrap");
  const actionBtn = document.getElementById("btn-action");
  const hintEl = document.getElementById("fish-hint");
  const catchOverlay = document.getElementById("catch-overlay");

  const TALER_ICON = `<span class="taler-icon" aria-hidden="true"></span>`;

  // 0,35 kg -> "350 g", 2,4 kg, 120 kg
  function formatKg(kg) {
    if (kg < 1) return `${Math.max(1, Math.round(kg * 1000))} g`;
    if (kg < 10) return `${kg.toFixed(1).replace(".", ",")} kg`;
    return `${Math.round(kg)} kg`;
  }

  function rarityDots(rarity) {
    return `<span class="rarity" aria-label="${SL.RARITY[rarity]}">${[1, 2, 3, 4].map((i) => `<i class="${i <= rarity ? "on" : ""}"></i>`).join("")}</span>`;
  }

  // Tiefe eines Fischs als Text, z.B. "2–6 m"
  function depthText(fish) {
    const spot = SL.getSpot(fish.spot);
    return `${(fish.layers[0] - 1) * spot.layerM}–${fish.layers[1] * spot.layerM} m`;
  }

  // ---------- Screens ----------

  function showScreen(id) {
    document.querySelectorAll(".screen").forEach((el) => el.classList.remove("active"));
    document.getElementById(id).classList.add("active");
    if (id !== "screen-game") stopGameLoop();
    if (id === "screen-menu") refreshMenu();
    if (id === "screen-market") renderMarket();
    if (id === "screen-book") renderBook();
  }

  function openMarket(from) {
    marketReturn = from;
    showScreen("screen-market");
  }

  function refreshWallet() {
    document.querySelectorAll("[data-taler]").forEach((el) => { el.textContent = state.taler; });
    const slots = SL.Market.slots(state);
    const box = document.getElementById("hud-box");
    box.textContent = `${state.cooler.length}/${slots}`;
    box.parentElement.classList.toggle("full", state.cooler.length >= slots);
  }

  function refreshMenu() {
    refreshWallet();
    const known = Object.keys(state.book).length;
    document.getElementById("menu-stats").innerHTML = state.stats.caught
      ? `<b>${state.stats.caught}</b> Fische gefangen · Fischbuch <b>${known}/${SL.FISH.length}</b>`
      : "Noch nichts gefangen – ab ans Wasser!";
  }

  // ---------- Angeln ----------

  function sizeCanvas() {
    const availW = canvasWrap.clientWidth - 4;
    const availH = canvasWrap.clientHeight - 4;
    viewW = Math.floor(Math.max(200, Math.min(520, availW, availH * (R.W / R.H))));
    viewH = Math.round(viewW * (R.H / R.W));
    pixelRatio = window.devicePixelRatio || 1;
    canvas.style.width = viewW + "px";
    canvas.style.height = viewH + "px";
    canvas.width = Math.round(viewW * pixelRatio);
    canvas.height = Math.round(viewH * pixelRatio);
  }

  function openGame() {
    showScreen("screen-game");
    const spot = SL.getSpot(state.spot);
    document.getElementById("hud-spot").textContent = spot.name;
    session = new SL.FishingSession({ spot, gear: SL.gearStats(state.gear), layer: state.layers[spot.id] || 1 });
    R.reset(spot.id);
    effects.clear();
    lastPrompt = null;
    lastState = null;
    hideCard();
    sizeCanvas();
    bindSessionEvents();
    refreshWallet();
    stopGameLoop();
    lastFrameTime = performance.now();
    rafId = requestAnimationFrame(gameLoop);
  }

  const DROPS = ["#2b2420", "#85786a"];

  function splash(count = 8) {
    effects.burst(R.HOOK_X, R.SURFACE, { count, colors: DROPS, speed: [40, 130], life: [300, 600], size: [1.2, 2.6], gravity: 320, angle: -Math.PI / 2, spread: Math.PI * 0.9 });
  }

  function bindSessionEvents() {
    const say = (text) => effects.text(R.HOOK_X, R.hookY(session) - 34, text);
    session.onSettle = () => SL.Audio.play("settle");
    session.onNibble = () => SL.Audio.play("nibble");
    session.onBite = () => {
      SL.Audio.play("bite");
      SL.Haptics.vibrate(30);
    };
    session.onEarly = () => {
      SL.Audio.play("early");
      say("Zu früh!");
    };
    session.onMissed = () => say("Zu spät …");
    session.onHook = () => {
      SL.Audio.play("hook");
      SL.Haptics.vibrate(20);
      lastPhase = "calm";
      if (session.reel.load() > 1.05) say("Stark! Pass auf die Schnur auf");
    };
    session.onEscape = (f, reason) => {
      SL.Audio.play("fall");
      state.stats.escaped++;
      SL.Storage.save(state);
      if (reason === "snapped") {
        R.snap();
        effects.shake(5, 220);
        SL.Haptics.vibrate([50, 30, 50]);
      }
      say({ snapped: "Schnur gerissen!", loose: "Haken gelöst …", escaped: "Entwischt!" }[reason] || "Entwischt!");
    };
    session.onCatch = (result) => {
      SL.Audio.play("caught", result.fish.rarity);
      SL.Haptics.vibrate([20, 40, 20]);
      splash(14);
      const info = SL.Market.addCatch(state, result);
      refreshWallet();
      cardTimer = setTimeout(() => showCatchCard(result, info), 560);
    };
  }

  // Hinweis unter dem Wasser + Beschriftung des großen Knopfs, je nach Phase
  function refreshPrompt() {
    const s = session.state;
    const full = SL.Market.coolerFull(state);
    const coming = s === "wait" && !!session.biter;
    const key = `${s}-${full}-${coming}`;
    if (key === lastPrompt) return;
    lastPrompt = key;
    const PROMPTS = {
      lower: ["Haken sinkt …", "Warten …"],
      wait: coming
        ? ["Da kommt einer … erst beim Biss drücken!", "Warten …"]
        : ["Tippe aufs Wasser, um die Tiefe zu wählen", "Warten …"],
      bite: ["Jetzt drücken!", "Anschlagen!"],
      reel: ["Halten = ziehen. Zappelt er: loslassen!", "Ziehen"],
      landed: ["", "…"],
      escaped: ["", "…"],
    };
    const [hint, label] = full && s !== "reel" && s !== "landed"
      ? ["Kühlbox voll – ab zum Markt", "Zum Markt"]
      : PROMPTS[s] || ["", ""];
    hintEl.textContent = hint;
    hintEl.classList.toggle("urgent", s === "bite");
    actionBtn.querySelector(".action-label").textContent = label;
    actionBtn.dataset.state = full && s !== "reel" && s !== "landed" ? "full" : s;
  }

  // Töne beim Ziehen: Rolle klickt, Schnur knarzt in der roten Zone, Warnton vor dem Aufbäumen
  function reelSounds(now) {
    if (session.state !== "reel") return;
    const r = session.reel;
    if (session.holding && now - lastTick > 85) {
      lastTick = now;
      SL.Audio.play("reelTick");
    }
    if (r.tension > SL.FISHING.HIGH && now - lastCreak > 180) {
      lastCreak = now;
      SL.Audio.play("creak");
    }
    const phase = r.phase();
    if (phase === "tell" && lastPhase === "calm") {
      SL.Audio.play("tell");
      SL.Haptics.vibrate(15);
    }
    lastPhase = phase;
  }

  function gameLoop(now) {
    const dt = Math.min(60, now - lastFrameTime);
    lastFrameTime = now;
    if (session) {
      const paused = !catchOverlay.classList.contains("hidden") || SL.Settings.isOpen();
      const step = paused ? 0 : dt;
      session.update(step);
      effects.update(step);
      if (session.state !== lastState) {
        // Haken taucht wieder ins Wasser
        if (session.state === "lower" && session.hook < 0.05) {
          SL.Audio.play("plop");
          splash(5);
        }
        lastState = session.state;
      }
      if (!paused) reelSounds(now);
      refreshPrompt();
      R.render(ctx, {
        session, viewW, viewH, pixelRatio, dt: step, effects, shake: effects.getShakeOffset(),
        onGust: () => SL.Audio.play("wind"),
      });
    }
    rafId = requestAnimationFrame(gameLoop);
  }

  function stopGameLoop() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
  }

  // ---------- Fang-Karte ----------

  function showCatchCard(result, info) {
    const f = result.fish;
    const badges = [];
    if (info.isNew) badges.push("Neu im Fischbuch");
    if (info.isRecord) badges.push("Neuer Rekord");
    if (result.perfect) badges.push(`Sauber gedrillt +${Math.round(SL.FISHING.PERFECT_BONUS * 100)} %`);
    document.getElementById("catch-art").innerHTML = SL.FishArt.svg(f);
    document.getElementById("catch-title").textContent = f.name;
    document.getElementById("catch-sub").innerHTML = `${rarityDots(f.rarity)}<span>${SL.RARITY[f.rarity]} · ${depthText(f)}</span>`;
    document.getElementById("catch-badges").innerHTML = badges.map((b) => `<span class="catch-badge">${b}</span>`).join("");
    document.getElementById("catch-rows").innerHTML = `
      <div class="result-row"><span>Gewicht</span><span class="result-value">${formatKg(result.kg)}</span></div>
      <div class="result-row"><span>Wert</span><span class="result-value">${result.value}${TALER_ICON}</span></div>`;
    const full = SL.Market.coolerFull(state);
    document.getElementById("catch-note").textContent = full
      ? "Die Kühlbox ist jetzt voll – verkauf deinen Fang auf dem Markt."
      : `Kühlbox: ${state.cooler.length}/${SL.Market.slots(state)}`;
    document.getElementById("btn-catch-ok").textContent = full ? "Zum Markt" : "Ab in die Kühlbox";
    catchOverlay.classList.remove("hidden");
    document.getElementById("btn-catch-ok").focus({ preventScroll: true });
  }

  function hideCard() {
    clearTimeout(cardTimer);
    catchOverlay.classList.add("hidden");
  }

  function closeCard() {
    if (catchOverlay.classList.contains("hidden")) return;
    hideCard();
    session.collect();
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    if (SL.Market.coolerFull(state)) openMarket("screen-game");
  }

  // ---------- Markt ----------

  function gearPips(level, max) {
    return `<span class="gear-pips">${Array.from({ length: max }, (_, i) => `<i class="${i <= level ? "on" : ""}"></i>`).join("")}</span>`;
  }

  function renderMarket() {
    refreshWallet();
    const slots = SL.Market.slots(state);
    const total = SL.Market.coolerValue(state);

    const coolerRows = state.cooler.length
      ? state.cooler.map((c) => {
        const f = SL.getFish(c.id);
        return `<li class="cooler-row">
          <span class="cooler-art">${SL.FishArt.svg(f)}</span>
          <span class="cooler-name"><b>${f.name}</b><span>${formatKg(c.kg)}${c.perfect ? " · sauber gedrillt" : ""}</span></span>
          <span class="cooler-value">${c.value}${TALER_ICON}</span>
        </li>`;
      }).join("")
      : `<li class="cooler-empty">Leer. Fang erst mal was!</li>`;

    const gearRows = SL.GEAR.map((g) => {
      const level = state.gear[g.id];
      const current = g.levels[level];
      const next = SL.Market.nextGear(state, g.id);
      const action = next
        ? `<button type="button" class="btn ${state.taler >= next.price ? "btn-primary" : ""} buy-btn" data-buy-gear="${g.id}" ${state.taler >= next.price ? "" : "disabled"}>
            <span>${next.name}</span><b>${next.price}${TALER_ICON}</b></button>`
        : `<span class="gear-max">Beste Stufe</span>`;
      return `<li class="gear-row">
        <div class="gear-info">
          <span class="gear-kind">${g.name} ${gearPips(level, g.levels.length)}</span>
          <b>${current.name}</b>
          <span class="gear-effect">${g.effect}</span>
        </div>
        ${action}
      </li>`;
    }).join("");

    const depth = SL.gearStats(state.gear).depth;
    const spotRows = SL.SPOTS.map((s) => {
      const owned = state.spots.includes(s.id);
      const known = SL.FISH.filter((f) => f.spot === s.id && state.book[f.id]).length;
      const count = SL.FISH.filter((f) => f.spot === s.id).length;
      const reach = SL.reachableLayers(s, depth);
      let action;
      if (owned && state.spot === s.id) action = `<span class="spot-current">Hier angelst du</span>`;
      else if (owned) action = `<button type="button" class="btn" data-choose-spot="${s.id}">Hier angeln</button>`;
      else action = `<button type="button" class="btn ${state.taler >= s.price ? "btn-primary" : ""} buy-btn" data-buy-spot="${s.id}" ${state.taler >= s.price ? "" : "disabled"}>
          <span>Freischalten</span><b>${s.price}${TALER_ICON}</b></button>`;
      return `<li class="gear-row ${owned ? "" : "locked"}">
        <div class="gear-info">
          <span class="gear-kind">${owned ? `Fischbuch ${known}/${count}` : "Gesperrt"} · ${reach}/${s.layers} Ebenen</span>
          <b>${s.name}</b>
          <span class="gear-effect">${s.description}</span>
        </div>
        ${action}
      </li>`;
    }).join("");

    document.getElementById("market-body").innerHTML = `
      <section class="market-section">
        <header class="market-head"><h3>Kühlbox</h3><span>${state.cooler.length}/${slots}</span></header>
        <ul class="cooler-list">${coolerRows}</ul>
        <button type="button" id="btn-sell" class="btn btn-primary sell-btn" ${total ? "" : "disabled"}>Alles verkaufen <b>+${total}${TALER_ICON}</b></button>
      </section>
      <section class="market-section">
        <header class="market-head"><h3>Ausrüstung</h3></header>
        <ul class="gear-list">${gearRows}</ul>
      </section>
      <section class="market-section">
        <header class="market-head"><h3>Angelplätze</h3></header>
        <ul class="gear-list">${spotRows}</ul>
      </section>
      <button type="button" class="btn btn-primary market-go" data-go-fish>Angeln</button>`;
  }

  function onMarketClick(e) {
    const el = e.target.closest("button");
    if (!el || el.disabled) return;
    if (el.id === "btn-sell") {
      const total = SL.Market.sellAll(state);
      if (total) {
        SL.Audio.play("sell");
        showToast(`+${total} Taler`);
      }
      renderMarket();
    } else if (el.dataset.buyGear) {
      if (SL.Market.buyGear(state, el.dataset.buyGear)) {
        SL.Audio.play("unlock");
        showToast(`${SL.getGear(el.dataset.buyGear).levels[state.gear[el.dataset.buyGear]].name} gekauft!`);
      }
      renderMarket();
    } else if (el.dataset.buySpot) {
      if (SL.Market.buySpot(state, el.dataset.buySpot)) {
        SL.Audio.play("unlock");
        showToast(`${SL.getSpot(el.dataset.buySpot).name} freigeschaltet!`);
      }
      renderMarket();
    } else if (el.dataset.chooseSpot) {
      SL.Market.chooseSpot(state, el.dataset.chooseSpot);
      renderMarket();
    } else if (el.hasAttribute("data-go-fish")) {
      openGame();
    }
  }

  // ---------- Fischbuch ----------

  function renderBook() {
    const known = Object.keys(state.book).length;
    document.getElementById("book-count").textContent = `${known}/${SL.FISH.length}`;
    document.getElementById("book-body").innerHTML = SL.SPOTS.map((s) => {
      const cards = SL.FISH.filter((f) => f.spot === s.id).map((f) => {
        const entry = state.book[f.id];
        return `<li class="book-card ${entry ? "" : "unknown"}">
          <span class="book-art">${SL.FishArt.svg(f, !!entry)}</span>
          <b>${entry ? f.name : "???"}</b>
          <span class="book-sub">${rarityDots(f.rarity)}${SL.RARITY[f.rarity]}</span>
          <span class="book-stats">${depthText(f)} · ${entry ? `${entry.count}× · Rekord ${formatKg(entry.bestKg)}` : "noch nicht gefangen"}</span>
        </li>`;
      }).join("");
      const done = SL.FISH.filter((f) => f.spot === s.id && state.book[f.id]).length;
      return `<section class="market-section">
        <header class="market-head"><h3>${s.name}</h3><span>${done}/${SL.FISH.filter((f) => f.spot === s.id).length}${state.spots.includes(s.id) ? "" : " · gesperrt"}</span></header>
        <ul class="book-grid">${cards}</ul>
      </section>`;
    }).join("");
  }

  // ---------- Eingabe ----------

  function isGameActive() {
    return document.getElementById("screen-game").classList.contains("active");
  }

  function canAct() {
    return session && isGameActive() && !SL.Settings.isOpen() && catchOverlay.classList.contains("hidden");
  }

  function pressAction() {
    if (!canAct()) return;
    if (SL.Market.coolerFull(state) && session.state !== "reel" && session.state !== "landed") {
      openMarket("screen-game");
      return;
    }
    actionBtn.classList.add("pressed");
    session.press();
  }

  function releaseAction() {
    actionBtn.classList.remove("pressed");
    if (session) session.release();
  }

  // Tiefe wählen; zu tief für die Rolle -> Hinweis
  function chooseLayer(layer) {
    if (!canAct()) return;
    if (session.setLayer(layer)) {
      state.layers[session.spot.id] = session.targetLayer;
      SL.Storage.save(state);
    } else {
      SL.Audio.play("bump");
      effects.text(R.W / 2, R.SURFACE + 20, "Zu tief – Rolle im Markt aufrüsten");
    }
  }

  function bindInput() {
    let activePointer = null;
    const down = (e) => {
      if (e.button > 0) return;
      e.preventDefault();
      activePointer = e.pointerId;
      pressAction();
    };
    actionBtn.addEventListener("pointerdown", down);
    // Aufs Wasser tippen: Tiefe wählen - beim Biss und beim Ziehen zählt es wie der Knopf
    canvas.addEventListener("pointerdown", (e) => {
      if (e.button > 0) return;
      if (session && (session.state === "bite" || session.state === "reel")) {
        down(e);
        return;
      }
      const rect = canvas.getBoundingClientRect();
      const y = ((e.clientY - rect.top) / rect.height) * R.H;
      const layer = R.layerAt(session, y);
      if (layer) chooseLayer(layer);
    });
    const up = (e) => {
      if (e.pointerId !== activePointer) return;
      activePointer = null;
      releaseAction();
    };
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    for (const el of [actionBtn, canvas]) el.addEventListener("contextmenu", (e) => e.preventDefault());

    // Tastatur: Leertaste/Enter = Knopf, ↑/↓ (W/S) = Tiefe
    const PRESS_KEYS = [" ", "Enter"];
    const LAYER_KEYS = { ArrowUp: -1, w: -1, W: -1, ArrowDown: 1, s: 1, S: 1 };
    window.addEventListener("keydown", (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (SL.Settings.isOpen()) {
        if (e.key === "Escape") { e.preventDefault(); SL.Settings.close(); }
        return;
      }
      if (!isGameActive() || (!PRESS_KEYS.includes(e.key) && !LAYER_KEYS[e.key])) return;
      e.preventDefault();
      if (e.repeat) return;
      if (!catchOverlay.classList.contains("hidden")) {
        if (PRESS_KEYS.includes(e.key)) closeCard();
        return;
      }
      if (LAYER_KEYS[e.key]) chooseLayer(session.targetLayer + LAYER_KEYS[e.key]);
      else pressAction();
    });
    window.addEventListener("keyup", (e) => {
      if (PRESS_KEYS.includes(e.key) && isGameActive()) releaseAction();
    });
    // Tab im Hintergrund: Knopf gilt als losgelassen
    document.addEventListener("visibilitychange", () => { if (document.hidden) releaseAction(); });
  }

  let toastTimer = null;
  function showToast(message) {
    const toast = document.getElementById("toast");
    toast.textContent = message;
    toast.classList.remove("hidden", "show");
    void toast.offsetWidth;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.add("hidden"), 1800);
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
    const onResize = () => {
      syncViewportHeight();
      if (isGameActive()) sizeCanvas();
    };
    if (window.visualViewport) window.visualViewport.addEventListener("resize", onResize);
    window.addEventListener("resize", onResize);

    document.querySelectorAll("[data-nav]").forEach((btn) => {
      btn.addEventListener("click", () => showScreen(btn.dataset.nav));
    });
    document.getElementById("btn-play").addEventListener("click", openGame);
    document.getElementById("btn-market").addEventListener("click", () => openMarket("screen-menu"));
    document.getElementById("btn-book").addEventListener("click", () => showScreen("screen-book"));
    document.getElementById("btn-settings").addEventListener("click", () => SL.Settings.open());
    document.getElementById("btn-hud-box").addEventListener("click", () => openMarket("screen-game"));
    document.getElementById("btn-hud-spot").addEventListener("click", () => openMarket("screen-game"));
    document.getElementById("btn-market-back").addEventListener("click", () => {
      if (marketReturn === "screen-game") openGame();
      else showScreen("screen-menu");
    });
    document.getElementById("btn-catch-ok").addEventListener("click", closeCard);
    document.getElementById("market-body").addEventListener("click", onMarketClick);
    bindInput();

    document.addEventListener("pointerdown", (e) => {
      SL.Audio.ensure();
      if (e.target.closest(".btn, .toggle")) SL.Audio.play("click");
    }, true);
    window.addEventListener("keydown", () => SL.Audio.ensure(), true);

    SL.Settings.init(state, (settings) => { effects.enabled = settings.effects; });
    refreshMenu();
  }

  return { init, showScreen };
})();
