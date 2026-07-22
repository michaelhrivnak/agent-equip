#!/usr/bin/env bash
#
# Conductor workspace setup for a Laravel project — runs when a workspace (git worktree) is created.
set -euo pipefail

[ -f composer.json ] && composer install
[ -f package.json ] && npm install

if [ ! -f .env ] && [ -f .env.example ]; then
    cp .env.example .env
    [ -f artisan ] && php artisan key:generate
fi

# Add per-workspace database setup here if the project needs it, e.g.:
# [ -f artisan ] && php artisan migrate
