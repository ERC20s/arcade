#!/usr/bin/env node
/*
 * check-arcade.mjs — enforce the CONTRIBUTING.md rules that were only prose.
 *
 * Plain Node (>= 18), zero dependencies, no build step. Run it from the
 * repository root with `npm run check` (or `node tools/check-arcade.mjs`).
 *
 * Usage
 *   node tools/check-arcade.mjs [--root <dir>]
 *
 * By default the repository root is the folder above tools/. The optional
 * --root <dir> (or --root=<dir>) points the same rules at another repository
 * root; `npm test` uses it to run the checker against the fixture roots in
 * tools/fixtures/. Nothing about the rules below changes with it.
 *
 * What it checks
 *   Launcher (index.html)
 *     - the <ul id="game-list"> block exists
 *     - every listed link carries class="game", has a unique href, and points
 *       at a file that actually exists on disk
 *   Every game (games/<name>/index.html) and the shared template
 *   (template/game-template/index.html)
 *     - the file opens with the metadata comment carrying Title:, Description:
 *       and Controls:
 *     - the file is <= 400 lines
 *     - it holds the back link <a class="back" href="../../index.html">
 *     - it shows a score (id="score" or the text "Score:") and a pause
 *       affordance (id="pauseBtn", id="pauseOverlay" or the text "Paused")
 *     - the folder holds no .js, .css or package.json file
 *
 * All of the text searches skip HTML comments and the contents of <script> and
 * <style> blocks, so a string in the game's JavaScript or a rule in its CSS
 * never stands in for markup the player can actually see.
 *   Every game, additionally
 *     - it is listed in the launcher and the link text starts with its Title
 *
 * Every problem prints one line as `path:line: message`; a clean run prints a
 * short summary. The exit code is 0 when clean, 1 when anything failed and 2
 * when the command line itself is wrong (a --root that names no directory).
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// The repository root the rules are applied to: the folder above tools/ unless
// --root <dir> / --root=<dir> says otherwise. A bad or missing value is a usage
// error (exit 2), which is never confused with "the arcade has problems" (1).
function rootFromArgv(argv) {
  const fallback = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  let value = null;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--root") {
      value = argv[i + 1];
      if (!value || value.startsWith("--")) value = "";
      break;
    }
    if (arg.startsWith("--root=")) {
      value = arg.slice("--root=".length);
      break;
    }
  }
  if (value === null) return fallback;
  if (!value) {
    console.error("usage: node tools/check-arcade.mjs [--root <dir>]");
    process.exit(2);
  }
  const resolved = path.resolve(value);
  if (!existsSync(resolved) || !statSync(resolved).isDirectory()) {
    console.error(`--root: not a directory: ${resolved}`);
    process.exit(2);
  }
  return resolved;
}

const ROOT = rootFromArgv(process.argv.slice(2));
const MAX_LINES = 400;
const LAUNCHER = "index.html";
const TEMPLATE = "template/game-template/index.html";
const GAMES_DIR = "games";
const BACK_HREF = "../../index.html";

const problems = [];
const checked = [];

function fail(rel, line, message) {
  problems.push(`${rel}${line ? ":" + line : ""}: ${message}`);
}

function abs(rel) {
  return path.join(ROOT, rel.split("/").join(path.sep));
}

function read(rel) {
  return readFileSync(abs(rel), "utf8");
}

function lineOf(text, index) {
  return text.slice(0, Math.max(0, index)).split("\n").length;
}

function countLines(text) {
  const lines = text.split("\n");
  // A trailing newline does not make an extra line of code.
  if (lines.length && lines[lines.length - 1] === "") lines.pop();
  return lines.length;
}

// Ranges of <!-- ... --> in a chunk of HTML, so commented-out markup (the
// launcher ships an example entry inside a comment) is never treated as live.
function commentRanges(html) {
  const ranges = [];
  const re = /<!--[\s\S]*?-->/g;
  let m;
  while ((m = re.exec(html))) ranges.push([m.index, m.index + m[0].length]);
  return ranges;
}

// Ranges of <script ...> ... </script> and <style ...> ... </style>. What is
// inside them is code, not something the player reads on screen: a JavaScript
// string "Score: " or a CSS rule #pauseBtn{...} must not stand in for the real
// on-screen markup, and an <a href="../../index.html"> built inside a string is
// not a live back link either.
function scriptStyleRanges(html) {
  const ranges = [];
  const re = /<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;
  let m;
  while ((m = re.exec(html))) ranges.push([m.index, m.index + m[0].length]);
  return ranges;
}

// Everything the checker's text searches must skip: comments plus script and
// style blocks, sorted and merged so overlaps (a <script> inside a comment, a
// comment inside a <style>) count once. Deliberately a regex heuristic, not a
// full HTML parse — arcade games are single self-contained files.
function excludedRanges(html) {
  const all = commentRanges(html).concat(scriptStyleRanges(html));
  all.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const range of all) {
    const last = merged[merged.length - 1];
    if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
    else merged.push([range[0], range[1]]);
  }
  return merged;
}

function inRanges(ranges, index) {
  return ranges.some(([start, end]) => index >= start && index < end);
}

const ENTITIES = {
  "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'",
  "&apos;": "'", "&mdash;": "—", "&ndash;": "–", "&nbsp;": " ",
  "&larr;": "←", "&rarr;": "→"
};

function text(html) {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&[a-z#0-9]+;/gi, (e) => (e in ENTITIES ? ENTITIES[e] : e))
    .replace(/\s+/g, " ")
    .trim();
}

/* ------------------------------------------------------------------ launcher */

function readLauncher() {
  if (!existsSync(abs(LAUNCHER))) {
    fail(LAUNCHER, 0, "the root launcher is missing");
    return { entries: [], ok: false };
  }
  const html = read(LAUNCHER);
  const list = html.match(/<ul\b[^>]*\bid="game-list"[^>]*>([\s\S]*?)<\/ul>/i);
  if (!list) {
    fail(LAUNCHER, 0, 'no <ul id="game-list"> ... </ul> block found; the launcher cannot list games');
    return { entries: [], ok: false };
  }
  const blockStart = html.indexOf(list[0]) + list[0].indexOf(list[1]);
  const block = list[1];
  const skip = excludedRanges(block);
  const entries = [];
  const anchor = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = anchor.exec(block))) {
    if (inRanges(skip, m.index)) continue; // an example inside a comment is not an entry
    const attrs = m[1];
    const href = (attrs.match(/\bhref="([^"]*)"/i) || [])[1] || "";
    entries.push({
      href,
      label: text(m[2]),
      hasGameClass: /\bclass="[^"]*\bgame\b[^"]*"/i.test(attrs),
      line: lineOf(html, blockStart + m.index)
    });
  }
  return { entries, ok: true };
}

function checkLauncherEntries(entries) {
  const seen = new Map();
  for (const entry of entries) {
    if (!entry.href) {
      fail(LAUNCHER, entry.line, "a launcher link has no href");
      continue;
    }
    if (!entry.hasGameClass) {
      fail(LAUNCHER, entry.line, `launcher link "${entry.href}" is missing class="game"`);
    }
    if (/^(?:[a-z]+:)?\/\//i.test(entry.href) || entry.href.startsWith("#")) {
      fail(LAUNCHER, entry.line, `launcher link "${entry.href}" is not a path to a game in this repository`);
      continue;
    }
    const rel = entry.href.replace(/^\.\//, "").split(/[?#]/)[0];
    if (seen.has(rel)) {
      fail(LAUNCHER, entry.line, `launcher lists "${rel}" twice (first at line ${seen.get(rel)})`);
    } else {
      seen.set(rel, entry.line);
    }
    if (!existsSync(abs(rel))) {
      fail(LAUNCHER, entry.line, `dead launcher link: "${rel}" does not exist on disk`);
      continue;
    }
    if (!/^games\/[^/]+\/index\.html$/.test(rel)) {
      fail(LAUNCHER, entry.line, `launcher link "${rel}" should point at games/<name>/index.html`);
    }
  }
  return seen;
}

/* --------------------------------------------------------------- game checks */

// The metadata block: the file must OPEN with the HTML comment carrying the
// three exact labels CONTRIBUTING.md requires.
function checkMetadata(rel, html) {
  const head = html.replace(/^\uFEFF/, "").trimStart();
  if (!head.startsWith("<!--")) {
    fail(rel, 1, "file does not start with the required metadata comment (<!-- Title: ... -->)");
    return null;
  }
  const end = head.indexOf("-->");
  if (end === -1) {
    fail(rel, 1, "the metadata comment is never closed with -->");
    return null;
  }
  const block = head.slice(0, end);
  const fields = {};
  for (const label of ["Title", "Description", "Controls"]) {
    const m = block.match(new RegExp("^\\s*" + label + ":\\s*(\\S.*?)\\s*$", "m"));
    if (!m) fail(rel, 1, `metadata comment is missing a non-empty "${label}:" field`);
    else fields[label] = m[1];
  }
  return fields;
}

function checkFolder(rel) {
  const dir = path.dirname(abs(rel));
  let names = [];
  try {
    names = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of names) {
    const full = path.join(dir, name);
    let isDir = false;
    try { isDir = statSync(full).isDirectory(); } catch { isDir = false; }
    if (isDir) continue;
    if (name === "package.json" || /\.(js|mjs|cjs|css)$/i.test(name)) {
      fail(`${path.posix.dirname(rel)}/${name}`, 0,
        "no separate source files in a game folder: the game must be one self-contained index.html");
    }
  }
}

function checkGameFile(rel, { registration }) {
  if (!existsSync(abs(rel))) {
    fail(rel, 0, "expected file is missing");
    return;
  }
  const html = read(rel);
  const fields = checkMetadata(rel, html);

  // Enforce minimal Controls content: the Controls: metadata must mention a
  // movement affordance (Arrow keys or WASD), an action input (Space/Enter/tap/action)
  // and a pause affordance (P or Pause). This is a conservative, token-based
  // check to catch common omissions; keep the diagnostic short and actionable.
  if (fields && fields.Controls) {
    const controls = fields.Controls;
    const movementRe = /\b(?:arrow|arrows|wasd)\b/i;
    const actionRe = /\b(?:space|enter|tap|action)\b/i;
    const pauseRe = /\b(?:P|Pause)\b/i;
    if (!movementRe.test(controls) || !actionRe.test(controls) || !pauseRe.test(controls)) {
      fail(rel, 1, 'missing required Controls details: include movement (Arrow or WASD), an action (Space/Enter/tap) and pause (P/Pause)');
    }
  }

  const lines = countLines(html);
  if (lines > MAX_LINES) {
    fail(rel, lines, `file is ${lines} lines; the limit is ${MAX_LINES}`);
  }

  // Look for live <a ...> anchors whose href points exactly at BACK_HREF,
  // ignoring comment, script and style ranges, accepting single or double quotes and any
  // attribute order. If such an anchor exists but its class attribute does
  // not include the token 'back' (case-insensitive, as a space-separated
  // token), report a single-line diagnostic pointing at the anchor's line.
  // Additionally require evidence that the back link will be a tappable target
  // (44×44 CSS pixels): either inline style on the anchor with min-/width/height
  // declarations in pixels >= 44, or a <style> block rule targeting a.back or
  // .back that sets min-width/min-height/width/height to >= 44px. This is a
  // conservative, regex-based heuristic and intentionally only looks for
  // literal px declarations inside the game's file.
  const skip = excludedRanges(html);
  const anchorRe = /<a\b([^>]*)>/gi;
  let m;
  let found = false;
  let sizeEvidence = false;
  // Keep a line number for the first back anchor with class so diagnostics point
  // at a useful location when tappable evidence is missing.
  let firstBackLine = 0;
  while ((m = anchorRe.exec(html))) {
    const idx = m.index;
    if (inRanges(skip, idx)) continue;
    const attrs = m[1];
    const hrefMatch = attrs.match(/\bhref\s*=\s*(['"])(.*?)\1/i);
    if (!hrefMatch) continue;
    const hrefVal = hrefMatch[2];
    if (hrefVal !== BACK_HREF) continue;
    found = true;
    const classMatch = attrs.match(/\bclass\s*=\s*(['"])(.*?)\1/i);
    let hasBack = false;
    if (classMatch && classMatch[2]) {
      const tokens = classMatch[2].split(/\s+/).filter(Boolean);
      hasBack = tokens.some(t => t.toLowerCase() === "back");
    }
    if (!hasBack) {
      const line = lineOf(html, idx);
      fail(rel, line, 'missing class="back" on back link');
      continue;
    }
    // Record the line of the first back anchor with class for later diagnostics.
    if (!firstBackLine) firstBackLine = lineOf(html, idx);

    // Check inline style attribute for px-based width/height/min-* rules >= 44
    const styleMatch = attrs.match(/\bstyle\s*=\s*(['"])([\s\S]*?)\1/i);
    if (styleMatch && styleMatch[2]) {
      const styleText = styleMatch[2];
      const dimRe = /(?:min-width|min-height|width|height)\s*:\s*([0-9]+)px/gi;
      let dm;
      while ((dm = dimRe.exec(styleText))) {
        const n = Number(dm[1]);
        if (!Number.isNaN(n) && n >= 44) {
          sizeEvidence = true;
          break;
        }
      }
      if (sizeEvidence) break;
    }
    // If no inline evidence yet, continue to next anchor and we'll scan <style>
    // blocks once after the anchor loop; a later anchor might have inline evidence.
  }

  // If we haven't found inline evidence but we did find at least one back anchor
  // with class="back", search the file's <style> blocks for rules that target
  // a.back or .back and declare pixel-based dimensions >= 44.
  if (!sizeEvidence && firstBackLine) {
    const styleBlockRe = /<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi;
    let sbm;
    while ((sbm = styleBlockRe.exec(html))) {
      const css = sbm[1];
      // Very small CSS rule parser: selector { body }
      const ruleRe = /([^{}]+)\{([^}]*)\}/g;
      let rm;
      while ((rm = ruleRe.exec(css))) {
        const selector = rm[1];
        const body = rm[2];
        if (!/\b(a\.back|\.back)\b/i.test(selector)) continue;
        const dimRe = /(?:min-width|min-height|width|height)\s*:\s*([0-9]+)px/gi;
        let dm;
        while ((dm = dimRe.exec(body))) {
          const n = Number(dm[1]);
          if (!Number.isNaN(n) && n >= 44) {
            sizeEvidence = true;
            break;
          }
        }
        if (sizeEvidence) break;
      }
      if (sizeEvidence) break;
    }
  }

  if (!found) {
    fail(rel, 0, `no back link to the launcher: expected <a class="back" href="${BACK_HREF}">`);
  } else if (firstBackLine && !sizeEvidence) {
    fail(rel, firstBackLine, 'back link does not show tappable-size evidence: add an inline style or a <style> rule targeting a.back or .back that sets min-width/min-height/width/height to at least 44px (see CONTRIBUTING.md)');
  }

  // Require a visible score indicator and a pause affordance. Both searches use
  // the excluded ranges computed above, so commented-out markup, JavaScript
  // strings and CSS rules never count: only what is in the live DOM does.
  function foundOutsideExcluded(re) {
    let mm;
    // Ensure global flag for repeated exec calls
    const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : (re.flags + "g").replace(/g+/g, "g"));
    while ((mm = g.exec(html))) {
      if (!inRanges(skip, mm.index)) return true;
    }
    return false;
  }

  // Visible score: either an element with id="score" or the literal text
  // "Score:" in the live DOM (outside comments, <script> and <style>).
  const idScoreRe = /\bid\s*=\s*(?:(["'])score\1|score\b)/i;
  const textScoreRe = /\bScore:/i;
  const hasScore = foundOutsideExcluded(idScoreRe) || foundOutsideExcluded(textScoreRe);
  if (!hasScore) {
    fail(rel, 0, 'missing visible score: add id="score" or the text "Score:" to the markup (a match inside <script>, <style> or a comment does not count)');
  }

  // Pause affordance: id="pauseBtn" OR id="pauseOverlay" OR the literal text "Paused"
  const idPauseBtnRe = /\bid\s*=\s*(?:(["'])pauseBtn\1|pauseBtn\b)/i;
  const idPauseOverlayRe = /\bid\s*=\s*(?:(["'])pauseOverlay\1|pauseOverlay\b)/i;
  const textPausedRe = /\bPaused\b/i;
  const hasPause = foundOutsideExcluded(idPauseBtnRe) || foundOutsideExcluded(idPauseOverlayRe) || foundOutsideExcluded(textPausedRe);
  if (!hasPause) {
    fail(rel, 0, 'missing pause affordance: add an on-screen pause button (id="pauseBtn") or a pause overlay (id="pauseOverlay") to the markup (a match inside <script>, <style> or a comment does not count)');
  }

  checkFolder(rel);

  if (registration) {
    const line = registration.listed.get(rel);
    if (!line) {
      fail(rel, 0, `not registered in the launcher: add <li><a class="game" href="${rel}">Title — one-line description</a></li> inside <ul id="game-list"> in ${LAUNCHER}`);
    } else if (fields && fields.Title) {
      const entry = registration.entries.find((e) => e.href.replace(/^\.\//, "").split(/[?#]/)[0] === rel);
      const label = entry ? entry.label : "";
      if (!label.toLowerCase().startsWith(fields.Title.toLowerCase())) {
        fail(LAUNCHER, line, `launcher link text "${label}" does not start with the game's Title "${fields.Title}" (${rel})`);
      }
    }
  }
  checked.push(rel);
}

function listGames() {
  const dir = abs(GAMES_DIR);
  if (!existsSync(dir)) return [];
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    const full = path.join(dir, name);
    let isDir = false;
    try { isDir = statSync(full).isDirectory(); } catch { isDir = false; }
    if (!isDir) continue;
    const rel = `${GAMES_DIR}/${name}/index.html`;
    if (!existsSync(abs(rel))) {
      fail(`${GAMES_DIR}/${name}`, 0, "game folder has no index.html");
      continue;
    }
    out.push(rel);
  }
  return out;
}

/* ---------------------------------------------------------------------- run */

const launcher = readLauncher();
const listed = launcher.ok ? checkLauncherEntries(launcher.entries) : new Map();
const registration = { listed, entries: launcher.entries };

const games = listGames();
for (const rel of games) checkGameFile(rel, { registration });

// The template is held to the same rules (minus registration): it is what every
// game is copied from, so a break there breaks every future submission.
checkGameFile(TEMPLATE, { registration: null });

if (launcher.ok) checked.unshift(`${LAUNCHER} (launcher, ${launcher.entries.length} entr${launcher.entries.length === 1 ? "y" : "ies"})`);

if (problems.length) {
  for (const line of problems) console.error(line);
  console.error(`\n${problems.length} problem${problems.length === 1 ? "" : "s"} found. See CONTRIBUTING.md.`);
  process.exit(1);
}

console.log(`arcade check passed — ${checked.join(", ")} ${games.length ? "" : "; no games merged yet"}.`);
