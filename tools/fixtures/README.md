# Checker fixtures

Tiny fake arcade repositories used by `tools/test-check-arcade.mjs` (run with
`npm test`). They exist so a change to a rule in `tools/check-arcade.mjs` can be
run against known-good and known-bad input instead of being judged by eye on a
diff.

- `clean/` is the whole base repository: launcher, one game (`games/demo`) and
  the shared template. Running the checker with `--root` against it must exit 0
  with no problems.
- Every other folder is an **overlay**: it holds only the files that differ from
  `clean/`. The test copies `clean/` into a temporary directory, copies the
  overlay on top, runs `node tools/check-arcade.mjs --root <tmp>` and asserts the
  exit code and the expected problem line.

Nothing here is served or shipped: the checker only ever scans `games/` and
`template/` under the root it is given, so these files are invisible to a normal
`npm run check` of this repository, and the zero-dependency rule for real games
is untouched.

Adding a case: create `tools/fixtures/<case-name>/` with just the changed files
and add one row to the `CASES` table in `tools/test-check-arcade.mjs`.
