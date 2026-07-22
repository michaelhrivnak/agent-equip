<!-- managed by agent-equip — edit this file and it becomes yours (agent-equip then stops updating it); customize by adding your own alongside instead. -->

# agent-equip: set up this project for AI development

Run the full agent-equip onboarding for this repository in one pass, with **minimal questions** —
only stop to ask when a choice is genuinely ambiguous or risky. Otherwise proceed with sensible
defaults and summarize what you did at the end.

Do these in order:

## 1. Capture project context

Follow `.agent-equip/onboard.md`: explore the repo and write the project-context sections (project
structure, weighted features, conventions that differ from stack norms, and Operations) into
`AGENTS.md`, above the `<!-- agent-equip >>>` managed block. Leave that block untouched.

## 2. Tailor the pre-commit checks

Using the Operations context you just captured, update `.agent-equip/precommit` to run the
project's real format (write mode), lint, type-check, and — only if fast — test commands. Keep
it fast: subset or skip a slow/long-running suite (leave the full run to CI) and note the
choice. Follow the `tune-precommit` skill.

## 3. Tailor the Conductor setup

Update `.conductor/setup.sh` (deps, env/config, database, local services) and
`.conductor/settings.toml` (run scripts, run mode, ports) so a fresh Conductor workspace is
ready to work in — mind parallel-safety. Follow the `tune-conductor` skill.

## Finish

Summarize: what context you captured, what you changed in `.agent-equip/precommit` and
`.conductor/`, and any decisions you made or still need from the user (e.g. a slow test suite you
excluded from the pre-commit gate). Prefer doing the obvious thing and reporting it over asking.
