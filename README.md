# speedLab

Kleine Browser-Spiele mit gemeinsamen Coins und einer täglichen Serie. Läuft komplett im Browser –
kein Server, kein Build-Schritt.

## Lokal starten

```bash
npm run dev
```

Danach <http://localhost:5173> öffnen.

## Ordner

```
index.html            Startseite (Spieleauswahl, Coins, Daily-Serie)
hub/                  Styles + Logik der Startseite
shop/                 Shop-Seite: Skin und Spur der Figur für alle Spiele, alles frei
                      (Knopf im Menü jedes Spiels)
shared/               Gemeinsam für alle Seiten
  css/base.css        Farben, Schrift, Buttons, Logo, Figur (Startseite + Spiele)
  css/game.css        Aufbau jeder Spielseite: Menü, Level-Auswahl, HUD, Pause, Ergebnis,
                      Daily-Karte, Einstellungen, Toast
  js/profile.js       Coins, Daily-Serie, ausgerüsteter Look (spielübergreifend)
  js/cosmetics.js     Katalog des Shops: Standard-Skin + je Spiel eine Spur, Ausrüsten
  js/cosmetics-draw.js  Figur und Spuren zeichnen (Shop und Spiele)
  js/days.js          Tages-Schlüssel (Tageswechsel um Mitternacht Ortszeit)
  js/games.js         Liste aller Spiele für die Startseite
  js/links.js         Ordner-Links funktionieren auch beim Öffnen als Datei
  js/rng.js           Zufall mit Seed (gleicher Seed = gleiches Level)
  js/audio.js         Ton-Engine, gemeinsame Töne (Klick, Coin, Sterne, Ziel ...) und Vibration
  js/effects.js       Partikel, schwebender Text, Wackeln
  js/settings.js      Einstellungs-Fenster (Töne, Lautstärke, Vibration, Effekte + eigene Zeilen)
games/maze/           Das Labyrinth-Spiel
  index.html, css/, js/
  preview.svg         Kachelbild auf der Startseite
  tools/              Hilfsskripte (npm run seeds, npm run maze-preview)
games/drift/          Das Eis-Rutsch-Puzzle
  index.html, css/, js/
  preview.svg         Kachelbild auf der Startseite
  tools/level-gen.js  Erzeugt die Level-Karten (npm run drift-levels)
games/leap/           Das Timing-Sprungspiel
  index.html, css/, js/
  preview.svg         Kachelbild auf der Startseite
  tools/course-check.js  Prüft alle Strecken per Simulation (npm run leap-check)
tools/stamp.js        Versions-Hashes an alle Skripte/Styles in den HTML-Seiten (npm run stamp)
```

## Speicherstand

Alles liegt im `localStorage` des Browsers, jeweils mit dem Präfix `speedlab_`:

- `speedlab_profile_v1` – Coins, Daily-Serie und der im Shop ausgerüstete Look, gilt für alle Spiele
- `speedlab_<spiel>_v1` – Fortschritt und Einstellungen eines Spiels (z. B. `speedlab_maze_v1`)

## Neues Spiel hinzufügen

Am einfachsten: `games/leap/` kopieren (das jüngste Spiel) und den Spielteil austauschen.

1. Ordner `games/<id>/` mit eigener `index.html` anlegen.
2. Dort `../../shared/css/base.css` und `../../shared/css/game.css` einbinden, danach das eigene
   `css/style.css` – darin steht nur, was es nur in diesem Spiel gibt (Spielfeld, Hinweise ...).
3. Skripte aus `../../shared/js/`: `links.js`, `days.js`, `profile.js`, dazu nach Bedarf `rng.js`,
   `audio.js`, `effects.js`, `settings.js`. Die HTML-Bausteine (Menü, Ergebnis, Einstellungen ...)
   übernimmt man aus einem bestehenden Spiel – dann sehen sie automatisch gleich aus.
4. Eigene Töne in `js/sounds.js` mit `SL.Audio.add({ name() { ... } })` anmelden.
5. Einstellungen: Das Fenster hat Töne, Lautstärke, Vibration und Effekte; eine eigene Zeile ist
   ein `<button class="toggle" data-setting="...">` – `settings.js` findet sie von selbst. Der
   Speicherstand des Spiels braucht dafür ein `SL.Storage` mit `save(state)` und `reset()`.
6. Tipp-Steuerung fürs Handy (optional): `.tap-pad` > `.tap-field` > `.tap-btn` – Fläche und Optik
   der schwarzen Knöpfe kommen aus `game.css`, Anzahl, Größe und Position legt das Spiel fest
   (Maze: Raute aus vier, Leap: einer in der Mitte).
7. Coins über `SL.Profile.coins()`, `SL.Profile.addCoins(n)` und `SL.Profile.spend(n)`. Belohnung
   für ein Level wie in allen Spielen: `SL.Profile.levelPay(preisDesNächstenLevels, sterne)` plus
   jeder eingesammelte Coin 1:1 (3 Sterne reichen direkt fürs nächste Level, 2 Sterne nach zwei
   Läufen, 1 Stern nach drei).
8. Shop: `cosmetics.js` und `cosmetics-draw.js` einbinden. Die Figur mit
   `SL.CosmeticsDraw.drawFigure(...)` zeichnen, die Spur mit
   `SL.CosmeticsDraw.drawTrail(ctx, punkte, radius, SL.Cosmetics.trailFor("<id>"))`. Die eigene Spur
   des Spiels ist eine Zeile in `TRAILS` (`cosmetics.js`, mit `game: "<id>"`) - so taucht sie auch
   im Shop auf und lässt sich in allen Spielen ausrüsten.
9. Geschafftes Daily melden: `SL.Profile.completeDaily("<id>")` – liefert `{ firstForGame, streak }`.
   Beim ersten Mal am Tag gibt es `SL.Profile.dailyBonus(sterne, streak)` Coins.
10. Eintrag in `shared/js/games.js` (Name, Spruch, Vorschaubild) – dann erscheint die Kachel.
11. Zurück zur Startseite: `<a href="../../">`.

## Veröffentlichen (GitHub Pages)

Im Repo unter **Settings → Pages** „Deploy from a branch“ mit `main` und `/ (root)` wählen. Alle
Pfade sind relativ, `.nojekyll` liegt schon bereit.

**Vor jedem Commit `npm run stamp`.** GitHub Pages lässt Browser jede Datei 10 Minuten aus dem Cache
nehmen – nach einem Update kann ein Handy sonst neue und alte Skripte mischen, und ein Spiel startet
nicht mehr. `stamp` hängt an jede eingebundene `.js`/`.css` einen Hash ihres Inhalts
(`ui.js?v=1a2b3c4d`); geänderte Dateien bekommen so eine neue Adresse und werden garantiert frisch
geladen. Nebenbei meldet es Pfade mit falscher Groß-/Kleinschreibung (unter Windows egal, online
nicht). `npm run stamp -- --check` prüft nur.
