import { expect, test } from "bun:test";
import {
	existsSync,
	mkdirSync,
	readFileSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { install } from "../../src/install.ts";
import { useSandbox, walk } from "../helpers.ts";

const ctx = useSandbox();

test("whole install is idempotent: a second run makes zero byte changes, all up-to-date", () => {
	install({ target: ctx.target, stack: "laravel", commitHelper: false });
	const before = new Map(walk(ctx.target).map((f) => [f, readFileSync(f)]));

	const report = install({
		target: ctx.target,
		stack: "laravel",
		commitHelper: false,
	});
	expect(report.files.every((f) => f.outcome === "up-to-date")).toBe(true);

	const after = walk(ctx.target);
	expect(after.sort()).toEqual([...before.keys()].sort()); // no new/removed files
	for (const f of after) {
		const prev = before.get(f);
		expect(prev !== undefined && readFileSync(f).equals(prev)).toBe(true);
	}
});

test("a typo'd end marker does not delete the user's content below the block", () => {
	install({ target: ctx.target, stack: "laravel", commitHelper: false });
	const agentsPath = join(ctx.target, "AGENTS.md");
	const seeded = readFileSync(agentsPath, "utf8");
	// User appends notes below the block, then fat-fingers the closing marker.
	const damaged = `${seeded}\n# My notes\nkeep this line\n`.replace(
		"<!-- ai-setup <<< -->",
		"<!-- ai-setup XXX -->",
	);
	writeFileSync(agentsPath, damaged);

	install({ target: ctx.target, stack: "laravel", commitHelper: false });
	const after = readFileSync(agentsPath, "utf8");
	expect(after).toContain("keep this line"); // not truncated to EOF
	expect(after).toContain("# My notes");
});

test("a file with two managed blocks collapses to one on re-install (content preserved)", () => {
	install({ target: ctx.target, stack: "laravel", commitHelper: false });
	const agentsPath = join(ctx.target, "AGENTS.md");
	const block = readFileSync(agentsPath, "utf8"); // fresh install = just the managed block
	// Simulate pre-fix damage: two copies of the block with user content around them.
	writeFileSync(agentsPath, `# Top\n\n${block}\n${block}\n# Bottom\n`);

	install({ target: ctx.target, stack: "laravel", commitHelper: false });
	const after = readFileSync(agentsPath, "utf8");
	expect(after.match(/<!-- ai-setup >>>/g)?.length).toBe(1); // exactly one block
	expect(after).toContain("# Top");
	expect(after).toContain("# Bottom");
});

test("malformed target settings.json is left intact with a *.ai-setup-new (no crash)", () => {
	mkdirSync(join(ctx.target, ".claude"), { recursive: true });
	const settings = join(ctx.target, ".claude/settings.json");
	writeFileSync(settings, "{ not valid json, }");

	install({ target: ctx.target, stack: "laravel", commitHelper: false });
	expect(readFileSync(settings, "utf8")).toBe("{ not valid json, }"); // untouched
	expect(existsSync(`${settings}.ai-setup-new`)).toBe(true);
});

test("an existing, differing settings.toml is preserved with a *.ai-setup-new (no claude needed)", () => {
	mkdirSync(join(ctx.target, ".conductor"), { recursive: true });
	const toml = join(ctx.target, ".conductor/settings.toml");
	writeFileSync(toml, "existing = true\n");

	install({ target: ctx.target, stack: "laravel", commitHelper: false });
	expect(readFileSync(toml, "utf8")).toBe("existing = true\n"); // untouched
	expect(existsSync(`${toml}.ai-setup-new`)).toBe(true);
});

test("a human edit to a seeded file forks it: left untouched and silent on re-run", () => {
	install({ target: ctx.target, stack: "laravel", commitHelper: false });
	const precommit = join(ctx.target, ".ai-setup/precommit");
	writeFileSync(precommit, "#!/bin/sh\necho mine\n"); // team edits → now owns it

	const report = install({
		target: ctx.target,
		stack: "laravel",
		commitHelper: false,
	});
	expect(readFileSync(precommit, "utf8")).toBe("#!/bin/sh\necho mine\n"); // untouched
	expect(existsSync(`${precommit}.ai-setup-new`)).toBe(false); // no churn
	expect(
		report.files.find((f) => f.path === ".ai-setup/precommit")?.outcome,
	).toBe("forked");
});

test("copied executable templates keep their exec bit", () => {
	install({ target: ctx.target, stack: "laravel", commitHelper: false });
	const mode = statSync(join(ctx.target, ".ai-setup/precommit")).mode;
	expect(mode & 0o111).not.toBe(0); // at least one execute bit set
});

test("commit-helper source line is deduped across re-runs (one marker in the rc)", () => {
	process.env.SHELL = "/bin/zsh";
	install({ target: ctx.target, stack: "laravel" });
	install({ target: ctx.target, stack: "laravel" });
	const zshrc = readFileSync(join(ctx.home, ".zshrc"), "utf8");
	expect(zshrc.match(/# ai-setup: commit helper/g)?.length).toBe(1);
});
