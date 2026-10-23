// Angeln ohne DOM (läuft auch in Node, siehe tools/fish-check.js): Haken auf eine Tiefen-Ebene
// lassen, Fische schwimmen in ihren Ebenen, einer kommt zum Haken, zupft und beißt - dann ziehen.
// Koordinaten: x 0..1 über die Breite, Tiefe in Ebenen (0 = Oberfläche, Ebene n = n-1 .. n).
//
//   lower   - Haken sinkt/steigt zur gewählten Ebene (setLayer)
//   wait    - Haken hängt in der Ebene; irgendwann schwimmt ein Fisch hin und zupft (Drücken = zu
//             früh, er haut ab)
//   bite    - er beißt: jetzt drücken = anschlagen. Zu spät = er schwimmt weg.
//   reel    - Ziehen (SL.TensionGame): halten = ziehen, loslassen = locker lassen
//   landed  - gefangen, wartet auf collect() von ui.js
//   escaped - entwischt oder Schnur gerissen, kurz Pause, dann wieder lower
// ui.js setzt die Hooks (onXyz).
window.SL = window.SL || {};

(function () {
  const HOOK_X = 0.47; // wo die Schnur ins Wasser geht
  const SINK_SPEED = 1.8; // Ebenen pro Sekunde
  const FISH_PER_LAYER = 3;
  const RESPAWN_MS = [2000, 5000];
  const WAIT_MS = [1500, 4000]; // bis ein Fisch Interesse zeigt (× Köder)
  const SWIM_SPEED = [0.03, 0.06]; // Breite pro Sekunde
  const APPROACH_SPEED = 0.11;
  const NIBBLE_MS = 450;
  const BITE_MS = 850;
  const EARLY_PAUSE_MS = 1500;
  const ESCAPE_MS = 1100;

  // Ziehen
  const LOW = 0.25; // darunter: Schnur zu locker, der Fisch zieht davon
  const HIGH = 0.8; // darüber: rote Zone, bei 1 reißt die Schnur
  const START_TENSION = 0.35;
  const START_PROGRESS = 0.2;
  // Die Spannung läuft gleitend (RATE pro Sekunde) auf einen Zielwert zu. Last = Fischkraft / Schnur.
  // Halten: HOLD_BASE + HOLD_LOAD × Last - schwache Fische kann man einfach halten, starke mit
  // schwacher Schnur muss man pumpen. Gegen einen aufbäumenden Fisch ziehen: + SURGE_LOAD × Last.
  // Loslassen: REST_LOAD × Last (fast locker).
  const RATE = 2.6;
  const HOLD_BASE = 0.42;
  const HOLD_LOAD = 0.35;
  const SURGE_LOAD = 0.75;
  const REST_LOAD = 0.08;
  // Zu starker Fisch für die Schnur (Last über SAFE_LOAD): beim Aufbäumen zieht er die Schnur auch
  // straff, wenn man loslässt - weit drüber reißt sie. Der Deckel, für den man die Schnur aufrüstet.
  const SAFE_LOAD = 0.8;
  const SURGE_FREE = 1.8;
  const FIGHT_MS = 30000; // länger hält der Haken nicht - schwache Angel + großer Fisch = weg
  const SURGE_DRAIN = 0.13; // Fortschritt, den ein aufbäumender Fisch zurückholt
  const FILL = 0.3; // Fortschritt pro Sekunde bei straffer Schnur (× Angel / Fischkraft)
  const SLACK_DRAIN = 0.12; // Fortschritt, den man bei lockerer Schnur verliert
  const TELL_MS = 300; // so lange zappelt er, bevor er sich aufbäumt
  const PERFECT_BONUS = 0.2; // nie in der roten Zone = 20 % mehr wert

  // Aufbäumen je Fisch: alle every ms, dauert length ms
  const SURGES = {
    ruhig: { every: [2600, 4200], length: [450, 700] },
    flitzer: { every: [1300, 2400], length: [350, 550] },
    sinker: { every: [2200, 3600], length: [800, 1200] },
    springer: { every: [1500, 2600], length: [500, 800] },
    wild: { every: [900, 1700], length: [400, 700] },
  };

  SL.FISHING = { HOOK_X, LOW, HIGH, PERFECT_BONUS };

  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  // ---------- Ziehen ----------

  // size 0..1 = wie groß das Exemplar ist (große ziehen stärker)
  function TensionGame(fish, size, gear, rand = Math.random) {
    this.fish = fish;
    this.rand = rand;
    this.S = fish.strength * (0.85 + 0.3 * size);
    this.L = gear.strength;
    this.P = gear.power;
    this.surges = SURGES[fish.behavior] || SURGES.ruhig;
    this.tension = START_TENSION;
    this.progress = START_PROGRESS;
    this.t = 0;
    this.perfect = true;
    this.done = null; // "caught" | "escaped" | "snapped" | "loose"
    this.planSurge(500);
  }

  TensionGame.prototype.planSurge = function planSurge(after) {
    const s = this.surges;
    this.surgeAt = this.t + after + lerp(s.every[0], s.every[1], this.rand());
    this.surgeEnd = this.surgeAt + lerp(s.length[0], s.length[1], this.rand());
  };

  // "calm" | "tell" (zappelt gleich) | "surge" (bäumt sich auf)
  TensionGame.prototype.phase = function phase() {
    if (this.t >= this.surgeAt && this.t < this.surgeEnd) return "surge";
    if (this.t >= this.surgeAt - TELL_MS && this.t < this.surgeAt) return "tell";
    return "calm";
  };

  TensionGame.prototype.update = function update(dt, holding) {
    if (this.done) return this.done;
    const s = dt / 1000;
    this.t += dt;
    if (this.t >= this.surgeEnd) this.planSurge(0);
    const surging = this.phase() === "surge";

    const load = this.load();
    const target = holding
      ? HOLD_BASE + HOLD_LOAD * load + (surging ? SURGE_LOAD * load : 0)
      : REST_LOAD * load + (surging ? SURGE_FREE * Math.max(0, load - SAFE_LOAD) : 0);
    this.tension += (target - this.tension) * (1 - Math.exp(-RATE * s));
    if (this.tension > HIGH) this.perfect = false;
    if (this.tension >= 1) {
      this.tension = 1;
      this.done = "snapped";
      return this.done;
    }

    if (surging) this.progress -= SURGE_DRAIN * this.S * s;
    else if (this.tension >= LOW) this.progress += (FILL * this.P) / (0.5 + 0.7 * this.S) * s;
    if (this.tension < LOW) this.progress -= SLACK_DRAIN * s;
    this.progress = clamp(this.progress, 0, 1);
    if (this.progress >= 1) this.done = "caught";
    else if (this.progress <= 0) this.done = "escaped";
    else if (this.t >= FIGHT_MS) this.done = "loose";
    return this.done;
  };

  // Fischkraft / Schnur - über 1 ist er eigentlich zu stark für diese Schnur
  TensionGame.prototype.load = function load() {
    return this.S / this.L;
  };

  // ---------- Angelstelle ----------

  const RARITY_WEIGHT = [0, 60, 25, 8, 2];

  // Welche Art schwimmt in dieser Ebene, wie groß ist sie? luck 0..~1: seltener + größer
  SL.pickFish = function pickFish(spotId, layer, luck, rand = Math.random) {
    const pool = SL.FISH.filter((f) => f.spot === spotId && layer >= f.layers[0] && layer <= f.layers[1]);
    if (!pool.length) return null;
    const weights = pool.map((f) => RARITY_WEIGHT[f.rarity] * (1 + luck * (f.rarity - 1) * 1.5));
    let r = rand() * weights.reduce((a, b) => a + b, 0);
    let fish = pool[pool.length - 1];
    for (let i = 0; i < pool.length; i++) {
      r -= weights[i];
      if (r <= 0) { fish = pool[i]; break; }
    }
    const size = Math.pow(rand(), 1.5 - 0.7 * Math.min(1, luck));
    const kg = lerp(fish.kg[0], fish.kg[1], size);
    const value = Math.max(1, Math.round(fish.value * (0.6 + 0.8 * size)));
    return { fish, size, kg, value };
  };

  // opts: { spot, gear (SL.gearStats), layer (zuletzt gewählte Ebene), rand }
  function FishingSession(opts) {
    this.spot = opts.spot;
    this.gear = opts.gear;
    this.rand = opts.rand || Math.random;
    this.reach = SL.reachableLayers(this.spot, this.gear.depth);
    this.time = 0;
    this.state = "lower";
    this.stateAt = 0;
    this.holding = false;
    this.targetLayer = clamp(opts.layer || 1, 1, this.reach);
    this.hook = 0; // Tiefe des Hakens in Ebenen
    this.fishes = [];
    this.nextId = 1;
    this.respawns = []; // { layer, at }
    this.waitUntil = Infinity;
    this.biter = null; // Fisch, der gerade kommt / zupft / beißt / hängt
    this.reel = null;
    this.reelFrom = 0; // Tiefe, aus der der gehakte Fisch kommt
    this.result = null;
    for (let layer = 1; layer <= this.spot.layers; layer++) {
      for (let i = 0; i < FISH_PER_LAYER; i++) this.spawn(layer, false);
    }
  }

  FishingSession.prototype.setState = function setState(state) {
    this.state = state;
    this.stateAt = this.time;
  };

  FishingSession.prototype.spawn = function spawn(layer, fromEdge) {
    const pick = SL.pickFish(this.spot.id, layer, this.gear.luck, this.rand);
    if (!pick) return;
    const dir = this.rand() < 0.5 ? -1 : 1;
    this.fishes.push({
      id: this.nextId++,
      ...pick,
      layer,
      x: fromEdge ? (dir > 0 ? -0.1 : 1.1) : 0.08 + this.rand() * 0.84,
      d: layer - 0.75 + this.rand() * 0.5,
      dir,
      speed: lerp(SWIM_SPEED[0], SWIM_SPEED[1], this.rand()),
      mode: "swim", // swim | approach | nibble | bite | hooked | flee
      turnAt: this.time + 3000 + this.rand() * 5000,
      modeAt: this.time,
      nibbles: 0,
    });
  };

  FishingSession.prototype.flee = function flee(f) {
    f.mode = "flee";
    f.dir = f.x < 0.5 ? -1 : 1;
    f.modeAt = this.time;
    if (this.biter === f) this.biter = null;
  };

  // Halbe Fischlänge in Breiten-Einheiten (das Bild ist 400 breit) - damit das Maul am Haken ist
  const halfLen = (f) => f.fish.len / 800;

  FishingSession.prototype.updateFishes = function updateFishes(dt) {
    const s = dt / 1000;
    for (const f of this.fishes) {
      if (f.mode === "swim") {
        f.x += f.dir * f.speed * s;
        // am Rand umdrehen (wer gerade vom Rand reinschwimmt, schwimmt weiter), sonst ab und zu
        if (f.x <= 0.04 && f.dir < 0) f.dir = 1;
        else if (f.x >= 0.96 && f.dir > 0) f.dir = -1;
        else if (f.x > 0.04 && f.x < 0.96 && this.time >= f.turnAt) {
          f.dir = -f.dir;
          f.turnAt = this.time + 3000 + this.rand() * 5000;
        }
      } else if (f.mode === "approach") {
        const tx = HOOK_X - f.dir * halfLen(f);
        const dx = tx - f.x;
        f.d += (this.hook - f.d) * Math.min(1, s * 3);
        if (Math.abs(dx) < 0.004) {
          f.x = tx;
          f.mode = f.nibbles > 0 ? "nibble" : "bite";
          f.modeAt = this.time;
          if (f.mode === "bite") this.startBite();
        } else {
          f.x += Math.sign(dx) * Math.min(Math.abs(dx), APPROACH_SPEED * s);
        }
      } else if (f.mode === "nibble") {
        if (this.time - f.modeAt >= NIBBLE_MS) {
          f.nibbles--;
          f.modeAt = this.time;
          if (this.onNibble) this.onNibble(f);
          if (f.nibbles <= 0) {
            f.mode = "bite";
            this.startBite();
          }
        }
      } else if (f.mode === "flee") {
        f.x += f.dir * 0.4 * s;
      } else if (f.mode === "hooked") {
        f.x = HOOK_X - f.dir * halfLen(f);
        f.d = this.hook;
      }
    }
    // Weggeschwommene verschwinden und kommen später als neue Fische vom Rand
    const gone = this.fishes.filter((f) => f.mode === "flee" && (f.x < -0.2 || f.x > 1.2));
    for (const f of gone) this.respawns.push({ layer: f.layer, at: this.time + lerp(RESPAWN_MS[0], RESPAWN_MS[1], this.rand()) });
    if (gone.length) this.fishes = this.fishes.filter((f) => !gone.includes(f));
    for (const r of this.respawns) if (this.time >= r.at) this.spawn(r.layer, true);
    this.respawns = this.respawns.filter((r) => this.time < r.at);
  };

  FishingSession.prototype.startBite = function startBite() {
    this.setState("bite");
    if (this.onBite) this.onBite(this.biter);
  };

  FishingSession.prototype.scheduleWait = function scheduleWait(extra = 0) {
    this.waitUntil = this.time + lerp(WAIT_MS[0], WAIT_MS[1], this.rand()) * this.gear.wait + extra;
  };

  // Ebene wählen (1 = oben). Liefert false, wenn die Schnur nicht so tief reicht.
  FishingSession.prototype.setLayer = function setLayer(layer) {
    if (layer < 1 || layer > this.spot.layers) return true;
    if (layer > this.reach) return false;
    if (this.state !== "lower" && this.state !== "wait") return true;
    if (layer === this.targetLayer && this.state === "wait") return true;
    if (this.biter) {
      this.biter.mode = "swim";
      this.biter = null;
    }
    this.targetLayer = layer;
    this.setState("lower");
    return true;
  };

  FishingSession.prototype.press = function press() {
    this.holding = true;
    if (this.state === "bite") {
      const f = this.biter;
      f.mode = "hooked";
      this.reelFrom = this.hook;
      this.reel = new SL.TensionGame(f.fish, f.size, this.gear, this.rand);
      this.setState("reel");
      if (this.onHook) this.onHook(f);
    } else if (this.state === "wait" && this.biter) {
      // Zu früh: der Fisch erschrickt
      this.flee(this.biter);
      this.scheduleWait(EARLY_PAUSE_MS);
      if (this.onEarly) this.onEarly();
    }
  };

  FishingSession.prototype.release = function release() {
    this.holding = false;
  };

  FishingSession.prototype.update = function update(dt) {
    this.time += dt;
    this.updateFishes(dt);
    switch (this.state) {
      case "lower": {
        const target = this.targetLayer - 0.5;
        const step = SINK_SPEED * (dt / 1000);
        if (Math.abs(target - this.hook) <= step) {
          this.hook = target;
          this.setState("wait");
          this.scheduleWait();
          if (this.onSettle) this.onSettle();
        } else {
          this.hook += Math.sign(target - this.hook) * step;
        }
        break;
      }
      case "wait":
        if (!this.biter && this.time >= this.waitUntil) {
          // Ein Fisch aus dieser Ebene wird neugierig (nur wer gerade im Bild ist)
          const near = this.fishes.filter((f) => f.mode === "swim" && f.layer === this.targetLayer && f.x > 0.05 && f.x < 0.95);
          if (near.length) {
            const f = near[Math.floor(this.rand() * near.length)];
            f.mode = "approach";
            f.dir = f.x < HOOK_X ? 1 : -1;
            f.nibbles = Math.floor(this.rand() * 3);
            f.modeAt = this.time;
            this.biter = f;
          } else {
            this.waitUntil = this.time + 700;
          }
        }
        break;
      case "bite":
        if (this.time - this.stateAt > BITE_MS) {
          this.flee(this.biter);
          this.setState("wait");
          this.scheduleWait();
          if (this.onMissed) this.onMissed();
        }
        break;
      case "reel": {
        const done = this.reel.update(dt, this.holding);
        this.hook = this.reelFrom * (1 - this.reel.progress);
        if (done === "caught") {
          const f = this.biter;
          const value = this.reel.perfect ? Math.round(f.value * (1 + PERFECT_BONUS)) : f.value;
          this.result = { fish: f.fish, kg: f.kg, size: f.size, value, perfect: this.reel.perfect };
          this.fishes = this.fishes.filter((x) => x !== f);
          this.respawns.push({ layer: f.layer, at: this.time + RESPAWN_MS[0] });
          this.biter = null;
          this.setState("landed");
          if (this.onCatch) this.onCatch(this.result);
        } else if (done) {
          const f = this.biter;
          this.flee(f);
          this.setState("escaped");
          if (this.onEscape) this.onEscape(f, done);
        }
        break;
      }
      case "escaped":
        if (this.time - this.stateAt >= ESCAPE_MS) {
          this.reel = null;
          this.setState("lower");
        }
        break;
      default:
        break;
    }
  };

  // ui.js: Fang ist verbucht -> Haken wieder runter
  FishingSession.prototype.collect = function collect() {
    this.result = null;
    this.reel = null;
    this.setState("lower");
  };

  SL.TensionGame = TensionGame;
  SL.FishingSession = FishingSession;
})();
