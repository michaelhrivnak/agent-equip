# ai-setup

A Bun + TypeScript CLI that seeds AI-development tooling into existing projects, per stack. It
installs config (AGENTS.md, a Claude adapter + skills, a commit helper, a precommit hook,
Conductor scaffolding) into a target repo. See `README.md` for the full overview.

## Project structure

- `bin/ai-setup.ts` — CLI entry (commander + @clack/prompts): `init [target] --stack <name>`, `list`.
- `src/` — install logic: `install.ts` (orchestrator + per-type merge routing), `merge.ts`
  (merge strategies), `templates.ts` (layer composition + AGENTS.md assembly + stack metadata),
  `packages.ts` (curated packages), `commitHelper.ts` (user-level helper install), `paths.ts`.
- `templates/common/` + `templates/<stack>/` — the payload seeded into targets; a stack overlays
  common (same relative path wins). Stacks: `laravel`, `bun-cli`.
- `assets/commit.sh` — the user-level `commit` shell helper (not seeded into targets).
- `test/` — `bun test`, split per stack (`core`, `laravel`, `bun-cli`) + `helpers.ts`.

## Features (most important first)

- **Seed a stack's tooling into a target** (`src/install.ts`) — the core flow: compose
  common+stack, merge safely into existing files, assemble `AGENTS.md`.
- **AGENTS.md assembly** (`src/templates.ts` → `assembleAgents`) — canonical cross-agent
  instructions built from `templates/<layer>/rules/*.md` fragments.
- **Curated per-stack package install** (`src/packages.ts`) — detect + offer + run (e.g. Boost).
- **User-level `commit` helper** (`src/commitHelper.ts`) — installed to `~/.config/ai-setup`.
- **Conductor scaffolding** — `.conductor/` in the payload.

## Conventions that differ from Bun/TS norms

- Formatting/lint is **Biome with tabs** (not Prettier / 2-space). `bun run lint` is strict
  (`--error-on-warnings`); `bun run fix` = `biome check --write`.
- The repo **dogfoods its own installer** — root `AGENTS.md`, `CLAUDE.md`, `.claude/`,
  `.conductor/`, `.ai-setup/` are GENERATED via `bun run bin/ai-setup.ts init . --stack bun-cli
  --force --project-only`. Do NOT hand-edit inside the managed ai-setup blocks; edit the
  `templates/` sources and re-run.
- Adding a stack is **pure data** — a `templates/<name>/` folder (+ optional `stack.json`,
  `packages.json`, `rules/*.md`, `test/<name>/`); no `src/` changes.
- Rules are authored as small `templates/<layer>/rules/*.md` fragments and assembled into one
  `AGENTS.md`; they are NOT seeded as separate files.

## Running it

- `bun install`; `bun test`; `bun run lint` / `bun run typecheck` / `bun run fix`.
- Drive the CLI: `bun run bin/ai-setup.ts init <target> --stack <name>` (`--dry-run` to preview).

<!-- ai-setup >>> (managed by ai-setup — content between these markers may be overwritten on re-install) -->
Personal or global agent instructions take precedence over the project conventions below. On any conflict, follow the personal instruction and say so.

# Git

- Never run `git add`, `git commit`, or `git push` unless explicitly asked to. Stage and
  commit only on request.
- When you do commit, keep messages action-oriented (past tense: Added, Fixed, Updated),
  concise, and specific about what changed. No trailing period.
- Never work or commit directly on `main`/`master` — branch first.
- Never delete branches, `git reset`, `git stash`, force-push, or rewrite history.

# Testing

- This project uses `bun test`. Every change should be covered by a new or updated test; run
  the affected tests and make sure they pass.
- Run the minimum needed while iterating — filter to a file (`bun test path/to/file.test.ts`)
  or a name (`bun test -t "<name>"`) rather than the whole suite.
- Keep tests hermetic: use temp dirs and override env (e.g. `$HOME`) instead of touching the
  real environment. Fix failures one at a time.

# Working style

Behavioral guidelines to reduce common coding mistakes. Bias toward caution over speed; for
trivial tasks, use judgment.

## Think before coding

- State assumptions explicitly; if uncertain, ask.
- If multiple interpretations exist, surface them — don't pick one silently.
- If a simpler approach exists, say so.

## Simplicity first

- Write the minimum code that solves the problem. Nothing speculative.
- No abstractions for single-use code, no unrequested flexibility, no error handling for
  impossible scenarios.

## Surgical changes

- Touch only what the task requires. Don't refactor or reformat adjacent code.
- Match existing style. If you spot unrelated dead code, mention it — don't delete it.
- Remove only the orphans your own change created.

## Goal-driven execution

- Turn tasks into verifiable goals ("add validation" → "write tests for invalid inputs, then
  make them pass") and loop until verified.
<!-- ai-setup <<< -->
