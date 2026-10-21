// Töne des Automaten - Engine und gemeinsame Töne: shared/js/audio.js
window.SL = window.SL || {};

(function () {
  const { tone, noise } = SL.Audio;
  // Dur-Leiter ab C5 für die Gewinn-Melodien
  const SCALE = [523, 659, 784, 1047, 1319, 1568, 2093, 2637];

  SL.Audio.add({
    // Hebel unten / Knopf: mechanisches Klacken, dann läuft die Mechanik an
    slotPull() {
      noise({ duration: 0.05, gain: 0.22, filter: "highpass", cutoff: 1800 });
      tone({ freq: 210, freqEnd: 120, type: "square", duration: 0.07, gain: 0.05 });
      noise({ duration: 0.4, gain: 0.05, filter: "bandpass", cutoff: 350, cutoffEnd: 1500, q: 0.9, attack: 0.06, delay: 0.03 });
    },

    // Ein Feld läuft an der Gewinnlinie vorbei. loud = die Walze bremst gerade (einzelne Ticks)
    slotTick({ reel = 0, loud = false } = {}) {
      const f = [1850, 2050, 2300][reel] || 2000;
      tone({ freq: f, freqEnd: f * 0.75, type: "triangle", duration: 0.022, gain: loud ? 0.06 : 0.018 });
    },

    // Walze rastet ein: dumpfer Schlag + Klick der Arretierung
    slotStop(reel = 0) {
      tone({ freq: 160 - reel * 12, freqEnd: 68, type: "sine", duration: 0.14, gain: 0.32 });
      noise({ duration: 0.06, gain: 0.1, cutoff: 1100 });
      tone({ freq: 2800, type: "square", duration: 0.012, gain: 0.025, delay: 0.005 });
    },

    // Spannung auf der letzten Walze: Piepen, das mit jedem Mal höher wird
    slotTease(step = 0) {
      const f = 440 * Math.pow(2, Math.min(step, 18) / 12);
      tone({ freq: f, type: "square", duration: 0.05, gain: 0.035 });
      tone({ freq: f * 1.5, type: "sine", duration: 0.06, gain: 0.03 });
    },

    // Gewinn: Arpeggio nach oben, je größer der Gewinn (tier 1-4), desto länger und voller
    slotWin(tier = 1) {
      const notes = SCALE.slice(tier >= 3 ? 0 : 2, [0, 3, 5, 7, 8][tier] + (tier >= 3 ? 0 : 2));
      const step = tier >= 3 ? 0.075 : 0.06;
      notes.forEach((f, i) => tone({ freq: f, type: "triangle", duration: 0.16, gain: 0.16, delay: i * step }));
      const end = notes.length * step;
      tone({ freq: notes[notes.length - 1] * 2, type: "sine", duration: 0.35, gain: 0.06, delay: end });
      if (tier >= 3) {
        // Schlussakkord
        [1047, 1319, 1568].forEach((f) => tone({ freq: f, type: "triangle", duration: 0.5, gain: 0.08, delay: end + 0.05 }));
      }
    },

    // Jackpot: Fanfare, dreimal hoch, dann ein langer Akkord mit Glitzern
    slotJackpot() {
      [0, 0.18, 0.36].forEach((d, k) => {
        [784, 988, 1175].forEach((f) => tone({ freq: f * (1 + k * 0.125), type: "square", duration: 0.13, gain: 0.05, delay: d }));
      });
      [1047, 1319, 1568, 2093].forEach((f) => tone({ freq: f, type: "triangle", duration: 0.9, gain: 0.09, delay: 0.56 }));
      for (let i = 0; i < 10; i++) tone({ freq: 2093 + i * 180, type: "sine", duration: 0.07, gain: 0.03, delay: 0.6 + i * 0.07 });
    },

    // Kristall-Zähler zählt hoch: kleine helle Blips, mit jedem etwas höher
    crystalTick(i = 0) {
      tone({ freq: 1400 + Math.min(i, 30) * 35, type: "sine", duration: 0.04, gain: 0.05 });
    },
  });
})();
