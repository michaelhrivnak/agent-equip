# agent-equip

> A quickstart CLI that seeds AI-development tooling into your projects — per stack.

[![CI](https://github.com/michaelhrivnak/agent-equip/actions/workflows/ci.yml/badge.svg)](https://github.com/michaelhrivnak/agent-equip/actions/workflows/ci.yml)

`agent-equip` drops a consistent set of AI-assisted development tooling into a target project —
cross-agent instructions (`AGENTS.md`), Claude Code config and on-demand skills, a `commit`
shell helper, a pre-commit hook, and [Conductor](https://conductor.build) workspace
scaffolding — tailored to the project's stack. It merges safely into files that already exist
and can recommend & install curated packages for the stack.

## About

Setting up the same AI tooling by hand in every repo is tedious and drifts over time.
`agent-equip` makes it one command: pick your stack, and it installs a consistent AI-assistant
setup into your project (plus a small `commit` helper into your shell). Re-run it any time to
stay current — it never clobbers your own edits.

Supported stacks today: **Laravel** and **Bun/TypeScript CLI**; more (e.g. .NET) are on the
roadmap. Built with [Bun](https://bun.sh) + TypeScript.

## Features

- **Cross-agent instructions** — `AGENTS.md` (read by most coding agents) is the canonical,
  agent-neutral layer. Everything on top is Claude-specific today: the `CLAUDE.md` adapter,
  on-demand skills, slash commands, permissions, and commit-message generation (per-agent
  adapters for other agents are on the roadmap, M3).
- **One-command project setup** — run `/agent-equip` in your agent and it onboards the repo (writes
  a project-context doc into `AGENTS.md`: structure, key features, and the conventions that
  *differ* from your stack's norms) and tailors the pre-commit + Conductor files to the project.
- **Stack-aware** — tailors those instructions, rules, and recommendations to your project's
  stack (Laravel and Bun/TypeScript today).
- **Smart `commit` command** — runs your pre-commit checks, then writes the commit message for
  you from the staged diff (via Claude) and prefixes a branch ticket id.
- **Package recommendations** — spots stack-relevant tools you're missing (e.g. Laravel Boost)
  and installs the ones you pick.
- **Conductor-ready** — sets up [Conductor](https://conductor.build) so parallel agent
  workspaces work out of the box.
- **Non-destructive & updatable** — merges into your existing files instead of overwriting them;
  re-run any time to pull the latest tooling.

## Requirements

- [Bun](https://bun.sh) v1.3+
- A target project that is a git repository
- Optional:
  - the [`claude`](https://docs.claude.com/en/docs/claude-code) CLI — for commit-message
    generation and smart merges of structured config
  - stack tooling for package installs (e.g. Composer for the Laravel packages)

## Usage

Clone and install dependencies:

```sh
git clone <repo-url> agent-equip && cd agent-equip
bun install
```

Install tooling into a project (interactive — prompts for the stack if omitted):

```sh
bun run bin/agent-equip.ts init /path/to/project --stack laravel
```

List available stacks:

```sh
bun run bin/agent-equip.ts list
```

> A standalone binary (`bun build --compile`) and/or `npx agent-equip` are planned so you won't
> need to clone this repo to use it.

### `init` options

| Flag | Description |
| --- | --- |
| `-s, --stack <name>` | Stack template to install (skips the picker) |
| `--dry-run` | Show what would change; write nothing |
| `-y, --yes` | Don't prompt (requires `--stack`) |
| `--project-only` | Seed project files only; skip the user-level `commit` helper |
| `--no-packages` | Skip the curated package picker |
| `--no-agent-tools` | Skip the agent-tools picker (plugins / MCP / hooks) |
| `--force` | Allow installing into the agent-equip repo itself (dogfooding) |

### What gets installed

Into the **target project**:

- `AGENTS.md` — shared, cross-agent instructions assembled from the stack's rules (a managed
  `agent-equip` block; your own content is preserved).
- `CLAUDE.md` — a thin adapter that imports `AGENTS.md` for Claude Code.
- `.claude/` — Claude-specific settings and on-demand skills.
- `.gitignore` — a managed `agent-equip` block for the files above.
- `.conductor/` — `settings.toml` plus a `setup.sh` stub for Conductor workspace setup.
- `.agent-equip/precommit` — a lint/format hook the `commit` helper runs (kept out of the repo
  root to avoid clutter).
- `.agent-equip/` prompts (`setup.md`, `onboard.md`) and matching `/agent-equip` + `/onboard` commands,
  plus the `tune-precommit` / `tune-conductor` skills — the guided setup (see "Finish setup" below).
- `CLAUDE.local.md.example` — copy to `CLAUDE.local.md` for personal, gitignored overrides.

Into your **home directory** (once, machine-level):

- `~/.config/agent-equip/commit.sh` and a source line added to `~/.zshrc` and/or `~/.bashrc`
  (autodetected from your shell).

### Ownership: what stays current vs. what you take over

agent-equip ships a **library it keeps current** and a **scaffold it hands over**:

| File | Owner | On re-run |
| --- | --- | --- |
| `AGENTS.md` rules block, `CLAUDE.md`, skills, `/commands`, `.agent-equip/*.md` prompts | product | refreshed while pristine; **your edit forks it** and updates stop |
| `.agent-equip/precommit`, `.conductor/*` | team | seeded as smart defaults, then yours the moment you edit them |
| `.claude/settings.json` (permissions + tool picks) | mixed | deep-merged every run; your values always win |
| `.gitignore` | shared | managed `agent-equip` block only; the rest is yours |

**The contract:** a file you haven't touched stays current on re-run; a file you've edited is
yours — agent-equip never modifies it again (and won't nag with `*.agent-equip-new` for it). Two ways to
customize:

- **Extend prose alongside it** — add project context *above* the `AGENTS.md` block, use
  `CLAUDE.local.md`, or add your own skills/commands. This keeps the product prose updatable.
- **Edit the scaffold directly** — `.agent-equip/precommit`, the Conductor files, permissions. That's
  what it's for; editing is how you take ownership.

agent-equip tracks the sha of each whole file it wrote in `.agent-equip/manifest.json` (committed) to
tell pristine files from forked ones. Marked-block files (`AGENTS.md`, `CLAUDE.md`, `.gitignore`)
instead refresh just their block, always preserving your surrounding content. A pre-existing file
agent-equip didn't create is never overwritten — you get a `*.agent-equip-new` copy to reconcile once.

### The `commit` helper

Once installed, `commit` (from any repo):

1. runs `.agent-equip/precommit` (lint/format) and aborts if it fails,
2. stages everything,
3. uses the `claude` CLI to write a one-line message from the staged diff — with retry / type-
   your-own / abort if generation fails — and prefixes a branch ticket id (e.g. `ABC-123`) when
   present.

### Curated packages

After seeding files, `agent-equip` checks the target for stack-relevant packages it doesn't yet
have (declared in `templates/<stack>/packages.json`) and offers a checklist. It shows the exact
install commands and only runs the ones you confirm.

### Recommended agent tools

`agent-equip` also offers an interactive picker of agent tooling — Claude plugins, MCP servers, and
hooks (declared in `templates/<stack>/agent-tools.json`) — applying the ones you select to
`.claude/settings.json` and/or `.mcp.json`. Nothing third-party is written without your choice:
under `--yes` or when the output isn't a terminal it only reports what's available. Skip it with
`--no-agent-tools`.

The committed `.claude/settings.json` also ships a **permissions** baseline — read-only commands
auto-allowed; destructive ones (`rm -rf`, `git reset`/`stash`, force-push, branch deletion,
`sudo`) denied; `git commit`/`push` always prompt. Loosen or tighten it per-developer in
`.claude/settings.local.json`. Treat it as a guardrail against accidental damage or secret
exposure, not a security boundary: prefix-based denies are bypassable, so real secrets belong
outside any reachable `.env` file.

### Finish setup in your agent

After `init` seeds the files, open the project in your agent and run **`/agent-equip`** (Claude
Code) — or follow `.agent-equip/setup.md` in any agent. It does the whole setup in one pass, with
minimal questions:

1. **Onboard** — explores the repo and writes your **project context** into `AGENTS.md`, above
   the managed block: structure, the most important features, and the conventions that *differ*
   from your stack's defaults (the highest-signal part for future agents).
2. **Tailor the pre-commit** — sets `.agent-equip/precommit` to the project's real
   format/lint/type-check/test commands (subsetting or skipping a slow suite).
3. **Tailor Conductor** — fills `.conductor/setup.sh` + `settings.toml` (deps, database, local
   services, run scripts, ports, parallel-safety).

The pieces are also available individually — `/onboard` (context only) and the `tune-precommit` /
`tune-conductor` skills — and everything is re-runnable to refresh as the project evolves.

`AGENTS.md` ends up with two parts: your **project context** (above the managed block, yours to
own) and the generic guardrail-rules **`agent-equip` block** (refreshed on re-install).

## Roadmap

See [ROADMAP.md](ROADMAP.md) — and the [GitHub milestones](https://github.com/michaelhrivnak/agent-equip/milestones) — for what's planned.

## Contributing

Contributions are welcome — new stacks especially.

### Development

```sh
bun install
bun test          # tests live under test/<area>/ (per stack, plus core)
bun run lint      # Biome (tabs, double quotes) — strict, warnings fail
bun run fix       # Biome format + safe lint fixes
bun run typecheck # tsc --noEmit
```

CI runs lint + typecheck + tests on pushes to `main` and on every PR. The repo dogfoods its own installer via
the `bun-cli` stack, so `./.agent-equip/precommit` runs the same checks locally.

### Adding a stack

1. Create `templates/<name>/` with the files that differ from `common` (identical relative
   paths override the common layer). Rules in `templates/<name>/rules/*.md` are assembled into
   the project's `AGENTS.md`; structured configs (`*.json`, `*.toml`) are merged; other files
   are copied.
2. Optionally add `templates/<name>/stack.json` (`label`, `description`) for the picker, and
   `templates/<name>/packages.json` to curate installable packages.
3. Add tests under `test/<name>/`.

It then appears in `agent-equip list` and `--stack <name>` automatically.

## License

Released under the [MIT License](LICENSE).
