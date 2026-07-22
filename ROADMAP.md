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
- Distribution — published to npm as a **Node bundle**, run with `npx agent-equip` (bun not
  required). See the decision below.

## Decisions

### Distribution: node-compatible npm is the sole channel

The published CLI is a plain Node bundle (`bun build --target=node`); `npx agent-equip` is the one
supported entry point. **Low barrier to entry is a product tenet** — a contributor should be able
to try agent-equip with a tool they already have (Node), not install a second runtime. The repo's
own toolchain stays bun; only the shipped artifact must be Node-clean (CI's `node-smoke` job
enforces no Bun runtime APIs).

The earlier bun-compiled standalone binary was removed as redundant with this.

**Revisit trigger:** real adopters with no Node available (expected earliest alongside the dotnet
stack, M2). The plan then is *not* to revive the bun binary, but a small static binary (Go/Rust)
shipped as per-platform npm packages (esbuild-style: same `npx` UX, ~5 MB download) plus a single
`curl | sh` install script.

## Phases

### [M2 — More stacks](https://github.com/michaelhrivnak/agent-equip/milestone/2)

Broaden stack coverage.

- ✅ Add a **dotnet** stack — added XML merge routing (`*.csproj`/`*.props`/`*.targets`) ([#8](https://github.com/michaelhrivnak/agent-equip/issues/8))
- Additional stacks: node/generic, python (tracking) ([#9](https://github.com/michaelhrivnak/agent-equip/issues/9))

### [M3 — Multi-agent](https://github.com/michaelhrivnak/agent-equip/milestone/3)

Thin per-agent adapters on top of the canonical `AGENTS.md` — added when a second agent is
actually used.

- Per-agent adapters (Gemini, Copilot, Cursor) ([#10](https://github.com/michaelhrivnak/agent-equip/issues/10))

### [M4 — Robustness & updates](https://github.com/michaelhrivnak/agent-equip/milestone/4)

- ✅ `agent-equip update` + version stamp + change summary ([#11](https://github.com/michaelhrivnak/agent-equip/issues/11))
  - `agent-equip update [target]` re-runs the install non-interactively — the manifest header now
    persists `{version, stack, agents}` — and reports a `vX → vY` line plus the per-file outcomes.
  - The `AGENTS.md` managed-block marker carries the CLI version (`<!-- agent-equip >>> vX.Y.Z … -->`).
  - Forked files are surfaced in one flat "kept your local edits" list (no prose-vs-scaffold split).
  - Manifest tracking extended to `.claude/settings.json` / `.mcp.json`: their post-picker hash is
    recorded so only later human edits count as divergence (surfaced once, still deep-merged safely).
- Live-verify & harden the permissions block ([#12](https://github.com/michaelhrivnak/agent-equip/issues/12))
- Onboarding: handle monorepos / very large codebases ([#13](https://github.com/michaelhrivnak/agent-equip/issues/13))
- Per-stack code hooks (`detect()`/`postInstall()`) ([#14](https://github.com/michaelhrivnak/agent-equip/issues/14))
- Robustness edge cases (non-git dirs, TOML merge, config conflicts) ([#15](https://github.com/michaelhrivnak/agent-equip/issues/15))
