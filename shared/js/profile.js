// Spielübergreifendes Profil: Coins, die tägliche Serie, die Skins aus dem Shop und die geschafften
// Aufgaben (quests.js) gehören keinem einzelnen Spiel. Coins aus einem Spiel kann man in jedem anderen
// ausgeben, und die Serie hält, solange man jeden Tag das Daily von irgendeinem Spiel schafft.
// Alles andere (Level, Bestwerte, Einstellungen) speichert jedes Spiel selbst unter einem eigenen
// Schlüssel.
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
    // cosmetics: gekaufte Skins/Spuren + was ausgerüstet ist ({ skin, trail }), siehe cosmetics.js
    // quests: { [aufgabe]: Zeitpunkt } - geschaffte Aufgaben, siehe quests.js
    return {
      coins: 0, streak: 0, bestStreak: 0, lastDaily: null, dailyLog: {},
      cosmetics: { owned: [], equipped: {} }, quests: {},
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

  // ---------- Shop ----------
  // Nur der Besitz - welche Items es gibt und was sie kosten, steht in cosmetics.js

  function ownedCosmetics() {
    return read().cosmetics.owned;
  }

  function equippedCosmetic(type) {
    return read().cosmetics.equipped[type] || null;
  }

  // Coins abziehen, Item besitzen und ausrüsten in einem Schritt. false = zu wenig Coins
  function buyCosmetic(id, type, price) {
    if (read().coins < price) return false;
    update((p) => {
      p.coins -= price;
      if (!p.cosmetics.owned.includes(id)) p.cosmetics.owned.push(id);
      p.cosmetics.equipped[type] = id;
    });
    return true;
  }

  function equipCosmetic(id, type) {
    update((p) => { p.cosmetics.equipped[type] = id; });
  }

  // Ausgemusterte Items zurücknehmen: refunds = [{ id, coins }]. Wer eins besitzt, bekommt die
  // Coins zurück, ist es ausgerüstet, gilt wieder der Standard. Läuft bei jedem Laden, tut aber nur
  // etwas, solange noch so ein Item im Besitz ist.
  function refundCosmetics(refunds) {
    const owned = read().cosmetics.owned;
    const hits = refunds.filter((r) => owned.includes(r.id));
    if (!hits.length) return;
    update((p) => {
      for (const { id, coins } of hits) {
        p.cosmetics.owned = p.cosmetics.owned.filter((o) => o !== id);
        p.coins += coins;
        for (const type of Object.keys(p.cosmetics.equipped)) {
          if (p.cosmetics.equipped[type] === id) delete p.cosmetics.equipped[type];
        }
      }
    });
  }

  // ---------- Aufgaben ----------
  // Nur das Festhalten - welche Aufgaben es gibt und wann sie erfüllt sind, steht in quests.js

  function questDone(id) {
    return Boolean(read().quests[id]);
  }

  function completeQuest(id) {
    if (!questDone(id)) update((p) => { p.quests[id] = Date.now(); });
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
        delete p.cosmetics; // die Skins holt migrateShop gleich danach aus dem Maze-Spielstand
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

  // Einmaliger Umzug, als der Shop aus Maze in alle Spiele wanderte: Gekaufte Skins/Spuren lagen im
  // Maze-Spielstand - das Profil holt sie sich einmal von dort.
  function migrateShop() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw && JSON.parse(raw).cosmetics) return;
      const save = (id) => JSON.parse(localStorage.getItem(`speedlab_${id}_v1`) || "null");
      const maze = save("maze");
      update((p) => {
        p.cosmetics = {
          owned: (maze && maze.ownedCosmetics) || [],
          equipped: (maze && maze.equipped) || (maze && maze.equippedCosmetic ? { skin: maze.equippedCosmetic } : {}),
        };
      });
    } catch (e) {
      console.warn("Skins konnten nicht ins Profil übernommen werden.", e);
    }
  }
  migrateShop();

  return {
    coins, addCoins, spend, levelPay, dailyBonus,
    ownedCosmetics, equippedCosmetic, buyCosmetic, equipCosmetic, refundCosmetics, questDone, completeQuest,
    streak, bestStreak, dailiesOn, completeDaily, onChange,
  };
})();
