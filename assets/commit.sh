# commit — run the project's pre-commit checks, stage everything, and commit.
#
# Works in bash and zsh. The ai-setup installer copies this to ~/.config/ai-setup/commit.sh
# and sources it from your shell rc (~/.zshrc and/or ~/.bashrc). Use it from any repo, any
# subdirectory:
#
#   commit "Fixed the servicing queue sort"   # use your own message
#   commit                                     # generate a short message from the staged diff
#
# Behavior:
#   - Resolves the repo root, so it works from a subdirectory.
#   - Runs .ai-setup/precommit (or legacy ./precommit) at the repo root first; a non-zero exit
#     aborts the commit. This is separate from git hooks.
#   - Stages everything repo-wide (git add -A), including fixes the pre-commit step made.
#   - With no message, the Claude CLI (if installed) writes a one-line message from the staged
#     diff; otherwise you're prompted, or it falls back to "WIP".
#   - If the branch name contains a ticket id (e.g. ABC-123), it's prefixed to the message.

commit() {
    local root
    root="$(git rev-parse --show-toplevel 2>/dev/null)" || {
        echo "commit: not inside a git repository" >&2
        return 1
    }

    # 1. Project pre-commit checks (not a git hook) — run at the repo root; abort if they fail.
    local precommit=""
    if [ -f "$root/.ai-setup/precommit" ]; then
        precommit="$root/.ai-setup/precommit"
    elif [ -f "$root/precommit" ]; then
        precommit="$root/precommit"
    fi
    if [ -n "$precommit" ]; then
        # Run via bash when the exec bit is missing, so checks are never silently skipped.
        if [ -x "$precommit" ]; then
            ( cd "$root" && "$precommit" ) || { echo "commit: pre-commit checks failed, aborting" >&2; return 1; }
        else
            ( cd "$root" && bash "$precommit" ) || { echo "commit: pre-commit checks failed, aborting" >&2; return 1; }
        fi
    fi

    # 2. Stage everything repo-wide (regardless of cwd), including pre-commit fixes.
    git add -A
    if git diff --cached --quiet; then
        echo "commit: nothing staged to commit" >&2
        return 0
    fi

    local commitMessage="$*"
    local ticket_id
    # First ABC-123 style id in the branch name (must start with a letter, so "2024-01" is ignored).
    ticket_id="$(git branch --show-current | grep -oE '[A-Z][A-Z0-9]*-[0-9]+' | head -n1)"

    # 3. No message provided → generate one from the staged diff via the Claude CLI (if present).
    #    On failure, ask the user to retry, type their own, or abort.
    while [ -z "$commitMessage" ]; do
        if command -v claude >/dev/null 2>&1; then
            local generated rc
            generated="$(git diff --cached | claude -p 'Write a single-line git commit message for the staged diff provided on stdin. Start with a past-tense verb (Added, Fixed, Updated, Removed). Be specific and name the component or feature that changed. One line, ~70 characters max, no trailing period, no ticket prefix, no quotes or backticks. Output ONLY the commit message text and nothing else.' 2>/dev/null)"
            rc=$?  # exit status of the pipeline == the claude command (avoid zsh's read-only $status)
            if [ "$rc" -eq 0 ] && [ -n "$generated" ]; then
                commitMessage="$(printf '%s\n' "$generated" | head -n1)"
                break
            fi
            if [ "$rc" -ne 0 ]; then
                echo "commit: claude failed (exit $rc)." >&2
            else
                echo "commit: claude returned no message." >&2
            fi
        else
            echo "commit: claude not found on PATH." >&2
        fi

        # No terminal to prompt on (e.g. run from a script) → fall back to WIP.
        if [ ! -t 0 ]; then
            echo "commit: non-interactive shell; using 'WIP'." >&2
            commitMessage="WIP"
            break
        fi

        # Decide what to do. Inner loop so a typo re-prompts without another claude call.
        while true; do
            local choice=""
            printf 'Message generation unavailable. [R]etry, [e]nter your own, [a]bort? '
            if ! read -r choice; then
                echo "commit: aborted; your changes remain staged (run 'git reset' to unstage)." >&2
                return 1
            fi
            case "$choice" in
                r|R|"")
                    break  # regenerate on the next outer-loop iteration
                    ;;
                e|E)
                    printf 'Commit message: '
                    if ! read -r commitMessage || [ -z "$commitMessage" ]; then
                        echo "commit: empty message, aborting; your changes remain staged (run 'git reset' to unstage)." >&2
                        return 1
                    fi
                    break  # commitMessage is set → outer loop exits
                    ;;
                a|A)
                    echo "commit: aborted; your changes remain staged (run 'git reset' to unstage)." >&2
                    return 1
                    ;;
                *)
                    echo "commit: unrecognized option '$choice'." >&2
                    ;;
            esac
        done
    done

    # 4. Prefix the ticket id when the branch has one.
    if [ -n "$ticket_id" ]; then
        commitMessage="$ticket_id $commitMessage"
    fi

    git commit -m "$commitMessage"
}
