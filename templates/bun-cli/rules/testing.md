# Testing

- This project uses `bun test`. Every change should be covered by a new or updated test; run
  the affected tests and make sure they pass.
- Run the minimum needed while iterating — filter to a file (`bun test path/to/file.test.ts`)
  or a name (`bun test -t "<name>"`) rather than the whole suite.
- Keep tests hermetic: use temp dirs and override env (e.g. `$HOME`) instead of touching the
  real environment. Fix failures one at a time.
