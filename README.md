# arcade
A collection of small browser games, one folder each, zero dependencies, keyboard and touch, shared launcher.

## Layout

```
index.html                      the shared launcher: links to every merged game
games/<name>/index.html         one game per folder, single self-contained HTML file
template/game-template/         minimal starting point to copy into games/<name>/
CONTRIBUTING.md                 the rules a game must meet
.github/PULL_REQUEST_TEMPLATE.md  the checklist a reviewer works through
```

## Run it locally

There is nothing to install and no build step. Serve the repository root on the
port this repository already declares in its `.d8a` run entry (`arcade`):

```
npx --yes serve -l 5002 .
```

Then open http://localhost:5002/ for the launcher, and click through to a game.
Serve the root rather than opening a game file directly, so the relative links
(`games/<name>/index.html` out of the launcher, `../../index.html` back) resolve
exactly as they will after merge.

## Add a game

1. Copy `template/game-template/index.html` to `games/<name>/index.html`.
2. Edit the metadata header (Title, Description, Controls).
3. Keep it to one file, at most 400 lines, no dependencies.
4. Support keyboard (movement, action, pause) and touch (tap to act, on-screen pause).
5. Include a visible link back to the launcher, focusable with Tab and at least
   44x44 CSS pixels to tap:
   `<a class="back" href="../../index.html">&larr; Arcade</a>`
6. Register the game in the launcher by adding one line inside
   `<ul id="game-list">` in the root `index.html`:
   `<li><a class="game" href="games/<name>/index.html">Title — one-line description</a></li>`

Steps 5 and 6 are review-blocking: without them a game is either invisible from
the arcade or a dead end once opened.

Full rules: [CONTRIBUTING.md](CONTRIBUTING.md).
Starting point: [template/game-template/index.html](template/game-template/index.html).
Reviewer checklist: [.github/PULL_REQUEST_TEMPLATE.md](.github/PULL_REQUEST_TEMPLATE.md).
