// Endlosmodus: eine Strecke ohne Ziel. Sie wird beim Spielen Abschnitt für Abschnitt (jeweils bis
// zum nächsten Checkpoint) weitergebaut, jeder Abschnitt zufällig in der Stufe von Level 10, 20 oder
// 30 - Tempo, Länge, Punkt-Arten und Gabelungen wie in einem Abschnitt dieses Levels. Absturz =
// zurück zum letzten Checkpoint. Keine Sterne, kein Ziel: Gezählt werden alle je erreichten
// Checkpoints, über alle Läufe hinweg. Frei, sobald alle Level 3 Sterne haben.
window.SL = window.SL || {};

SL.Endless = (function () {
  const STAGES = [10, 20, 30]; // aus diesen Leveln kommen die Abschnitte
  const AHEAD = 2; // so viele Checkpoints liegen immer schon fertig vor dem zuletzt erreichten

  // Neuer Lauf mit zufälligem Seed - jeder Lauf ist eine andere Strecke (fester Seed: tools/).
  // extend(index) nach jedem erreichten Checkpoint (Plattform-Index) aufrufen.
  function createRun(seed = Math.floor(Math.random() * 0x100000000)) {
    const builder = SL.createCourseBuilder(seed);
    const pick = SL.createRng(seed ^ 0x5bd1e995); // eigene Folge für die Stufen
    const course = builder.course;
    course.endless = true;

    function addSection() {
      const curve = SL.levelCurve(STAGES[Math.floor(pick() * STAGES.length)]);
      const parts = curve.checkpoints + 1; // so viele Abschnitte hat das Level
      builder.addSection({
        vx: curve.vx,
        points: Math.round(curve.points / parts),
        forks: Math.round(curve.forks / parts),
        kinds: curve.kinds,
        coinsPerFork: curve.coinsPerFork,
      });
    }

    function extend(reached) {
      while (course.platforms.length - 1 < reached + AHEAD) addSection();
    }
    extend(0);
    return { course, extend };
  }

  const maxStars = () => SL.LEVELS.length * 3;

  // Frei mit allen Sternen - und dann für immer, auch wenn neue Strecken die Sterne zurücksetzen
  function isUnlocked(state) {
    if (!state.endless.unlocked && SL.Economy.totalStars(state) >= maxStars()) {
      state.endless.unlocked = true;
      SL.Storage.save(state);
    }
    return state.endless.unlocked;
  }

  // Ein Checkpoint geschafft: der Zähler läuft über alle Läufe weiter. Liefert den neuen Stand.
  function addCheckpoint(state) {
    state.endless.checkpoints++;
    SL.Storage.save(state);
    return state.endless.checkpoints;
  }

  return { createRun, isUnlocked, maxStars, addCheckpoint };
})();
