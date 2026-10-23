// Kampf-Simulation ohne DOM: Ablauf des Bosses (Kombos), die Figur (ausweichen, ducken,
// zuschlagen) und wer wen trifft. Die Spielzeit (time, ms) läuft nur über update(dt) - Pause heißt
// einfach: kein update. Trefferstopp (hitstop) hält die Zeit kurz an, damit Treffer "sitzen".
// ui.js setzt die Hooks (onXyz) für Töne, Effekte und Anzeigen.
//
// Regeln:
// - Der Boss holt aus (windup, die Zone wird markiert), schlägt zu (strike) und trifft am Ende des
//   Schlags alles, was in der Zone steht. Nach der letzten Faust einer Kombo ist er offen (open).
// - Zuschlagen trifft nur, wenn der Boss offen ist: nach einer Kombo, kurz nachdem eine Faust
//   feststeckt (Angriffe mit opens) oder nach einem perfekten Ausweichen. Sonst blockt er und
//   kontert - während des Zuschlagens kann man nicht ausweichen, also kostet das ein Leben.
// - Schläge im Takt bilden eine Kette: Gerade, Gerade, Aufwärtshaken (3 Schaden).
// - Perfekt ausweichen = erst ganz knapp vor dem Einschlag: bricht die Kombo ab, Boss ist offen.
// - Ab halber Energie wird der Boss wütend (SL.BOSS.phases[1]). Läuft die Rundenuhr ab: verloren.
window.SL = window.SL || {};

(function () {
  // Figur. Ausweichen: rein - halten - zurück.
  const DODGE = { in: 45, hold: 230, out: 80 };
  const DODGE_MS = DODGE.in + DODGE.hold + DODGE.out;
  const PUNCHES = [
    { kind: "jab", hit: 70, total: 190, damage: 1, hitstop: 45 },
    { kind: "jab", hit: 70, total: 190, damage: 1, hitstop: 45 },
    { kind: "upper", hit: 110, total: 320, damage: 3, hitstop: 110 },
  ];
  const CHAIN_MS = 280; // so lange nach dem Ende eines Treffers geht die Kette weiter
  const BUFFER_MS = 120; // Druck kurz vor Ende des Zuschlagens wird gemerkt und danach ausgeführt
  const HIT_STUN_MS = 380;
  const INVULN_MS = 900;
  const PERFECT_MS = 140; // höchstens so knapp vor dem Einschlag ausgewichen = perfekt
  const PERFECT_OPEN_MS = 950;
  const HITSTOP = { hurt: 130, perfect: 120 };

  // Boss
  const INTRO_MS = 1600; // "RUNDE 1" ... "LOS!"
  const GUARD_MS = 420; // Deckung zwischen zwei Kombos
  const STRIKE_MS = 90; // Faust fliegt
  const GLINT_LEAD = 320; // so lange vor dem Einschlag blitzt das Auge auf
  const STUCK_MS = 260; // länger offen, wenn die Faust feststeckt (opens)
  const COUNTER_MS = 170; // geblockt -> Konter trifft nach so vielen ms
  const ROAR_MS = 900; // wird wütend
  const DOWN_MS = 1700; // K.o. -> Ergebnis
  const LOST_MS = 1500; // keine Leben / Zeit um -> Ergebnis

  SL.DUEL = { PUNCHES, STRIKE_MS, GLINT_LEAD };

  const easeOut = (t) => 1 - (1 - t) * (1 - t);
  const clamp01 = (t) => Math.max(0, Math.min(1, t));

  function DuelSession(boss) {
    this.boss = boss;
    this.time = 0;
    this.step = 0; // um wie viel die Zeit im letzten update vorgerückt ist (für den Renderer)
    this.hitstop = 0;
    this.started = false;
    this.finished = false;
    this.endAt = null; // Kampf entschieden, Ergebnis kommt zu dieser Zeit
    this.endReason = null; // "ko" | "lost" | "time"
    this.hearts = boss.hearts;
    this.bossHp = boss.hp;
    this.rage = false;
    this.stats = { landed: 0, blocked: 0, hitsTaken: 0, perfects: 0, maxCombo: 0 };
    this.combo = 0; // Treffer am Stück
    this.lastHit = null; // { at, kind, damage }
    this.lastPerfectAt = -Infinity;
    this.lastHurtAt = -Infinity;
    // action: idle | dodge | attack | hit. dir (bei dodge): L | R | D. punch = Index in PUNCHES
    this.player = { action: "idle", start: 0, dir: null, fromX: 0, resolved: false, punch: 0 };
    this.chain = { next: 0, until: -Infinity };
    this.buffered = null;
    this.invulnUntil = -Infinity;
    this.lastComboIndex = -1;
    // phase: wait | intro | guard | windup | strike | recover | open | counter | roar | down | taunt
    this.fight = { phase: "wait", start: 0, dur: Infinity, combo: null, step: 0, key: null, attack: null, glinted: false };
  }

  DuelSession.prototype.phaseCfg = function phaseCfg() {
    return this.boss.phases[this.rage ? 1 : 0];
  };

  DuelSession.prototype.timeLeft = function timeLeft() {
    const fightTime = Math.max(0, this.time - INTRO_MS);
    return Math.max(0, this.boss.roundMs - fightTime);
  };

  // ---------- Figur ----------

  DuelSession.prototype.actionEnd = function actionEnd() {
    const p = this.player;
    if (p.action === "dodge") return p.start + DODGE_MS;
    if (p.action === "attack") return p.start + PUNCHES[p.punch].total;
    if (p.action === "hit") return p.start + HIT_STUN_MS;
    return -Infinity;
  };

  // Wo die Figur zur Zeit at ist: x -1..1 (links..rechts), duck 0..1, lunge 0..1 (nach vorn beim
  // Zuschlagen), recoil 0..1 (zurückgeworfen nach einem Treffer)
  DuelSession.prototype.pose = function pose(at = this.time) {
    const p = this.player;
    const t = at - p.start;
    const out = { x: 0, duck: 0, lunge: 0, recoil: 0, punch: null };
    if (t < 0) return out;
    if (p.action === "dodge") {
      const target = p.dir === "L" ? -1 : p.dir === "R" ? 1 : 0;
      let k;
      if (t < DODGE.in) k = easeOut(t / DODGE.in);
      else if (t < DODGE.in + DODGE.hold) k = 1;
      else k = 1 - easeOut(clamp01((t - DODGE.in - DODGE.hold) / DODGE.out));
      // Rein: von der alten Position zum Ziel, zurück: vom Ziel in die Mitte
      out.x = t < DODGE.in ? p.fromX + (target - p.fromX) * k : target * k;
      if (p.dir === "D") out.duck = k;
    } else if (p.action === "attack") {
      const punch = PUNCHES[p.punch];
      out.punch = punch.kind;
      out.x = p.fromX * (1 - easeOut(clamp01(t / 60)));
      out.lunge = t < punch.hit ? easeOut(t / punch.hit) : 1 - clamp01((t - punch.hit) / (punch.total - punch.hit));
    } else if (p.action === "hit") {
      out.x = p.fromX * (1 - easeOut(clamp01(t / 160)));
      out.recoil = 1 - clamp01(t / HIT_STUN_MS);
    }
    return out;
  };

  // Stelle für die Treffer-Prüfung: L / C / R oder D (geduckt in der Mitte)
  DuelSession.prototype.zone = function zone() {
    const pose = this.pose();
    if (pose.duck >= 0.5) return "D";
    if (pose.x <= -0.5) return "L";
    if (pose.x >= 0.5) return "R";
    return "C";
  };

  // input: N = zuschlagen, W/E = nach links/rechts ausweichen, S = ducken
  DuelSession.prototype.press = function press(input) {
    if (this.finished || this.endAt != null) return;
    if (!this.started) {
      this.started = true;
      this.setPhase("intro", INTRO_MS);
      if (this.onStart) this.onStart();
      return;
    }
    if (this.fight.phase === "intro") return;
    const p = this.player;
    // Beim Zuschlagen und nach einem Treffer ist man festgelegt - nur kurz vor Ende merken
    if ((p.action === "attack" || p.action === "hit") && this.actionEnd() > this.time) {
      if (this.actionEnd() - this.time <= BUFFER_MS) this.buffered = input;
      return;
    }
    this.startAction(input);
  };

  DuelSession.prototype.startAction = function startAction(input) {
    const p = this.player;
    const fromX = this.pose().x; // von der aktuellen Position aus, damit ein Wechsel nicht springt
    if (input === "N") {
      const punch = this.time <= this.chain.until ? this.chain.next : 0;
      Object.assign(p, { action: "attack", start: this.time, dir: null, fromX, resolved: false, punch });
      if (this.onSwing) this.onSwing(PUNCHES[punch].kind);
    } else {
      const dir = input === "W" ? "L" : input === "E" ? "R" : "D";
      Object.assign(p, { action: "dodge", start: this.time, dir, fromX });
      if (this.onDodge) this.onDodge(dir);
    }
  };

  DuelSession.prototype.isBossOpen = function isBossOpen() {
    const f = this.fight;
    return f.phase === "open" || (f.phase === "recover" && f.attack.opens);
  };

  // Der Moment, in dem der eigene Schlag ankommt
  DuelSession.prototype.resolveSwing = function resolveSwing() {
    const f = this.fight;
    const p = this.player;
    if (f.phase === "down" || this.endAt != null) return;
    const punch = PUNCHES[p.punch];
    if (this.isBossOpen()) {
      this.bossHp = Math.max(0, this.bossHp - punch.damage);
      this.stats.landed++;
      this.combo++;
      this.stats.maxCombo = Math.max(this.stats.maxCombo, this.combo);
      this.lastHit = { at: this.time, kind: punch.kind, damage: punch.damage };
      this.hitstop += punch.hitstop;
      this.chain = { next: (p.punch + 1) % PUNCHES.length, until: p.start + punch.total + CHAIN_MS };
      if (this.onBossHit) this.onBossHit(punch.kind, this.combo);
      if (this.bossHp <= 0) {
        this.setPhase("down", Infinity);
        this.endAt = this.time + DOWN_MS;
        this.endReason = "ko";
        if (this.onBossDown) this.onBossDown();
      }
    } else {
      this.stats.blocked++;
      this.combo = 0;
      this.chain = { next: 0, until: -Infinity };
      this.setPhase("counter", COUNTER_MS);
      if (this.onBlocked) this.onBlocked();
    }
  };

  DuelSession.prototype.hurtPlayer = function hurtPlayer() {
    const p = this.player;
    const fromX = this.pose().x;
    this.hearts--;
    this.stats.hitsTaken++;
    this.combo = 0;
    this.chain = { next: 0, until: -Infinity };
    this.invulnUntil = this.time + INVULN_MS;
    this.lastHurtAt = this.time;
    this.hitstop += HITSTOP.hurt;
    this.buffered = null;
    Object.assign(p, { action: "hit", start: this.time, dir: null, fromX });
    if (this.onPlayerHit) this.onPlayerHit(this.hearts);
    if (this.hearts <= 0) this.lose("lost");
  };

  DuelSession.prototype.lose = function lose(reason) {
    this.setPhase("taunt", Infinity);
    this.endAt = this.time + LOST_MS;
    this.endReason = reason;
    if (this.onLose) this.onLose(reason);
  };

  // ---------- Boss ----------

  DuelSession.prototype.setPhase = function setPhase(phase, dur, start = this.time) {
    Object.assign(this.fight, { phase, start, dur });
  };

  // Nächste Kombo: die erste jeder Stufe ist die einfachste (Liste vorne), danach zufällig, aber
  // nie zweimal dieselbe hintereinander
  DuelSession.prototype.startCombo = function startCombo(at) {
    const combos = this.phaseCfg().combos;
    let index = 0;
    if (this.lastComboIndex >= 0) {
      index = Math.floor(Math.random() * (combos.length - 1));
      if (index >= this.lastComboIndex) index++;
    }
    this.lastComboIndex = index;
    this.fight.combo = combos[index];
    this.fight.step = 0;
    this.startWindup(at);
  };

  DuelSession.prototype.startWindup = function startWindup(at) {
    const f = this.fight;
    f.key = f.combo[f.step];
    f.attack = SL.ATTACKS[f.key];
    f.glinted = false;
    this.setPhase("windup", Math.round(this.phaseCfg().windupMs * f.attack.windup), at);
    if (this.onWindup) this.onWindup(f.key, f.attack);
  };

  // Einschlag: trifft die Figur, wenn sie in der Zone steht. Wer knapp vorher ausgewichen ist,
  // weicht perfekt aus - die Kombo bricht ab und der Boss ist offen.
  DuelSession.prototype.impact = function impact(end) {
    const f = this.fight;
    const p = this.player;
    const hit = f.attack.hits.includes(this.zone()) && this.time >= this.invulnUntil;
    if (hit) {
      this.hurtPlayer();
      if (this.onImpact) this.onImpact(f.key, f.attack, true);
      if (this.endAt != null) return;
    } else {
      const perfect = p.action === "dodge" && end - p.start <= PERFECT_MS && f.attack.hits.includes("C");
      if (this.onImpact) this.onImpact(f.key, f.attack, false);
      if (perfect) {
        this.stats.perfects++;
        this.lastPerfectAt = this.time;
        this.hitstop += HITSTOP.perfect;
        this.setPhase("open", PERFECT_OPEN_MS, end);
        if (this.onPerfect) this.onPerfect();
        return;
      }
    }
    const extra = f.attack.opens ? STUCK_MS : 0;
    if (f.step < f.combo.length - 1) {
      this.setPhase("recover", this.phaseCfg().gapMs + extra, end);
    } else {
      this.setPhase("open", this.phaseCfg().openMs + extra, end);
      if (this.onOpen) this.onOpen();
    }
  };

  DuelSession.prototype.advanceBoss = function advanceBoss() {
    const f = this.fight;
    // Augenblitzen kurz vor dem Einschlag - das Zeichen zum Ausweichen
    if (f.phase === "windup" && !f.glinted && this.time >= f.start + f.dur + STRIKE_MS - GLINT_LEAD) {
      f.glinted = true;
      if (this.onGlint) this.onGlint();
    }
    while (this.time >= f.start + f.dur) {
      const end = f.start + f.dur;
      switch (f.phase) {
        case "intro":
          this.setPhase("guard", GUARD_MS, end);
          if (this.onFight) this.onFight();
          break;
        case "guard":
          this.startCombo(end);
          break;
        case "windup":
          this.setPhase("strike", STRIKE_MS, end);
          if (this.onStrike) this.onStrike(f.key, f.attack);
          break;
        case "strike":
          this.impact(end);
          if (this.endAt != null) return;
          break;
        case "recover":
          f.step++;
          this.startWindup(end);
          break;
        case "open":
          this.combo = 0;
          // Unter halber Energie: erst brüllen, dann wütend weiter
          if (!this.rage && this.bossHp <= this.boss.hp * this.boss.rageAt) {
            this.rage = true;
            this.lastComboIndex = -1;
            this.setPhase("roar", ROAR_MS, end);
            if (this.onRage) this.onRage();
          } else {
            this.setPhase("guard", GUARD_MS, end);
          }
          break;
        case "roar":
          this.setPhase("guard", GUARD_MS, end);
          break;
        case "counter":
          // Der Konter trifft die Mitte - wer gerade zuschlägt, steht genau da
          if (this.time >= this.invulnUntil) this.hurtPlayer();
          if (this.endAt != null) return;
          this.setPhase("guard", GUARD_MS, end);
          break;
        default:
          return;
      }
    }
  };

  DuelSession.prototype.update = function update(dt) {
    this.step = 0;
    if (this.finished || !this.started) return;
    // Trefferstopp frisst die Zeit zuerst
    if (this.hitstop > 0) {
      const used = Math.min(dt, this.hitstop);
      this.hitstop -= used;
      dt -= used;
      if (dt <= 0) return;
    }
    this.time += dt;
    this.step = dt;
    const p = this.player;
    if (p.action === "attack" && !p.resolved && this.time - p.start >= PUNCHES[p.punch].hit) {
      p.resolved = true;
      this.resolveSwing();
    }
    if (p.action !== "idle" && this.time >= this.actionEnd()) {
      p.action = "idle";
      if (this.buffered && this.endAt == null) {
        const input = this.buffered;
        this.buffered = null;
        this.startAction(input);
      }
    }
    this.advanceBoss();
    if (this.endAt == null && this.fight.phase !== "intro" && this.timeLeft() <= 0) this.lose("time");
    if (this.endAt != null && this.time >= this.endAt) this.finish();
  };

  DuelSession.prototype.finish = function finish() {
    this.finished = true;
    const won = this.endReason === "ko";
    this.result = {
      won,
      reason: this.endReason,
      stars: won ? this.hearts : 0, // jedes behaltene Leben ist ein Stern
      hearts: this.hearts,
      timeMs: Math.max(0, this.time - INTRO_MS),
      bossHpLeft: this.bossHp,
      ...this.stats,
    };
    if (this.onFinish) this.onFinish(this.result);
  };

  // Fortschritt der aktuellen Boss-Phase 0..1 (für die Markierung und die Fäuste)
  DuelSession.prototype.phaseProgress = function phaseProgress() {
    const f = this.fight;
    return Number.isFinite(f.dur) ? clamp01((this.time - f.start) / f.dur) : 0;
  };

  SL.DuelSession = DuelSession;
})();
