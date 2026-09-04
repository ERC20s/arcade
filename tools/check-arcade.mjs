#!/usr/bin/env node
/*
 * check-arcade.mjs — enforce the CONTRIBUTING.md rules that were only prose.
 *
 * Plain Node (>= 18), zero dependencies, no build step. Run it from the
 * repository root with `npm run check` (or `node tools/check-arcade.mjs`).
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
 * short summary. The exit code is 0 when clean and 1 when anything failed.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
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

  const lines = countLines(html);
  if (lines > MAX_LINES) {
    fail(rel, lines, `file is ${lines} lines; the limit is ${MAX_LINES}`);
  }

  // Look for live <a ...> anchors whose href points exactly at BACK_HREF,
  // ignoring comment, script and style ranges, accepting single or double quotes and any
  // attribute order. If such an anchor exists but its class attribute does
  // not include the token 'back' (case-insensitive, as a space-separated
  // token), report a single-line diagnostic pointing at the anchor's line.
  const skip = excludedRanges(html);
  const anchorRe = /<a\b([^>]*)>/gi;
  let m;
  let found = false;
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
    }
  }
  if (!found) {
    fail(rel, 0, `no back link to the launcher: expected <a class="back" href="${BACK_HREF}">`);
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
