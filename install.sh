#!/usr/bin/env bash
#
# Project bootstrap for a fresh clone. Idempotent — safe to re-run.
#
# What it does today:
#   - installs the `commit` shell helper into your ~/.zshrc (as a source line, so repo
#     updates to the helper are picked up automatically)
#   - creates your local CLAUDE.local.md from the committed example if you don't have one
#
# Add more steps as the project grows (composer install, npm install, git hooks, ...).
# See the "add more setup steps here" section at the bottom.
set -euo pipefail

# Absolute path to the repo root (this script lives at the root).
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ---------------------------------------------------------------------------
# commit helper -> ~/.zshrc
# ---------------------------------------------------------------------------
install_commit_helper() {
    local zshrc="${ZDOTDIR:-$HOME}/.zshrc"
    local marker="# ai-setup: commit helper"
    local source_line="source \"$REPO_ROOT/scripts/commit.zsh\"  $marker"

    touch "$zshrc"

    if grep -qF "$marker" "$zshrc"; then
        # Rewrite the marked line in place (e.g. if the clone moved).
        local tmp
        tmp="$(mktemp)"
        grep -vF "$marker" "$zshrc" > "$tmp"
        printf '%s\n' "$source_line" >> "$tmp"
        mv "$tmp" "$zshrc"
        echo "✓ Updated commit helper in $zshrc"
    else
        printf '\n%s\n' "$source_line" >> "$zshrc"
        echo "✓ Installed commit helper in $zshrc"
    fi
    echo "  Open a new shell or run 'source $zshrc' to use the 'commit' function."
}

# ---------------------------------------------------------------------------
# per-developer local Claude instructions
# ---------------------------------------------------------------------------
install_local_claude() {
    if [ -f "$REPO_ROOT/CLAUDE.local.md" ]; then
        echo "• CLAUDE.local.md already exists — leaving it as-is."
    else
        cp "$REPO_ROOT/CLAUDE.local.md.example" "$REPO_ROOT/CLAUDE.local.md"
        echo "✓ Created CLAUDE.local.md from the example."
    fi
}

install_commit_helper
install_local_claude

# ---------------------------------------------------------------------------
# add more setup steps here, e.g.:
#   [ -f composer.json ] && composer install
#   [ -f package.json ]  && npm install
# ---------------------------------------------------------------------------

echo "Done."
