/*
 * common/arcade.js — the one piece of code every game shares.
 *
 * Plain browser script, zero dependencies, no build step. A game loads it with
 *   <script src="../../common/arcade.js"></script>
 * before its own inline <script>, then uses the global `Arcade`:
 *
 *   const hs = Arcade.highScore('snake');   // best score kept in localStorage
 *   hs.best;                                // current best (0 when none saved)
 *   hs.submit(score);                       // true when score is a new best
 *
 *   Arcade.soundButton(btn);                // wire an on-screen Sound on/off toggle
 *   Arcade.sound.toggle();                  // e.g. from the M key
 *   Arcade.sound.beep(440, 80);             // short tone, silent when sound is off
 *
 *   Arcade.fitCanvas(canvas, W, H, room, redraw);
 *     // scale a W x H canvas to the space room() returns ({w, h} in CSS px),
 *     // with a devicePixelRatio backing store so it is sharp on phones; the
 *     // game keeps drawing in W x H units. Refits on resize and rotation and
 *     // calls redraw() after each refit (not after the first fit).
 *
 * Storage can throw (private browsing, a locked-down iframe): every read falls
 * back to the default and every write is skipped, so the game keeps playing.
 */
(function () {
  'use strict';

  function load(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }

  function save(key, value) {
    try { localStorage.setItem(key, value); } catch (e) { /* storage blocked: keep it in memory */ }
  }

  // Keys are arcade-<game>-best, the key Snake has always used, so existing bests survive.
  function highScore(game) {
    const key = 'arcade-' + game + '-best';
    const saved = parseInt(load(key), 10);
    let best = Number.isFinite(saved) && saved > 0 ? saved : 0;
    return {
      get best() { return best; },
      submit(score) {
        if (!(score > best)) return false;
        best = score;
        save(key, String(best));
        return true;
      }
    };
  }

  // One setting for the whole arcade: muting one game mutes them all.
  const SOUND_KEY = 'arcade-sound';
  let soundOn = load(SOUND_KEY) !== 'off';
  let audio = null;
  const buttons = [];

  function setSound(on) {
    soundOn = !!on;
    save(SOUND_KEY, soundOn ? 'on' : 'off');
    for (const b of buttons) paint(b);
    if (soundOn) wake();  // a Sound button click or the M key is itself a gesture
  }

  function paint(button) {
    button.textContent = soundOn ? 'Sound on' : 'Sound off';
    button.setAttribute('aria-pressed', soundOn ? 'true' : 'false');
  }

  // Browsers only start audio inside a user gesture, and Safari on iOS only
  // resumes it inside one too, but many beeps come from a game's frame loop
  // (Snake's first is eating a fruit, long after the key press or swipe). So
  // every tap, click and key press creates or wakes the context while it can.
  function wake() {
    if (!soundOn) return null;
    if (!audio) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      audio = new AC();
    }
    if (audio.state === 'suspended') audio.resume();
    return audio;
  }
  for (const type of ['touchend', 'click', 'keydown']) window.addEventListener(type, wake, true);

  function beep(freq, ms, type) {
    if (!wake()) return;
    const t = audio.currentTime;
    const d = (ms || 80) / 1000;
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = type || 'square';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.05, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + d);
    osc.connect(gain);
    gain.connect(audio.destination);
    osc.start(t);
    osc.stop(t + d);
  }

  function soundButton(button) {
    buttons.push(button);
    paint(button);
    button.addEventListener('click', () => setSound(!soundOn));
  }

  function fitCanvas(canvas, w, h, room, redraw) {
    const ctx = canvas.getContext('2d');
    function fit(refit) {
      const r = room();
      const scale = Math.max(0.1, Math.min(r.w / w, r.h / h));
      const cssW = Math.floor(w * scale);
      const cssH = Math.floor(h * scale);
      const dpr = window.devicePixelRatio || 1;
      canvas.style.width = cssW + 'px';
      canvas.style.height = cssH + 'px';
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      ctx.setTransform(canvas.width / w, 0, 0, canvas.height / h, 0, 0);
      if (refit && redraw) redraw();  // resizing a canvas clears it
    }
    window.addEventListener('resize', () => fit(true));
    window.addEventListener('orientationchange', () => fit(true));
    fit(false);  // the first fit runs before the game has anything to draw
    return ctx;
  }

  window.Arcade = {
    highScore,
    soundButton,
    fitCanvas,
    sound: {
      get on() { return soundOn; },
      toggle() { setSound(!soundOn); },
      beep
    }
  };
})();
