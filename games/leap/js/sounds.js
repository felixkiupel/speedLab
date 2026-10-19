// Leap-eigene Töne: Absprung je nach Wertung, Schanze, Landung, Leerlauf-Druck. Engine und die
// gemeinsamen Töne (Klick, Coin, Crash, Absturz, Checkpoint, Sterne, Ziel ...) liegen in
// shared/js/audio.js.
window.SL = window.SL || {};

(function () {
  const { tone, noise } = SL.Audio;

  SL.Audio.add({
    // Absprung von einem Punkt: je genauer, desto heller und voller
    jump(rating = "ok") {
      const base = { perfect: 880, good: 740, ok: 587 }[rating] || 587;
      tone({ freq: base, freqEnd: base * 1.5, type: "triangle", duration: 0.11, gain: 0.15 });
      if (rating === "perfect") tone({ freq: base * 2, type: "sine", duration: 0.14, gain: 0.06, delay: 0.04 });
    },
    // Über die Schanze: kurzes Rauschen, das nach oben zieht
    launch() {
      noise({ duration: 0.22, gain: 0.07, filter: "bandpass", cutoff: 900, cutoffEnd: 2600, q: 1.2, attack: 0.02 });
    },
    land() {
      tone({ freq: 140, freqEnd: 70, type: "sine", duration: 0.12, gain: 0.22 });
      noise({ duration: 0.07, gain: 0.1, cutoff: 700 });
    },
    // Gedrückt, aber kein Punkt da: leises "Pff" - die Erschöpfung läuft trotzdem
    whiff() {
      noise({ duration: 0.08, gain: 0.06, filter: "bandpass", cutoff: 1800, cutoffEnd: 900, q: 0.8 });
    },
  });
})();
