This project collects small, single-file browser games in games/<name>/index.html.
Follow these minimal rules so games work with the shared launcher and stay easy to review.

Folder layout
- Put each game in its own folder under games/, with the entry file at games/<name>/index.html.
- No build step or external dependencies: the game must be a single HTML file with inline CSS and JS. Small static assets (an image, a sound) may sit in the same folder, but there are no separate .js/.css source files, no package.json, no bundler and no CDN runtime.

Required metadata
- Each index.html must start with an HTML comment block containing these fields (exact labels):
  <!--
  Title: Short game title
  Description: One-sentence summary (what the player does)
  Controls: List of controls (keyboard + touch)
  -->
- The launcher and reviewers will read these fields to show the game list and basic info.

Size constraint
- The 400-line limit applies to games/<name>/index.html: that file must be <= 400 lines. Static assets in the folder are not counted.
- Keep code concise; utility comments are fine.

Keyboard and touch
- Games must support keyboard controls and basic touch input.
- Minimum required controls: movement (arrow keys or WASD), one action button (e.g. Space), and a pause toggle (P).
- Provide equivalent touch affordances: tap for action, an on-screen pause button or two-finger tap to pause.
- Every game must carry a visible link back to the launcher. Use a plain anchor to the root launcher:
  <a class="back" href="../../index.html">&larr; Arcade</a>
- The back link must be reachable both ways: focusable with Tab and followed with Enter, with a visible focus style, and tappable with a target of at least 44x44 CSS pixels. Do not swallow Enter or Tab in a global keydown handler, and keep the link clear of the pause overlay so it still works while paused.
- Stand down only for the keys a focused control actually consumes (Tab always, Enter and Space while a link, button or form control has focus). Never return early from the whole keydown handler just because something interactive is focused: clicking the on-screen Pause button leaves focus on it, and a blanket guard would kill arrows, WASD and P until the player clicked elsewhere.

Register the game in the launcher
- A game is not done until it is listed. In the same pull request, add one line inside <ul id="game-list"> in the root index.html:
  <li><a class="game" href="games/<name>/index.html">Title &mdash; one-line description</a></li>
- Use the Title and Description from the game's own metadata header so the launcher and the file agree.
- The launcher's empty-state note (section id="empty-note") is meant to disappear once the list has entries. If it is still visible after you add your line, say so in the pull request rather than deleting the launcher's other markup.

Accessibility and UX
- Provide a visible score or progress indicator (simple numeric counter is acceptable).
- Provide a clear visual pause overlay or state so players know the game is paused.
- Respect basic contrast and tappable target sizes for mobile.

Template
- A minimal template is included at template/game-template/index.html. Copy it into games/<name>/index.html and edit the metadata block and game code.
- Game loops must be time-based: use delta-time (dt) in seconds and express velocities in units per second. Clamp dt to a reasonable maximum (we recommend 0.25) to avoid large jumps after backgrounding, and use fractional accumulators for counters so visible numbers step cleanly. The template demonstrates the pattern.
- The template now ships with the back-to-launcher link already in place (<a class="back" href="../../index.html">), sized as a 44x44 tap target, with a visible focus outline and above the pause overlay. Keep it when you copy the template, and keep its href pointing at ../../index.html, which resolves to the root launcher from games/<name>/index.html.
- The template's global keydown handler stands down for Tab, and for Enter and Space while a link or button has focus, so those keys keep working on the back link and the pause button while movement and pause keys stay with the game. If you rewrite the input handling, preserve that guard as written — do not widen it back to every key.
- Everything else is still on you: the template is a starting point, not proof of compliance, and your game still needs the launcher list entry described above before it can be merged.

How to verify a submission
- Run npm run check from the repository root (Node 18 or newer; no install, no dependencies). It re-checks the launcher links, the metadata header, the back link, the 400-line limit and the no-extra-source-files rule for every game and for the template, prints one line per problem and exits non-zero. It is a first pass, not a replacement for the manual checks below.
- If your change touches a rule in tools/check-arcade.mjs, also run npm test. That is the checker's own self-test: it runs the checker with --root against the small fixture arcades in tools/fixtures/ (a clean one and one per known-bad case) and against this repository, and asserts the exit code and the problem line. A rule that is too broad fails the clean fixture; a rule that is too narrow fails its known-bad fixture. Add a fixture folder and a row in the CASES table there when you add a rule.
- Serve the repository root (see README.md) and open the launcher, not the game file directly, so relative links behave as they will after merge.
- Check the metadata header is present and correct.
- Check the launcher lists the game: the new <li> is inside <ul id="game-list">, the link opens games/<name>/index.html, and the title and description match the metadata header.
- Verify keyboard input (arrows, Space, P), touch taps trigger the action, and the pause overlay appears and hides.
- Click the on-screen pause button with the mouse, click it again to resume, then press the movement keys and P without clicking anywhere else: the keyboard must still work.
- Verify the back link both ways: Tab to it (focus must be visible), press Enter and land on the launcher; then tap it on a touch screen or a narrow window. Repeat once while the game is paused.
- Check index.html is <= 400 lines and that the folder holds no extra source files.
- A submission that fails the launcher entry or the back link is not merged: the game would be unreachable from the arcade, or a dead end once opened.

Questions
- If a game needs relaxed constraints for a specific reason (larger file, assets), open an issue describing why and propose a path forward.

Thank you for keeping games small, keyboard + touch friendly, and easy for the launcher to list.