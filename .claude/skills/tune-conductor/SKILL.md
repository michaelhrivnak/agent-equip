---
name: tune-conductor
description: Use when setting up or editing a project's Conductor files installed by ai-setup — `.conductor/setup.sh` (runs when a new Conductor workspace/worktree is created) and `.conductor/settings.toml` (setup command, run scripts, run mode). Trigger when configuring Conductor for the project, editing `.conductor/setup.sh` or `.conductor/settings.toml`, wiring dev/test/worker run scripts, deciding concurrent vs nonconcurrent, handling ports/DB for parallel workspaces, or right after onboarding a project with ai-setup. For deep Conductor reference see https://conductor.build/docs.
---

<!-- managed by ai-setup — edit this file and it becomes yours (ai-setup then stops updating it); customize by adding your own skill alongside instead. -->

# Tune the Conductor setup

ai-setup installs `.conductor/settings.toml` (which wires `scripts.setup = "bash
.conductor/setup.sh"`) and a generic `.conductor/setup.sh` stub. Tailor them so a fresh
Conductor workspace (a git worktree) is immediately ready to work in.

Start from the **Operations** section of `AGENTS.md` (written by onboarding) — it should list the
setup/bootstrap steps, the database and any local services, how tests run, and the dev command +
ports. Build these files from that; fall back to the package manifests if it is thin or missing.

## `.conductor/setup.sh` — workspace bootstrap

Runs from the new workspace directory in a non-interactive shell when the workspace is created.
Fill in what the project needs to go from a bare checkout to runnable:

- Install deps: `composer install`, `npm install` / `bun install`, `pip install -r ...`.
- Provide gitignored local files that aren't in the worktree — copy them, or prefer Conductor's
  Files-to-copy / `.worktreeinclude` for static ones (`.env`, local config, certs).
- Generate/prepare: app key, `.env` from example, a per-workspace database + migrate, built assets.
- Use `$CONDUCTOR_ROOT_PATH` to reach the repo root; `$CONDUCTOR_PORT`..`+9` for workspace ports;
  branch on `$CONDUCTOR_IS_LOCAL` for local-only steps. Exit non-zero to fail setup.

## `.conductor/settings.toml` — run scripts & mode

- `[scripts.run.<id>]` with `command`, optional `default = true`, and an `icon` (Lucide name) —
  e.g. `dev` (server bound to `$CONDUCTOR_PORT`), `test`, `worker`.
- `run_mode = "concurrent"` only when multiple workspaces can run at once (separate ports, no
  shared local resource). Use `"nonconcurrent"` when the project needs one fixed port, one local
  DB, or a shared Docker stack.

## Parallel-safety (important)

Conductor runs many workspaces simultaneously. Bind servers to `$CONDUCTOR_PORT`; give each
workspace its own DB/state where possible. If the project genuinely can't be made
workspace-isolable, choose `nonconcurrent` and note why.

For the full Conductor reference (Files-to-copy, spotlight testing, environment variables,
settings precedence), see the Conductor docs at https://conductor.build/docs.
