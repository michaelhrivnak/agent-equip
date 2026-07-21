# Working style

Behavioral guidelines to reduce common coding mistakes. Bias toward caution over speed; for
trivial tasks, use judgment.

## Think before coding

- State assumptions explicitly; if uncertain, ask.
- If multiple interpretations exist, surface them — don't pick one silently.
- If a simpler approach exists, say so.

## Simplicity first

- Write the minimum code that solves the problem. Nothing speculative.
- No abstractions for single-use code, no unrequested flexibility, no error handling for
  impossible scenarios.

## Surgical changes

- Touch only what the task requires. Don't refactor or reformat adjacent code.
- Match existing style. If you spot unrelated dead code, mention it — don't delete it.
- Remove only the orphans your own change created.

## Goal-driven execution

- Turn tasks into verifiable goals ("add validation" → "write tests for invalid inputs, then
  make them pass") and loop until verified.
