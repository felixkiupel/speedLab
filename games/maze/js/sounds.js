// Maze-eigene Töne: Schritt und Kauf. Engine und die gemeinsamen Töne (Klick, Coin, Crash,
// Checkpoint, Sterne, Ziel ...) liegen in shared/js/audio.js.
window.SL = window.SL || {};

(function () {
  const { tone } = SL.Audio;

  SL.Audio.add({
    // Schritt: kurzer Klick, wird bei schnellen Serien leicht höher (combo = Schritte in Folge)
    step(combo = 0) {
      const lift = Math.min(combo, 16) / 48;
      tone({ freq: 520 * Math.pow(2, lift), type: "triangle", duration: 0.045, gain: 0.12 });
    },
    purchase() {
      [784, 1047, 1319, 1568].forEach((f, i) => tone({ freq: f, type: "triangle", duration: 0.1, gain: 0.13, delay: i * 0.05 }));
    },
  });
})();
