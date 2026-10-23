// Fish-eigene Töne: Platschen, Zupfen, Biss, Ziehen (Rolle, Knarzen, Warnung), Wind, Fang.
// Engine + gemeinsame Töne (Coin, Absturz, Freischalten ...) in shared/js/audio.js.
window.SL = window.SL || {};

(function () {
  const { tone, noise } = SL.Audio;

  SL.Audio.add({
    // Haken taucht ins Wasser
    plop() {
      tone({ freq: 620, freqEnd: 180, type: "sine", duration: 0.12, gain: 0.16 });
      noise({ duration: 0.12, gain: 0.06, cutoff: 1200, delay: 0.02 });
    },
    nibble() {
      tone({ freq: 880, freqEnd: 700, type: "sine", duration: 0.05, gain: 0.08 });
    },
    bite() {
      noise({ duration: 0.18, gain: 0.12, cutoff: 1600, cutoffEnd: 500 });
      tone({ freq: 1319, type: "triangle", duration: 0.14, gain: 0.1, delay: 0.02 });
      tone({ freq: 1760, type: "triangle", duration: 0.16, gain: 0.08, delay: 0.09 });
    },
    hook() {
      tone({ freq: 300, freqEnd: 900, type: "triangle", duration: 0.1, gain: 0.12 });
    },
    // Rolle klickt beim Ziehen
    reelTick() {
      tone({ freq: 2400, type: "square", duration: 0.012, gain: 0.018 });
    },
    // Schnur knarzt in der roten Zone
    creak() {
      noise({ duration: 0.12, gain: 0.05, filter: "bandpass", cutoff: 700, cutoffEnd: 1300, q: 6 });
    },
    // Fisch zappelt gleich - loslassen!
    tell() {
      tone({ freq: 988, type: "square", duration: 0.05, gain: 0.05 });
      tone({ freq: 740, type: "square", duration: 0.07, gain: 0.05, delay: 0.06 });
    },
    // Haken kommt in der Ebene an
    settle() {
      tone({ freq: 420, freqEnd: 300, type: "sine", duration: 0.08, gain: 0.06 });
    },
    // Leichte Brise: leises Rauschen, das an- und abschwillt
    wind() {
      noise({ duration: 2.6, gain: 0.025, filter: "bandpass", cutoff: 380, cutoffEnd: 260, q: 0.6, attack: 1.1 });
    },
    early() {
      tone({ freq: 330, freqEnd: 250, type: "triangle", duration: 0.14, gain: 0.1 });
    },
    // Gefangen - seltene Fische mit längerer Melodie
    caught(rarity = 1) {
      const notes = rarity >= 3 ? [523, 659, 784, 1047, 1319] : rarity === 2 ? [523, 659, 784, 1047] : [587, 784, 988];
      notes.forEach((f, i) => tone({ freq: f, type: "triangle", duration: 0.16, gain: 0.14, delay: i * 0.075 }));
    },
    sell() {
      [988, 1319, 1568].forEach((f, i) => tone({ freq: f, type: "square", duration: 0.06, gain: 0.05, delay: i * 0.06 }));
    },
  });
})();
