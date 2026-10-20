// Shop-Seite: Skins und Spuren für die Figur - spielübergreifend, bezahlt mit den gemeinsamen Coins.
// Jedes Item schaltet eine Aufgabe frei (quests.js). Vorher ist es nur ein ausgegrautes Fragezeichen,
// darunter die Aufgabe - bei geheimen Seltenheiten (Legendär, Mythisch) nur "???". Alles steht
// untereinander auf einer Seite: oben der aktuelle Look, darunter je Kategorie (SL.COSMETIC_TYPES)
// eine Abteilung mit allen Items. Katalog und Besitz: shared/js/cosmetics.js, Vorschauen:
// shared/js/cosmetics-draw.js. Aufgerufen wird der Shop aus den Spiel-Menüs mit ?from=<spiel>.
(function () {
  const COIN_ICON = `<span class="coin-icon" aria-hidden="true"></span>`;
  const LOCK_ICON = `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><rect x="5" y="10.5" width="14" height="10.5" rx="2.5"/></svg>`;
  const CHECK_ICON = `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const INLINE_COIN = `<span class="inline-icon">${COIN_ICON}</span>`;

  const animated = (cos) => SL.CosmeticsDraw.isAnimated(cos);
  let animId = null;

  // "Zurück" führt in das Spiel, aus dem man kam (?from=maze), sonst zur Startseite
  function setupBackLink() {
    const from = new URLSearchParams(location.search).get("from");
    const game = SL.GAMES.find((g) => g.id === from);
    if (!game) return;
    const link = document.getElementById("shop-back");
    link.href = "../" + game.path;
    link.lastChild.textContent = game.name;
  }

  // Noch nicht freigeschaltet: Fragezeichen statt Vorschau, Name verborgen, darunter die Aufgabe
  function lockedTileHtml(cos) {
    const quest = SL.Quests.get(cos.quest);
    const hint = SL.Cosmetics.isSecret(cos) || !quest ? "???" : quest.text;
    return `<div class="shop-tile locked">
      <span class="rarity rarity-${cos.rarity}">${SL.RARITIES[cos.rarity].name}</span>
      <div class="shop-mystery shop-mystery-${cos.type}" aria-hidden="true"><span>?</span></div>
      <div class="shop-name">???</div>
      <span class="shop-quest">${hint}</span>
      <button type="button" class="btn btn-small" disabled aria-label="Gesperrt">${LOCK_ICON}${cos.price}${COIN_ICON}</button>
    </div>`;
  }

  // Freigeschaltet: Vorschau + Status (Im Besitz / fehlende Coins / kaufbar) + Kaufen/Ausrüsten
  function tileHtml(cos, coins) {
    if (!SL.Cosmetics.isUnlocked(cos)) return lockedTileHtml(cos);
    const owned = SL.Cosmetics.owns(cos.id);
    const equipped = SL.Cosmetics.equipped(cos.type).id === cos.id;
    const rarity = cos.rarity
      ? `<span class="rarity rarity-${cos.rarity}">${SL.RARITIES[cos.rarity].name}</span>`
      : `<span class="rarity rarity-default">Standard</span>`;
    let label = "Ausrüsten";
    let btnClass = "btn btn-small";
    let disabled = false;
    let status = `<span class="shop-status">Im Besitz</span>`;
    if (equipped) {
      label = `${CHECK_ICON}Ausgerüstet`;
      btnClass += " btn-primary is-equipped";
      disabled = true;
    } else if (!owned) {
      label = `${cos.price}${COIN_ICON}`;
      disabled = coins < cos.price;
      status = coins < cos.price
        ? `<span class="shop-status">Noch ${cos.price - coins}${INLINE_COIN} sammeln</span>`
        : `<span class="shop-status is-ready">Freigeschaltet – jetzt kaufbar</span>`;
    }
    return `<div class="shop-tile ${equipped ? "equipped" : ""}">
      ${rarity}
      <canvas class="shop-preview" data-preview="${cos.id}" aria-hidden="true"></canvas>
      <div class="shop-name">${cos.name}</div>
      ${status}
      <button type="button" class="${btnClass}" data-cosmetic="${cos.id}" ${disabled ? "disabled" : ""}>${label}</button>
    </div>`;
  }

  // Eine Abteilung pro Kategorie, Kopf im Stil der Kapitel in der Level-Auswahl
  function sectionHtml(type, coins) {
    const owned = type.items.filter((c) => SL.Cosmetics.owns(c.id)).length;
    const pct = Math.round((owned / type.items.length) * 100);
    return `<section class="shop-section" aria-labelledby="shop-${type.id}">
      <header class="chapter-head">
        <div class="chapter-title">
          <h3 id="shop-${type.id}">${type.name}</h3>
          <p>${type.hint}</p>
        </div>
        <div class="chapter-progress">
          <div class="chapter-stars"><b>${owned}</b><span>/ ${type.items.length} gesammelt</span></div>
          <div class="progress"><span style="width:${pct}%"></span></div>
        </div>
      </header>
      <div class="shop-grid shop-grid-${type.id}">${type.items.map((cos) => tileHtml(cos, coins)).join("")}</div>
    </section>`;
  }

  function render() {
    const skin = SL.Cosmetics.equipped("skin");
    const trail = SL.Cosmetics.equipped("trail");
    const ownedTotal = SL.COSMETICS.filter((c) => SL.Cosmetics.owns(c.id)).length;
    const questsDone = SL.QUESTS.filter((q) => SL.Quests.isDone(q.id)).length;
    const coins = SL.Profile.coins();
    // Neu aufbauen ohne an den Anfang zu springen (z.B. nach einem Kauf weiter unten)
    const scroller = document.querySelector(".shop-screen");
    const scrollTop = scroller.scrollTop;

    document.getElementById("shop-coins").textContent = coins;
    document.getElementById("shop").innerHTML = `
      <div class="shop-hero">
        <canvas class="shop-hero-canvas" data-preview="hero" aria-hidden="true"></canvas>
        <div class="shop-hero-info">
          <span class="kicker">Dein Look</span>
          <div class="shop-hero-name">${skin.name}</div>
          <div class="shop-hero-trail">Spur: ${trail.name}</div>
          <div class="shop-hero-count">
            <div class="progress"><span style="width:${Math.round((ownedTotal / SL.COSMETICS.length) * 100)}%"></span></div>
            <span>${ownedTotal} / ${SL.COSMETICS.length} gesammelt</span>
          </div>
          <div class="shop-hero-quests">
            <span class="shop-hero-quests-total">${CHECK_ICON}<b>${questsDone}</b><span>/ ${SL.QUESTS.length}</span></span>
            <span>Aufgaben geschafft – jede schaltet ein Item frei</span>
          </div>
        </div>
      </div>
      ${SL.COSMETIC_TYPES.map((type) => sectionHtml(type, coins)).join("")}`;
    scroller.scrollTop = scrollTop;

    drawPreviews(performance.now(), false);
    // Bewegte Items (Flamme, Polarlicht, Komet ...) brauchen eine Schleife - nur wenn eins zu sehen ist
    stopAnimation();
    const visible = [skin, trail, ...SL.COSMETICS.filter((c) => SL.Cosmetics.isUnlocked(c))];
    if (visible.some(animated)) {
      const tick = (now) => {
        drawPreviews(now, true);
        animId = requestAnimationFrame(tick);
      };
      animId = requestAnimationFrame(tick);
    }
  }

  // Skins: Figur groß. Spuren: Mini-Korridor mit dem ausgerüsteten Skin. Hero: aktueller Look.
  // onlyAnimated: im Animations-Takt nur die Canvases neu zeichnen, die sich bewegen.
  function drawPreviews(time, onlyAnimated) {
    const skin = SL.Cosmetics.equipped("skin");
    const trail = SL.Cosmetics.equipped("trail");
    document.querySelectorAll("#shop canvas[data-preview]").forEach((canvas) => {
      const id = canvas.dataset.preview;
      if (id === "hero") {
        if (!onlyAnimated || animated(skin) || animated(trail)) SL.CosmeticsDraw.drawScenePreview(canvas, skin, trail, time);
        return;
      }
      const cos = SL.getCosmetic(id);
      if (onlyAnimated && !animated(cos) && !(cos.type === "trail" && animated(skin))) return;
      if (cos.type === "skin") SL.CosmeticsDraw.drawSkinPreview(canvas, cos, time);
      else SL.CosmeticsDraw.drawScenePreview(canvas, skin, cos, time);
    });
  }

  function stopAnimation() {
    if (animId) cancelAnimationFrame(animId);
    animId = null;
  }

  function onClick(e) {
    const btn = e.target.closest("button[data-cosmetic]");
    if (!btn) return;
    const id = btn.dataset.cosmetic;
    if (SL.Cosmetics.owns(id) ? SL.Cosmetics.equip(id) : SL.Cosmetics.buy(id)) render();
  }

  document.addEventListener("DOMContentLoaded", () => {
    setupBackLink();
    SL.Quests.sync();
    render();
    document.getElementById("shop").addEventListener("click", onClick);
    const scroller = document.querySelector(".shop-screen");
    scroller.addEventListener("scroll", () => {
      document.querySelector(".shop-topbar").classList.toggle("scrolled", scroller.scrollTop > 0);
    }, { passive: true });
    window.addEventListener("resize", () => drawPreviews(performance.now(), false));
    // Coins/Aufgaben/Skins können sich in einem anderen Tab ändern (Spiel, Startseite)
    SL.Profile.onChange(render);
    // Zurück-Button aus einem Spiel: Seite kommt evtl. aus dem Cache -> neu einlesen
    window.addEventListener("pageshow", (e) => { if (e.persisted) render(); });
    // Animation nur, solange die Seite sichtbar ist
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) stopAnimation();
      else render();
    });
  });
})();
