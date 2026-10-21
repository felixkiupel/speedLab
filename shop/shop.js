// Shop-Seite: Skins und Spuren für die Figur - spielübergreifend und alles frei. Alles steht
// untereinander auf einer Seite: oben der Weg zu den Slots (dort gibt es Kristalle, die zweite
// Währung), dann der aktuelle Look, darunter je Kategorie (SL.COSMETIC_TYPES) eine Abteilung mit
// allen Items. Katalog: shared/js/cosmetics.js, Vorschauen: shared/js/cosmetics-draw.js.
// Aufgerufen wird der Shop aus den Spiel-Menüs mit ?from=<spiel>.
(function () {
  const CRYSTAL_ICON = `<span class="crystal-icon" aria-hidden="true"></span>`;
  const ARROW_ICON = `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 5.5L16 12l-6.5 6.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const CHECK_ICON = `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

  // Aus welchem Spiel man kommt (?from=maze) - dorthin führt "Zurück"
  const fromGame = SL.GAMES.find((g) => g.id === new URLSearchParams(location.search).get("from")) || null;

  function setupBackLink() {
    if (!fromGame) return;
    const link = document.getElementById("shop-back");
    link.href = "../" + fromGame.path;
    link.lastChild.textContent = fromGame.name;
  }

  // Spur in der Vorschau oben: die ausgerüstete, sonst die eigene des Spiels, aus dem man kommt
  const shownTrail = () => SL.Cosmetics.trailFor(fromGame ? fromGame.id : "maze");

  function tileHtml(cos) {
    const equipped = SL.Cosmetics.equipped(cos.type);
    const isOn = Boolean(equipped) && equipped.id === cos.id;
    // Ohne ausgerüstete Spur nutzt jedes Spiel seine eigene - das steht dann an jeder Spur
    const status = isOn ? "In allen Spielen" : cos.type === "trail" && !equipped ? `Gerade in ${cos.name}` : "";
    const button = isOn
      ? `<button type="button" class="btn btn-small btn-primary is-equipped" disabled>${CHECK_ICON}Ausgerüstet</button>`
      : `<button type="button" class="btn btn-small" data-equip="${cos.id}">Ausrüsten</button>`;
    return `<div class="shop-tile ${isOn ? "equipped" : ""}">
      <canvas class="shop-preview" data-preview="${cos.id}" aria-hidden="true"></canvas>
      <div class="shop-name">${cos.name}</div>
      <span class="shop-status">${status}</span>
      ${button}
    </div>`;
  }

  // Eine Abteilung pro Kategorie, Kopf im Stil der Kapitel in der Level-Auswahl. Bei den Spuren
  // rechts der Weg zurück zu "jedes Spiel seine eigene".
  function sectionHtml(type) {
    let side = "";
    if (type.id === "trail") {
      side = SL.Cosmetics.equipped("trail")
        ? `<button type="button" class="btn btn-small btn-ghost" data-unequip="trail">Jedes Spiel seine eigene</button>`
        : `<span class="shop-section-note">Gerade hat jedes Spiel seine eigene</span>`;
    }
    return `<section class="shop-section" aria-labelledby="shop-${type.id}">
      <header class="chapter-head">
        <div class="chapter-title">
          <h3 id="shop-${type.id}">${type.name}</h3>
          <p>${type.hint}</p>
        </div>
        ${side}
      </header>
      <div class="shop-grid shop-grid-${type.id}">${type.items.map(tileHtml).join("")}</div>
    </section>`;
  }

  function render() {
    const skin = SL.Cosmetics.equipped("skin");
    const trail = SL.Cosmetics.equipped("trail");
    // Neu aufbauen ohne an den Anfang zu springen (z.B. nach dem Ausrüsten weiter unten)
    const scroller = document.querySelector(".shop-screen");
    const scrollTop = scroller.scrollTop;

    const crystals = SL.Profile.crystals();
    document.getElementById("shop-coins").textContent = SL.Profile.coins();
    document.getElementById("shop-crystals").textContent = crystals;
    // Slots bekommen ?from= mit, damit "Zurück" über den Shop ins richtige Spiel führt
    const slotsHref = "../slots/" + (fromGame ? `?from=${fromGame.id}` : "");
    document.getElementById("shop").innerHTML = `
      <a class="shop-slots-card" href="${slotsHref}">
        <span class="shop-slots-icon">${CRYSTAL_ICON}</span>
        <span class="shop-slots-text">
          <b>${crystals} ${crystals === 1 ? "Kristall" : "Kristalle"}</b>
          <span>Am Automaten tauschst du Coins gegen Kristalle – damit gibt's bald Skins.</span>
        </span>
        <span class="shop-slots-go">Slots${ARROW_ICON}</span>
      </a>
      <div class="shop-hero">
        <canvas class="shop-hero-canvas" data-preview="hero" aria-hidden="true"></canvas>
        <div class="shop-hero-info">
          <span class="kicker">Dein Look</span>
          <div class="shop-hero-name">${skin.name}</div>
          <div class="shop-hero-trail">Spur: ${trail ? `${trail.name} – in allen Spielen` : "jedes Spiel seine eigene"}</div>
        </div>
      </div>
      ${SL.COSMETIC_TYPES.map(sectionHtml).join("")}`;
    scroller.scrollTop = scrollTop;
    drawPreviews();
  }

  // Skins: Figur groß. Spuren: Mini-Korridor mit der Figur. Hero: aktueller Look.
  function drawPreviews() {
    document.querySelectorAll("#shop canvas[data-preview]").forEach((canvas) => {
      const id = canvas.dataset.preview;
      const cos = id === "hero" ? null : SL.Cosmetics.get(id);
      if (cos && cos.type === "skin") SL.CosmeticsDraw.drawSkinPreview(canvas);
      else SL.CosmeticsDraw.drawScenePreview(canvas, cos || shownTrail());
    });
  }

  function onClick(e) {
    const equip = e.target.closest("button[data-equip]");
    const unequip = e.target.closest("button[data-unequip]");
    if (equip) SL.Cosmetics.equip(equip.dataset.equip);
    else if (unequip) SL.Cosmetics.unequip(unequip.dataset.unequip);
    // neu gezeichnet wird über SL.Profile.onChange
  }

  document.addEventListener("DOMContentLoaded", () => {
    setupBackLink();
    render();
    document.getElementById("shop").addEventListener("click", onClick);
    const scroller = document.querySelector(".shop-screen");
    scroller.addEventListener("scroll", () => {
      document.querySelector(".shop-topbar").classList.toggle("scrolled", scroller.scrollTop > 0);
    }, { passive: true });
    window.addEventListener("resize", drawPreviews);
    // Coins und Look können sich auch in einem anderen Tab ändern (Spiel, Startseite)
    SL.Profile.onChange(render);
    // Zurück-Button aus einem Spiel: Seite kommt evtl. aus dem Cache -> neu einlesen
    window.addEventListener("pageshow", (e) => { if (e.persisted) render(); });
  });
})();
