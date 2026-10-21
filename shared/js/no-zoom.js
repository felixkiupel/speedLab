// Kein Reinzoomen auf speedLab - weder per Doppeltipp (passiert beim schnellen Tippen in den Spielen
// und am Automaten) noch mit zwei Fingern. Drei Teile, weil jeder Browser einen anderen beachtet:
//   - viewport-Meta jeder Seite (maximum-scale=1, user-scalable=no): Android
//   - touch-action: manipulation auf <html> (base.css): Doppeltipp-Zoom, auch auf dem iPhone
//   - hier: Safari auf dem iPhone ignoriert user-scalable=no - Zwei-Finger-Gesten fangen wir ab
document.addEventListener("gesturestart", (e) => e.preventDefault(), { passive: false });
document.addEventListener("gesturechange", (e) => e.preventDefault(), { passive: false });
document.addEventListener("touchmove", (e) => {
  if (e.touches.length > 1) e.preventDefault();
}, { passive: false });
