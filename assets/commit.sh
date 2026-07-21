# commit — stage everything, run the project's pre-commit checks, and commit.
#
# Works in bash and zsh. The ai-setup installer copies this to ~/.config/ai-setup/commit.sh
# and sources it from your shell rc (~/.zshrc and/or ~/.bashrc). Use it from any repo:
#
#   commit "Fixed the servicing queue sort"   # use your own message
#   commit                                     # generate a short message from the staged diff
#
# Behavior:
#   - If an executable .ai-setup/precommit (or legacy ./precommit) exists, it runs first
#     (lint/format). A non-zero exit aborts the commit. This is separate from git hooks.
#   - Stages everything (git add .), including fixes the pre-commit step made.
#   - If the branch name contains a ticket id (e.g. ABC-123), it's prefixed to the message.
#   - With no message, the Claude CLI writes a one-line message from the staged changes;
#     if that produces nothing it falls back to "WIP".
#
# Requires: the `claude` CLI on PATH for auto-generated messages.

commit() {
    # 1. Project pre-commit checks (not a git hook) — abort the commit if they fail.
    #    Prefer .ai-setup/precommit; fall back to a legacy ./precommit.
    local precommit=""
    if [ -x "./.ai-setup/precommit" ]; then
        precommit="./.ai-setup/precommit"
    elif [ -x "./precommit" ]; then
        precommit="./precommit"
    fi
    if [ -n "$precommit" ] && ! "$precommit"; then
        echo "commit: pre-commit checks failed, aborting" >&2
        return 1
    fi

    # 2. Stage everything (including any fixes the pre-commit step made).
    git add .

    local commitMessage="$*"
    local ticket_id
    # Portable (BSD + GNU grep): first ABC-123 style id in the branch name, if any.
    ticket_id="$(git branch --show-current | grep -oE '[A-Z0-9]{2,}-[0-9]+' | head -n1)"

    # 3. No message provided → generate one from the staged diff via the Claude CLI.
    #    Capture the output and the CLI's exit status separately (don't pipe into `head`
    #    here, or the pipeline status would reflect `head` and hide a failed `claude`).
    #    On failure, ask the user to retry, type their own, or abort.
    while [ -z "$commitMessage" ]; do
        local generated rc
        generated="$(git diff --cached | claude -p 'Write a single-line git commit message for the staged diff provided on stdin. Start with a past-tense verb (Added, Fixed, Updated, Removed). Be specific and name the component or feature that changed. One line, ~70 characters max, no trailing period, no ticket prefix, no quotes or backticks. Output ONLY the commit message text and nothing else.' 2>/dev/null)"
        rc=$?  # exit status of the pipeline == the claude command (avoid zsh's read-only $status)

        if [ "$rc" -eq 0 ] && [ -n "$generated" ]; then
            # Keep only the first line, in case the model added anything extra.
            commitMessage="$(printf '%s\n' "$generated" | head -n1)"
            break
        fi

        if [ "$rc" -ne 0 ]; then
            echo "commit: claude failed (exit $rc)." >&2
        else
            echo "commit: claude returned no message." >&2
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
            printf 'Generation failed. [R]etry, [e]nter your own, [a]bort? '
            if ! read -r choice; then
                echo "commit: aborted." >&2
                return 1
            fi
            case "$choice" in
                r|R|"")
                    break  # regenerate on the next outer-loop iteration
                    ;;
                e|E)
                    printf 'Commit message: '
                    if ! read -r commitMessage || [ -z "$commitMessage" ]; then
                        echo "commit: empty message, aborting." >&2
                        return 1
                    fi
                    break  # commitMessage is set → outer loop exits
                    ;;
                a|A)
                    echo "commit: aborted." >&2
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
