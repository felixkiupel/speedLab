// Soundeffekte, komplett per Web Audio erzeugt (keine Audiodateien), plus Vibration - gemeinsam für
// alle Spiele. Hier liegt die Engine und die Töne, die jedes Spiel gleich verwendet (Klick, Coin,
// Sterne, Ziel ...). Spiel-eigene Geräusche meldet jedes Spiel in seiner js/sounds.js mit
// SL.Audio.add({ name() { ... } }) an und baut sie aus SL.Audio.tone / SL.Audio.noise.
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

  // Ein Ton mit kurzer Hüllkurve; freqEnd lässt die Tonhöhe gleiten (z.B. Crash nach unten)
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

  // Gefiltertes Rauschen: "lowpass" für Aufprall-Geräusche, "bandpass" mit Sweep z.B. fürs Rutschen
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

  // Töne, die in allen Spielen gleich klingen. Die Spiele ergänzen ihre eigenen über add().
  const SOUNDS = {
    // Kurz gegen etwas gestoßen (ohne Folgen)
    bump() {
      tone({ freq: 160, freqEnd: 120, type: "sine", duration: 0.07, gain: 0.18 });
    },
    coin() {
      tone({ freq: 988, type: "square", duration: 0.06, gain: 0.07 });
      tone({ freq: 1319, type: "square", duration: 0.1, gain: 0.07, delay: 0.055 });
    },
    // Harter Aufprall (Wand)
    crash() {
      noise({ duration: 0.22, gain: 0.35, cutoff: 700 });
      tone({ freq: 190, freqEnd: 55, type: "sine", duration: 0.28, gain: 0.35 });
    },
    // Runterfallen (Loch, verpasster Sprung): Ton rutscht nach unten weg
    fall() {
      tone({ freq: 620, freqEnd: 110, type: "triangle", duration: 0.42, gain: 0.16 });
      noise({ duration: 0.3, gain: 0.08, cutoff: 900, cutoffEnd: 200, delay: 0.05 });
    },
    checkpoint() {
      [660, 880, 1175].forEach((f, i) => tone({ freq: f, type: "triangle", duration: 0.12, gain: 0.16, delay: i * 0.07 }));
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

  // Spiel-eigene Töne anmelden: { name(arg) { tone(...); noise(...); } }
  function add(sounds) {
    Object.assign(SOUNDS, sounds);
  }

  return {
    ensure,
    play,
    add,
    tone,
    noise,
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
