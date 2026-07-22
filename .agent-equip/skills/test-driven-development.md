---
name: test-driven-development
description: Use when building NEW behavior — implementing a new function, method, endpoint, component, command, or feature where a test can express the intended behavior up front. Drives a red → green → refactor loop: write a failing test for the next slice of behavior, make it pass with the minimal code, then refactor with the test green. For changing or fixing EXISTING behavior, use the codifying-existing-behavior skill instead. Skip for throwaway spikes, pure config/generated code, UI/visual-only tweaks, and glue with no reasonable test seam.
---

<!-- managed by agent-equip — edit this file and it becomes yours (agent-equip then stops updating it); customize by adding your own skill alongside instead. -->

# Test-Driven Development

When building **new** behavior, write the test first and let it drive the implementation:
**red → green → refactor**. The test defines "done" before any production code exists, so the
code that appears is only what a test demanded — nothing speculative. This is intentional
scope, not a violation of "surgical changes."

For changing or fixing **existing** behavior with code already in place, use the
`codifying-existing-behavior` skill instead — that pins current behavior; this grows new
behavior.

## When this applies

Invoke when the user asks to build something new:
- "implement / add / build X" where X is a new function, method, class, endpoint, component,
  command, parser, calculation, or feature.
- "write a validator / formatter / transformer for …"
- Any greenfield unit whose intended behavior you can state as concrete input → output examples.

## When to skip (carve-outs)

Do NOT force the loop when the change is:
- **Throwaway / spike**: exploratory code you'll discard once you've learned the shape. Say it's
  a spike; test the real version afterward.
- **Pure config / generated code**: no behavior of your own to assert.
- **UI / visual-only**: layout, styling, copy — no logic to pin. (Logic behind the UI still
  gets TDD.)
- **No reasonable seam**: glue with no observable behavior to assert. State why and proceed.

If unsure whether a unit qualifies, say so and ask. Do not guess.

## Define the first behavior before writing code

If the ask is vague ("add search", "build the importer"), **stop and ask** what the first
observable behavior should be — the smallest concrete example (given this input, produce this
output / this effect). Don't infer the whole design from the name. One slice at a time.

## Procedure — red / green / refactor

Match the project's own test framework and conventions (its runner, file layout, fixtures,
assertions). Check `AGENTS.md` and neighboring tests first; if the layout is unclear, dispatch a
read-only `Explore` subagent to find where and how tests are written. Do not impose a framework
the project doesn't use.

### 1. Red — write the failing test

Write the **smallest** test that expresses the next slice of desired behavior. Run it and
confirm it fails **for the right reason** — a missing-implementation / wrong-result assertion,
not a typo, import error, or setup mistake. A test that errors before it asserts hasn't gone red
yet.

### 2. Green — minimal code to pass

Write the least code that makes the test pass. Resist implementing behavior no test has asked
for yet — that's the next slice's job. Run the test; it must pass.

### 3. Refactor — clean up green

With the test passing, improve names, remove duplication, tidy structure. Re-run the test after
each change; it stays green. Do not add behavior here.

### 4. Loop

Repeat for the next slice (next input/output example, next edge case, next error path) until the
feature is complete. Keep each test focused on one behavior.

## Edge cases and errors are their own slices

Don't cram every case into one test. Add a slice per meaningful path: the happy path first, then
boundaries, invalid input, and error handling — each a red → green cycle. Stop when the behaviors
the user asked for are covered; don't gold-plate with cases nobody needs.

## Out-clauses

The user can override at any time:
- "skip TDD, just write it" → skip the loop cleanly, do not lecture. Consider adding a test after.
- "I'll write the tests myself" → implement, leave the tests to them.
- For a trivial one-liner with obvious behavior, use judgment and state the call: "This is a
  one-line pure helper — writing it and a single test together rather than strict red-first.
  Object?"

## Tradeoff acknowledgment

TDD front-loads effort: you write the test before the code and iterate in small cycles. The cost
is real (more round-trips) and so is the benefit (coverage from day one, a tight spec, minimal
un-asked-for code). Don't let it drift into over-testing trivial glue or designing far beyond the
behavior requested — that trades one excess for another.
