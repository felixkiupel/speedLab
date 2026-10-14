// Tägliches Labyrinth: jeden Tag ein neues Maze, für alle gleich (Seed aus dem Datum).
// Schwierigkeit nach Wochentag (Mo leicht ... So schwer), Serie ("Streak") für Tage in Folge,
// Bonus-Coins beim ersten Abschluss des Tages und ein Ergebnis-Text zum Teilen.
window.SL = window.SL || {};

SL.Daily = (function () {
  // Daily #1 = 1. Oktober 2026
  const EPOCH_UTC = Date.UTC(2026, 9, 1);
  const DAY_MS = 86400000;
  const KEEP_DAYS = 14; // ältere Tagesergebnisse werden aus dem Speicherstand geräumt

  // Index = Date.getDay() (0 = Sonntag). curveId = Stelle auf der Level-Kurve (Größe/Loops/Weglänge)
  const WEEKDAYS = [
    { name: "Sonntag", difficulty: "Schwer", curveId: 25, checkpoints: 2 },
    { name: "Montag", difficulty: "Leicht", curveId: 6, checkpoints: 0 },
    { name: "Dienstag", difficulty: "Leicht", curveId: 9, checkpoints: 0 },
    { name: "Mittwoch", difficulty: "Mittel", curveId: 13, checkpoints: 1 },
    { name: "Donnerstag", difficulty: "Mittel", curveId: 16, checkpoints: 1 },
    { name: "Freitag", difficulty: "Mittel", curveId: 19, checkpoints: 1 },
    { name: "Samstag", difficulty: "Schwer", curveId: 22, checkpoints: 2 },
  ];

  // Lokales Datum als Schlüssel "2026-10-14" (der Tag wechselt um Mitternacht Ortszeit)
  function dateKey(date = new Date()) {
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${date.getFullYear()}-${m}-${d}`;
  }

  function parseKey(key) {
    const [y, m, d] = key.split("-").map(Number);
    return { y, m, d };
  }

  function dayIndex(key) {
    const { y, m, d } = parseKey(key);
    return Math.round((Date.UTC(y, m - 1, d) - EPOCH_UTC) / DAY_MS);
  }

  function shiftKey(key, days) {
    const { y, m, d } = parseKey(key);
    return dateKey(new Date(y, m - 1, d + days));
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

  function getConfig(key = dateKey()) {
    const { y, m, d } = parseKey(key);
    const weekday = WEEKDAYS[new Date(y, m - 1, d).getDay()];
    const { rooms, loopFactor } = SL.levelCurve(weekday.curveId);
    const number = dayIndex(key) + 1;
    return {
      id: "daily",
      dailyKey: key,
      number,
      name: `Daily #${number}`,
      weekday: weekday.name,
      difficulty: weekday.difficulty,
      curveId: weekday.curveId,
      checkpoints: weekday.checkpoints,
      rows: rooms,
      cols: rooms,
      loopFactor,
      coinCount: 8,
      rewardLevelId: weekday.curveId, // Coins wie ein Level dieser Schwierigkeit
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

  function getRecord(state, key = dateKey()) {
    return state.daily.results[key] || null;
  }

  // Serie zählt, solange gestern oder heute abgeschlossen wurde
  function currentStreak(state, today = dateKey()) {
    const last = state.daily.lastCompleted;
    if (last === today || last === shiftKey(today, -1)) return state.daily.streak;
    return 0;
  }

  // Bonus nur beim ersten Abschluss des Tages: 50 + 50 pro Stern + 10 pro Serien-Tag (max. 100)
  function bonusFor(stars, streak) {
    return 50 + stars * 50 + Math.min(streak * 10, 100);
  }

  // Trägt einen Daily-Abschluss ein. Gibt zurück, ob es der erste des Tages war, ob es eine neue
  // Bestzeit ist, die aktuelle Serie und die verdienten Coins.
  function recordResult(state, key, timeMs, stars) {
    const daily = state.daily;
    const prev = daily.results[key];
    const firstClear = !prev;
    const isNewBest = !prev || timeMs < prev.bestTimeMs;
    daily.results[key] = {
      bestTimeMs: prev ? Math.min(prev.bestTimeMs, timeMs) : timeMs,
      stars: prev ? Math.max(prev.stars, stars) : stars,
      attempts: (prev?.attempts || 0) + 1,
    };

    let coins = 0;
    if (firstClear) {
      daily.streak = daily.lastCompleted === shiftKey(key, -1) ? daily.streak + 1 : 1;
      daily.bestStreak = Math.max(daily.bestStreak, daily.streak);
      daily.lastCompleted = key;
      coins = bonusFor(stars, daily.streak);
      state.coins += coins;
    }

    // Alte Tage aufräumen, damit der Speicherstand nicht endlos wächst
    for (const k of Object.keys(daily.results)) {
      if (dayIndex(key) - dayIndex(k) > KEEP_DAYS) delete daily.results[k];
    }
    SL.Storage.save(state);
    return { firstClear, isNewBest, streak: daily.streak, coins };
  }

  // "speedLab Daily #14 · Mittwoch ★★☆ 23.41s · Serie 4" zum Teilen
  function shareText(config, record, streak, formatTime) {
    const stars = "★".repeat(record.stars) + "☆".repeat(3 - record.stars);
    const streakPart = streak > 1 ? ` · ${streak} Tage Serie` : "";
    return `speedLab Daily #${config.number} (${config.difficulty}) ${stars} ${formatTime(record.bestTimeMs)}${streakPart}`;
  }

  // "5 Std. 12 Min." bis zum nächsten Daily (short: nur "5 Std." bzw. "45 Min.")
  function timeUntilNext(now = new Date(), short = false) {
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const mins = Math.max(1, Math.round((next - now) / 60000));
    const h = Math.floor(mins / 60);
    if (h === 0) return `${mins} Min.`;
    return short ? `${h} Std.` : `${h} Std. ${mins % 60} Min.`;
  }

  return { dateKey, getConfig, getMaze, getRecord, currentStreak, recordResult, shareText, timeUntilNext, bonusFor };
})();
