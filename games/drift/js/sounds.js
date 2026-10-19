// Drift-eigene Töne: Rutschen, Aufprall, Schnee, Sackgasse, Zug zurück. Engine und die gemeinsamen
// Töne (Klick, Coin, ins Loch fallen, Sterne, Ziel ...) liegen in shared/js/audio.js.
window.SL = window.SL || {};

(function () {
  const { tone, noise } = SL.Audio;

  SL.Audio.add({
    // Rutschen: Zischen über Eis, so lang wie der Rutscher selbst (tiles = Felder)
    slide(tiles = 1) {
      const duration = SL.slideDuration(tiles) / 1000;
      noise({ duration, gain: 0.09, filter: "bandpass", cutoff: 2600, cutoffEnd: 5200, q: 0.9, attack: 0.03 });
    },
    // Aufprall am Fels/Rand: dumpfer Schlag, je länger der Rutscher, desto kräftiger
    thud(tiles = 1) {
      const power = Math.min(1, 0.4 + tiles * 0.12);
      tone({ freq: 150, freqEnd: 60, type: "sine", duration: 0.16, gain: 0.32 * power });
      noise({ duration: 0.09, gain: 0.18 * power, cutoff: 600 });
    },
    snow() {
      noise({ duration: 0.16, gain: 0.16, cutoff: 1400, cutoffEnd: 500 });
    },
    // übers Ziel gerutscht, ohne liegen zu bleiben
    goalPass() {
      tone({ freq: 1175, type: "sine", duration: 0.07, gain: 0.07 });
    },
    stuck() {
      tone({ freq: 330, type: "triangle", duration: 0.13, gain: 0.12 });
      tone({ freq: 247, type: "triangle", duration: 0.2, gain: 0.12, delay: 0.12 });
    },
    undo() {
      tone({ freq: 900, freqEnd: 480, type: "sine", duration: 0.09, gain: 0.12 });
    },
  });
})();
