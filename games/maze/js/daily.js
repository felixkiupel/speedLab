// Tägliches Labyrinth: jeden Tag ein neues Maze, für alle gleich (Seed aus dem Datum).
// Schwierigkeit nach Wochentag (Mo leicht ... So schwer), Bonus-Coins beim ersten Abschluss des
// Tages und ein Ergebnis-Text zum Teilen. Die Serie ("Streak") ist spielübergreifend und liegt im
// Profil: Sie zählt jeden Tag, an dem irgendein Spiel sein Daily geschafft hat.
window.SL = window.SL || {};

SL.Daily = (function () {
  const GAME_ID = "maze"; // wie in shared/js/games.js
  const EPOCH_KEY = "2026-10-01"; // Daily #1
  const KEEP_DAYS = 14; // ältere Tagesergebnisse werden aus dem Speicherstand geräumt

  // Index = Date.getDay() (0 = Sonntag). curveId = Stelle auf der Level-Kurve (Größe/Loops/Weglänge)
  const WEEKDAYS = [
    { difficulty: "Schwer", curveId: 25, checkpoints: 2 }, // Sonntag
    { difficulty: "Leicht", curveId: 6, checkpoints: 0 }, // Montag
    { difficulty: "Leicht", curveId: 9, checkpoints: 0 }, // Dienstag
    { difficulty: "Mittel", curveId: 13, checkpoints: 1 }, // Mittwoch
    { difficulty: "Mittel", curveId: 16, checkpoints: 1 }, // Donnerstag
    { difficulty: "Mittel", curveId: 19, checkpoints: 1 }, // Freitag
    { difficulty: "Schwer", curveId: 22, checkpoints: 2 }, // Samstag
  ];

  function dayIndex(key) {
    return SL.Days.between(EPOCH_KEY, key);
  }

  // FNV-1a: stabiler Seed aus einem Text
  function hashSeed(text) {
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  }

  function getConfig(key = SL.Days.key()) {
    const { y, m, d } = SL.Days.parse(key);
    const weekday = WEEKDAYS[new Date(y, m - 1, d).getDay()];
    const { rooms, loopFactor } = SL.levelCurve(weekday.curveId);
    const number = dayIndex(key) + 1;
    return {
      dailyKey: key,
      number,
      name: `Daily #${number}`,
      difficulty: weekday.difficulty,
      curveId: weekday.curveId,
      checkpoints: weekday.checkpoints,
      rows: rooms,
      cols: rooms,
      loopFactor,
      coinCount: 8,
    };
  }

  // Wie bei den Leveln: aus ein paar Kandidaten-Seeds den nehmen, dessen kürzester Weg am
  // nächsten an der Zielkurve liegt - damit "Schwer" auch wirklich lang ist. Gecacht pro Tag.
  const mazeCache = new Map();
  function getMaze(config) {
    if (!mazeCache.has(config.dailyKey)) {
      const { targetSteps } = SL.levelCurve(config.curveId);
      let best = null;
      for (let k = 0; k < 12; k++) {
        const maze = SL.generateMaze({ ...config, seed: hashSeed(`speedlab-daily-${config.dailyKey}-${k}`) });
        if (!best || Math.abs(maze.optimalSteps - targetSteps) < Math.abs(best.optimalSteps - targetSteps)) best = maze;
      }
      mazeCache.set(config.dailyKey, best);
    }
    return mazeCache.get(config.dailyKey);
  }

  function getRecord(state, key = SL.Days.key()) {
    return state.daily.results[key] || null;
  }

  // Bonus nur beim ersten Abschluss des Tages: 50 + 50 pro Stern + 10 pro Serien-Tag (max. 100)
  function bonusFor(stars, streak) {
    return 50 + stars * 50 + Math.min(streak * 10, 100);
  }

  // Trägt einen Daily-Abschluss ein. Gibt zurück, ob es heute der erste in Maze war, ob es eine
  // neue Bestzeit ist, die aktuelle Serie und die verdienten Coins.
  function recordResult(state, key, timeMs, stars) {
    const daily = state.daily;
    const prev = daily.results[key];
    const isNewBest = !prev || timeMs < prev.bestTimeMs;
    daily.results[key] = {
      bestTimeMs: prev ? Math.min(prev.bestTimeMs, timeMs) : timeMs,
      stars: prev ? Math.max(prev.stars, stars) : stars,
      attempts: (prev?.attempts || 0) + 1,
    };

    // Ob es der erste Abschluss heute ist, entscheidet das Profil - so gibt es den Bonus auch nach
    // "Maze-Fortschritt löschen" nicht ein zweites Mal am selben Tag
    const { firstForGame, streak } = SL.Profile.completeDaily(GAME_ID, key);
    const coins = firstForGame ? bonusFor(stars, streak) : 0;

    // Alte Tage aufräumen, damit der Speicherstand nicht endlos wächst
    for (const k of Object.keys(daily.results)) {
      if (dayIndex(key) - dayIndex(k) > KEEP_DAYS) delete daily.results[k];
    }
    SL.Storage.save(state);
    SL.Profile.addCoins(coins);
    return { firstClear: firstForGame, isNewBest, streak, coins };
  }

  // "speedLab Daily #14 (Mittel) ★★☆ 23.41s · 4 Tage Serie" zum Teilen
  function shareText(config, record, streak, formatTime) {
    const stars = "★".repeat(record.stars) + "☆".repeat(3 - record.stars);
    const streakPart = streak > 1 ? ` · ${streak} Tage Serie` : "";
    return `speedLab Daily #${config.number} (${config.difficulty}) ${stars} ${formatTime(record.bestTimeMs)}${streakPart}`;
  }

  return { getConfig, getMaze, getRecord, recordResult, shareText };
})();
