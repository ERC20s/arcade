#!/usr/bin/env node
/*
 * test-games.mjs — runtime tests for the shipped browser code.
 *
 * Plain Node (>= 18), zero dependencies, no build step. Run it from the
 * repository root with `npm test` (which runs it after the checker self-test).
 *
 * How it works
 *   common/arcade.js and the inline <script> of a game are run unchanged in a
 *   node:vm context with the few browser globals they touch stubbed out. The
 *   game's top-level functions and `let` state live in that context's global
 *   scope, so a test can set up a position (a ball, a wall) and call the real
 *   game code on it, with no browser.
 *
 * Exit code: 0 when every test passes, 1 when any test fails.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const COMMON = readFileSync(path.join(REPO, "common", "arcade.js"), "utf8");

/* ------------------------------------------------------------------ helpers */

// An element stub: records listeners, ignores styling, and hands out a 2D
// context on which every drawing call is a no-op.
function element() {
  const listeners = {};
  return {
    style: {},
    textContent: "",
    width: 0,
    height: 0,
    listeners,
    setAttribute() {},
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
    getBoundingClientRect() { return { left: 0, top: 0, width: 480, height: 640 }; },
    getContext() { return new Proxy({}, { get: () => () => {}, set: () => true }); }
  };
}

// A browser-ish global object for vm. `stored` seeds localStorage.
//
// AudioContext follows the autoplay rule Safari on iOS enforces: a context
// created outside a user gesture starts "suspended", and resume() only takes
// effect inside one (otherwise it rejects with NotAllowedError). `gesture()`
// dispatches an event the way a tap or key press does: window capture
// listeners first, then the target's own, all inside the gesture.
function browser({ stored = {} } = {}) {
  const store = new Map(Object.entries(stored));
  const windowListeners = {};
  const contexts = [];
  let inGesture = false;

  class FakeAudioContext {
    constructor() {
      this.state = inGesture ? "running" : "suspended";
      this.currentTime = 0;
      this.destination = {};
      this.started = [];          // the context's state each time a tone starts
      contexts.push(this);
    }
    resume() {
      if (inGesture) {
        this.state = "running";
        return Promise.resolve();
      }
      const refused = Promise.reject(new Error("NotAllowedError: resume() outside a user gesture"));
      refused.catch(() => {});    // the caller may ignore it, as the arcade does
      return refused;
    }
    createOscillator() {
      const ctx = this;
      return { frequency: {}, connect() {}, start() { ctx.started.push(ctx.state); }, stop() {} };
    }
    createGain() {
      return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} };
    }
  }

  const g = {
    Math,
    console,
    AudioContext: FakeAudioContext,
    devicePixelRatio: 1,
    innerWidth: 1000,
    innerHeight: 800,
    performance: { now: () => 0 },
    requestAnimationFrame() {},
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v))
    },
    document: { hidden: false, getElementById: element, querySelector: element, addEventListener() {} },
    addEventListener(type, fn) { (windowListeners[type] ||= []).push(fn); }
  };
  g.window = g;
  vm.createContext(g);

  function gesture(type, target) {
    inGesture = true;
    try {
      const event = { type, target };
      for (const fn of windowListeners[type] || []) fn(event);
      for (const fn of (target && target.listeners[type]) || []) fn(event);
    } finally {
      inGesture = false;
    }
  }

  return { g, contexts, gesture, run: (code) => vm.runInContext(code, g) };
}

// The inline (src-less) scripts of a game page, in order.
function inlineScripts(rel) {
  const html = readFileSync(path.join(REPO, ...rel.split("/")), "utf8");
  return [...html.matchAll(/<script>([\s\S]*?)<\/script\s*>/gi)].map((m) => m[1]);
}

function loadGame(rel) {
  const page = browser();
  page.run(COMMON);
  for (const code of inlineScripts(rel)) page.run(code);
  return page;
}

/* ------------------------------------------------------------ common/arcade.js */

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test("arcade.js: a beep from the frame loop after a key press is audible (iOS gesture rule)", () => {
  // Snake's first beep is eating a fruit, inside requestAnimationFrame, after
  // the player has only pressed arrow keys. The tone must start on a running
  // context, not on one created (suspended) outside any gesture.
  const page = browser();
  page.run(COMMON);
  page.gesture("keydown", null);
  page.run("Arcade.sound.beep(660, 60)");
  assert.equal(page.contexts.length, 1, "expected exactly one AudioContext");
  assert.deepEqual(page.contexts[0].started, ["running"]);
});

test("arcade.js: a beep after a tap is audible (iOS gesture rule)", () => {
  const page = browser();
  page.run(COMMON);
  page.gesture("touchend", null);
  page.run("Arcade.sound.beep(440, 40)");
  assert.equal(page.contexts.length, 1, "expected exactly one AudioContext");
  assert.deepEqual(page.contexts[0].started, ["running"]);
});

test("arcade.js: turning sound on with the Sound button makes the next loop beep audible", () => {
  const page = browser({ stored: { "arcade-sound": "off" } });
  page.run(COMMON);
  const button = element();
  page.g.soundBtn = button;
  page.run("Arcade.soundButton(soundBtn)");
  assert.equal(button.textContent, "Sound off");
  page.gesture("click", button);
  assert.equal(button.textContent, "Sound on");
  page.run("Arcade.sound.beep(660, 60)");
  assert.equal(page.contexts.length, 1, "expected exactly one AudioContext");
  assert.deepEqual(page.contexts[0].started, ["running"]);
});

test("arcade.js: with sound off, taps and beeps never create an AudioContext", () => {
  const page = browser({ stored: { "arcade-sound": "off" } });
  page.run(COMMON);
  page.gesture("keydown", null);
  page.gesture("touchend", null);
  page.run("Arcade.sound.beep(660, 60)");
  assert.equal(page.contexts.length, 0);
});

/* ----------------------------------------------------------------- Breakout */

const BREAKOUT = "games/breakout/index.html";

// Shoot the ball straight up (or at vx) at the bottom row from just below it,
// with its centre at x, and step the real game until it turns back down.
// Returns the rows of the bricks it broke on the way.
const SHOOT_UP = `(function (x, vx) {
  buildWall();
  serving = false;
  ball = {x, y: TOP + ROWS * (BH + GAP) + R + 10, vx, vy: -START_SPEED};
  for (let i = 0; i < 1000 && ball.vy < 0; i++) stepBall(1 / 240);
  return bricks.filter(b => !b.alive).map(b => b.row);
})`;

test("breakout: a ball sent up into the gap between two bricks bounces off the bottom row", () => {
  const page = loadGame(BREAKOUT);
  const shoot = page.run(SHOOT_UP);
  const { SIDE, BW, GAP, ROWS } = page.run("({SIDE, BW, GAP, ROWS})");
  const bottom = ROWS - 1;
  // Every impact point across one brick plus the gap beside it, at three angles.
  for (const vx of [0, 100, -100]) {
    for (let x = SIDE + 2 * (BW + GAP); x < SIDE + 3 * (BW + GAP); x += 0.5) {
      const rows = shoot(x, vx);
      assert.ok(rows.length >= 1, `x=${x} vx=${vx}: the ball broke no brick`);
      assert.ok(
        rows.every((r) => r === bottom),
        `x=${x} vx=${vx}: the ball went on through the wall and broke bricks in rows ${JSON.stringify(rows)}`
      );
    }
  }
});

test("breakout: a ball that hits a brick on its side bounces sideways", () => {
  const page = loadGame(BREAKOUT);
  const after = page.run(`(function () {
    buildWall();
    // One brick to hit, plus a far corner one so clearing it does not end the level.
    for (const b of bricks) b.alive = false;
    const b = bricks[2 * COLS + 3];
    b.alive = true;
    bricks[0].alive = true;
    serving = false;
    ball = {x: b.x - R - 5, y: b.y + BH / 2, vx: 300, vy: 20};
    for (let i = 0; i < 100 && b.alive; i++) stepBall(1 / 240);
    return {alive: b.alive, vx: ball.vx, vy: ball.vy};
  })()`);
  assert.equal(after.alive, false, "the ball never reached the brick");
  assert.ok(after.vx < 0, `expected the ball to leave to the left, vx=${after.vx}`);
  assert.ok(after.vy > 0, `expected the vertical direction to be kept, vy=${after.vy}`);
});

test("breakout: a ball that comes down onto a brick bounces back up", () => {
  const page = loadGame(BREAKOUT);
  const after = page.run(`(function () {
    buildWall();
    const b = bricks[3];  // top row
    serving = false;
    ball = {x: b.x + BW / 2, y: b.y - R - 5, vx: 40, vy: 300};
    for (let i = 0; i < 100 && b.alive; i++) stepBall(1 / 240);
    return {alive: b.alive, vx: ball.vx, vy: ball.vy};
  })()`);
  assert.equal(after.alive, false, "the ball never reached the brick");
  assert.ok(after.vy < 0, `expected the ball to go back up, vy=${after.vy}`);
  assert.ok(after.vx > 0, `expected the horizontal direction to be kept, vx=${after.vx}`);
});

/* ---------------------------------------------------------------------- run */

const failures = [];
console.log("game runtime tests");
for (const { name, fn } of tests) {
  try {
    fn();
    console.log(`  ok  ${name}`);
  } catch (err) {
    failures.push(`${name}: ${err && err.message ? err.message : err}`);
    console.error(`FAIL  ${name}`);
  }
}

if (failures.length) {
  console.error(`\n${failures.length} failing test${failures.length === 1 ? "" : "s"}:`);
  for (const line of failures) console.error(`- ${line}`);
  process.exit(1);
}

console.log(`\nall ${tests.length} tests passed.`);
