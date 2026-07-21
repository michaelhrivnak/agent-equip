# ai-setup

A template + installer that seeds AI-development tooling into other projects: agent
instructions, `.claude/rules`, the `codifying-existing-behavior` skill, a `commit` shell
helper, a `precommit` stub, and Conductor scaffolding.

This repo is not a product — it's the source for local-dev setup. Personal instructions in
`~/.claude/CLAUDE.md` still take precedence over anything here.

## Usage

```
./install.sh <target-project-dir>
```

Copies `template/` into the target project (safely merging into files that already exist)
and installs the user-level `commit` helper into `~/.config/ai-setup` + `~/.zshrc`.

## Layout

- `template/` — the payload seeded into target projects. Edit these to change what installs.
- `scripts/commit.zsh` — the user-level `commit` helper (copied to `~/.config/ai-setup`).
- `install.sh` — the installer.
