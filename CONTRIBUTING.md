This project collects small, single-file browser games in games/<name>/index.html.
Follow these minimal rules so games work with the shared launcher and stay easy to review.

Folder layout
- Put each game in its own folder under games/, with the entry file at games/<name>/index.html.
- No build step or external dependencies: each game must be a single HTML file (may include inline CSS and JS).

Required metadata
- Each index.html must start with an HTML comment block containing these fields (exact labels):
  <!--
  Title: Short game title
  Description: One-sentence summary (what the player does)
  Controls: List of controls (keyboard + touch)
  -->
- The launcher and reviewers will read these fields to show the game list and basic info.

Size constraint
- Each game's index.html must be <= 400 lines (lines are used to keep games small and reviewable).
- Keep code concise; utility comments are fine.

Keyboard and touch
- Games must support keyboard controls and basic touch input.
- Minimum required controls: movement (arrow keys or WASD), one action button (e.g. Space), and a pause toggle (P).
- Provide equivalent touch affordances: tap for action, an on-screen pause button or two-finger tap to pause.

Accessibility and UX
- Provide a visible score or progress indicator (simple numeric counter is acceptable).
- Provide a clear visual pause overlay or state so players know the game is paused.
- Respect basic contrast and tappable target sizes for mobile.

Template
- A minimal template is included at template/game-template/index.html. Copy it into games/<name>/index.html and edit the metadata block and game code.

How to verify a submission
- Open games/<name>/index.html in a browser.
- Check the metadata header is present and correct.
- Verify keyboard input (arrows, Space, P), touch taps trigger the action, and the pause overlay appears and hides.
- Pause the game and confirm Resume is still tappable: the pause overlay must never cover the on-screen pause button (give the button a higher z-index than the overlay), so a touch-only player can always resume.
- Confirm action input does nothing while paused: Space and taps must not score, move or otherwise change state until the game is resumed; only the pause toggle (P and the pause button) stays live.

Questions
- If a game needs relaxed constraints for a specific reason (larger file, assets), open an issue describing why and propose a path forward.

Thank you for keeping games small, keyboard + touch friendly, and easy for the launcher to list.