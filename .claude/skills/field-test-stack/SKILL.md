---
name: field-test-stack
description: Field-test an agent-equip stack against a real cloned project and analyze the install results. Use when validating a stack (e.g. dotnet, laravel, bun-cli) end-to-end on a real-world repo — running `agent-equip init` into a clone, then judging whether every file seeded/merged correctly, whether any `*.agent-equip-new` reconcile copies are bugs vs expected, whether the opinionated seeded config (e.g. a .NET Directory.Build.props with analyzers/TreatWarningsAsErrors) breaks or reshapes the project's build/format/test, and whether package recommendations are accurate. Produces a structured findings report and resets the clone.
---

# Field-test a stack install

Goal: run `agent-equip init` into a **real cloned project** for a given stack and produce an
**analysis of the install results** — did it merge/seed correctly, what needs reconciling, and how
does the opinionated tooling actually affect that project. This is a diagnostic for agent-equip's
own behavior; it does **not** fix agent-equip — it reports findings (open issues / propose changes
separately).

## Inputs

- `<stack>` — the stack to test (`dotnet`, `laravel`, `bun-cli`, …).
- `<target>` — path to a **cloned, clean git checkout** of a real project. Must be a git repo so we
  can snapshot and reset. Treat it as throwaway.

Run the CLI from this repo: `bun run bin/agent-equip.ts …`.

## Candidate .NET projects (verified shapes)

Clone one or more to test the `dotnet` stack against different structures:

| Repo | Shape it exercises |
| --- | --- |
| `ThreeMammals/Ocelot` | **No root `Directory.Build.props`** → tests the seed (`created`) path |
| `serilog/serilog` | `Directory.Build.props`, classic `.sln`, `global.json` → simple XML merge |
| `CommunityToolkit/dotnet` | `Directory.Build.props`, `.slnx`, no CPM → merge, non-CPM |
| `App-vNext/Polly` | `Directory.Build.props` **+ `Directory.Packages.props` (CPM)** → merge **and** the pinned-Roslynator-vs-CPM conflict (NU1008, issue #19) |
| `dotnet/eShop` | props + CPM + Aspire, large modern app → heavy real-world stress |

Pick by what you want to exercise: seed vs merge, CPM vs non-CPM, small vs large.

## Procedure

1. **Snapshot & characterize the target.**
   - `git -C <target> rev-parse HEAD` and confirm `git -C <target> status` is clean.
   - Note the project's shape: is there a root `Directory.Build.props`? `Directory.Packages.props`
     (Central Package Management)? `global.json` SDK pin? `.sln`/`.slnx`? where are the test
     projects? Record what the install is expected to seed vs merge.

2. **Dry run first.** `bun run bin/agent-equip.ts init <target> --stack <stack> --project-only --dry-run`.
   Capture the planned per-file outcomes; sanity-check them against step 1's expectation before
   writing anything.

3. **Install.** Same command without `--dry-run`. Capture the outcome lines.

4. **Analyze each file outcome.**
   - `created` — new file seeded. Confirm it landed and (for scripts) is executable.
   - `merged-json` / `merged-msbuild` — `git -C <target> diff -- <file>`. Verify the project's **own
     values survived** and only **additive** template nodes appear. Any overwritten user value is a
     bug — flag it loudly.
   - `up-to-date` — no change; fine.
   - `new-written` → a `<file>.agent-equip-new` was left. **Investigate why the merge didn't apply**
     (malformed target? unsupported XML/JSON shape? a strategy gap?). Highest-signal finding —
     decide bug vs expected.
   - `forked` — a previously agent-equip-managed file diverged; only expected on re-runs.

5. **Reconcile-copy sweep.** `find <target> -name '*.agent-equip-new'`. List every one with a
   verdict: **expected** (foreign file we correctly refused to clobber) or **bug** (a merge that
   should have handled it).

6. **AGENTS.md check.** Confirm the stack's `rules/*` and the common rules assembled into the
   managed block; spot-check the text.

7. **Opinionated-config / toolchain impact** (the core of the analysis — run the stack's real
   tools in the target and record what the seeded config did):
   - **.NET:**
     - `dotnet build` — did the seeded `Directory.Build.props` (`TreatWarningsAsErrors`,
       `AnalysisLevel`, Nullable) turn a previously-green build red? Count and **categorize** the
       new errors/warnings (nullable, analyzer IDs, style IDExxxx). Judge whether that's acceptable
       enforcement or too aggressive for adoption.
     - `dotnet format --verify-no-changes` — how much would the precommit reformat?
     - Run the seeded gate: `bash <target>/.agent-equip/precommit` (or its steps) — capture
       pass/fail and why.
     - **CPM interaction:** if the project has `Directory.Packages.props`, does our pinned
       Roslynator `PackageReference Version=...` conflict (NU1008)? Record it — this is the concrete
       motivation for issue #19.
   - **Other stacks:** run that stack's format/lint/typecheck/test the same way and record impact.

8. **Package-recommendation accuracy.** Inspect what the stack would recommend
   (`missingPackages`, via the CLI's package step or a small script) vs the project's actual deps —
   is anything offered that's already present, or a detection path wrong?

9. **Report.** Emit a structured findings report:
   - Per-file outcome table (file → outcome → verdict).
   - Reconcile copies, each tagged expected/bug.
   - Merge-correctness verdict: did any user value get clobbered? (should be none).
   - Opinionated-config impact: did the build break, how badly, is it expected/acceptable.
   - Package-recommendation accuracy.
   - **agent-equip bugs found** vs **expected adoption friction** — keep these separate. For real
     bugs, propose a follow-up (issue / fix) rather than fixing inline here.

10. **Reset the clone.** `git -C <target> checkout . && git -C <target> clean -fd` to remove seeded
    files and `*.agent-equip-new` copies; confirm `git -C <target> rev-parse HEAD` matches step 1 so
    the test is repeatable.

## Rules

- The target is throwaway — never commit in it; always reset in step 10.
- `dotnet build`/`test` on a large repo is slow. Default to build + `format --verify-no-changes`;
  run the full test suite only when specifically checking the precommit's test step.
- This skill **analyzes** agent-equip; it doesn't patch it. Findings → issues/PRs, not silent edits.
