#!/usr/bin/env bash
#
# ai-setup installer — seeds AI-development tooling into a target project and installs the
# user-level `commit` shell helper.
#
# Usage: ./install.sh <target-project-dir>
#
# Idempotent. How existing files in the target are handled:
#   - CLAUDE.md, .gitignore     -> a marked "ai-setup" block is inserted/refreshed (append-safe)
#   - .claude/settings.json     -> merged with jq (existing values win); else claude; else *.ai-setup-new
#   - .conductor/settings.toml  -> merged with claude if available; else *.ai-setup-new
#   - everything else           -> created if absent; if it exists and differs, a *.ai-setup-new
#                                  copy is left beside it and the original is untouched
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMPLATE_DIR="$SCRIPT_DIR/template"

log() { printf '%s\n' "$*"; }
usage() { echo "Usage: $0 <target-project-dir>" >&2; exit 2; }

# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------

# Best-effort merge via the Claude CLI. Overwrites $1 (existing) with the merged result.
# Returns non-zero if claude is missing or produced nothing.
claude_merge() {  # $1 existing-target  $2 template
    command -v claude >/dev/null 2>&1 || return 1
    local out
    out="$(claude -p "Merge the TEMPLATE config into the EXISTING config file and print ONLY the full merged file contents — no explanation, no code fences. Preserve the existing file's values on any conflict; add whatever the template has that is missing.

EXISTING (${1##*/}):
$(cat "$1")

TEMPLATE:
$(cat "$2")" 2>/dev/null)" || return 1
    [ -n "$out" ] || return 1
    printf '%s\n' "$out" > "$1"
}

# Create $2 from $1 if absent; otherwise merge (jq for json), leaving the original intact
# and writing *.ai-setup-new if it can't be merged automatically.
merge_file() {  # $1 template  $2 target  $3 kind(json|toml)
    local t="$1" dst="$2" kind="$3"
    if [ ! -f "$dst" ]; then
        mkdir -p "$(dirname "$dst")"; cp "$t" "$dst"; log "  created ${dst#"$TARGET"/}"; return
    fi
    if diff -q "$t" "$dst" >/dev/null 2>&1; then
        log "  ${dst#"$TARGET"/} already up to date"; return
    fi
    if [ "$kind" = json ] && command -v jq >/dev/null 2>&1; then
        local tmp; tmp="$(mktemp)"
        if jq -s '.[0] * .[1]' "$t" "$dst" > "$tmp" 2>/dev/null; then
            mv "$tmp" "$dst"; log "  merged (jq) ${dst#"$TARGET"/}"; return
        fi
        rm -f "$tmp"
    fi
    if claude_merge "$dst" "$t"; then
        log "  merged (claude) ${dst#"$TARGET"/}"; return
    fi
    cp "$t" "$dst.ai-setup-new"
    log "  could not auto-merge ${dst#"$TARGET"/} — wrote ${dst##*/}.ai-setup-new for manual merge"
}

# Copy $1 -> $2 only if $2 is absent. If it exists and differs, leave a *.ai-setup-new copy.
copy_if_absent() {  # $1 src  $2 dest  [$3 = exec]
    local src="$1" dst="$2"
    if [ -e "$dst" ]; then
        if diff -q "$src" "$dst" >/dev/null 2>&1; then
            log "  ${dst#"$TARGET"/} already up to date"
        else
            cp "$src" "$dst.ai-setup-new"
            [ "${3:-}" = exec ] && chmod +x "$dst.ai-setup-new" || true
            log "  ${dst#"$TARGET"/} exists and differs — wrote ${dst##*/}.ai-setup-new"
        fi
    else
        mkdir -p "$(dirname "$dst")"; cp "$src" "$dst"
        [ "${3:-}" = exec ] && chmod +x "$dst" || true
        log "  created ${dst#"$TARGET"/}"
    fi
}

# Insert/refresh a marked block in a file (idempotent: create, append, or replace in place).
ensure_block() {  # $1 file  $2 start-marker  $3 end-marker  $4 block-file (contains the markers)
    local file="$1" start="$2" end="$3" block="$4"
    mkdir -p "$(dirname "$file")"
    if [ -f "$file" ]; then
        local tmp; tmp="$(mktemp)"
        # Drop any existing block (start..end inclusive), keep everything else.
        awk -v s="$start" -v e="$end" '
            index($0,s){drop=1}
            !drop{print}
            index($0,e){drop=0; next}
        ' "$file" > "$tmp"
        [ -s "$tmp" ] && printf '\n' >> "$tmp" || true
        cat "$block" >> "$tmp"
        mv "$tmp" "$file"
        log "  refreshed ai-setup block in ${file#"$TARGET"/}"
    else
        cp "$block" "$file"
        log "  created ${file#"$TARGET"/}"
    fi
}

# ---------------------------------------------------------------------------
# user-level commit helper -> ~/.config/ai-setup, sourced from ~/.zshrc
# ---------------------------------------------------------------------------
install_commit_helper() {
    # Target the real ~/.zshrc. We intentionally do NOT honor $ZDOTDIR: some integrated
    # terminals (e.g. Conductor) point it at a managed shell-integration dir.
    local zshrc="$HOME/.zshrc"
    local dest_dir="$HOME/.config/ai-setup"
    local dest="$dest_dir/commit.zsh"
    local marker="# ai-setup: commit helper"
    local source_line="source \"$dest\"  $marker"

    mkdir -p "$dest_dir"
    cp "$SCRIPT_DIR/scripts/commit.zsh" "$dest"
    touch "$zshrc"
    if grep -qF "$marker" "$zshrc"; then
        local tmp; tmp="$(mktemp)"
        grep -vF "$marker" "$zshrc" > "$tmp" || true
        printf '%s\n' "$source_line" >> "$tmp"
        mv "$tmp" "$zshrc"
        log "✓ commit helper updated at $dest (sourced from $zshrc)"
    else
        printf '\n%s\n' "$source_line" >> "$zshrc"
        log "✓ commit helper installed to $dest (sourced from $zshrc)"
    fi
}

# ---------------------------------------------------------------------------
# project payload -> <target>
# ---------------------------------------------------------------------------
seed_project() {
    log "Seeding ai-setup template into $TARGET"
    ensure_block "$TARGET/CLAUDE.md"  "<!-- ai-setup >>>" "<!-- ai-setup <<< -->" "$TEMPLATE_DIR/CLAUDE.md"
    ensure_block "$TARGET/.gitignore" "# ai-setup >>>"    "# ai-setup <<<"        "$TEMPLATE_DIR/gitignore.snippet"

    copy_if_absent "$TEMPLATE_DIR/CLAUDE.local.md.example" "$TARGET/CLAUDE.local.md.example"

    local f
    for f in "$TEMPLATE_DIR"/.claude/rules/*.md; do
        copy_if_absent "$f" "$TARGET/.claude/rules/$(basename "$f")"
    done
    copy_if_absent "$TEMPLATE_DIR/.claude/skills/codifying-existing-behavior/SKILL.md" \
                   "$TARGET/.claude/skills/codifying-existing-behavior/SKILL.md"

    merge_file "$TEMPLATE_DIR/.claude/settings.json" "$TARGET/.claude/settings.json" json

    copy_if_absent "$TEMPLATE_DIR/precommit" "$TARGET/precommit" exec

    merge_file "$TEMPLATE_DIR/.conductor/settings.toml" "$TARGET/.conductor/settings.toml" toml
    copy_if_absent "$TEMPLATE_DIR/.conductor/setup.sh" "$TARGET/.conductor/setup.sh" exec
}

# ---------------------------------------------------------------------------
main() {
    [ $# -eq 1 ] || usage
    TARGET="$(cd "$1" 2>/dev/null && pwd)" || { echo "install: target '$1' not found" >&2; exit 1; }
    if [ "$TARGET" = "$SCRIPT_DIR" ]; then
        echo "install: refusing to install ai-setup into itself" >&2; exit 1
    fi
    [ -d "$TARGET/.git" ] || log "note: $TARGET is not a git repo root (continuing)"

    install_commit_helper
    seed_project
    log "Done. Open a new shell or run 'source ~/.zshrc' to use the 'commit' helper."
}

main "$@"
