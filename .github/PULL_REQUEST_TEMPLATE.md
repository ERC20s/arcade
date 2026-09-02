Short description of the change

Describe the game or change in one sentence.

Checklist for contributors

- [ ] Game folder added at games/<name>/ with an entrypoint at games/<name>/index.html
- [ ] Single-file game: index.html is the only source file required (assets in the same folder are allowed); total source <= 400 lines
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
- [ ] Back-to-launcher link present (the template's <a id="backLink" href="../../index.html">), reachable by Tab/Enter and by tap, and still clickable while paused
- [ ] Tested in desktop and mobile browsers; list the user agent/browser used for verification
- [ ] Short controls summary and one-line gameplay description included in the PR description
- [ ] Optional: attach a screenshot or short GIF showing gameplay

Notes for reviewers

- This project expects "a collection of small, single-file browser games in games/<name>/index.html." See README/CONTRIBUTING for full expectations.
- The template is advisory: reviewers should still confirm the above checks.

Thank you for contributing a small, keyboard + touch friendly game.