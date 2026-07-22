# agent-equip

A Bun + TypeScript CLI that seeds AI-development tooling into existing projects, per stack. It
installs config (AGENTS.md with an on-demand skills index, agent-agnostic skill bodies plus
per-agent adapters, a commit helper, a precommit hook, Conductor scaffolding) into a target
repo. See `README.md` for the full overview.

## Project structure

- `bin/agent-equip.ts` — CLI entry (commander + @clack/prompts): `init [target] --stack <name>`, `list`.
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
  instructions built from `templates/<layer>/rules/*.md` fragments, plus an on-demand **Skills
  index** (`composeSkills`) pointing at the neutral skill bodies.
- **Agent-agnostic skills** (`src/install.ts`) — author once under `templates/<layer>/skills/`;
  the body ships to `.agent-equip/skills/<name>.md` and is indexed in AGENTS.md for any agent
  (e.g. Codex), while selected agents also get a native copy (Claude → `.claude/skills/`). The
  `init --agents` multi-select gates the per-agent adapters.
- **Curated per-stack package install** (`src/packages.ts`) — detect + offer + run (e.g. Boost).
- **User-level `commit` helper** (`src/commitHelper.ts`) — installed to `~/.config/agent-equip`.
- **Conductor scaffolding** — `.conductor/` in the payload.

## Conventions that differ from Bun/TS norms

- Formatting/lint is **Biome with tabs** (not Prettier / 2-space). `bun run lint` is strict
  (`--error-on-warnings`); `bun run fix` = `biome check --write`.
- The repo **dogfoods its own installer** — root `AGENTS.md`, `CLAUDE.md`, `.claude/`,
  `.conductor/`, `.agent-equip/` are GENERATED via `bun run bin/agent-equip.ts init . --stack bun-cli
  --force --project-only`. Do NOT hand-edit inside the managed agent-equip blocks; edit the
  `templates/` sources and re-run.
- Adding a stack is **pure data** — a `templates/<name>/` folder (+ optional `stack.json`,
  `packages.json`, `rules/*.md`, `skills/<name>/skill.md`, `test/<name>/`); no `src/` changes.
- Rules are authored as small `templates/<layer>/rules/*.md` fragments and assembled into one
  `AGENTS.md`; they are NOT seeded as separate files.
- Skills are authored agent-agnostically as `templates/<layer>/skills/<name>/skill.md` (a stack
  skill overrides a common one of the same name). They are NOT seeded verbatim — the installer
  emits `.agent-equip/skills/<name>.md`, the AGENTS.md Skills index, and per-agent copies.

## Running it

- `bun install`; `bun test`; `bun run lint` / `bun run typecheck` / `bun run fix`.
- Drive the CLI: `bun run bin/agent-equip.ts init <target> --stack <name>` (`--dry-run` to preview).

<!-- agent-equip >>> v0.0.4 (managed by agent-equip — content between these markers may be overwritten on re-install) -->
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

## Secrets and .env

- Never read `.env` or other real secret files — they hold live credentials.
- Read `.env.example` instead for variable names and structure; ask the user for real values.

# Skills

On-demand skill instructions. When a task matches a skill's description, read that skill's file before proceeding.

- **codifying-existing-behavior** — Use when modifying existing business logic — refactoring, fixing bugs, or changing the behavior of an existing function, method, service, module, class, handler, job, or endpoint. Mandates writing a test that codifies current behavior (or reproduces the bug) BEFORE touching production code. For bugs, the test starts red. For non-bug changes, the test starts green and stays green after the change. Skip for UI/visual tweaks, copy/comment/formatting changes, pure additions of new functions or classes, dependency bumps, and code with no reasonable test seam. Read `.agent-equip/skills/codifying-existing-behavior.md` before acting.
- **subagent-dispatch** — Use when handing off multi-finding fix work to a subagent or working agent — PR review remediation, batched test failures, multi-cluster bug fixes, or any prompt that dispatches several related fixes in one task. Covers structuring the dispatch prompt with a source-of-truth pointer, universal constraints, one-cluster-at-a-time execution with per-cluster verify gates, and a standardized report format. Skip for single-issue handoffs — a plain one-paragraph task description is enough there. Read `.agent-equip/skills/subagent-dispatch.md` before acting.
- **test-driven-development** — Use when building NEW behavior — implementing a new function, method, endpoint, component, command, or feature where a test can express the intended behavior up front. Drives a red → green → refactor loop — write a failing test for the next slice of behavior, make it pass with the minimal code, then refactor with the test green. For changing or fixing EXISTING behavior, use the codifying-existing-behavior skill instead. Skip for throwaway spikes, pure config/generated code, UI/visual-only tweaks, and glue with no reasonable test seam. Read `.agent-equip/skills/test-driven-development.md` before acting.
- **tune-conductor** — Use when setting up or editing a project's Conductor files installed by agent-equip — `.conductor/setup.sh` (runs when a new Conductor workspace/worktree is created) and `.conductor/settings.toml` (setup command, run scripts, run mode). Trigger when configuring Conductor for the project, editing `.conductor/setup.sh` or `.conductor/settings.toml`, wiring dev/test/worker run scripts, deciding concurrent vs nonconcurrent, handling ports/DB for parallel workspaces, or right after onboarding a project with agent-equip. For deep Conductor reference see https://conductor.build/docs. Read `.agent-equip/skills/tune-conductor.md` before acting.
- **tune-precommit** — Use when setting up or editing a project's `.agent-equip/precommit` hook — the pre-commit checks the agent-equip `commit` helper runs before every commit. Trigger when creating or modifying `.agent-equip/precommit`, configuring pre-commit lint/format/test checks, deciding whether tests should run on commit, or right after onboarding a project with agent-equip. Covers choosing the project's real lint/format/typecheck/test commands and keeping the gate fast (e.g. skipping or subsetting slow test suites, using parallel tests). Read `.agent-equip/skills/tune-precommit.md` before acting.
<!-- agent-equip <<< -->
