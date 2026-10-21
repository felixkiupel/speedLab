// Hängt an jede lokale .js/.css-Datei, die eine HTML-Seite einbindet, einen Hash ihres Inhalts
// (src="js/ui.js?v=1a2b3c4d"). Warum: GitHub Pages lässt Browser jede Datei 10 Minuten lang aus dem
// Cache nehmen. Nach einem Update kann ein Handy so neue und alte Skripte mischen (z.B. neues
// endless.js mit altem course.js) - dann bricht das Spiel ab. Mit Hash ändert sich bei jeder
// Änderung die Adresse der Datei, und der Browser holt sie garantiert neu.
//
// Prüft nebenbei, dass jede eingebundene Datei genau so geschrieben existiert: Windows ist bei
// Groß-/Kleinschreibung egal, GitHub Pages nicht ("Ui.js" statt "ui.js" ginge lokal, online nicht).
//
// Setzt außerdem die Versionsnummer im Footer der Startseite (siehe versionNow).
//
//   npm run stamp              Hashes + Version aktualisieren - vor jedem Commit
//   npm run stamp -- --check   nur prüfen; Exit-Code 1, wenn ein Hash oder die Version veraltet ist
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execSync } = require("child_process");

const root = path.join(__dirname, "..");
const check = process.argv.includes("--check");
const SKIP_DIRS = new Set([".git", ".claude", "node_modules"]);

function htmlFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.isDirectory()) return SKIP_DIRS.has(e.name) ? [] : htmlFiles(path.join(dir, e.name));
    return e.name.endsWith(".html") ? [path.join(dir, e.name)] : [];
  });
}

// Gibt es die Datei mit genau dieser Schreibweise? (fs.existsSync ignoriert sie unter Windows)
function existsExactly(file) {
  const rel = path.relative(root, file);
  if (rel.startsWith("..")) return fs.existsSync(file);
  let dir = root;
  for (const part of rel.split(path.sep)) {
    if (!fs.existsSync(dir) || !fs.readdirSync(dir).includes(part)) return false;
    dir = path.join(dir, part);
  }
  return true;
}

// Zeilenenden vereinheitlichen: Windows (CRLF) und GitHub (LF) sollen denselben Hash ergeben
function hashOf(file) {
  const text = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
  return crypto.createHash("sha1").update(text).digest("hex").slice(0, 8);
}

const REF = /(\s(?:src|href)=")([^"?#:]+\.(?:js|css))(?:\?v=[0-9a-f]*)?(")/g;
const errors = [];
const changed = [];
const show = (file) => path.relative(root, file).split(path.sep).join("/");

for (const html of htmlFiles(root)) {
  const before = fs.readFileSync(html, "utf8");
  const after = before.replace(REF, (all, pre, ref, post) => {
    const file = path.join(path.dirname(html), ref);
    if (!existsExactly(file)) {
      errors.push(`${show(html)}: "${ref}" gibt es so nicht (Schreibweise?)`);
      return all;
    }
    return `${pre}${ref}?v=${hashOf(file)}${post}`;
  });
  if (after === before) continue;
  changed.push(show(html));
  if (!check) fs.writeFileSync(html, after);
}

// Version = 0.<Nummer des Commits> - alles ist noch Testphase, darum 0.x. Die Nummer zählt die
// Commits, steigt also bei jeder Veröffentlichung von selbst; am Handy sieht man so, ob man eine
// alte Seite aus dem Cache hat. Sind Änderungen offen (stamp läuft vor dem Commit), ist es die
// Nummer des kommenden Commits - danach, im sauberen Stand, bleibt sie gleich. Dateien, die git noch
// nicht kennt, zählen nicht (sonst stiege sie wegen einer liegengebliebenen preview.svg).
function versionNow() {
  try {
    const git = (args) => execSync(`git ${args}`, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    const commits = Number(git("rev-list --count HEAD"));
    const pending = git("status --porcelain --untracked-files=no") !== "";
    return `0.${commits + (pending ? 1 : 0)}`;
  } catch (e) {
    return null;
  }
}

const HOME = path.join(root, "index.html");
const VERSION = /(<span class="foot-version">v)[^<]*(<\/span>)/;
const version = versionNow();
if (!version) {
  console.log("! Version nicht gesetzt - git nicht gefunden");
} else {
  const before = fs.readFileSync(HOME, "utf8");
  if (!VERSION.test(before)) errors.push(`${show(HOME)}: kein .foot-version gefunden`);
  const after = before.replace(VERSION, `$1${version}$2`);
  if (after !== before) {
    if (!changed.includes(show(HOME))) changed.push(show(HOME));
    if (!check) fs.writeFileSync(HOME, after);
    console.log(`Version: v${version}`);
  }
}

for (const e of errors) console.log("! " + e);
if (check) {
  console.log(changed.length ? `Veraltete Hashes/Version in: ${changed.join(", ")} - npm run stamp` : "Alle Hashes und die Version aktuell");
  process.exitCode = changed.length || errors.length ? 1 : 0;
} else {
  console.log(changed.length ? `Aktualisiert: ${changed.join(", ")}` : "Alle Hashes waren schon aktuell");
  process.exitCode = errors.length ? 1 : 0;
}
