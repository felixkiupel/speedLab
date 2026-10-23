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
- Coins, Kristalle + Daily-Serie global (`SL.Profile`, `speedlab_profile_v1`), alles andere pro
  Spiel (`speedlab_<id>_v1`, Slots: `speedlab_slots_v1` nur Einsatz + Ton). Alle Pfade relativ
  (GitHub Pages).
- **Coin-Regel (Wunsch des Nutzers, gilt für alle Spiele, Rework 21.10.2026):** Level-Belohnung =
  `SL.Profile.levelPay(SL.levelUnlockCost(id + 1), sterne, besteSterneBisher)` + eingesammelte
  Coins 1:1. **Jeder Stern zahlt nur einmal** (gegen Farmen): alle 3 Sterne zusammen = Preis des
  nächsten Levels + 2, jeder Stern ein Drittel davon; bezahlt wird nur, was über die besten Sterne
  bisher hinausgeht. Level mit 3 Sternen bringen nur noch die eingesammelten Coins. Das Ergebnis
  zeigt die Posten (`SL.Profile.levelPayLabel`, z.B. „1 neuer Stern“, „3 Sterne schon geholt +0“) –
  in allen drei Spielen gleich (`computeReward` → `{ parts, total }`). Tagesbonus klein:
  `dailyBonus` = 10/Stern + Serie (max. 10). Freischalten soll eine Herausforderung bleiben – keine
  neuen Coin-Quellen ohne Rücksprache. Alle Spiele kosten fürs Freischalten (Drift/Leap:
  60 + 15/Level, Maze: 40 + 35/Level).
- **Kein Zoomen** (Wunsch des Nutzers): viewport-Meta jeder Seite mit `maximum-scale=1,
  user-scalable=no`, `html { touch-action: manipulation }` (base.css) und `shared/js/no-zoom.js`
  (blockt Zwei-Finger-Gesten auf dem iPhone) – neue Seiten brauchen alle drei.
- Schwarze Meldungen (Effekt-Texte, Start-Hinweise, Toast) haben eine helle 2-px-Umrandung, damit
  sie auch vor dunklem Grund lesbar bleiben.
- **Kristalle (zweite Währung, Wunsch des Nutzers 21.10.2026):** gibt es nur am Automaten
  (`slots/`), bezahlt mit Coins, zu einem bewusst „bodenlosen“ Kurs (~112 Coins pro Kristall,
  `npm run slots-odds`). Die Slots zahlen nie Coins aus. Später sollen Skins Kristalle kosten.
- Strecken/Karten ändern → `SL.LEVEL_SET_VERSION` in `levels.js` erhöhen (alte Bestwerte verfallen).
- Kein Test-Framework. Prüfen per Node-Tool (siehe unten) und im Browser.
- **Version** steht im Footer der Startseite (`index.html`, `.foot-version`) und wird **nicht von
  Hand** gesetzt: `npm run stamp` schreibt `v0.<Nummer des Commits>` (Testphase = 0.x, Wunsch des
  Nutzers 21.10.2026; offene Änderungen = Nummer des kommenden Commits). Daran sieht der Nutzer
  am Handy, ob er eine Seite aus dem Cache hat.
- **Vor jedem Commit `npm run stamp`** (`tools/stamp.js`): hängt Inhalts-Hashes (`?v=…`) an alle
  eingebundenen JS/CSS-Dateien der HTML-Seiten und setzt die Version (s.o.). Ohne das mischen Handys nach einem Deploy alte
  (GitHub-Pages-Cache, 10 Min.) und neue Skripte – wahrscheinlichste Ursache, warum der
  Endlosmodus am 20.10.2026 auf dem Handy nicht lief. Meldet auch Pfade mit falscher
  Groß-/Kleinschreibung.

## Starten & im Browser prüfen

- Dev-Server: `.claude/launch.json` → `speedlab-server` (http-server, Port 5173, kein Cache).
- Im Browser-Pane mit `navigate` (mit `tabId`) auf die volle URL gehen, z.B.
  `http://localhost:5173/games/drift/index.html` – ein `browser_batch` mit Ordner-URL wurde abgelehnt.
- Schnell ins Spiel: per `javascript_tool` `document.getElementById("btn-play").click()` und dann
  eine `.level-tile[data-level="N"]` klicken. Drift startet beim ersten Mal ins Tutorial.

## Shared (`shared/`)

| Datei | Inhalt |
|---|---|
| `css/base.css` | Farben (`--ink`, `--bg`, `--border` …), Schrift, Buttons, Logo, Figur, `.coin-icon`/`.crystal-icon`, `.coin-pill`, `.wallet-pill` (Coins + Kristalle, Shop und Slots) |
| `css/game.css` | Gemeinsames Spielseiten-Gerüst: Menü, Level-Auswahl, HUD, Pause, Ergebnis, Daily-Karte, Einstellungen, Toast, `.canvas-wrap/.canvas-frame`, Tipp-Steuerung |
| `js/profile.js` | `SL.Profile`: `coins() addCoins() spend() levelPay() dailyBonus() completeDaily(id,key) streak() bestStreak() dailiesOn()`, Kristalle (`crystals() playSlots(einsatz, gewinn)` – bucht einen Dreh in einem Schritt), Shop (`equippedCosmetic(type) equipCosmetic(type, id|null)`), `onChange()` – liest/schreibt jedes Mal frisch. `migrateShop` erstattet einmalig alte Käufe (Skins/Spuren, die es nicht mehr gibt). |
| `js/days.js` | `SL.Days`: Tages-Schlüssel `YYYY-MM-DD`, `between`, `parse`, `timeUntilNext` |
| `js/rng.js` | `SL.createRng(seed)` (mulberry32) |
| `js/audio.js` | `SL.Audio` (Web-Audio-Engine + gemeinsame Töne, `add/play/tone/noise/ensure`), `SL.Haptics.vibrate` |
| `js/effects.js` | `SL.Effects`: `burst text shake clear update render(ctx,toScreen,bounds)`, `enabled` |
| `js/settings.js` | Einstellungs-Overlay, liest Zeilen aus dem HTML (`data-setting`) |
| `js/games.js` | `SL.GAMES` – Kacheln der Startseite |
| `js/links.js` | Ordner-Links auch bei `file://` |
| `js/no-zoom.js` | Kein Zwei-Finger-Zoom auf dem iPhone (Rest: viewport-Meta + base.css), auf jeder Seite als erstes Skript |
| `js/cosmetics.js` | Katalog: `SKINS` (nur „Standard“) und `TRAILS` (je Spiel eine: Maze/Drift/Leap, `game` + `style`) → `SL.COSMETIC_TYPES`, `SL.COSMETICS`. `SL.Cosmetics`: `get equipped(type) trailFor(gameId) equip(id) unequip(type)`. Alles frei, keine Preise. |
| `js/cosmetics-draw.js` | `SL.TrailStyles[style].draw(ctx, points, r)` (`dots` Maze, `streak` Drift, `growing` Leap; r = Figur-Radius, damit jede Spur in jedes Spiel passt). `SL.CosmeticsDraw`: `drawFigure(ctx,x,y,r,look,body?) drawTrail(ctx,points,r,trail) drawStreak drawSkinPreview drawScenePreview` (IIFE). |

Startseite: `index.html` + `hub/hub.js|css`.
Shop: `shop/index.html|shop.js|shop.css` – eigene Seite im Spielseiten-Gerüst (`game.css`, ein
Screen, Kopfzeile sticky mit beiden Währungen), alles untereinander: Karte zu den Slots, Dein
Look, dann je Kategorie eine Abteilung (Kopf wie die Kapitel der Level-Auswahl). Erreichbar über den Shop-Knopf im Menü jedes Spiels
(`../../shop/?from=<id>`, „Zurück“ führt dorthin; `links.js` hängt bei `file://` index.html vor `?` ein).
**Stand (Wunsch des Nutzers, 21.10.2026):** Skins mit Aufgaben, Seltenheiten und Preisen wurden
komplett gestrichen. Im Shop gibt es nur den Standard-Skin und die drei Spuren der Spiele (benannt
nach dem Spiel), alles frei. Ohne ausgerüstete Spur hat jedes Spiel seine eigene
(`SL.Cosmetics.trailFor`); eine ausgerüstete gilt in allen Spielen, „Jedes Spiel seine eigene“ im
Shop legt sie wieder ab. Keine Aufgaben/Achievements – neue Shop-Inhalte nur nach Rücksprache.
Drift zeichnet seinen eigenen Schweif weiter aus den Rutschern (`drawTrails` in renderer.js, zieht
sich nach dem Stopp zurück) mit derselben Form (`SL.CosmeticsDraw.drawStreak`); Leap hängt die
Figur-Position als letzten Spur-Punkt an.

Slots: `slots/` – nur über den Shop erreichbar (`../slots/?from=<id>`, „Zurück“ führt in den Shop
und reicht `from` weiter). Gleiches Seiten-Gerüst wie der Shop.
- `machine.js`: `SL.Slots` ohne DOM (läuft in Node) – `SYMBOLS` (Punkt, Dreieck, Viereck, Sechseck,
  Stern, Sieben = Jackpot: `count` auf dem 20er-Walzenband = Wahrscheinlichkeit, `pay3`),
  `REELS` (feste Seeds, nie zwei gleiche nebeneinander), `BASE_STAKE` 40 × `STAKES` [1, 2, 5],
  `evaluate` (mittlere Reihe: 3 gleiche = `pay3`, 2 gleiche von links = 1), `spin(stufe)`, `odds()`
  (exakt über alle 8000 Kombinationen). **Quoten ändern → `npm run slots-odds`.**
- `slots.js`: Ergebnis steht beim Drücken fest und wird sofort gebucht (`playSlots`), die Walzen
  spielen es nur vor; die Kristall-Anzeige zählt erst nach dem Stillstand hoch. Walzen-Physik als
  Funktion der Zeit (Ausholen, Anlaufen, volle Fahrt, Bremsen mit easeOutBack aufs Zielfeld – das
  Bremsen startet, sobald das Ziel genau einen Bremsweg vor der Linie liegt; die Walzen bremsen
  der Reihe nach). Flache Walzen (3 Reihen, mittlere hell, äußere im Halbschatten) + Bewegungsunschärfe
  im Canvas, Spannung auf Walze 3, wenn 1+2 gleich sind (die ganze Walze blinkt gefüllt, kein
  Rahmen). Großer runder Knopf oder Leertaste; erneut drücken = schneller stoppen. Knopf immer
  schwarz (kein Hover-Umfärben, verliert nach dem Klick den Fokus), beim Laufen ausgegraut („Stopp“).
  Konfetti auf eigener Canvas über der ganzen Seite (`#slot-fx`).
- **Look (Wunsch des Nutzers):** schwarz-weiß wie die Spiele, keine bunten Farben. Weiche Formen
  (runde Ecken) – nur die Sieben sticht heraus: klassische Automaten-7 (`sevenPath`: fetter Balken
  mit rundem Ohr, geschwungener Schaft mit breitem Fuß), hell gefüllt mit dunkler Kontur und
  3D-Versatz. Selbst gezeichnet statt Schriftdatei (kein Nachladen, keine Anfrage an Google). Der
  Nutzer fand eine kantige Western-7 aus Polygonen zu „zusammengewürfelt“ – nur glatte Kurven. Gewinn = „Licht aus“: das Walzenfenster dunkelt ab (`VEIL`), nur die Gewinner
  leuchten mit Lichthof und ploppen nacheinander rein; zwei gleiche: Symbol hell, drei gleiche:
  Holo-Silber mit Lichtschein wie die 100-%-Sterne in Leap (`HOLO_BASE/HOLO_SHINE`) plus kurzer
  Blitz; die Lauflichter (= Lautsprecher-Gitter unten rechts) blinken silbern. Beim nächsten Dreh geht das Licht wieder an. Kein
  `shadowBlur` (bremst auf iPhones) – Glühen über Radial-Verläufe; die Konfetti-Canvas wird nur
  gezeichnet, solange Konfetti fliegt (max. 2× Auflösung).
- **Aufbau nach Referenzbild des Nutzers (21.10.2026):** Figur schaut oben übers Gehäuse,
  „speedSlots“-Logo + „Kristall-Automat“, dunkles Walzenfenster mit Meldungs-Leiste oben und
  Einsatz/Gewinn unten (Monospace), Pfeile der Gewinnlinie per CSS, runde Einsatz-Knöpfe (gewählt =
  hell, eingedrückt), großer Dreh-Knopf, Ton-Schalter, Füße. Kein Hebel mehr. Gewinntabelle als
  Karte mit dunklem Kopf. Handy untereinander, ab 820 px nebeneinander. Gewackelt wird `#slot-stage`
  (Figur + Gehäuse).
- Kristall-Icon (`.crystal-icon`, base.css) = um 45° gedrehtes Quadrat mit weichen Ecken.
- `sounds.js`: `slotPull slotTick slotStop slotTease slotWin(tier) slotJackpot crystalTick`.

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
- Figur + Spur zeichnet `renderer.js` mit `SL.CosmeticsDraw` (Spur = `SL.Cosmetics.trailFor("maze")`).
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

## Duel (`games/duel/`) – Arcade-Boss-Kampf, PROTOTYP (23.10.2026)

**Wunsch des Nutzers:** Prototyp muss sich durch Löschen von `games/duel/` + dem Eintrag in
`shared/js/games.js` (+ diesem Abschnitt) restlos entfernen lassen – also nichts außerhalb des
Ordners anfassen. Darum: keine Coins, kein Profil, kein Freischalten, kein Shop-Link, Tool nicht in
package.json (`node games/duel/tools/duel-check.js`). **Nur ein einziger Kampf** zum Testen – mehr
Level/Bosse erst, wenn der Nutzer mit dem Kern zufrieden ist. Erste Version (9 ruhige Level, heller
Look) fand er zu langweilig → schneller, Retro-Automaten-Stil.
- Steuerung wie Maze: ← → ausweichen, ↓ ducken, ↑/Leertaste zuschlagen (Handy: großer Knopf oben).
  Ausweichen ist kurz (`SL.DUEL.DODGE`), beim Zuschlagen kann man nicht ausweichen.
- `boss.js`: `SL.ATTACKS` (welche Stellen L/C/R/D ein Angriff trifft, `opens` = Faust steckt fest
  → Boss kurz offen), `SL.BOSS` (Energie, Rundenuhr, `phases[0]` normal / `phases[1]` rasend ab
  halber Energie, je mit festen Kombos).
- `game.js`: `SL.DuelSession` – eigene Spielzeit über `update(dt)`, Trefferstopp (`hitstop`) hält
  sie kurz an, `step` = zuletzt vorgerückt (Renderer). Phasen
  `wait/intro/guard/windup/strike/recover/open/counter/roar/down/taunt`. Zuschlagen trifft nur, wenn
  offen (`isBossOpen`), sonst Block + Konter = Leben weg. Schläge im Takt: Gerade, Gerade, Haken
  (`PUNCHES`, `chain`). Augenblitzen (`onGlint`, `GLINT_LEAD` vor dem Einschlag); Ausweichen
  ≤ `PERFECT_MS` vor dem Einschlag = perfekt → Kombo bricht ab, Boss offen. Rundenuhr abgelaufen =
  verloren. Sterne = übrige Leben.
- `renderer.js`: Automaten-Look – dunkler Bildschirm, helle Figuren, eigene 5×7-Pixel-Schrift
  (`FONT`, `pixelText`; kein Ü – sieht wie Ö aus), Leisten mit Nachlauf, Rundenuhr, Combo-Zähler,
  Ansagen (`announce`), Einblendungen, Funken, invertierender Blitz (`flash`, Effekt-Einstellung),
  Zoom-Stoß, Nachbilder, Publikum, Scanlines + Vignette (pro Größe vorgerendert). Welt 400×400.
- `ui.js`: Menü → direkt in den Kampf, Zeitlupe bei perfekt/K.o. (`slowMo`), Ergebnis.
- Tool `node games/duel/tools/duel-check.js`: Profi- und Mensch-Bot (260 ms Reaktion) müssen immer
  gewinnen, Dauer-Zuschlagen muss verlieren; zeigt Kampfdauer gegen die Rundenuhr.

## Fish (`games/fish/`) – Angel-Spiel, PROTOTYP (23.10.2026)

Gleiche Prototyp-Regel wie Duel: alles in `games/fish/` + Eintrag in `shared/js/games.js` (+ dieser
Abschnitt), Tool nur per `node games/fish/tools/fish-check.js`. Entspanntes „für unterwegs“-Spiel:
Haken auf eine Tiefen-Ebene lassen, Fisch drillen, auf dem Markt verkaufen, aufrüsten.
**Eigene Währung „Taler“** (nur im Spielstand `speedlab_fish_v1`, Icon = Münze mit Loch) – wegen
der Coin-Regel keine Plattform-Coins; ob/wie man das verbindet, ist offen.
- **Wünsche des Nutzers (Verlauf):** Stardew-Balken „viel zu schwer“ → Pfeil-Folgen → jetzt nach
  seinem Referenzbild: **Querschnitt mit Tiefen-Ebenen**, Fische sichtbar in ihren Ebenen, tiefere
  Angelplätze, Upgrades als Deckel. Minispiel = **Ziehen mit Spannung** (zu doll = reißt, zu wenig
  = entkommt). Look schwarz-weiß/warm-beige, ruhig. Brise nur noch als stärker wiegendes Seegras +
  leises Rauschen – **keine Windstriche** am Himmel (fand der Nutzer störend). Markt-Knöpfe rechts
  alle gleich breit. Kein Kram (Stiefel/Dose) mehr.
- `data.js`: `SL.SPOTS` (Teich 3×2 m, Fluss 4×3 m, Meer 5×6 m), `SL.FISH` (15 Arten: `layers` von–bis,
  Seltenheit 1–4, Wert, kg, `strength`, `behavior` = Aufbäumen, `len` im Bild, `shape`),
  `SL.GEAR` (Angel = `power` → schneller hoch, Schnur = `strength` → hält mehr, Rolle = `depth` in m
  → erreichbare Ebenen, Köder, Kühlbox), `SL.gearStats`, `SL.reachableLayers(spot, depth)`.
- `fishing.js`: `SL.FishingSession` – Fische schwimmen je Ebene (x 0..1, Tiefe in Ebenen), einer
  kommt zum Haken, zupft, beißt; `setLayer` (false = zu tief), `press/release`; Zustände
  `lower/wait/bite/reel/landed/escaped`. `SL.TensionGame`: Spannung läuft auf einen Zielwert zu
  (halten = je nach Last = Fischkraft/Schnur, loslassen = fast locker), Aufbäumen mit Vorwarnung
  (`tell`) – dagegen ziehen = Riss; zu starker Fisch zieht die Schnur beim Aufbäumen auch ohne
  Halten straff (`SAFE_LOAD`); locker = Fortschritt sinkt; nach `FIGHT_MS` löst sich der Haken.
  Nie in der roten Zone = +20 %.
- `fishart.js`: `SL.FishArt` – Fisch-Pfade aus `shape`, als SVG (Markt, Fischbuch, Karte) und Canvas.
- `renderer.js`: Welt 400×560 – Himmel mit Steg/Figur/Rute, Wasser-Ebenen mit Meter-Marken,
  gesperrte Ebenen schraffiert, Grund mit Seegras, Fische, Haken + Luftblasen, Spannungs-Anzeige.
  Brise (`GUST_*`) ruft `onGust` → Wind-Ton in ui.js.
- `market.js`: `SL.Market` (Fang verbuchen + Fischbuch, verkaufen, Ausrüstung/Plätze kaufen).
- `ui.js`: aufs Wasser tippen bzw. ↑/↓ = Tiefe (je Platz gemerkt in `state.layers`), großer Knopf
  bzw. Leertaste = anschlagen + ziehen; Töne beim Ziehen (Rolle, Knarzen, Warnton).
- Tool: erreichbare Ebenen je Rolle + Fangquote je Fisch × Ausrüstungsstufe für zwei Bots
  (200/320 ms Reaktion). Nach Änderungen an Fischen, Ausrüstung oder Spannungs-Werten laufen lassen.
