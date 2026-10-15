// Ordner-Links ("games/maze/", "../../") liefert jeder Webserver - auch GitHub Pages - als
// index.html aus. Öffnet man die Seite aber direkt als Datei (Doppelklick -> file://), zeigt der
// Browser dort nur den Ordnerinhalt. Dann hängen wir beim Klick selbst index.html an; online
// bleiben die kurzen URLs.
window.SL = window.SL || {};

if (location.protocol === "file:") {
  const toIndex = (e) => {
    const link = e.target.closest && e.target.closest("a[href]");
    if (!link) return;
    const href = link.getAttribute("href");
    // nur relative Ordner-Links (kein "https:", kein "?"/"#")
    if (/^[^:?#]*\/$/.test(href)) link.setAttribute("href", href + "index.html");
  };
  document.addEventListener("click", toIndex, true);
  document.addEventListener("auxclick", toIndex, true); // Mittelklick = neuer Tab
}
