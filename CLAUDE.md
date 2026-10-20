# speedLab – Projektübersicht für Claude

Kurzkarte des Projekts, damit nicht jede Sitzung alles neu lesen muss. Ordnerbaum, Speicherstand
und "Neues Spiel hinzufügen" stehen in der README – hier nur, was man zum Arbeiten am Code braucht.
**Bei größeren Änderungen (neue Datei, neues Spiel, neue Spielmechanik) diese Datei mitpflegen.**

## Grundregeln

- Nutzer schreibt Deutsch, UI-Texte und Code-Kommentare sind Deutsch.
- Reines Vanilla-JS ohne Build, ohne Module: jede Datei hängt ihre API an `window.SL`, die
  Reihenfolge der `<script>`-Tags in `index.html` ist die Abhängigkeitsreihenfolge.
  Achtung: Top-Level-`const` aller Skripte einer Seite teilen sich einen Scope – gleicher Name in
  zwei Dateien desselben Spiels = SyntaxError. ui.js-Dateien sind IIFEs (`SL.UI = (function(){…})()`).
- `shared/` nur für Code, der in mehreren Spielen wirklich identisch ist – kein halb geteilter
  Flickenteppich. Renderer, Storage, Economy, ui.js bleiben pro Spiel.
- Coins + Daily-Serie global (`SL.Profile`, `speedlab_profile_v1`), alles andere pro Spiel
  (`speedlab_<id>_v1`). Alle Pfade relativ (später GitHub Pages).
- **Coin-Regel (Wunsch des Nutzers, gilt für alle Spiele):** Level-Belohnung =
  `SL.Profile.levelPay(SL.levelUnlockCost(id + 1), sterne)` + eingesammelte Coins 1:1.
  3 Sterne = Preis des nächsten Levels + 2 (reicht direkt), 2 Sterne = 55 % (zwei Läufe nötig),
  1 Stern = 35 % (drei Läufe). Keine Einmal-Boni. Tagesbonus klein: `dailyBonus` = 10/Stern +
  Serie (max. 10). Freischalten soll eine Herausforderung bleiben – keine neuen Coin-Quellen
  ohne Rücksprache.
- Strecken/Karten ändern → `SL.LEVEL_SET_VERSION` in `levels.js` erhöhen (alte Bestwerte verfallen).
- Kein Test-Framework. Prüfen per Node-Tool (siehe unten) und im Browser.

## Starten & im Browser prüfen

- Dev-Server: `.claude/launch.json` → `speedlab-server` (http-server, Port 5173, kein Cache).
- Im Browser-Pane mit `navigate` (mit `tabId`) auf die volle URL gehen, z.B.
  `http://localhost:5173/games/drift/index.html` – ein `browser_batch` mit Ordner-URL wurde abgelehnt.
- Schnell ins Spiel: per `javascript_tool` `document.getElementById("btn-play").click()` und dann
  eine `.level-tile[data-level="N"]` klicken. Drift startet beim ersten Mal ins Tutorial.

## Shared (`shared/`)

| Datei | Inhalt |
|---|---|
| `css/base.css` | Farben (`--ink`, `--bg`, `--border` …), Schrift, Buttons, Logo, Figur |
| `css/game.css` | Gemeinsames Spielseiten-Gerüst: Menü, Level-Auswahl, HUD, Pause, Ergebnis, Daily-Karte, Einstellungen, Toast, `.canvas-wrap/.canvas-frame`, Tipp-Steuerung |
| `js/profile.js` | `SL.Profile`: `coins() addCoins() spend() levelPay() dailyBonus() completeDaily(id,key) streak() bestStreak() dailiesOn()`, Shop-Besitz (`ownedCosmetics buyCosmetic equipCosmetic refundCosmetics`), Aufgaben (`questDone completeQuest`), `onChange()` – liest/schreibt jedes Mal frisch |
| `js/quests.js` | `SL.QUESTS` (id, text, optional `check()` fürs Profil) + `SL.Quests`: `get isDone complete sync`. Spiel-Aufgaben meldet jedes Spiel in `economy.js → checkQuests(state)` (beim Start + nach jedem Ergebnis, aus dem Spielstand → zählt rückwirkend). |
| `js/days.js` | `SL.Days`: Tages-Schlüssel `YYYY-MM-DD`, `between`, `parse`, `timeUntilNext` |
| `js/rng.js` | `SL.createRng(seed)` (mulberry32) |
| `js/audio.js` | `SL.Audio` (Web-Audio-Engine + gemeinsame Töne, `add/play/tone/noise/ensure`), `SL.Haptics.vibrate` |
| `js/effects.js` | `SL.Effects`: `burst text shake clear update render(ctx,toScreen,bounds)`, `enabled` |
| `js/settings.js` | Einstellungs-Overlay, liest Zeilen aus dem HTML (`data-setting`) |
| `js/games.js` | `SL.GAMES` – Kacheln der Startseite |
| `js/links.js` | Ordner-Links auch bei `file://` |
| `js/cosmetics.js` | Katalog: Listen `SKINS`/`TRAILS` (je Item `rarity`, `quest`, Muster/Stil) → `SL.COSMETIC_TYPES`, `SL.COSMETICS`; `SL.RARITIES` (Preis je Seltenheit, `secret` = Aufgabe im Shop verborgen: Legendär, Mythisch); `RETIRED` = ausgemusterte IDs, Käufer bekommen Coins zurück. `SL.Cosmetics`: `owns isUnlocked isSecret equipped unlockedBy(fn) buy equip`. **Neuer Skin = eine Zeile.** |
| `js/cosmetics-draw.js` | Aussehen als Einträge: `SL.SkinPatterns[name] = { draw, css, ring?, outline?, animated? }`, `SL.TrailStyles[name] = { draw, animated? }`. `SL.CosmeticsDraw`: `fillBody drawFigure(look-Vektor) drawTrail isAnimated applyMascotLook drawSkinPreview drawScenePreview` (IIFE). **Neues Muster = ein Eintrag.** |

Startseite: `index.html` + `hub/hub.js|css`.
Shop: `shop/index.html|shop.js|shop.css` – eigene Seite im Spielseiten-Gerüst (`game.css`, ein
Screen, Kopfzeile sticky), alles untereinander: Dein Look, dann je Kategorie eine Abteilung (Kopf
wie die Kapitel der Level-Auswahl). Erreichbar über den Shop-Knopf im Menü jedes Spiels
(`../../shop/?from=<id>`, „Zurück“ führt dorthin; `links.js` hängt bei `file://` index.html vor `?` ein).
**Freischalten (Wunsch des Nutzers):** Jedes Item gehört zu einer Aufgabe. Vorher im Shop nur ein
graues „?“ mit Namen „???“, darunter die Aufgabe (Gewöhnlich/Selten/Episch) bzw. „???“ (Legendär,
Mythisch). Nach der Aufgabe sichtbar und mit Coins kaufbar (Preis aus der Seltenheit). Skins sollen
besonders sein und zur Aufgabe passen (keine bloßen Farbvarianten). Ergebnis-Screens zeigen „Neu
im Shop freigeschaltet: …“ (`SL.Cosmetics.unlockedBy`), im Leap-Endlosmodus als schwebender Text.
Alle drei Spiele zeichnen Figur + Spur mit `SL.CosmeticsDraw` im ausgerüsteten Skin; Drift zeigt die
Standard-Spur (Punkte) nicht, dort ist der eigene Schweif der Standard.
Der Umzug alter Käufe aus dem Maze-Spielstand ins Profil passiert einmal in `profile.js` (`migrateShop`).

## Gemeinsames Muster jedes Spiels (`games/<id>/js/`)

`levels.js` (Kapitel, `levelCurve`, `SL.LEVELS`, Cache-Getter) · `game.js` (Lauf-Simulation ohne DOM,
Hooks `onXyz`, die ui.js setzt) · `renderer.js` (`SL.Renderer.render(ctx, state)`, Canvas) ·
`ui.js` (Screens, Game-Loop, Eingabe, Ergebnis, Menü/Daily-Karte) · `economy.js` (Sterne, Belohnung,
Freischalten) · `storage.js` (Spielstand + Einstellungen) · `sounds.js` (eigene Töne) ·
`daily.js` (Seed aus Datum, Schwierigkeit nach Wochentag, Bonus, Teilen-Text) · `main.js` (Start).
Alle Spiele: 30 Level in 3 Kapiteln, Freischalten mit Coins.

## Maze (`games/maze/`) – Labyrinth, ein Tastendruck = ein Feld

- `maze.js`: `SL.generateMaze`, Zellen `SL.WALL/SL.PATH`, `findShortestPath`, `computeCheckpoints`.
- `game.js`: `SL.GameSession` – Wand = zurück zum Start/Checkpoint, Uhr läuft weiter (Sterne nach Zeit).
- `levels.js`: Seeds in `LEVEL_SEEDS` (von `npm run seeds` geschrieben).
- Figur + Spur zeichnet `renderer.js` mit `SL.CosmeticsDraw` im ausgerüsteten Skin; die Maskottchen
  (Pause/Ergebnis) bekommen ihn per `SL.CosmeticsDraw.applyMascotLook` (in ui.js `applyPlayerLook`).
- Tools: `npm run seeds`, `npm run maze-preview` (erzeugt `preview.svg`).

## Drift (`games/drift/`) – Eis-Rutsch-Puzzle ("Slide"-Spiel)

- `puzzle.js`: Karte als Text (`#` Fels, `.` Eis, `:` Schnee, `o` Loch, `S` Start, `G` Ziel, `$` Coin),
  `SL.parseBoard`, `SL.slide`, `SL.analyzeBoard`, Rutschdauer `SL.slideDuration`. Ziel bremst nicht.
- `game.js`: `SL.GameSession` mit Zug-Warteschlange, Undo, Ins-Loch-Fallen (`SL.FALL_MS`).
- `levels.js`: fertige Karten im Block `LEVEL_MAPS` (von `npm run drift-levels` geschrieben),
  `SL.TUTORIAL`. Kein Daily.
- `renderer.js`: Boden vorgerendert (`buildFloorLayer`), Felsen = runde Blöcke (Inset 0.06·Feld,
  Radius 0.18·Feld). Der Rahmen (Bande) ist der CSS-Border der Canvas; seine Rundung setzt
  `ui.js → sizeCanvas()` passend zur Feldgröße.
- Sterne nach Zeit (`STAR_ALLOWANCE`), man kann nicht sterben.
- Tool: `npm run drift-levels` (`--check`, `--only 4,17`, `--dry`).

## Leap (`games/leap/`) – Timing-Sprungspiel (Seitenansicht, Figur rollt automatisch nach rechts)

- `course.js`: Geometrie + Generator. `SL.LEAP` (Konstanten), Bögen sind Parabeln über x
  (`SL.leapArc`, `SL.leapAim`), `SL.leapTraceArc` (was ein Bogen trifft: Punkte, Landung, Wand).
  `SL.createCourseBuilder(seed)` → `{ course, addSection(cfg) }` hängt **Abschnitte** an:
  n Punkte → Checkpoint-Plattform mit Schanze (bzw. Ziel bei `goal: true`). Gabelungen (früher
  Punkt A → Coins). `SL.buildCourse(cfg)` baut Level/Daily damit auf einmal.
  Strecke = `{ vx, platforms, points, coins, startX, goalX, jumpCount }`; Ziele werden per
  `{kind:"point", id}` bzw. `{kind:"land", x, y, platform}` referenziert. Tempo pro Abschnitt:
  `platform.vx` = Tempo ab dieser Plattform. **Achtung:** Der Umbau zum Builder musste alle
  Level/Dailys bitgleich lassen – Reihenfolge der `rand()`-Aufrufe nie ändern, sonst
  `LEVEL_SET_VERSION` erhöhen.
- `game.js`: `SL.LeapSession` – x kommt direkt aus der Lauf-Uhr; Tempo `vx` wechselt nur beim
  Landen auf einer Plattform mit anderem `vx`. Modi `wait/ground/air/lost/done`; Druck auf einem
  Punkt = Wertung Perfekt/Gut/OK nach ms-Abstand; Abklingzeit pro Druck; Absturz → Respawn an
  letzter Checkpoint-Plattform (`respawnIndex` = Plattform-Index = erreichte Checkpoints).
- `levels.js`: `SL.levelCurve(id)` (Tempo, Punktzahl, Gabelungen, Punkt-Arten je Kapitel),
  fester Seed pro Level. `daily.js` nimmt eine Stelle der Kurve je Wochentag.
- `endless.js`: `SL.Endless` – Endlosmodus. `createRun(seed?)` → `{ course, extend(index) }`,
  jeder Abschnitt zufällig wie ein Abschnitt von Level 10/20/30, Strecke liegt immer 2
  Checkpoints voraus (`course.endless = true`, kein Ziel). Frei mit allen 90 Sternen
  (`state.endless.unlocked`, bleibt dann frei). `state.endless.checkpoints` = alle je erreichten
  Checkpoints über alle Läufe (kein Rekord – der Nutzer will sehen, wie viel er schon gespielt hat).
- `ui.js`: Kamera (Figur bei 27 % der Breite), Modus `"level" | "daily" | "endless"`, Ergebnis,
  Daily-Teilen. Endlos: Karte ganz unten in der Level-Auswahl, HUD-Mitte = Fahne + Checkpoints
  insgesamt statt Treffsicherheit, Coins (1:1) werden erst am nächsten Checkpoint gutgeschrieben.
- `renderer.js`: zeichnet alle Plattformen/Punkte/Coins (nur sichtbare), Ziel-Rahmen bei
  `kind === "goal"`, Fortschrittsleiste über `startX..goalX` (endlos: letzter → nächster Checkpoint).
- Sterne nach Treffsicherheit (`SL.STAR_ACCURACY`: 90 / 65 %). Level mit 100 % bekommen in der
  Level-Auswahl holo-silberne, schimmernde Sterne (`.level-tile.flawless` in css/style.css).
- Tool: `npm run leap-check` – simuliert alle Level, kommende Dailys und 8 Endlos-Läufe à 12
  Checkpoints (perfekt spielbar, kein Abkürzen, Gabelungen erreichbar). Nach Änderungen an
  Generator/Kurve immer laufen lassen (~30 s).
