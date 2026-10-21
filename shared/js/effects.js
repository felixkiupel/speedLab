// Partikel, schwebender Text und Bildschirm-Wackeln fürs Spielfeld - gemeinsam für alle Spiele.
// Positionen in Welt-Pixeln des jeweiligen Spiels; beim Zeichnen rechnet toScreen() sie auf den
// Bildschirm um, damit Effekte mit einer Kamera mitwandern. "enabled" = Einstellung "Effekte";
// schwebender Text (z.B. "Checkpoint!") bleibt auch ohne Effekte, weil er Information ist.
window.SL = window.SL || {};

SL.Effects = function Effects() {
  this.enabled = true;
  this.particles = [];
  this.texts = [];
  this.shakeMs = 0;
  this.shakeTotalMs = 0;
  this.shakePower = 0;
};

const randRange = (min, max) => min + Math.random() * (max - min);

// opts: count, colors, speed [min,max] px/s, life [min,max] ms, size [min,max], gravity px/s²,
//       shape "dot" | "square" | "confetti", spread (Winkel in rad, Standard voller Kreis)
SL.Effects.prototype.burst = function burst(x, y, opts) {
  if (!this.enabled) return;
  const { count = 10, colors = ["#2b2420"], speed = [60, 160], life = [300, 600], size = [2, 4], gravity = 0, shape = "dot", angle = 0, spread = Math.PI * 2 } = opts;
  for (let i = 0; i < count; i++) {
    const a = angle + (Math.random() - 0.5) * spread;
    const v = randRange(speed[0], speed[1]);
    const maxLife = randRange(life[0], life[1]);
    this.particles.push({
      x, y,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v,
      life: maxLife,
      maxLife,
      size: randRange(size[0], size[1]),
      color: colors[Math.floor(Math.random() * colors.length)],
      gravity,
      shape,
      rot: Math.random() * Math.PI,
      spin: randRange(-8, 8),
    });
  }
};

SL.Effects.prototype.text = function text(x, y, label) {
  this.texts.push({ x, y, label, life: 900, maxLife: 900 });
};

SL.Effects.prototype.shake = function shake(power, ms) {
  if (!this.enabled) return;
  this.shakePower = power;
  this.shakeMs = ms;
  this.shakeTotalMs = ms;
};

SL.Effects.prototype.clear = function clear() {
  this.particles = [];
  this.texts = [];
  this.shakeMs = 0;
};

SL.Effects.prototype.update = function update(dtMs) {
  const dt = dtMs / 1000;
  for (const p of this.particles) {
    p.life -= dtMs;
    p.vy += p.gravity * dt;
    p.vx *= 0.985;
    p.vy *= 0.985;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.rot += p.spin * dt;
  }
  this.particles = this.particles.filter((p) => p.life > 0);
  for (const t of this.texts) {
    t.life -= dtMs;
    t.y -= 28 * dt;
  }
  this.texts = this.texts.filter((t) => t.life > 0);
  if (this.shakeMs > 0) this.shakeMs = Math.max(0, this.shakeMs - dtMs);
};

// Zufälliger Versatz, der über die Dauer ausklingt
SL.Effects.prototype.getShakeOffset = function getShakeOffset() {
  if (this.shakeMs <= 0) return { x: 0, y: 0 };
  const k = (this.shakeMs / this.shakeTotalMs) * this.shakePower;
  return { x: (Math.random() * 2 - 1) * k, y: (Math.random() * 2 - 1) * k };
};

// bounds { w, h } (optional): schwebender Text bleibt komplett im Spielfeld (am Rand sonst abgeschnitten)
SL.Effects.prototype.render = function render(ctx, toScreen, bounds) {
  for (const p of this.particles) {
    const [x, y] = toScreen(p.x, p.y);
    ctx.globalAlpha = Math.min(1, (p.life / p.maxLife) * 1.5);
    ctx.fillStyle = p.color;
    if (p.shape === "dot") {
      ctx.beginPath();
      ctx.arc(x, y, p.size, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // "square" und "confetti" (flaches Rechteck, dreht sich)
      const w = p.size * (p.shape === "confetti" ? 1.6 : 1);
      const h = p.size * (p.shape === "confetti" ? 0.8 : 1);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(p.rot);
      ctx.fillRect(-w, -h, w * 2, h * 2);
      ctx.restore();
    }
  }
  ctx.globalAlpha = 1;

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = '700 14px "Segoe UI", system-ui, sans-serif';
  for (const t of this.texts) {
    let [x, y] = toScreen(t.x, t.y);
    ctx.globalAlpha = Math.min(1, (t.life / t.maxLife) * 2);
    const w = ctx.measureText(t.label).width + 16;
    if (bounds) {
      x = Math.max(w / 2 + 4, Math.min(bounds.w - w / 2 - 4, x));
      y = Math.max(16, Math.min(bounds.h - 16, y));
    }
    // Dunkle Pille mit heller Umrandung - so bleibt sie auch vor dunklem Grund (Wände, Land) lesbar
    ctx.fillStyle = "#2b2420";
    ctx.strokeStyle = "#fbf7f0";
    ctx.lineWidth = 4; // die innere Hälfte deckt die Füllung zu -> 2 px Rand wie im CSS
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(x - w / 2, y - 12, w, 24, 12) : ctx.rect(x - w / 2, y - 12, w, 24);
    ctx.stroke();
    ctx.fill();
    ctx.fillStyle = "#fbf7f0";
    ctx.fillText(t.label, x, y + 1);
  }
  ctx.globalAlpha = 1;
};
