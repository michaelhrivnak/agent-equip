<!-- managed by ai-setup — edit this file and it becomes yours (ai-setup then stops updating it); customize by adding your own alongside instead. -->

# Onboarding prompt — build this project's AI context

Purpose: give future AI agents the project-specific context they need to work here quickly.
Explore this repository, then write a concise **project context** into `AGENTS.md`, ABOVE the
`<!-- ai-setup >>>` managed block. Never edit anything inside that block.

Capture only what an agent CANNOT infer on its own. Be brief, specific, and cite file paths.
Do not restate what is obvious from the code or standard for this project's stack.

## Explore first

Skim the README, package manifests, the directory tree, entry points, routing and config, a few
representative modules, and the tests. Determine the stack, and how the project is actually
built, run, and tested locally.

For stack/framework/language **versions**, read the lockfile or manifest (`composer.lock`,
`package.json`, `*.lock`) — treat auto-generated helper blocks (e.g. a Laravel Boost
`<laravel-boost-guidelines>` section) as potentially stale and never copy a version from them.

## Produce these sections (in order)

### Project structure

A short map: the key directories and what each is responsible for, the main entry point(s), and
how the major pieces fit together. High-level — not an exhaustive file listing.

### Features (ordered by importance)

The project's main capabilities or domains, **ordered most-important first**, so it is obvious
which are core to the product versus secondary. One line each: name the feature/domain and where
it lives. Weight by how central it is — the domain the codebase revolves around comes first.

### Conventions that differ from stack norms

The highest-value section. First, know the idiomatic conventions of this project's stack. Then
list ONLY the places where THIS project deliberately deviates from them — custom patterns,
non-standard structure or naming, house rules, unusual library choices, opinionated workflows.
Do NOT list anything the stack already implies; an agent already knows the defaults. The
deviations are the signals it can't guess. For each: the usual norm → what this project does
instead → where to see it.

**Start this section** with any contradictions between the ai-setup managed block below (or your
global rules) and the actual code — one line each, formatted `block says X → real answer is Y
(proof: <path>)`. If the block or rules name a test framework, package manager, or formatter
(Pest, PHPUnit, Pint, npm/pnpm/bun, etc.), verify EACH against the manifest and state the result
even when it matches. This is the highest-value catch you can make — do it first and explicitly.

### Operations

The concrete commands and setup an agent needs to work here — capture what applies (skip what
doesn't) and prefer the project's real scripts. Be specific: this section feeds the
`tune-precommit` and `tune-conductor` skills, so record the actual commands even when the tooling
is standard.

- **Setup / bootstrap** — going from a fresh checkout to runnable: dependency install, `.env` /
  local config, database (create, migrate, seed), generated files, and any local services
  required (database, cache, queue, Docker, mail).
- **Lint & format** — the tools and exact commands, and whether formatting is auto-fixed.
- **Type checking** — the command, if the stack has one.
- **Tests** — how to run them and the main command(s); whether the full suite is **fast or
  slow/long-running**; and — always state this explicitly — whether **parallel** runs are
  supported (name the tool, e.g. `--parallel` / paratest, or say "not configured"); plus any
  test database or fixtures it needs.
- **Run** — the dev server / app command and the port(s) it uses.

## Rules

- This becomes always-on context loaded every session — keep it lean and scannable; every line
  must earn its place.
- Specifics (paths, names) over generalities.
- Write only facts true for EVERY contributor. Don't bake in your own machine's setup — a personal
  dev server (Herd, Valet, Docker Desktop), personal paths, or OS-specific commands belong in your
  local config, not shared project context. (These often leak in from a global `~/.claude/CLAUDE.md`
  or `AGENTS.md` — ignore those for project context.) If setup genuinely differs by OS, point to
  the README rather than hardcoding one path.
- If it is standard for the stack, omit it — including framework-default config (a sync queue, the
  default dev/serve port, the default cache driver). State a config value only where the project
  overrides the stack default.
- If `AGENTS.md` already carries house rules or conventions ANYWHERE in the file (an existing
  house-rules section, the managed block, or an auto-generated block like Laravel Boost), do NOT
  restate them. Make "Conventions that differ" a short curated INDEX — the 3–5 highest-signal
  deviations, one line each, each pointing to where the full rule already lives — not a
  re-derivation.
- Describe the project's real commands, not the current contents of the ai-setup stub files
  (`.ai-setup/precommit`, `.conductor/*`) — those get tuned right afterward, so any description of
  them goes stale.
- Do not touch the `<!-- ai-setup >>> ... <<< -->` block.

## After onboarding

With the context captured, tailor the ai-setup stubs to the project's real tooling:
`.ai-setup/precommit` (the pre-commit checks) and `.conductor/setup.sh` + `.conductor/settings.toml`
(Conductor workspace setup). In Claude Code, the `tune-precommit` and `tune-conductor` skills
guide this.
