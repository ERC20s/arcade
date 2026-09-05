#!/usr/bin/env node
/*
 * test-check-arcade.mjs — the arcade checker's own self-test.
 *
 * Plain Node (>= 18), zero dependencies, no build step. Run it from the
 * repository root with `npm test` (or `node tools/test-check-arcade.mjs`).
 *
 * How it works
 *   tools/fixtures/clean/ is a whole tiny arcade repository: a launcher, one
 *   game (games/demo/index.html) and a shared template, all of which satisfy
 *   every rule in tools/check-arcade.mjs. Every other folder under
 *   tools/fixtures/ is an OVERLAY holding only the files that differ.
 *
 *   For each case the test copies clean/ into a temporary directory, copies the
 *   overlay on top, runs `node tools/check-arcade.mjs --root <tmp>` and asserts
 *   the exit code plus the problem line that must (or must not) appear.
 *
 *   It finally runs the checker against this repository itself and asserts a
 *   clean exit, so the launcher, Snake and the template are a regression
 *   fixture too: a new rule that is too broad fails here instead of at a vote.
 *
 * Exit code: 0 when every case passes, 1 when any case fails.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { appendFileSync, cpSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..");
const CHECKER = path.join(HERE, "check-arcade.mjs");
const FIXTURES = path.join(HERE, "fixtures");
const BASE = path.join(FIXTURES, "clean");

/* ------------------------------------------------------------------ helpers */

function runChecker(args) {
  const result = spawnSync(process.execPath, [CHECKER, ...args], { encoding: "utf8" });
  if (result.error) throw result.error;
  return {
    status: result.status,
    output: `${result.stdout || ""}${result.stderr || ""}`
  };
}

// clean/ copied into a fresh temp directory, with the named overlay (if any)
// copied over it. Returns the temp root the checker is pointed at.
function compose(overlay) {
  const root = mkdtempSync(path.join(os.tmpdir(), "arcade-fixture-"));
  cpSync(BASE, root, { recursive: true });
  if (overlay) {
    const dir = path.join(FIXTURES, overlay);
    assert.ok(existsSync(dir), `fixture overlay is missing: tools/fixtures/${overlay}`);
    cpSync(dir, root, { recursive: true });
  }
  return root;
}

/* -------------------------------------------------------------------- cases */

// exit: the exit code the checker must return (0 clean, 1 problems found).
// includes / excludes: substrings that must / must not appear in its output.
// mutate: optional last-minute change to the composed root, for a case that
// would be silly to check in as a file (a 400+ line game).
const CASES = [
  {
    name: "clean fixture passes",
    overlay: null,
    exit: 0,
    includes: ["arcade check passed", "games/demo/index.html"],
    excludes: ["problem", "missing", "dead launcher link"]
  },
  {
    name: "a game with no back link is rejected",
    overlay: "missing-back-link",
    exit: 1,
    includes: ["games/demo/index.html", "no back link to the launcher"]
  },
  {
    name: "a back link without class=\"back\" is rejected",
    overlay: "back-link-without-class",
    exit: 1,
    includes: ["games/demo/index.html", 'missing class="back" on back link']
  },
  {
    name: "a score that only exists inside <script> does not count",
    overlay: "score-only-inside-script",
    exit: 1,
    includes: ["games/demo/index.html", "missing visible score"]
  },
  {
    name: "a pause affordance that only exists inside <style> does not count",
    overlay: "pause-only-in-css",
    exit: 1,
    includes: ["games/demo/index.html", "missing pause affordance"]
  },
  {
    name: "a game missing from the launcher is rejected",
    overlay: "unregistered-game",
    exit: 1,
    includes: ["games/demo/index.html", "not registered in the launcher"]
  },
  {
    name: "a launcher label that does not start with the Title is rejected",
    overlay: "label-does-not-match-title",
    exit: 1,
    includes: ["index.html", "does not start with the game's Title"]
  },
  {
    name: "a launcher link to a game that does not exist is rejected",
    overlay: "dead-launcher-link",
    exit: 1,
    includes: ["index.html", "dead launcher link", "games/ghost/index.html"]
  },
  {
    name: "a stray .js file in a game folder is rejected",
    overlay: "stray-js-in-game-folder",
    exit: 1,
    includes: ["games/demo/stray.js", "no separate source files in a game folder"]
  },
  {
    name: "a game over 400 lines is rejected",
    overlay: null,
    exit: 1,
    includes: ["games/demo/index.html", "the limit is 400"],
    mutate(root) {
      const game = path.join(root, "games", "demo", "index.html");
      let padding = "";
      for (let i = 1; i <= 400; i++) padding += `<!-- padding line ${i} -->\n`;
      appendFileSync(game, padding, "utf8");
    }
  },
  {
    name: "a Controls field that omits required tokens is rejected",
    overlay: "controls-missing",
    exit: 1,
    includes: ["games/demo/index.html", "missing required Controls details"]
  },
  {
    name: "a <title> that does not start with the metadata Title is rejected",
    overlay: "title-mismatch",
    exit: 1,
    includes: ["games/demo/index.html", "page <title> does not start with the game's Title"]
  }
];

/* ---------------------------------------------------------------------- run */

const failures = [];

function check(name, fn) {
  try {
    fn();
    console.log(`  ok  ${name}`);
  } catch (err) {
    failures.push(`${name}: ${err && err.message ? err.message : err}`);
    console.error(`FAIL  ${name}`);
  }
}

console.log("arcade checker self-test");

for (const testCase of CASES) {
  let root = null;
  try {
    root = compose(testCase.overlay);
    if (testCase.mutate) testCase.mutate(root);
    const { status, output } = runChecker(["--root", root]);
    check(testCase.name, () => {
      assert.equal(
        status,
        testCase.exit,
        `expected exit ${testCase.exit}, got ${status}. Checker said:\n${output}`
      );
      for (const needle of testCase.includes || []) {
        assert.ok(output.includes(needle), `expected output to mention "${needle}". Checker said:\n${output}`);
      }
      for (const needle of testCase.excludes || []) {
        assert.ok(!output.includes(needle), `expected output NOT to mention "${needle}". Checker said:\n${output}`);
      }
    });
  } catch (err) {
    failures.push(`${testCase.name}: ${err && err.message ? err.message : err}`);
    console.error(`FAIL  ${testCase.name}`);
  } finally {
    if (root) rmSync(root, { recursive: true, force: true });
  }
}

// The real repository is a fixture too: whatever is merged must stay clean.
check("this repository passes its own checker (no --root)", () => {
  const { status, output } = runChecker([]);
  assert.equal(status, 0, `expected a clean run of the real repository, got exit ${status}:\n${output}`);
  assert.ok(output.includes("arcade check passed"), `expected the pass line, got:\n${output}`);
});

check("--root=<dir> is accepted and agrees with the default root", () => {
  const { status } = runChecker([`--root=${REPO}`]);
  assert.equal(status, 0, `expected --root=<repo> to be a clean run, got exit ${status}`);
});

check("--root with no directory is a usage error, not a rule failure", () => {
  assert.equal(runChecker(["--root"]).status, 2);
});

check("--root pointing at a directory that does not exist is a usage error", () => {
  const missing = path.join(os.tmpdir(), "arcade-fixture-does-not-exist-4c1f9");
  assert.equal(runChecker(["--root", missing]).status, 2);
});

if (failures.length) {
  console.error(`\n${failures.length} failing check${failures.length === 1 ? "" : "s"}:`);
  for (const line of failures) console.error(`- ${line}`);
  process.exit(1);
}

console.log(`\nall ${CASES.length + 4} checks passed.`);
