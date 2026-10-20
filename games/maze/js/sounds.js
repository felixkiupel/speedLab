// Maze-eigener Ton: Schritt. Engine und die gemeinsamen Töne (Klick, Coin, Crash,
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
  });
})();
