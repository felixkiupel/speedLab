// Tages-Schlüssel für alles, was "pro Tag" zählt (Dailys aller Spiele, Serie). Der Tag wechselt
// um Mitternacht Ortszeit - für alle Spiele gleichzeitig.
window.SL = window.SL || {};

SL.Days = (function () {
  const DAY_MS = 86400000;

  // Lokales Datum als Schlüssel "2026-10-14"
  function key(date = new Date()) {
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${date.getFullYear()}-${m}-${d}`;
  }

  function parse(k) {
    const [y, m, d] = k.split("-").map(Number);
    return { y, m, d };
  }

  function shift(k, days) {
    const { y, m, d } = parse(k);
    return key(new Date(y, m - 1, d + days));
  }

  // Abstand in Tagen von a nach b (b später = positiv). Über UTC gerechnet, damit
  // Sommer-/Winterzeit keine halben Tage erzeugt.
  function between(a, b) {
    const pa = parse(a), pb = parse(b);
    return Math.round((Date.UTC(pb.y, pb.m - 1, pb.d) - Date.UTC(pa.y, pa.m - 1, pa.d)) / DAY_MS);
  }

  // "5 Std. 12 Min." bis zu den nächsten Dailys (short: nur "5 Std." bzw. "45 Min.")
  function timeUntilNext(now = new Date(), short = false) {
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const mins = Math.max(1, Math.round((next - now) / 60000));
    const h = Math.floor(mins / 60);
    if (h === 0) return `${mins} Min.`;
    return short ? `${h} Std.` : `${h} Std. ${mins % 60} Min.`;
  }

  return { key, parse, shift, between, timeUntilNext };
})();
