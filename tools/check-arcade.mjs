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
 *     - it holds the back link <a ... href="../../index.html">
 *     - the folder holds no .js, .css or package.json file
 *   Every game, additionally
 *     - it is listed in the launcher and the link text starts with its Title
 *
 *   Additionally: a focused external-asset detector flags absolute remote
 *   URLs (http:, https:, or protocol-relative //) in common resource
 *   attributes and @import inside <style> blocks. Values that start with
 *   data:, blob:, or are same-folder relative (no leading protocol or //) are
 *   allowed. Commented HTML (<!-- -->) is ignored and line numbers are kept.
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
  const skip = commentRanges(block);
  const entries = [];
  const anchor = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = anchor.exec(block))) {
    if (inRanges(skip, m.index)) continue; // an example inside a comment is not an entry
    const attrs = m[1];
    const href = (attrs.match(/\bhref=("|')([^"']*)\1/i) || [])[2] || "";
    entries.push({
      href,
      label: text(m[2]),
      hasGameClass: /\bclass=("|')[^"']*\bgame\b[^"']*\1/i.test(attrs),
      line: lineOf(html, blockStart + m.index)
    });
  }

  // Scan launcher for remote assets as well
  scanForRemoteAssets(LAUNCHER, html);

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
      fail(LAUNCHER, entry.line, `launcher link "${entry.href}" is missing class="game"");
    }
    if (/^(?:[a-z]+:)?\/\//i.test(entry.href) || entry.href.startsWith("#")) {
      fail(LAUNCHER, entry.line, `launcher link "${entry.href}" is not a path to a game in this repository");
      continue;
    }
    const rel = entry.href.replace(/^\.\//, "").split(/[?#]/)[0];
    if (seen.has(rel)) {
      fail(LAUNCHER, entry.line, `launcher lists "${rel}" twice (first at line ${seen.get(rel)})");
    } else {
      seen.set(rel, entry.line);
    }
    if (!existsSync(abs(rel))) {
      fail(LAUNCHER, entry.line, `dead launcher link: "${rel}" does not exist on disk");
      continue;
    }
    if (!/^games\/[^/]+\/index\.html$/.test(rel)) {
      fail(LAUNCHER, entry.line, `launcher link "${rel}" should point at games/<name>/index.html");
    }
  }
  return seen;
}

/* --------------------------------------------------------------- game checks */

// The metadata block: the file must OPEN with the HTML comment carrying the
// three exact labels CONTRIBUTING.md requires.
function checkMetadata(rel, html) {
  const head = html.replace(/^\ufeff/, "").trimStart();
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
    if (!m) fail(rel, 1, `metadata comment is missing a non-empty "${label}:" field");
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

// New: focused external-asset detector
function scanForRemoteAssets(rel, html) {
  const ranges = commentRanges(html);

  function isRemote(url) {
    if (!url) return false;
    const s = url.trim();
    if (/^data:/i.test(s)) return false;
    if (/^blob:/i.test(s)) return false;
    return /^(?:https?:|\/\/)/i.test(s);
  }

  function reportAt(index, msg) {
    if (inRanges(ranges, index)) return;
    const line = lineOf(html, index);
    fail(rel, line, msg);
  }

  // script src
  const scriptRe = /<script\b[^>]*\bsrc\s*=\s*(['"])(.*?)\1/gi;
  let m;
  while ((m = scriptRe.exec(html))) {
    const url = m[2];
    const idx = m.index + m[0].indexOf(m[2]);
    if (isRemote(url)) reportAt(idx, `remote URL in <script src>: ${url}`);
  }

  // link rel=stylesheet href
  const linkRe = /<link\b([^>]*)>/gi;
  while ((m = linkRe.exec(html))) {
    const attrs = m[1];
    if (!/\brel\s*=\s*(['"]).*?stylesheet.*?\1/i.test(attrs)) continue;
    const hm = attrs.match(/\bhref\s*=\s*(['"])(.*?)\1/i);
    if (!hm) continue;
    const url = hm[2];
    const idx = m.index + m[0].indexOf(hm[0]) + hm[0].indexOf(hm[2]);
    if (isRemote(url)) reportAt(idx, `remote URL in <link rel=stylesheet href>: ${url}`);
  }

  // src and similar attributes on common tags
  const attrPatterns = ["img", "audio", "video", "source", "track", "iframe", "embed"];
  for (const tag of attrPatterns) {
    const re = new RegExp(`<${tag}\\b[^>]*\\bsrc\\s*=\\s*(['\\\"])(.*?)\\1`, "gi");
    while ((m = re.exec(html))) {
      const url = m[2];
      const idx = m.index + m[0].indexOf(m[2]);
      if (isRemote(url)) reportAt(idx, `remote URL in <${tag} src>: ${url}`);
    }
  }

  // img srcset (may appear on <img> or <source>)
  const srcsetRe = /\bsrcset\s*=\s*(['"])(.*?)\1/gi;
  while ((m = srcsetRe.exec(html))) {
    const val = m[2];
    const idxBase = m.index + m[0].indexOf(m[2]);
    // srcset: comma-separated list of URLs with optional descriptors
    const parts = val.split(/\s*,\s*/);
    let offset = 0;
    for (const p of parts) {
      const url = p.split(/\s+/)[0];
      const idx = idxBase + val.indexOf(p, offset);
      offset += p.length + 1;
      if (isRemote(url)) reportAt(idx, `remote URL in srcset: ${url}`);
    }
  }

  // object data=
  const objectRe = /<object\b[^>]*\bdata\s*=\s*(['"])(.*?)\1/gi;
  while ((m = objectRe.exec(html))) {
    const url = m[2];
    const idx = m.index + m[0].indexOf(m[2]);
    if (isRemote(url)) reportAt(idx, `remote URL in <object data>: ${url}`);
  }

  // @import inside <style>
  const styleRe = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
  while ((m = styleRe.exec(html))) {
    const block = m[1];
    const blockStart = m.index + m[0].indexOf(block);
    const importRe = /@import\s+(?:url\()?(?:['"])?([^'"\)\s;]+)(?:['"])?\)?/gi;
    let im;
    while ((im = importRe.exec(block))) {
      const url = im[1];
      const idx = blockStart + im.index + im[0].indexOf(im[1]);
      if (isRemote(url)) reportAt(idx, `remote URL in @import: ${url}`);
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

  // Scan for remote assets in every game and template too
  scanForRemoteAssets(rel, html);

  const lines = countLines(html);
  if (lines > MAX_LINES) {
    fail(rel, lines, `file is ${lines} lines; the limit is ${MAX_LINES}`);
  }

  const back = new RegExp('<a\\b[^>]*href="' + BACK_HREF.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + '"', "i");
  if (!back.test(html)) {
    fail(rel, 0, `no back link to the launcher: expected <a class="back" href="${BACK_HREF}">`);
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

console.log(`arcade check passed — ${checked.join(", ")}${games.length ? "" : "; no games merged yet"}.`);
