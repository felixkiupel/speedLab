// Tägliche Strecke: jeden Tag eine neue, für alle gleich (Seed aus dem Datum). Schwierigkeit nach
// Wochentag (Mo leicht ... So schwer), Bonus-Coins beim ersten Abschluss des Tages und ein
// Ergebnis-Text zum Teilen. Die Serie ist spielübergreifend und liegt im Profil (wie bei Maze).
window.SL = window.SL || {};

SL.Daily = (function () {
  const GAME_ID = "leap"; // wie in shared/js/games.js
  const EPOCH_KEY = "2026-10-19"; // Daily #1
  const KEEP_DAYS = 14; // ältere Tagesergebnisse werden aus dem Speicherstand geräumt

  // Index = Date.getDay() (0 = Sonntag). curveId = Stelle auf der Level-Kurve (Tempo, Länge, Punkt-Arten)
  const WEEKDAYS = [
    { difficulty: "Schwer", curveId: 26 }, // Sonntag
    { difficulty: "Leicht", curveId: 6 }, // Montag
    { difficulty: "Leicht", curveId: 9 }, // Dienstag
    { difficulty: "Mittel", curveId: 13 }, // Mittwoch
    { difficulty: "Mittel", curveId: 16 }, // Donnerstag
    { difficulty: "Mittel", curveId: 19 }, // Freitag
    { difficulty: "Schwer", curveId: 23 }, // Samstag
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
    const number = dayIndex(key) + 1;
    return {
      dailyKey: key,
      number,
      name: `Daily #${number}`,
      difficulty: weekday.difficulty,
      curveId: weekday.curveId,
      chapter: SL.levelCurve(weekday.curveId).chapter.id,
    };
  }

  const courseCache = new Map();
  function getCourse(config) {
    if (!courseCache.has(config.dailyKey)) {
      const curve = SL.levelCurve(config.curveId);
      courseCache.set(config.dailyKey, SL.buildCourse({ ...curve, seed: hashSeed(`speedlab-leap-daily-${config.dailyKey}`) }));
    }
    return courseCache.get(config.dailyKey);
  }

  function getRecord(state, key = SL.Days.key()) {
    return state.daily.results[key] || null;
  }

  // Bonus nur beim ersten Abschluss des Tages: 50 + 50 pro Stern + 10 pro Serien-Tag (max. 100)
  function bonusFor(stars, streak) {
    return 50 + stars * 50 + Math.min(streak * 10, 100);
  }

  // Trägt einen Daily-Abschluss ein. Gibt zurück, ob es heute der erste in Leap war, ob es ein
  // neuer Bestwert ist, die aktuelle Serie und die verdienten Coins.
  function recordResult(state, key, accuracy, stars) {
    const daily = state.daily;
    const prev = daily.results[key];
    const isNewBest = !prev || accuracy > prev.bestAccuracy;
    daily.results[key] = {
      bestAccuracy: prev ? Math.max(prev.bestAccuracy, accuracy) : accuracy,
      stars: prev ? Math.max(prev.stars, stars) : stars,
      attempts: (prev?.attempts || 0) + 1,
    };

    // Ob es der erste Abschluss heute ist, entscheidet das Profil - so gibt es den Bonus auch nach
    // "Leap-Fortschritt löschen" nicht ein zweites Mal am selben Tag
    const { firstForGame, streak } = SL.Profile.completeDaily(GAME_ID, key);
    const coins = firstForGame ? bonusFor(stars, streak) : 0;

    for (const k of Object.keys(daily.results)) {
      if (dayIndex(key) - dayIndex(k) > KEEP_DAYS) delete daily.results[k];
    }
    SL.Storage.save(state);
    SL.Profile.addCoins(coins);
    return { firstClear: firstForGame, isNewBest, streak, coins };
  }

  // "speedLab Leap · Daily #14 (Mittel) ★★☆ 87 % · 4 Tage Serie" zum Teilen
  function shareText(config, record, streak) {
    const stars = "★".repeat(record.stars) + "☆".repeat(3 - record.stars);
    const streakPart = streak > 1 ? ` · ${streak} Tage Serie` : "";
    return `speedLab Leap · Daily #${config.number} (${config.difficulty}) ${stars} ${SL.formatAccuracy(record.bestAccuracy)}${streakPart}`;
  }

  return { getConfig, getCourse, getRecord, recordResult, shareText };
})();
