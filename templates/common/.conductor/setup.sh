#!/usr/bin/env bash
#
# Conductor workspace setup — runs when a new workspace (git worktree) is created.
# Fill this in per project: install deps, copy env files, generate config, seed local state.
# Runs from the workspace dir in a non-interactive zsh; use $CONDUCTOR_ROOT_PATH for the repo
# root and $CONDUCTOR_PORT for a workspace-local server port. Exit non-zero to fail setup.
set -euo pipefail

# Examples — uncomment/adjust:
# [ -f composer.json ] && composer install
# [ -f package.json ]  && npm install
# [ -f .env ] || cp .env.example .env
