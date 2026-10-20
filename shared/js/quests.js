// Aufgaben, mit denen man Skins und Spuren im Shop freischaltet (welches Item zu welcher Aufgabe
// gehört, steht im Katalog in cosmetics.js). Erledigt ist eine Aufgabe auf zwei Wegen:
//   - ein Spiel meldet sie (SL.Quests.complete) - jedes Spiel prüft seine Aufgaben selbst aus dem
//     Spielstand (economy.js -> checkQuests), damit auch Erfolge von früher zählen
//   - Aufgaben rund ums Profil (Dailys, Serie) prüft check() hier direkt
// Erledigt bleibt erledigt: gespeichert wird im Profil (SL.Profile.completeQuest).
//
// NEUE AUFGABE: einen Eintrag hier anlegen, dann entweder check() schreiben oder im Spiel
// SL.Quests.complete("<id>") aufrufen, sobald sie geschafft ist - und im Katalog ein Item mit
// quest: "<id>" verknüpfen.
window.SL = window.SL || {};

(function () {
  // Gab es in den letzten Tagen (so weit das Profil sie kennt) einen Tag mit allen diesen Dailys?
  function dailiesSameDay(gameIds) {
    for (let i = 0; i < 14; i++) {
      const done = SL.Profile.dailiesOn(SL.Days.shift(SL.Days.key(), -i));
      if (gameIds.every((id) => done.includes(id))) return true;
    }
    return false;
  }

  SL.QUESTS = [
    // Profil (Dailys, Serie)
    { id: "daily", text: "Schaffe ein Daily", check: () => SL.Profile.bestStreak() >= 1 },
    { id: "daily-double", text: "Schaffe an einem Tag das Daily in Maze und in Leap", check: () => dailiesSameDay(["maze", "leap"]) },
    { id: "streak-7", text: "Erreiche eine Serie von 7 Tagen", check: () => SL.Profile.bestStreak() >= 7 },
    { id: "streak-30", text: "Erreiche eine Serie von 30 Tagen", check: () => SL.Profile.bestStreak() >= 30 },
    // Maze (games/maze/js/economy.js)
    { id: "maze-fast", text: "Schaffe ein Maze aus Kapitel 1 in unter 3 Sekunden" },
    { id: "maze-hard", text: "Schaffe ein Maze aus Kapitel 3 mit 3 Sternen" },
    { id: "maze-all", text: "Hol in allen Maze-Leveln 3 Sterne" },
    // Drift (games/drift/js/economy.js)
    { id: "drift-ideal", text: "Löse ein Drift-Level mit der Ideallösung" },
    { id: "drift-all", text: "Hol in allen Drift-Leveln 3 Sterne" },
    // Leap (games/leap/js/economy.js)
    { id: "leap-easy-100", text: "Schaffe ein Leap-Level aus Kapitel 1 mit 100 %" },
    { id: "leap-hard-100", text: "Schaffe ein Leap-Level aus Kapitel 3 mit 100 %" },
    { id: "leap-all-3", text: "Hol in allen Leap-Leveln 3 Sterne" },
    { id: "leap-all-100", text: "Schaffe alle Leap-Level mit 100 %" },
    { id: "endless-100", text: "Erreiche 100 Checkpoints im Leap-Endlosmodus" },
  ];

  const byId = (id) => SL.QUESTS.find((q) => q.id === id) || null;

  SL.Quests = {
    get: byId,

    isDone(id) {
      const quest = byId(id);
      return SL.Profile.questDone(id) || Boolean(quest && quest.check && quest.check());
    },

    // Ein Spiel meldet eine geschaffte Aufgabe (mehrfach melden ist harmlos)
    complete(id) {
      if (byId(id)) SL.Profile.completeQuest(id);
    },

    // Aufgaben mit check() festschreiben - manche könnten sonst wieder "verfallen" (das Profil
    // merkt sich die Dailys nur ein paar Tage). Beim Start jeder Seite und nach jedem Daily.
    sync() {
      for (const q of SL.QUESTS) {
        if (q.check && !SL.Profile.questDone(q.id) && q.check()) SL.Profile.completeQuest(q.id);
      }
    },
  };
})();
