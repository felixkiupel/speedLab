// Einstellungen: Töne (+ Lautstärke), Vibration, Effekte, Tipp-Steuerung. Als Overlay über dem
// aktuellen Screen, damit es auch aus der Pause heraus geht, ohne den Lauf zu verlieren.
window.SL = window.SL || {};

SL.Settings = (function () {
  let state = null;
  let onChange = () => {};
  let resetArmedUntil = 0;

  const overlay = () => document.getElementById("settings-overlay");

  // Werte an Audio/Haptik/Effekte durchreichen und der UI Bescheid geben (z.B. Tipp-Steuerung)
  function apply() {
    const s = state.settings;
    SL.Audio.setEnabled(s.sound);
    SL.Audio.setVolume(s.volume);
    SL.Haptics.enabled = s.vibration;
    onChange(s);
  }

  function set(key, value) {
    state.settings[key] = value;
    SL.Storage.save(state);
    apply();
    render();
  }

  function render() {
    const s = state.settings;
    const root = overlay();
    root.querySelectorAll(".toggle[data-setting]").forEach((el) => {
      el.setAttribute("aria-checked", String(Boolean(s[el.dataset.setting])));
    });
    root.querySelectorAll(".segmented[data-setting] button").forEach((btn) => {
      const active = s[btn.parentElement.dataset.setting] === btn.dataset.value;
      btn.classList.toggle("active", active);
      btn.setAttribute("aria-pressed", String(active));
    });
    const volume = document.getElementById("setting-volume");
    volume.value = Math.round(s.volume * 100);
    volume.disabled = !s.sound;
    document.getElementById("setting-volume-value").textContent = `${Math.round(s.volume * 100)} %`;
    root.querySelector(".setting-volume-row").classList.toggle("disabled", !s.sound);
  }

  function open() {
    render();
    overlay().classList.remove("hidden");
  }

  function close() {
    overlay().classList.add("hidden");
    disarmReset();
  }

  function isOpen() {
    return !overlay().classList.contains("hidden");
  }

  // Spielstand löschen braucht einen zweiten Klick innerhalb von 4 s
  function disarmReset() {
    resetArmedUntil = 0;
    const btn = document.getElementById("btn-reset-save");
    btn.textContent = "Spielstand löschen";
    btn.classList.remove("armed");
  }

  function onResetClick() {
    const btn = document.getElementById("btn-reset-save");
    if (Date.now() < resetArmedUntil) {
      SL.Storage.reset();
      location.reload();
      return;
    }
    resetArmedUntil = Date.now() + 4000;
    btn.textContent = "Wirklich alles löschen?";
    btn.classList.add("armed");
    setTimeout(() => { if (Date.now() >= resetArmedUntil) disarmReset(); }, 4100);
  }

  function init(saveState, changeHandler) {
    state = saveState;
    onChange = changeHandler;
    const root = overlay();

    root.querySelectorAll(".toggle[data-setting]").forEach((el) => {
      el.addEventListener("click", () => set(el.dataset.setting, !state.settings[el.dataset.setting]));
    });
    root.querySelectorAll(".segmented[data-setting] button").forEach((btn) => {
      btn.addEventListener("click", () => set(btn.parentElement.dataset.setting, btn.dataset.value));
    });
    const volume = document.getElementById("setting-volume");
    volume.addEventListener("input", () => {
      state.settings.volume = Number(volume.value) / 100;
      SL.Audio.setVolume(state.settings.volume);
      document.getElementById("setting-volume-value").textContent = `${volume.value} %`;
    });
    // Speichern + Probeton erst beim Loslassen, nicht bei jedem Zwischenwert
    volume.addEventListener("change", () => {
      SL.Storage.save(state);
      SL.Audio.play("coin");
    });
    document.getElementById("btn-settings-close").addEventListener("click", close);
    document.getElementById("btn-reset-save").addEventListener("click", onResetClick);
    // Klick auf den abgedunkelten Hintergrund schließt ebenfalls
    root.addEventListener("click", (e) => { if (e.target === root) close(); });

    apply();
  }

  return { init, open, close, isOpen };
})();
