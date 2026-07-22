# agent-equip format spec

This is the implementation-independent **behavior contract** for how agent-equip composes its
template payload and merges it into a target project. It documents observable behavior — file
formats, marker syntax, and routing rules — not the current TypeScript implementation.

Any reimplementation (a Go/Rust port, a different language) **must satisfy everything here** to be
compatible: the same inputs must produce the same on-disk result, and re-running must be
idempotent in the same way. The reference implementation lives in `src/` (`templates.ts`,
`install.ts`, `merge.ts`, `manifest.ts`); this file is the source of truth for behavior, and the
test suite under `test/` encodes it.

## 1. Layer composition

The payload is `templates/`, organized into **layers**: the shared `common` layer plus one
**stack** layer (e.g. `laravel`, `bun-cli`). A stack name is any directory under `templates/`
other than `common`.

Composing for a stack walks `templates/common/` then `templates/<stack>/` recursively. Each file
is keyed by its path **relative to its layer root**. On an identical relative path, the **stack
file wins** (overrides common). The result is a flat map of `relative path -> source file`.

Two categories of composed files are **not** seeded as-is:

- **Stack metadata** — `stack.json`, `packages.json`, `agent-tools.json` — are read by the
  installer (picker labels, curated packages, agent tools) and never written into the target.
- **Rule fragments** — anything under `rules/` ending in `.md` — are assembled into `AGENTS.md`
  (§2), not copied individually.

One path rename applies when seeding: `gitignore.snippet` → `.gitignore`.

## 2. AGENTS.md assembly

`AGENTS.md` is generated, not copied. Its managed block is:

1. a fixed preamble stating that personal/global instructions take precedence over project
   conventions;
2. followed by every composed `rules/*.md` fragment (common + stack, stack overriding a
   same-named fragment), each `trim()`med, joined by blank lines, in ascending path order.

The assembled text is wrapped in the marked-block markers (§3) and merged into the target's
`AGENTS.md` with the marked-block strategy — so a project's own prose above/below the block is
preserved.

## 3. Managed-block format (marked-block strategy)

Used for `AGENTS.md`, `CLAUDE.md`, and `.gitignore`. The managed region is delimited by a
start/end marker pair, one pair per file type:

| File | Start marker (prefix) | End marker |
| --- | --- | --- |
| `AGENTS.md`, `CLAUDE.md` | `<!-- agent-equip >>>` | `<!-- agent-equip <<< -->` |
| `.gitignore` | `# agent-equip >>>` | `# agent-equip <<<` |

The `AGENTS.md`/`CLAUDE.md` start marker carries trailing descriptive text on the same line
(`<!-- agent-equip >>> (managed by agent-equip …) -->`); the `AGENTS.md` marker additionally
stamps the installing CLI **version** right after the prefix (`<!-- agent-equip >>> vX.Y.Z (…) -->`).
Markers are matched by **prefix at the start of a line** (after leading whitespace) — the constant
`<!-- agent-equip >>>` prefix — so neither the trailing text nor the version affects matching, and
a version bump refreshes the block in place rather than leaving a stale duplicate.

Refresh semantics (`ensureBlock`):

- **Target absent** → create it containing just the block.
- **Target present** → remove **every** complete start→end block (see below), trim trailing
  blank lines from what remains, then append the fresh block separated by one blank line.
- **Idempotent** → if the result equals the current file, it is reported unchanged and not
  rewritten.

Block stripping (`stripBlock`) removes every well-formed start→end region (inclusive). This means
a file that somehow contains duplicate managed blocks **converges to exactly one** on the next
run. Only complete pairs are stripped: a start marker with no later end marker leaves the content
intact (never truncates to end-of-file). Content outside the block — including a line that merely
*mentions* a marker — is always preserved.

## 4. Merge routing

Every seeded file routes to exactly one strategy, chosen by name/type (not a hardcoded path
list), so a new stack's structured config merges correctly without code changes:

| Match | Strategy |
| --- | --- |
| `CLAUDE.md` | marked-block (§3) |
| `.gitignore` | marked-block (§3) |
| `*.json` | JSON deep-merge (§6) |
| `*.csproj` / `*.props` / `*.targets` | MSBuild merge (§7) |
| `*.toml` | whole-file / manifest (§5) |
| anything else | whole-file / manifest (§5) |

## 5. Ownership manifest (whole-file strategy)

Whole-file managed files (everything routed to "copy" or "toml" — prompts, skills, commands,
`precommit`, `.conductor/*`, TOML configs, …) are tracked in `.agent-equip/manifest.json`, so
agent-equip can tell a **pristine** file (still exactly as it last wrote) from a **forked** one
(edited by the team).

Manifest format: a JSON object with an install-params **header** (`version` — the CLI that last
wrote it, `stack`, `agents`) plus a `files` object of `relative path -> value` (keys sorted, file
ending in a newline). The header lets `update` re-run the same compose+merge non-interactively. A
pre-versioned flat manifest (`{ "<rel>": "<value>" }` with no `files` key) is read transparently as
`{ files: … }` with an absent header. Each file value is either:

- the lowercase hex **sha256 of the file's bytes as agent-equip last wrote them**, or
- the literal string `"forked"` — the **fork sentinel**. It can never equal a sha256 (64 hex
  chars), so a forked file always takes the silent path on later runs.

Routing for one whole-file entry, given the target file and its prior manifest value:

| Situation | Action | Outcome | New manifest value |
| --- | --- | --- | --- |
| target absent | write it (seed) | `created` | sha256(source) |
| target bytes == source | nothing (clear any stale `*.agent-equip-new`) | `up-to-date` | sha256(source) |
| no prior value **and** target differs from source | do **not** overwrite; write `<target>.agent-equip-new` once | `new-written` | `"forked"` |
| prior value == sha256(current target) (pristine) | overwrite from source (track upstream) | `updated` | sha256(source) |
| otherwise (edited since last write — forked) | leave untouched, silently | `forked` | prior value (unchanged) |

Notes:

- **First-encounter foreign file** (a file agent-equip never wrote) is never clobbered — the
  incoming version is dropped beside it as `<name>.agent-equip-new` **once**, and the sentinel is
  recorded so later runs stay silent (no repeated `*.agent-equip-new` churn).
- The executable bit of a written file derives from the **source** file's mode (so a stack stays
  pure data — an executable `precommit`/`setup.sh` in a template lands executable).
- Marked-block (§3) and MSBuild (§7) files are **not** manifest-tracked. JSON files (§6) **are**
  tracked (their merged-result hash), so `update` can surface a hand-edited one.

## 6. JSON deep-merge

For `*.json` (e.g. `.claude/settings.json`), the template is deep-merged into the target on every
run, non-destructively:

- **Target absent** → copy the template (`created`).
- **Target bytes == template** → `up-to-date`.
- **Target is malformed JSON** → never overwrite; drop `<target>.agent-equip-new` beside it
  (`new-written`, records the fork sentinel).
- **Otherwise** → deep-merge and write if the result changed (`merged-json`), else `up-to-date`.

Merge rule: **existing values win.** For a key present in both, a scalar or array in the target is
kept as-is (arrays are not concatenated); two objects merge recursively; keys only the template
introduces are added. Re-running is therefore safe and convergent.

JSON files **are** manifest-tracked: the sha256 of the merged result is recorded. When the target's
current bytes no longer match that recorded hash, it was **hand-edited** since agent-equip last wrote
it — the outcome is reported `forked` (so `update` surfaces it as "kept your local edits") while the
non-destructive deep-merge still runs. The agent-tools picker writes `.claude/settings.json` /
`.mcp.json` *after* the install records the manifest, so those files' hashes are re-stamped to the
post-picker bytes; only later human edits then count as divergence. Divergence is surfaced **once** —
the merged bytes become the new recorded baseline.

## 7. MSBuild merge

For MSBuild files (`*.csproj`, `*.props`, `*.targets` — e.g. a `Directory.Build.props`), the template
is merged into the target's `<Project>`, the XML analog of the JSON deep-merge:

- **Target absent** → copy the template (`created`).
- **Target bytes == template** → `up-to-date`.
- **Target is malformed XML, or has no `<Project>`** → never overwrite; drop
  `<target>.agent-equip-new` beside it (`new-written`).
- **Otherwise** → union the template's `<Project>` children into the target's and write if anything
  was added (`merged-msbuild`), else `up-to-date` (the file is not rewritten, so formatting never
  churns).

Merge rule: **existing values win.** A `<PropertyGroup>` tag the target already sets is left as-is;
`<ItemGroup>` items are keyed by (element tag + `Include` attribute) and added only when missing;
any other top-level element is added when the target lacks that tag. Re-running is safe and
convergent. (Like JSON, XML files are not manifest-tracked.)

## 8. Reconcile copies

Whenever a strategy refuses to overwrite a file it did not author (§5 first-encounter, §6
malformed target, §7 malformed/`<Project>`-less target), it leaves the incoming content beside the
original with a **`.agent-equip-new`** suffix for the user to reconcile, and clears that copy once
the target no longer differs. This suffix is the single reconcile-copy convention across all
strategies.
