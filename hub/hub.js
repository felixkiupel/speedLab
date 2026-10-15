// Startseite: Spiele-Kacheln aus SL.GAMES, dazu Coins und die spielübergreifende Daily-Serie aus
// dem Profil. Die Spiele selbst sind eigene Seiten unter games/<id>/.
(function () {
  const WEEKDAY_LETTERS = ["S", "M", "D", "M", "D", "F", "S"]; // Index = Date.getDay(), 0 = Sonntag
  const WEEKDAY_NAMES = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];

  const CHECK_ICON = `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

  // Nur neu setzen, wenn sich der Inhalt geändert hat - sonst laden beim Zurückkehren in den Tab
  // alle Vorschaubilder neu und die Kacheln flackern kurz
  function setHtml(el, html) {
    if (el._html === html) return;
    el.innerHTML = html;
    el._html = html;
  }

  function renderCoins() {
    document.getElementById("hub-coins").textContent = SL.Profile.coins();
  }

  // ---------- Serie ----------

  function renderStreak() {
    const today = SL.Days.key();
    const streak = SL.Profile.streak(today);
    const best = SL.Profile.bestStreak();
    const doneToday = SL.Profile.dailiesOn(today);

    document.getElementById("streak-card").classList.toggle("empty", !streak);

    const countEl = document.getElementById("streak-count");
    countEl.textContent = streak || "";
    countEl.classList.toggle("two", streak >= 10 && streak < 100);
    countEl.classList.toggle("small", streak >= 100);
    document.getElementById("streak-label").textContent = streak ? `${plural(streak, "Tag", "Tage")} Serie` : "Starte eine Serie";
    document.getElementById("streak-best").textContent = best
      ? `Rekord: ${plural(best, "Tag", "Tage")}`
      : "Ein Daily pro Tag – egal in welchem Spiel";

    // Die letzten 7 Tage, heute ganz rechts (Buchstabe als kleine helle Marke hervorgehoben)
    const week = [];
    for (let i = 6; i >= 0; i--) {
      const key = SL.Days.shift(today, -i);
      const { y, m, d } = SL.Days.parse(key);
      const weekday = new Date(y, m - 1, d).getDay();
      const done = SL.Profile.dailiesOn(key).length > 0;
      const classes = ["streak-day", done ? "done" : "", i === 0 ? "today" : ""].filter(Boolean).join(" ");
      const label = `${i === 0 ? "Heute, " : ""}${WEEKDAY_NAMES[weekday]}: ${done ? "geschafft" : "kein Daily"}`;
      week.push(`<span class="${classes}" title="${label}" aria-label="${label}">
        <span class="streak-day-name" aria-hidden="true">${WEEKDAY_LETTERS[weekday]}</span>
        <i aria-hidden="true">${done ? CHECK_ICON : ""}</i>
      </span>`);
    }
    setHtml(document.getElementById("streak-week"), week.join(""));

    // Heute: schon erledigt (welche Spiele) oder wie lange noch Zeit ist
    const names = doneToday.map((id) => SL.GAMES.find((g) => g.id === id)?.name || id);
    const left = SL.Days.timeUntilNext(new Date(), true);
    setHtml(document.getElementById("streak-foot"), doneToday.length
      ? `<span class="streak-foot-icon">${CHECK_ICON}</span><span>Heute geschafft in <b>${names.join(", ")}</b> · neue Dailys in ${left}</span>`
      : streak
        ? `<span>Noch <b>${left}</b>, um deine Serie zu halten – ein Daily in irgendeinem Spiel reicht</span>`
        : `<span>Schaff heute ein Daily in irgendeinem Spiel, dann startet deine Serie · noch <b>${left}</b></span>`);
  }

  // ---------- Spiele ----------

  // Die ganze Kachel ist der Link - beim Hovern hebt sie sich und das Bild zoomt leicht
  function gameCardHtml(game) {
    const doneToday = SL.Profile.dailiesOn().includes(game.id);
    const daily = game.daily
      ? `<span class="game-daily ${doneToday ? "done" : ""}">${doneToday ? `${CHECK_ICON}Daily geschafft` : "Daily offen"}</span>`
      : "";
    return `<a class="game-card" href="${game.path}">
      <span class="game-preview">
        <img src="${game.preview}" alt="" width="400" height="250">
        ${daily}
      </span>
      <span class="game-body">
        <span class="game-name">${game.name}</span>
        <span class="game-tagline">${game.tagline}</span>
        <span class="game-tags">${(game.tags || []).map((t) => `<span>${t}</span>`).join("")}</span>
      </span>
    </a>`;
  }

  // Platzhalter, damit die Startseite schon nach "Plattform" aussieht, solange es nur ein Spiel gibt
  const SOON_CARD = `<div class="game-card soon">
    <span class="game-preview">
      <span class="mascot face soon-mascot" aria-hidden="true"><span class="eye left"></span><span class="eye right"></span></span>
    </span>
    <span class="game-body">
      <span class="game-name">Bald mehr</span>
      <span class="game-tagline">Das nächste Spiel ist schon in Arbeit.</span>
    </span>
  </div>`;

  function renderGames() {
    setHtml(document.getElementById("game-grid"), SL.GAMES.map(gameCardHtml).join("") + SOON_CARD);
    document.getElementById("games-count").textContent = plural(SL.GAMES.length, "Spiel", "Spiele");
  }

  function render() {
    renderCoins();
    renderStreak();
    renderGames();
  }

  // ---------- Figur ----------

  // Die Pupillen folgen dem Mauszeiger (nur mit Maus/Stift). Ohne Bewegung schaut sie sich nach
  // ein paar Sekunden wieder von selbst um (look-around aus base.css).
  function bindMascot() {
    const mascot = document.getElementById("hub-mascot");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let idleTimer = null;

    if (!reducedMotion) {
      window.addEventListener("pointermove", (e) => {
        if (e.pointerType === "touch") return;
        const r = mascot.getBoundingClientRect();
        const dx = e.clientX - (r.left + r.width / 2);
        const dy = e.clientY - (r.top + r.height / 2);
        const dist = Math.hypot(dx, dy) || 1;
        const reach = Math.min(1, dist / 260) * r.width * 0.055; // nah dran = schaut weniger weit zur Seite
        mascot.style.setProperty("--look-x", `${((dx / dist) * reach).toFixed(2)}px`);
        mascot.style.setProperty("--look-y", `${((dy / dist) * reach).toFixed(2)}px`);
        mascot.classList.add("tracking");
        clearTimeout(idleTimer);
        idleTimer = setTimeout(() => mascot.classList.remove("tracking"), 4000);
      }, { passive: true });
    }

    // Hüpfer: Klasse an der Bühne, damit Figur und Bodenschatten zusammen animieren
    const stage = document.getElementById("hub-mascot-stage");
    mascot.addEventListener("click", () => {
      stage.classList.remove("hop");
      void stage.offsetWidth;
      stage.classList.add("hop");
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    render();
    bindMascot();
    // Andere Tabs (oder ein Spiel im selben Browser) ändern Coins/Serie
    SL.Profile.onChange(render);
    // Zurück-Button aus einem Spiel: Seite kommt evtl. aus dem Cache -> neu einlesen
    window.addEventListener("pageshow", (e) => { if (e.persisted) render(); });
    // Um Mitternacht wechselt der Tag - beim Zurückkehren in den Tab aktualisieren
    document.addEventListener("visibilitychange", () => { if (!document.hidden) render(); });
  });
})();
