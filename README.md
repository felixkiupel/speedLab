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
shared/               Gemeinsam für alle Seiten
  css/base.css        Farben, Schrift, Buttons, Logo, Figur
  js/profile.js       Coins + Daily-Serie (spielübergreifend)
  js/days.js          Tages-Schlüssel (Tageswechsel um Mitternacht Ortszeit)
  js/games.js         Liste aller Spiele für die Startseite
  js/links.js         Ordner-Links funktionieren auch beim Öffnen als Datei
games/maze/           Das Labyrinth-Spiel
  index.html, css/, js/
  preview.svg         Kachelbild auf der Startseite
  tools/              Hilfsskripte (npm run seeds, npm run maze-preview)
```

## Speicherstand

Alles liegt im `localStorage` des Browsers, jeweils mit dem Präfix `speedlab_`:

- `speedlab_profile_v1` – Coins und Daily-Serie, gilt für alle Spiele
- `speedlab_<spiel>_v1` – Fortschritt und Einstellungen eines Spiels (z. B. `speedlab_maze_v1`)

## Neues Spiel hinzufügen

1. Ordner `games/<id>/` mit eigener `index.html` anlegen.
2. Dort `../../shared/css/base.css` und die Skripte `links.js`, `days.js` und `profile.js` aus
   `../../shared/js/` einbinden.
3. Coins über `SL.Profile.coins()`, `SL.Profile.addCoins(n)` und `SL.Profile.spend(n)`.
4. Geschafftes Daily melden: `SL.Profile.completeDaily("<id>")` – liefert `{ firstForGame, streak }`.
5. Eintrag in `shared/js/games.js` (Name, Spruch, Vorschaubild) – dann erscheint die Kachel.
6. Zurück zur Startseite: `<a href="../../">`.

## Veröffentlichen (GitHub Pages)

Im Repo unter **Settings → Pages** „Deploy from a branch“ mit `main` und `/ (root)` wählen. Alle
Pfade sind relativ, `.nojekyll` liegt schon bereit.
