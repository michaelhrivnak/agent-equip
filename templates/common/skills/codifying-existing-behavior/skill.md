---
name: codifying-existing-behavior
description: Use when modifying existing business logic — refactoring, fixing bugs, or changing the behavior of an existing function, method, service, module, class, handler, job, or endpoint. Mandates writing a test that codifies current behavior (or reproduces the bug) BEFORE touching production code. For bugs, the test starts red. For non-bug changes, the test starts green and stays green after the change. Skip for UI/visual tweaks, copy/comment/formatting changes, pure additions of new functions or classes, dependency bumps, and code with no reasonable test seam.
---

<!-- managed by agent-equip — edit this file and it becomes yours (agent-equip then stops updating it); customize by adding your own skill alongside instead. -->

# Codifying Existing Behavior

When changing existing business logic, **codify current behavior in a test before changing the code**. This builds coverage where it's missing and makes the change safer to verify. Test-first is intentional scope expansion — it is the point, not a violation of "surgical changes."

For brand-new behavior with no existing code to pin, use the `test-driven-development` skill instead — that's normal TDD, this is characterization.

## When this applies

Invoke when the user asks for any of:
- "refactor X" / "clean up X" / "simplify X"
- "update / change / modify how X works"
- "fix the bug in X" (use the failing-regression-test variant)
- "improve / optimize X"
- Any edit to existing behavior in a function, method, service, module, class, handler, job, endpoint, or command.

## When to skip (carve-outs)

Do NOT block on this rule when the change is:
- **UI / visual**: markup, styling, layout, copy text, icon swaps, navigation order.
- **Trivial**: comment edits, doc changes, formatting, renames with no behavior change, dependency version bumps.
- **Pure additions**: a brand-new function, method, class, file, or feature that has no existing behavior to characterize. (The new code still needs its own test — that's normal TDD, not characterization; see the `test-driven-development` skill.)
- **Untestable surfaces**: rendering glue, third-party overrides, output/log-message formatting, infrastructure glue with no seam. State *why* it's untestable and proceed.

If unsure whether a change qualifies, say so and ask. Do not guess.

## Force the user to define scope

If the request is vague ("refactor the payment service", "clean up that handler"), **stop and ask** what specific behavior is being pinned before any research or test writing. Do not infer scope from the file alone — the user knows which paths through the code matter. No guessing.

## Procedure

### Step 1 — Research existing coverage (subagent)

Search the test suite for existing coverage — use a read-only subagent if your harness has one, otherwise search directly. Answer:
- "Does any existing test exercise `<unit>` or the behavior `<short description>`?"
- Find the project's test locations and layout — don't hardcode paths. Look under the test
  directory and any file matching the module or feature name.
- Report: existing tests touching this code, coverage gaps for the specific behavior being changed, and the most natural file to extend (or "no covering test exists").

Wait for findings before writing a test. If coverage exists and is adequate, **extend the existing file**, do not create a parallel one.

### Step 2 — Write the test

Follow the project's own test framework and conventions (its runner, fixtures/factories, setup/teardown, and data hygiene). Match the local conventions found in Step 1 — check `AGENTS.md` and neighboring tests; do not impose a framework the project doesn't use.

- **Bug fix**: write a failing test that reproduces the reported behavior. It must fail for the documented reason — not for a setup error.
- **Refactor / behavior change**: write a passing test that pins the *current* behavior on the path being changed. After your code change, the test should still pass (with assertions updated only if the behavior change is intentional and explicitly approved by the user).

Keep characterization tests focused on the specific path being changed. Don't try to pin all behavior of the unit — that's a different project.

### Step 3 — Confirm with the user

Show the test and its current pass/fail state. State explicitly:
- Bug: "Test fails with `<error>` reproducing the bug. OK to proceed with the fix?"
- Refactor: "Test passes against current behavior. OK to proceed with the change?"

Wait for approval before editing production code. The user may catch that you've pinned the wrong behavior or missed a path.

### Step 4 — Make the production change

Apply the minimal change. Run the test. It must end green (or, for a bug, transition red → green).

If the test breaks unexpectedly, **stop and report**. Do not "fix" the test to match the new behavior unless the user has explicitly approved the behavior change.

## Hard-to-reach code

If the code under change has no test seam (baked-in static/global calls, untyped dependencies, hidden state):

1. Prefer **extracting a minimal seam** (extract a function, inject a dependency, narrow a parameter type) before testing. The seam extraction itself is a refactor — it should be its own characterization-tested step if it's nontrivial, or a trivially-safe move (Martin Fowler's "extract method" with no behavior change) if it's small.
2. If extracting a seam is disproportionate to the actual change being made, state that clearly and ask whether to proceed without a test.

Heavy mocking to test untestable code is usually a smell — surface it rather than power through.

## Out-clauses

The user can override at any time:
- "skip the test, just fix it" / "no characterization needed" → skip cleanly, do not lecture.
- "I'll write the test myself" → skip Steps 1–3, proceed to the change.
- For one-line typo fixes / config tweaks even in business-logic files, use judgment and state the call: "This is a one-line constant change — skipping the characterization step. Object?"

When running unattended (CI, an autonomous workspace) with no user to answer, don't block on the scope question or Step 3 approval — state the behavior you pinned and your assumptions explicitly in your report, then proceed.

## Tradeoff acknowledgment

This expands scope on every existing-code edit. That is intentional and accepted. The cost is real (more tokens, slower turn-around) and the benefit is real (regression safety, coverage growth in untested areas). Do not let this skill slide into refactoring the code under test, "improving" adjacent code, or pinning behavior beyond the path being changed — that violates the surgical-changes rule.
