// Spielübergreifendes Profil: Coins, Kristalle, die tägliche Serie und der Look aus dem Shop gehören
// keinem einzelnen Spiel. Coins aus einem Spiel kann man in jedem anderen ausgeben, und die Serie
// hält, solange man jeden Tag das Daily von irgendeinem Spiel schafft. Kristalle sind die zweite
// Währung - es gibt sie nur am Automaten (slots/), bezahlt mit Coins. Alles andere (Level,
// Bestwerte, Einstellungen) speichert jedes Spiel selbst unter einem eigenen Schlüssel.
//
// Alle Spielstände liegen unter "speedlab_*": Auf github.io teilen sich alle Projekte eines
// Accounts denselben localStorage, das Präfix hält sie auseinander.
//
// Jeder Zugriff liest frisch aus localStorage und schreibt sofort zurück - so überschreiben sich
// Startseite und Spiele (auch in zwei offenen Tabs) nicht gegenseitig die Coins.
window.SL = window.SL || {};

SL.Profile = (function () {
  const KEY = "speedlab_profile_v1";
  const KEEP_DAYS = 14; // so lange merkt sich das Profil, welche Dailys an welchem Tag geschafft wurden

  let memory = null; // Fallback, falls localStorage blockiert ist - hält dann nur bis zum Neuladen
  const listeners = [];

  function defaults() {
    // dailyLog: { [YYYY-MM-DD]: ["maze", ...] } - welche Spiele an dem Tag ihr Daily geschafft haben
    // cosmetics.equipped: was im Shop ausgerüstet ist ({ skin, trail }), siehe cosmetics.js
    return {
      coins: 0, crystals: 0, streak: 0, bestStreak: 0, lastDaily: null, dailyLog: {},
      cosmetics: { equipped: {} },
    };
  }

  function read() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return Object.assign(defaults(), JSON.parse(raw));
    } catch (e) {
      console.warn("Profil konnte nicht geladen werden.", e);
    }
    return memory ? JSON.parse(memory) : defaults();
  }

  function write(p) {
    memory = JSON.stringify(p);
    try {
      localStorage.setItem(KEY, memory);
    } catch (e) {
      console.warn("Profil konnte nicht gespeichert werden.", e);
    }
    listeners.forEach((fn) => fn());
  }

  function update(fn) {
    const p = read();
    const result = fn(p);
    write(p);
    return result;
  }

  // ---------- Coins ----------

  function coins() {
    return read().coins;
  }

  function addCoins(amount) {
    if (amount > 0) update((p) => { p.coins += amount; });
  }

  // Zieht die Coins nur ab, wenn genug da sind
  function spend(amount) {
    if (read().coins < amount) return false;
    update((p) => { p.coins -= amount; });
    return true;
  }

  // ---------- Kristalle ----------

  function crystals() {
    return read().crystals;
  }

  // Ein Dreh am Automaten in einem Schritt: Einsatz in Coins abziehen, Gewinn in Kristallen
  // gutschreiben. Gebucht wird beim Drehen, nicht erst wenn die Walzen stehen - wer mittendrin die
  // Seite schließt, verliert nichts. false = zu wenig Coins
  function playSlots(stake, win) {
    if (read().coins < stake) return false;
    update((p) => {
      p.coins -= stake;
      p.crystals += win;
    });
    return true;
  }

  // ---------- Shop ----------
  // Nur was ausgerüstet ist - welche Items es gibt, steht in cosmetics.js

  function equippedCosmetic(type) {
    return read().cosmetics.equipped[type] || null;
  }

  // id = null legt das Item der Kategorie wieder ab (dann gilt der Standard)
  function equipCosmetic(type, id) {
    update((p) => {
      if (id) p.cosmetics.equipped[type] = id;
      else delete p.cosmetics.equipped[type];
    });
  }

  // ---------- Belohnung (für alle Spiele gleich) ----------

  // Coins für einen Level-Lauf, gemessen am Preis des nächsten Levels im selben Spiel: 3 Sterne
  // reichen direkt zum Freischalten (plus ein paar Coins), mit 2 Sternen braucht man zwei Läufe, mit
  // 1 Stern drei. Jeder Lauf zahlt gleich, auch Wiederholungen. Eingesammelte Coins kommen extra
  // dazu, jeder zählt genau 1.
  const STAR_SHARE = { 2: 0.55, 1: 0.35 };
  const THREE_STAR_EXTRA = 2;
  function levelPay(nextLevelCost, stars) {
    if (stars >= 3) return nextLevelCost + THREE_STAR_EXTRA;
    return Math.ceil(nextLevelCost * (STAR_SHARE[stars] || 0));
  }

  // Tagesbonus fürs erste geschaffte Daily eines Spiels am Tag: 10 pro Stern + 1 pro Serien-Tag
  // (höchstens 10). Ein kleines Extra - Level freischalten soll man sich in den Leveln verdienen.
  function dailyBonus(stars, streak) {
    return stars * 10 + Math.min(streak, 10);
  }

  // ---------- Daily-Serie ----------

  // Serie zählt, solange heute oder gestern ein Daily geschafft wurde
  function streak(today = SL.Days.key()) {
    const p = read();
    return p.lastDaily === today || p.lastDaily === SL.Days.shift(today, -1) ? p.streak : 0;
  }

  function bestStreak() {
    return read().bestStreak;
  }

  // Welche Spiele an einem Tag ihr Daily geschafft haben
  function dailiesOn(key = SL.Days.key()) {
    return read().dailyLog[key] || [];
  }

  // Ein Spiel meldet sein geschafftes Daily (mehrfach am selben Tag ist harmlos). Das erste Daily
  // des Tages - egal in welchem Spiel - lässt die Serie wachsen. firstForGame: heute zum ersten
  // Mal in diesem Spiel -> dafür gibt das Spiel seinen Tagesbonus.
  function completeDaily(gameId, key = SL.Days.key()) {
    return update((p) => {
      const done = p.dailyLog[key] || [];
      const firstOfDay = done.length === 0;
      const firstForGame = !done.includes(gameId);
      if (firstForGame) p.dailyLog[key] = [...done, gameId];
      if (firstOfDay && p.lastDaily !== key) {
        p.streak = p.lastDaily === SL.Days.shift(key, -1) ? p.streak + 1 : 1;
        p.bestStreak = Math.max(p.bestStreak, p.streak);
        p.lastDaily = key;
      }
      for (const k of Object.keys(p.dailyLog)) {
        if (SL.Days.between(k, key) > KEEP_DAYS) delete p.dailyLog[k];
      }
      return { firstForGame, streak: p.streak };
    });
  }

  // ---------- Sonstiges ----------

  // Wird bei jeder Änderung aufgerufen - auch wenn ein anderer Tab das Profil ändert
  function onChange(fn) {
    listeners.push(fn);
  }
  window.addEventListener("storage", (e) => {
    if (e.key === KEY || e.key === null) listeners.forEach((fn) => fn());
  });

  // Einmaliger Umzug vom alten Speicherstand aus der Zeit, als speedLab nur Maze war: Coins und
  // Serie wandern ins Profil, der Rest wird zum Maze-Spielstand. Läuft auf jeder Seite, die das
  // Profil lädt - egal ob man nach dem Update zuerst die Startseite oder Maze öffnet.
  const LEGACY_KEY = "speedlab_save_v1";
  const LEGACY_GAME_KEY = "speedlab_maze_v1"; // = SAVE_KEY in games/maze/js/storage.js
  function migrateLegacy() {
    try {
      const raw = localStorage.getItem(LEGACY_KEY);
      if (!raw) return;
      const old = JSON.parse(raw);
      const daily = old.daily || {};
      if (!localStorage.getItem(LEGACY_GAME_KEY)) {
        const game = Object.assign({}, old, { daily: { results: daily.results || {} } });
        delete game.coins;
        localStorage.setItem(LEGACY_GAME_KEY, JSON.stringify(game));
      }
      if (!localStorage.getItem(KEY)) {
        const p = defaults();
        delete p.cosmetics; // gekaufte Skins im Maze-Spielstand erstattet migrateShop gleich danach
        p.coins = old.coins || 0;
        p.streak = daily.streak || 0;
        p.bestStreak = daily.bestStreak || 0;
        p.lastDaily = daily.lastCompleted || null;
        for (const k of Object.keys(daily.results || {})) p.dailyLog[k] = ["maze"];
        if (p.lastDaily) p.dailyLog[p.lastDaily] = ["maze"];
        localStorage.setItem(KEY, JSON.stringify(p));
      }
      localStorage.removeItem(LEGACY_KEY);
    } catch (e) {
      console.warn("Alter Spielstand konnte nicht übernommen werden.", e);
    }
  }
  migrateLegacy();

  // Einmaliges Aufräumen, als Skins, Kauf-Spuren und Aufgaben wieder rausflogen (Okt. 2026): Wer
  // eins der Items gekauft hatte, bekommt die Coins zurück. Gekauft wurde früher im Maze-Shop (lag im
  // Maze-Spielstand) und danach im Shop für alle Spiele (lag im Profil unter cosmetics.owned).
  // Erledigt, sobald das Profil keine Liste "owned" mehr hat.
  const SCRAPPED_PRICES = {
    // Maze-Shop
    ember: 50, violet: 80, lime: 120, rose: 160, gold: 250, ice: 300, crimson: 350, sunset: 450,
    zebra: 600, ghost: 700, aurora: 850, galaxy: 1200, prism: 1500,
    "trail-tint": 100, "trail-line": 300, "trail-pixels": 400, "trail-sparks": 750, "trail-rainbow": 1400,
    // Shop für alle Spiele
    dawn: 100, frost: 100, flame: 250, twin: 250, bolt: 500, bullseye: 500, polar: 1000, labyrinth: 1000, holo: 2000,
    "trail-rings": 100, "trail-thread": 250, "trail-flags": 500, "trail-comet": 1000, "trail-phoenix": 2000,
  };
  function migrateShop() {
    try {
      const raw = localStorage.getItem(KEY);
      const stored = raw ? JSON.parse(raw) : null;
      if (stored && stored.cosmetics && !stored.cosmetics.owned) return;
      const maze = JSON.parse(localStorage.getItem(LEGACY_GAME_KEY) || "null");
      const owned = stored && stored.cosmetics ? stored.cosmetics.owned : (maze && maze.ownedCosmetics) || [];
      const refund = [...new Set(owned)].reduce((sum, id) => sum + (SCRAPPED_PRICES[id] || 0), 0);
      update((p) => {
        p.coins += refund;
        p.cosmetics = { equipped: {} };
        delete p.quests;
      });
    } catch (e) {
      console.warn("Alte Shop-Käufe konnten nicht erstattet werden.", e);
    }
  }
  migrateShop();

  return {
    coins, addCoins, spend, levelPay, dailyBonus, crystals, playSlots,
    equippedCosmetic, equipCosmetic,
    streak, bestStreak, dailiesOn, completeDaily, onChange,
  };
})();
