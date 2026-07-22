---
name: subagent-dispatch
description: Use when handing off multi-finding fix work to a subagent or working agent — PR review remediation, batched test failures, multi-cluster bug fixes, or any prompt that dispatches several related fixes in one task. Covers structuring the dispatch prompt with a source-of-truth pointer, universal constraints, one-cluster-at-a-time execution with per-cluster verify gates, and a standardized report format. Skip for single-issue handoffs — a plain one-paragraph task description is enough there.
---

<!-- managed by agent-equip — edit this file and it becomes yours (agent-equip then stops updating it); customize by adding your own skill alongside instead. -->

# Writing subagent dispatch prompts

When handing off multi-finding fix work (review remediation, batched test failures,
multi-cluster bug fixes) to another agent — a spawned subagent, a fresh agent session, or a
parallel workspace — structure the dispatch prompt so the receiving agent verifies before
fixing, works in bounded clusters, and reports in a form you can audit. A loose "fix these
issues" list produces scope drift, stale fixes, and unverifiable claims.

The prompt must be **self-contained**: the receiving agent has none of your conversation
context. No "the issues above", no "as discussed", no findings that live only in your chat —
restate every finding in the prompt itself, with file paths and symbols.

## Prompt structure

Build the prompt in this order:

### 1. Source-of-truth pointer

Name where the findings came from (the PR, the failing CI run, the triage doc) and state:
**verify every finding against the current code before fixing it**. Code moves between triage
and dispatch — if a finding no longer applies, the agent must say so and skip it, not force a
fix onto changed code.

### 2. Universal constraints

The rules that apply to every cluster, stated once at the top:

- No `git add` / `git commit` / `git push` unless the user explicitly allowed it.
- One cluster at a time; do not start the next until the current cluster's verify step passes.
- Project-specific landmines the agent can't infer: generated files and how to regenerate them,
  formatting/lint commands, which test runner and how to filter it.
- Capture once, grep many: when a command's output is needed repeatedly (test failures, lint
  output), save it to a file once and search that, instead of re-running the slow command.

### 3. Clusters

Group findings into clusters of related work — same file, same root cause, or same subsystem.
For each cluster give:

- **What is wrong** — the finding(s), specific enough to re-verify (file, symbol, observed vs
  expected).
- **Investigation gate** (when needed) — what the agent must confirm before editing, e.g. "check
  whether X still calls Y; if not, skip this cluster and report why".
- **The fix direction** — what to change and where the canonical source is (not the generated
  copy). Constrain the shape, don't dictate every line.
- **Verify step** — the concrete command(s) that prove the cluster is done: the filtered test,
  the lint run, the grep that must come back empty.

Order clusters by dependency and severity: blockers first, doc-only fixes last.

### 4. Report format

Tell the agent exactly what to report, per cluster: what it verified, what it changed (files +
one-line why), the verify commands run and their results. End the report with overall
test/lint/typecheck status and an explicit list of anything skipped, already fixed, or found
not to apply. No silent skips.

### 5. End-of-prompt hard rules

Close with the two or three rules that must survive even if the agent compresses the prompt:
typically "do not commit", "one cluster at a time", and "report skips explicitly". Repetition
here is intentional — the end of the prompt is what a long-running agent re-reads.

## What to leave out

- Findings you haven't triaged — a maybe-issue goes in a "needs a design call, not in scope"
  note at the end, not in a cluster.
- Step-by-step edit instructions — give the fix direction and the verify command; let the agent
  own the edit.
- Anything the target repo's own agent instructions already cover; point at them instead of
  restating.
