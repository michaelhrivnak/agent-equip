/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
	// No Bun test-runner plugin exists — drive `bun test` through the generic command runner.
	testRunner: "command",
	commandRunner: { command: "bun test" },
	// The command runner can't do per-test coverage; "off" runs the full suite per mutant.
	coverageAnalysis: "off",
	// Sandbox isolation (the default): Stryker copies the repo to .stryker-tmp and mutates there, so
	// the working tree is never touched — safe even if a run is interrupted. The copy drops the
	// executable bit on templates/.../precommit, which fails the "keeps exec bit" install test;
	// buildCommand runs once in the fresh sandbox to restore +x before any test runs. Stryker runs
	// this without a shell (execa escapes each token), so keep it a plain find — no shell globs/parens.
	buildCommand: "find templates -name precommit -exec chmod +x {} +",
	mutate: ["src/**/*.ts", "!src/**/*.test.ts"],
	// Each mutant cold-starts a fresh `bun test` under concurrency; the default 5s overhead flags
	// slow-but-not-hung reruns as timeouts (they still count as killed, but the label is noise).
	// A generous fixed overhead keeps genuine infinite-loop mutants as timeouts without the false ones.
	timeoutMS: 20000,
	reporters: ["clear-text", "progress", "html"],
	// Bun isn't a supported packageManager; npm is only used for Stryker's own plugin/sandbox
	// bookkeeping and never touches your test run.
	packageManager: "npm",
};
