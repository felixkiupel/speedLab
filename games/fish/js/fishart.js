// Fische als Pfade - aus den shape-Werten in data.js gebaut. Dieselben Pfade nutzt das
// Canvas (Path2D) und das HTML (SVG im Markt, Fischbuch, Fang-Karte). Koordinaten: Fisch schaut
// nach links, Nase bei x = -50, Schwanzspitze bei x = +50, Mitte y = 0.
window.SL = window.SL || {};

SL.FishArt = (function () {
  const INK = "#2b2420";
  const CREAM = "#fbf7f0";
  const SOFT = "#ddd3c2";
  const f1 = (n) => Math.round(n * 10) / 10;
  const cache = new Map();

  function parts(fish) {
    if (cache.has(fish.id)) return cache.get(fish.id);
    const s = fish.shape;
    const hh = Math.max(5, s.h * 50); // halbe Körperhöhe
    const fh = s.fin * 40; // Höhe der Rückenflosse
    const th = Math.max(hh * 0.9, 12); // halbe Höhe der Schwanzflosse
    const P = (x, y) => `${f1(x)},${f1(y)}`;

    let tail;
    if (s.tail === "fork") tail = `L${P(50, -th)} Q${P(38, 0)} ${P(50, th)} L${P(30, hh * 0.18)}`;
    else if (s.tail === "round") tail = `L${P(44, -th * 0.85)} Q${P(56, 0)} ${P(44, th * 0.85)} L${P(30, hh * 0.18)}`;
    else if (s.tail === "fan") tail = `L${P(54, -th * 1.35)} Q${P(42, 0)} ${P(54, th * 1.35)} L${P(30, hh * 0.18)}`;
    else tail = `Q${P(44, -hh * 0.1)} ${P(50, 0)} Q${P(44, hh * 0.1)} ${P(30, hh * 0.18)}`; // Aal: läuft spitz aus

    const body = `M${P(-50, 0)} C${P(-46, -hh * 0.9)} ${P(-10, -hh * 1.05)} ${P(12, -hh * 0.75)}`
      + ` C${P(20, -hh * 0.55)} ${P(26, -hh * 0.3)} ${P(30, -hh * 0.18)} ${tail}`
      + ` C${P(26, hh * 0.3)} ${P(20, hh * 0.5)} ${P(12, hh * 0.7)}`
      + ` C${P(-10, hh * 1.0)} ${P(-46, hh * 0.8)} ${P(-50, 0)} Z`;
    const fin = s.tail === "eel"
      ? `M${P(-30, -hh * 0.9)} Q${P(10, -hh - fh - 4)} ${P(46, -2)} L${P(30, -hh * 0.2)} Z`
      : `M${P(-16, -hh * 0.97)} Q${P(-6, -hh - fh * 1.1)} ${P(14, -hh * 0.72)} Z`
        + ` M${P(-6, hh * 0.86)} Q${P(0, hh + fh * 0.45)} ${P(8, hh * 0.7)} Z`;
    const nose = s.nose ? `M${P(-49, -1.6)} L${P(-50 - s.nose * 100, 0)} L${P(-49, 1.6)} Z` : "";

    // Zeichnung auf dem Körper (hell): Kiemenbogen + Muster
    let marks = `M${P(-30, -hh * 0.5)} Q${P(-24, 0)} ${P(-30, hh * 0.5)}`;
    if (s.marks === "bands") for (const x of [-14, -2, 10]) marks += ` M${P(x, -hh * 0.75)} L${P(x + 2, hh * 0.45)}`;
    if (s.marks === "wave") marks += ` M${P(-22, -hh * 0.35)} q${P(6, -4)} ${P(12, 0)} t${P(12, 0)} t${P(12, 0)} t${P(10, 0)}`;
    const dots = s.marks === "dots" ? [[-14, -hh * 0.4], [-4, -hh * 0.1], [6, -hh * 0.45], [14, -hh * 0.05], [-8, hh * 0.3]] : [];

    const eye = { x: -37, y: -hh * 0.18, r: Math.max(2.4, Math.min(5, hh * 0.2)) };
    const left = -52 - (s.nose ? s.nose * 100 : 0);
    const top = -hh - fh - 6;
    const bottom = hh + fh * 0.5 + 6;
    const box = { x: left, y: top, w: 58 - left, h: bottom - top };
    const p = { body, fin, nose, marks, dots, eye, box };
    cache.set(fish.id, p);
    return p;
  }

  // ---------- HTML ----------

  // known = false: nur graue Silhouette (Fischbuch, noch nicht gefangen)
  function svg(fish, known = true) {
    const p = parts(fish);
    const v = `${f1(p.box.x)} ${f1(p.box.y)} ${f1(p.box.w)} ${f1(p.box.h)}`;
    const color = known ? INK : SOFT;
    let inner = `<path d="${p.body} ${p.fin} ${p.nose}" fill="${color}"/>`;
    if (known) {
      inner += `<path d="${p.marks}" fill="none" stroke="${CREAM}" stroke-width="2" stroke-linecap="round" opacity="0.7"/>`;
      inner += p.dots.map(([x, y]) => `<circle cx="${f1(x)}" cy="${f1(y)}" r="2" fill="${CREAM}" opacity="0.7"/>`).join("");
      inner += `<circle cx="${p.eye.x}" cy="${f1(p.eye.y)}" r="${f1(p.eye.r)}" fill="${CREAM}"/>`;
      inner += `<circle cx="${f1(p.eye.x - p.eye.r * 0.2)}" cy="${f1(p.eye.y)}" r="${f1(p.eye.r * 0.5)}" fill="${INK}"/>`;
    }
    return `<svg class="fish-art" viewBox="${v}" aria-hidden="true">${inner}</svg>`;
  }

  // ---------- Canvas ----------

  const paths = new Map();
  function path2d(fish) {
    if (!paths.has(fish.id)) {
      const p = parts(fish);
      paths.set(fish.id, {
        body: new Path2D(`${p.body} ${p.fin} ${p.nose}`),
        marks: new Path2D(p.marks),
      });
    }
    return paths.get(fish.id);
  }

  // Fisch der Länge len (px) mit Mitte bei x/y. opts: flip (schaut nach rechts), alpha,
  // detail (Auge + Muster), wiggle (Schwanzschlag, Radiant)
  function draw(ctx, fish, x, y, len, opts = {}) {
    const p = parts(fish);
    const pp = path2d(fish);
    const k = len / 100;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(opts.flip ? -k : k, k);
    if (opts.wiggle) ctx.rotate(opts.wiggle);
    ctx.globalAlpha *= opts.alpha ?? 1;
    ctx.fillStyle = INK;
    ctx.fill(pp.body);
    if (opts.detail) {
      ctx.strokeStyle = CREAM;
      ctx.globalAlpha *= 0.7;
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.stroke(pp.marks);
      ctx.fillStyle = CREAM;
      for (const [dx, dy] of p.dots) {
        ctx.beginPath();
        ctx.arc(dx, dy, 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha /= 0.7;
      ctx.beginPath();
      ctx.arc(p.eye.x, p.eye.y, p.eye.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = INK;
      ctx.beginPath();
      ctx.arc(p.eye.x - p.eye.r * 0.2, p.eye.y, p.eye.r * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  return { svg, draw };
})();
