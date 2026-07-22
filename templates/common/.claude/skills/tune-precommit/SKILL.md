---
name: tune-precommit
description: Use when setting up or editing a project's `.agent-equip/precommit` hook — the pre-commit checks the agent-equip `commit` helper runs before every commit. Trigger when creating or modifying `.agent-equip/precommit`, configuring pre-commit lint/format/test checks, deciding whether tests should run on commit, or right after onboarding a project with agent-equip. Covers choosing the project's real lint/format/typecheck/test commands and keeping the gate fast (e.g. skipping or subsetting slow test suites, using parallel tests).
---

<!-- managed by agent-equip — edit this file and it becomes yours (agent-equip then stops updating it); customize by adding your own skill alongside instead. -->

# Tune the pre-commit hook

`.agent-equip/precommit` is a plain script the agent-equip `commit` helper runs before every commit
(it is NOT a git hook). It ships as a generic stub — tailor it to the project so it runs the
right checks, stays fast, and aborts the commit (non-zero exit) when something is wrong. The
`commit` helper stages whatever the hook changes, so formatters should run in **write mode**.

## What to include

The **Operations** section of `AGENTS.md` (written by onboarding) is the primary source — it
should already list the lint/format/typecheck/test commands and whether the test suite is fast,
slow, or parallel. Use it; fall back to the package manifests and their `scripts` if it is thin
or missing.

1. **Format (write mode)** — runs first so fixes get staged: `pint`, `prettier --write`,
   `biome check --write`, `gofmt -w`, `ruff format`, etc.
2. **Lint** — the project's linter (eslint, biome lint, ruff, phpstan-as-lint…).
3. **Type check** — if the stack has one (`tsc --noEmit`, phpstan, mypy).
4. **Tests** — only if the suite is fast (see below).

Guard each step so it no-ops when its tool isn't present (e.g. `[ -f package.json ]`,
`[ -x vendor/bin/pint ]`), and prefer the project's own scripts (`composer test`, `npm run lint`)
over ad-hoc commands.

## Tests: match the project's reality

The pre-commit gate must stay fast, or people bypass it.

- **Fast suite** → run it (`bun test`, `php artisan test`).
- **Slow / long-running suite** → do NOT run the whole thing on every commit. Run a fast subset
  (unit-only, changed-files, a smoke group), or skip tests here and leave the full run to CI.
  Say which you chose in a comment.
- **Parallel-capable** → use it when it's a net speedup and safe (e.g. Pest `--parallel`,
  `jest --maxWorkers`) — but not for suites that share a DB, fixtures, or ports and aren't
  parallel-safe.

## Rules

- Fast and deterministic — this runs on every commit.
- Non-zero exit aborts the commit.
- Keep it at `.agent-equip/precommit`, executable, with a `#!/usr/bin/env bash` shebang and
  `set -euo pipefail`.
