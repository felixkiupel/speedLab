// Der Boss und seine Angriffe. Prototyp: ein einziger Kampf zum Testen. Der Boss greift in festen
// Kombos an (Folgen von Angriffen) - die zu erkennen ist der Kern. Ab halber Energie wird er wütend:
// schneller, mit neuen Angriffen und längeren Kombos.
window.SL = window.SL || {};

(function () {
  // Erhöhen, sobald sich der Kampf ändert - alte Bestwerte werden dann verworfen
  SL.LEVEL_SET_VERSION = 2;

  // Wo die Figur stehen kann: L / C / R = links, Mitte, rechts (stehend), D = in der Mitte geduckt.
  // hits = welche Stellen der Angriff trifft. opens = Faust steckt danach kurz fest (Boss offen).
  // windup = Faktor auf die Ausholzeit.
  SL.ATTACKS = {
    F: { name: "Faust", hits: ["C", "D"], windup: 1, opens: false },
    HL: { name: "Hammer", hits: ["L", "C", "D"], windup: 1.12, opens: true },
    HR: { name: "Hammer", hits: ["C", "R", "D"], windup: 1.12, opens: true },
    S: { name: "Fegen", hits: ["L", "C", "R"], windup: 1, opens: false },
    D: { name: "Doppel", hits: ["L", "R"], windup: 1.15, opens: true },
  };

  // phases[0] = normal, phases[1] = wütend (ab rageAt der Energie)
  SL.BOSS = {
    name: "KLOTZ",
    shape: "square",
    hp: 40,
    hearts: 3,
    roundMs: 60000,
    rageAt: 0.5,
    phases: [
      {
        windupMs: 560, gapMs: 190, openMs: 1150,
        combos: [["F", "HL"], ["HR", "F"], ["F", "F", "HR"], ["HL", "HR"], ["F", "HL", "F"]],
      },
      {
        windupMs: 470, gapMs: 150, openMs: 1000,
        combos: [["S", "F"], ["HL", "S", "HR"], ["D", "F"], ["F", "S", "F", "D"], ["HR", "HL", "S"], ["D", "S", "F"]],
      },
    ],
  };
})();
