// Duel-eigene Töne im Automaten-Stil (viel Rechteck-Welle). Jeder Angriff hat beim Ausholen seinen
// eigenen Klang - so hört man die Kombo schon, bevor man sie sieht. Engine + gemeinsame Töne
// (Crash, Sterne ...) in shared/js/audio.js.
window.SL = window.SL || {};

(function () {
  const { tone, noise } = SL.Audio;

  SL.Audio.add({
    windup(key) {
      if (key === "F") {
        tone({ freq: 330, freqEnd: 520, type: "square", duration: 0.1, gain: 0.05 });
      } else if (key === "HL" || key === "HR") {
        tone({ freq: 98, freqEnd: 147, type: "sawtooth", duration: 0.28, gain: 0.08, attack: 0.04 });
        noise({ duration: 0.28, gain: 0.06, cutoff: 300, attack: 0.06 });
      } else if (key === "S") {
        noise({ duration: 0.3, gain: 0.08, filter: "bandpass", cutoff: 500, cutoffEnd: 1800, q: 1.4, attack: 0.08 });
      } else if (key === "D") {
        tone({ freq: 196, type: "square", duration: 0.08, gain: 0.06 });
        tone({ freq: 196, type: "square", duration: 0.08, gain: 0.06, delay: 0.1 });
      }
    },
    // Augenblitzen: jetzt ausweichen
    glint() {
      tone({ freq: 2093, type: "square", duration: 0.04, gain: 0.04 });
      tone({ freq: 3136, type: "sine", duration: 0.12, gain: 0.05, delay: 0.03 });
    },
    whoosh() {
      noise({ duration: 0.1, gain: 0.09, filter: "bandpass", cutoff: 2400, cutoffEnd: 700, q: 0.9 });
    },
    // Faust schlägt neben der Figur ein
    slam() {
      tone({ freq: 110, freqEnd: 50, type: "sine", duration: 0.18, gain: 0.26 });
      noise({ duration: 0.12, gain: 0.12, cutoff: 600 });
    },
    dodge() {
      noise({ duration: 0.07, gain: 0.06, filter: "bandpass", cutoff: 3000, cutoffEnd: 1400, q: 0.8 });
    },
    swing(kind) {
      if (kind === "upper") tone({ freq: 300, freqEnd: 1200, type: "square", duration: 0.12, gain: 0.05 });
      else tone({ freq: 500, freqEnd: 800, type: "square", duration: 0.04, gain: 0.04 });
    },
    // Treffer: dumpfer Schlag + heller Ton, der mit dem Combo steigt
    bossHit({ kind, combo = 0 } = {}) {
      const upper = kind === "upper";
      const f = 440 * Math.pow(1.12, Math.min(combo, 10));
      tone({ freq: upper ? 200 : 160, freqEnd: 60, type: "sine", duration: upper ? 0.22 : 0.1, gain: 0.34 });
      noise({ duration: upper ? 0.14 : 0.06, gain: upper ? 0.2 : 0.12, cutoff: upper ? 2200 : 1400 });
      tone({ freq: f, type: "square", duration: 0.05, gain: 0.05, delay: 0.01 });
      if (upper) tone({ freq: f * 1.5, type: "square", duration: 0.08, gain: 0.05, delay: 0.06 });
    },
    // Geblockt: metallisches "Klonk"
    blocked() {
      tone({ freq: 1250, type: "square", duration: 0.05, gain: 0.06 });
      tone({ freq: 1870, type: "triangle", duration: 0.12, gain: 0.05, delay: 0.01 });
      noise({ duration: 0.05, gain: 0.08, filter: "highpass", cutoff: 3000 });
    },
    perfect() {
      noise({ duration: 0.16, gain: 0.08, filter: "bandpass", cutoff: 1200, cutoffEnd: 4000, q: 1 });
      [1319, 1760, 2637].forEach((f, i) => tone({ freq: f, type: "square", duration: 0.06, gain: 0.045, delay: 0.03 + i * 0.045 }));
    },
    // Boss ist offen: kleines Schwindel-Trudeln nach unten
    open() {
      [880, 740, 622].forEach((f, i) => tone({ freq: f, type: "square", duration: 0.06, gain: 0.035, delay: i * 0.06 }));
    },
    roar() {
      tone({ freq: 90, freqEnd: 60, type: "sawtooth", duration: 0.7, gain: 0.12, attack: 0.05 });
      tone({ freq: 135, freqEnd: 85, type: "square", duration: 0.6, gain: 0.04, attack: 0.05 });
      noise({ duration: 0.7, gain: 0.1, cutoff: 500, attack: 0.08 });
    },
    // Ansagen: "RUNDE 1" (Arpeggio), "LOS!" (Akkord), "K.O." (großer Fall)
    announce(kind) {
      if (kind === "round") {
        [523, 659, 784, 1047].forEach((f, i) => tone({ freq: f, type: "square", duration: 0.08, gain: 0.05, delay: i * 0.07 }));
      } else if (kind === "fight") {
        [784, 988, 1175].forEach((f) => tone({ freq: f, type: "square", duration: 0.28, gain: 0.04 }));
        noise({ duration: 0.2, gain: 0.06, filter: "highpass", cutoff: 2500 });
      } else if (kind === "ko") {
        tone({ freq: 220, freqEnd: 40, type: "sine", duration: 0.6, gain: 0.35 });
        noise({ duration: 0.4, gain: 0.2, cutoff: 1500, cutoffEnd: 200 });
        [1047, 784, 659, 523].forEach((f, i) => tone({ freq: f, type: "square", duration: 0.12, gain: 0.05, delay: 0.35 + i * 0.1 }));
      }
    },
    // Rundenuhr in den letzten Sekunden
    tick() {
      tone({ freq: 1568, type: "square", duration: 0.03, gain: 0.03 });
    },
    lose() {
      [392, 330, 262, 196].forEach((f, i) => tone({ freq: f, type: "square", duration: 0.18, gain: 0.05, delay: i * 0.14 }));
    },
  });
})();
