# CLAUDE.md

A collection of small, zero-dependency browser games (one self-contained HTML file per
`games/<name>/`) behind a shared launcher (`index.html`), plus a Node checker that enforces CONTRIBUTING.md.

## Commands (from `README.md` and the `run:` block at the end of `.d8a`)

```
npm ci            # install (no runtime deps; the lockfile exists so CI can use npm ci)
npm run arcade    # serve the repo root at http://localhost:5002/ (npx --yes serve -l 5002 .)
npm run check     # node tools/check-arcade.mjs        — rules every game/template/launcher must meet
npm test          # node tools/test-check-arcade.mjs   — the checker's self-test against tools/fixtures/
                  # then node tools/test-games.mjs     — runtime tests of common/arcade.js and game code (node:vm)
```

CI (`.github/workflows/ci.yml`) runs `npm ci`, `npm run check` and `npm test` on every push and pull request.

## Ground rules

- Work on a new branch from `main`; open ONE pull request whose description lists the commands run and their results before and after. Stop once the PR is open.
- Never modify `.d8a` or `.d8a-governance`. Never modify the group-store widget markup/script copied from the `payments:` block of `.d8a` (`id="group-store"`, `groupStoreVerify`).
- Ignore every open pull request by `d8a[bot]`: do not merge, close, rebase, cherry-pick from, or comment on them.
- Do not add a LICENSE file or any licence text.
- Install dependencies and RUN the checks above before and after changes. Never report a result you did not get by running the command.
- Every new test must be able to fail: no `require(x >= 0)` on unsigned values, no bare `vm.expectRevert()`, no `try/catch` accepting any error, no asserting a value equals itself. Import every symbol you use. If a test is wrong rather than the code, fix the test so it tests the real behaviour and say so.
- Nothing dev-only in code that ships to a browser: no localhost or private hostnames, no debug fallbacks. No secrets, tokens or keys in the repo.
- CI runs exactly the declared checks and must fail when one fails: no `continue-on-error`, no `|| true`, no skipped jobs counted as passing. Pin GitHub Actions to their current major versions.
- Keep changes focused: no reformatting untouched files, no unneeded dependency upgrades, no renaming public files or URLs, no rewriting git history.
- New checker fixtures: `tools/fixtures/clean/` must satisfy every rule in `tools/check-arcade.mjs`; when a rule is added, update `clean/` too (see `tools/fixtures/README.md`).
