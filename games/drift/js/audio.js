// Soundeffekte, komplett per Web Audio erzeugt (keine Audiodateien), plus Vibration. Aufbau wie bei
// Maze, nur mit eigenen Geräuschen: Rutschen, Aufprall, Schnee, Zug zurück.
// Der AudioContext darf erst nach einer Nutzer-Geste starten -> ensure() hängt am ersten
// Tastendruck/Tippen (ui.js). Alles ist über die Einstellungen abschaltbar.
window.SL = window.SL || {};

SL.Audio = (function () {
  let ctx = null;
  let master = null;
  let enabled = true;
  let volume = 0.7;

  function ensure() {
    if (!enabled) return;
    if (!ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      // iOS/Safari: "ambient" mischt sich mit laufender Musik statt sie zu pausieren
      if (navigator.audioSession) {
        try { navigator.audioSession.type = "ambient"; } catch (e) { /* nicht unterstützt */ }
      }
      ctx = new AudioCtx();
      master = ctx.createGain();
      master.connect(ctx.destination);
      applyVolume();
    }
    if (ctx.state === "suspended") ctx.resume();
  }

  function applyVolume() {
    if (master) master.gain.value = enabled ? volume * 0.5 : 0;
  }

  // Ein Ton mit kurzer Hüllkurve; freqEnd lässt die Tonhöhe gleiten
  function tone({ freq, freqEnd, type = "sine", duration = 0.08, gain = 0.3, attack = 0.004, delay = 0 }) {
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (freqEnd) osc.frequency.exponentialRampToValueAtTime(freqEnd, t0 + duration);
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(gain, t0 + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(env).connect(master);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  // Gefiltertes Rauschen: "lowpass" für Aufprall/Schnee, "bandpass" mit Sweep fürs Rutschen
  function noise({ duration = 0.2, gain = 0.3, filter = "lowpass", cutoff = 900, cutoffEnd, q = 1, attack = 0, delay = 0 }) {
    const t0 = ctx.currentTime + delay;
    const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * duration), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const f = ctx.createBiquadFilter();
    f.type = filter;
    f.Q.value = q;
    f.frequency.setValueAtTime(cutoff, t0);
    if (cutoffEnd) f.frequency.exponentialRampToValueAtTime(cutoffEnd, t0 + duration);
    const env = ctx.createGain();
    if (attack) {
      env.gain.setValueAtTime(0.0001, t0);
      env.gain.exponentialRampToValueAtTime(gain, t0 + attack);
    } else {
      env.gain.setValueAtTime(gain, t0);
    }
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    src.connect(f).connect(env).connect(master);
    src.start(t0);
  }

  const SOUNDS = {
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
    bump() {
      tone({ freq: 160, freqEnd: 120, type: "sine", duration: 0.07, gain: 0.18 });
    },
    coin() {
      tone({ freq: 988, type: "square", duration: 0.06, gain: 0.07 });
      tone({ freq: 1319, type: "square", duration: 0.1, gain: 0.07, delay: 0.055 });
    },
    // übers Ziel gerutscht, ohne liegen zu bleiben
    goalPass() {
      tone({ freq: 1175, type: "sine", duration: 0.07, gain: 0.07 });
    },
    // Ins Loch: Ton rutscht nach unten weg
    fall() {
      tone({ freq: 620, freqEnd: 110, type: "triangle", duration: 0.42, gain: 0.16 });
      noise({ duration: 0.3, gain: 0.08, cutoff: 900, cutoffEnd: 200, delay: 0.05 });
    },
    stuck() {
      tone({ freq: 330, type: "triangle", duration: 0.13, gain: 0.12 });
      tone({ freq: 247, type: "triangle", duration: 0.2, gain: 0.12, delay: 0.12 });
    },
    undo() {
      tone({ freq: 900, freqEnd: 480, type: "sine", duration: 0.09, gain: 0.12 });
    },
    finish() {
      [523, 659, 784, 1047].forEach((f, i) => tone({ freq: f, type: "triangle", duration: 0.18, gain: 0.18, delay: i * 0.08 }));
      tone({ freq: 1568, type: "sine", duration: 0.35, gain: 0.08, delay: 0.32 });
    },
    // Ergebnis-Sterne: jeder Stern einen Ton höher
    star(index = 0) {
      const f = [784, 988, 1319][index] || 1319;
      tone({ freq: f, type: "triangle", duration: 0.16, gain: 0.18 });
      tone({ freq: f * 2, type: "sine", duration: 0.1, gain: 0.05, delay: 0.02 });
    },
    starLost() {
      tone({ freq: 440, freqEnd: 300, type: "triangle", duration: 0.16, gain: 0.1 });
    },
    unlock() {
      [880, 1109, 1319].forEach((f, i) => tone({ freq: f, type: "sine", duration: 0.2, gain: 0.12, delay: i * 0.09 }));
    },
    click() {
      tone({ freq: 700, type: "sine", duration: 0.03, gain: 0.06 });
    },
  };

  function play(name, arg) {
    if (!enabled || !ctx || ctx.state !== "running") return;
    const sound = SOUNDS[name];
    if (sound) sound(arg);
  }

  return {
    ensure,
    play,
    setEnabled(value) {
      enabled = value;
      applyVolume();
      if (enabled) ensure();
    },
    setVolume(value) {
      volume = value;
      applyVolume();
    },
  };
})();

// Vibration (nur Geräte/Browser, die es können - z.B. Android-Chrome; iOS ignoriert es)
SL.Haptics = {
  enabled: true,
  vibrate(pattern) {
    if (!this.enabled || !navigator.vibrate) return;
    // Ohne echte Nutzer-Interaktion blockt der Browser vibrate() und loggt einen Fehler
    if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
    navigator.vibrate(pattern);
  },
};
