Short description of the change

Describe the game or change in one sentence.

Checklist for contributors

- [ ] Game folder added at games/<name>/ with an entrypoint at games/<name>/index.html
- [ ] Single-file game: games/<name>/index.html is the only source file (small static assets in the same folder are allowed; no other HTML/JS/CSS source files); index.html is <= 400 lines
- [ ] No external build step or runtime dependencies (no package.json, bundlers, or CDN-only runtime requirements)
- [ ] Required metadata header present at the top of index.html using these exact labels:
  <!--
  Title: Short game title
  Description: One-sentence summary (what the player does)
  Controls: List of controls (keyboard + touch)
  -->
- [ ] Keyboard controls implemented (movement, action, pause — e.g. arrows/WASD, Space, P)
- [ ] Touch support provided or noted (tap for action, an on-screen pause button or two-finger tap)
- [ ] Visible score or progress indicator included
- [ ] Pause state clearly visible and toggled by the required control
- [ ] Back-to-launcher link present in games/<name>/index.html: a visible link with href="../../index.html", reachable by keyboard (Tab to focus, Enter to follow, visible focus style) and by tap (target at least 44x44 CSS pixels), and not covered by the pause overlay
- [ ] Launcher entry added to the root index.html game list, exactly one line in the form:
  <li><a class="game" href="games/<name>/index.html">Title — one-line description</a></li>
- [ ] Tested in desktop and mobile browsers; list the user agent/browser used for verification
- [ ] Short controls summary and one-line gameplay description included in the PR description
- [ ] Optional: attach a screenshot or short GIF showing gameplay

Notes for reviewers

- This project expects "a collection of small, single-file browser games in games/<name>/index.html." See README/CONTRIBUTING for full expectations.
- The template is advisory: reviewers should still confirm the above checks.
- Two checks are not optional, because a game that fails either one is unreachable from the arcade: the launcher list entry in the root index.html, and the back-to-launcher link inside the game. Verify both by hand — open the root index.html, click through to the game, then return with Tab+Enter and with a tap.
- If the game's own back link differs from href="../../index.html" (for example the game sits at another depth), confirm the link still resolves to the root launcher before approving.

Thank you for contributing a small, keyboard + touch friendly game.