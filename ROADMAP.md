# Roadmap

Work is tracked as [GitHub issues](https://github.com/michaelhrivnak/agent-equip/issues), grouped
into [milestones](https://github.com/michaelhrivnak/agent-equip/milestones). This file is a
high-level summary — the issues are the source of truth.

## Where things stand

The core is built and validated:

- Per-stack installer (Laravel, Bun/TS) with safe, idempotent merges and a canonical `AGENTS.md`
  (plus a thin `CLAUDE.md` adapter and on-demand Claude skills).
- The `commit` helper, curated package picker, agent-tools picker, a permissions baseline, and
  Conductor scaffolding.
- Guided onboarding — `/agent-equip` (→ `/onboard` + the `tune-precommit` / `tune-conductor` skills)
  — validated across Laravel and Bun/TS projects.

## Phases

### [M1 — Usable by others](https://github.com/michaelhrivnak/agent-equip/milestone/1)

Make it runnable without cloning the repo, and go public.

- Publish to npm for `npx agent-equip` ([#5](https://github.com/michaelhrivnak/agent-equip/issues/5))
- Standalone binary via `bun build --compile` + release workflow ([#6](https://github.com/michaelhrivnak/agent-equip/issues/6))
- Make the repo public + fix the CI badge ([#7](https://github.com/michaelhrivnak/agent-equip/issues/7))

### [M2 — More stacks](https://github.com/michaelhrivnak/agent-equip/milestone/2)

Broaden stack coverage.

- Add a **dotnet** stack — validates XML/`appsettings.json` merge routing ([#8](https://github.com/michaelhrivnak/agent-equip/issues/8))
- Additional stacks: node/generic, python (tracking) ([#9](https://github.com/michaelhrivnak/agent-equip/issues/9))

### [M3 — Multi-agent](https://github.com/michaelhrivnak/agent-equip/milestone/3)

Thin per-agent adapters on top of the canonical `AGENTS.md` — added when a second agent is
actually used.

- Per-agent adapters (Gemini, Copilot, Cursor) ([#10](https://github.com/michaelhrivnak/agent-equip/issues/10))

### [M4 — Robustness & updates](https://github.com/michaelhrivnak/agent-equip/milestone/4)

- `agent-equip update` + version stamp + change summary ([#11](https://github.com/michaelhrivnak/agent-equip/issues/11))
  - Surface upstream changes for *forked* files (the ownership manifest already tracks them). Treat
    forked **prose** (skills/commands/prompts — likely an accidental edit) as worth surfacing, but
    stay quiet on forked **scaffold** (precommit, Conductor — intended team ownership).
  - Extend manifest tracking to `.claude/settings.json`: today it deep-merges every run (non-destructive)
    but isn't pristine/fork-tracked, because the agent-tools picker also writes into it — `update` must
    record the post-picker hash so only human edits count as divergence.
- Live-verify & harden the permissions block ([#12](https://github.com/michaelhrivnak/agent-equip/issues/12))
- Onboarding: handle monorepos / very large codebases ([#13](https://github.com/michaelhrivnak/agent-equip/issues/13))
- Per-stack code hooks (`detect()`/`postInstall()`) ([#14](https://github.com/michaelhrivnak/agent-equip/issues/14))
- Robustness edge cases (non-git dirs, TOML merge, config conflicts) ([#15](https://github.com/michaelhrivnak/agent-equip/issues/15))
