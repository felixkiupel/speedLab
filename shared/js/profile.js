// Spielübergreifendes Profil: Coins und die tägliche Serie gehören keinem einzelnen Spiel. Coins aus
// einem Spiel kann man in jedem anderen ausgeben, und die Serie hält, solange man jeden Tag das
// Daily von irgendeinem Spiel schafft. Alles andere (Level, Skins, Einstellungen) speichert jedes
// Spiel selbst unter einem eigenen Schlüssel.
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
    return { coins: 0, streak: 0, bestStreak: 0, lastDaily: null, dailyLog: {} };
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

  return { coins, addCoins, spend, streak, bestStreak, dailiesOn, completeDaily, onChange };
})();
