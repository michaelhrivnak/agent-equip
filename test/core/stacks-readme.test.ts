import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { updateReadme } from "../../scripts/generate-stacks.ts";
import { REPO_ROOT } from "../../src/paths.ts";
import { listStacks } from "../../src/templates.ts";

// The README "Supported stacks" block is generated from the stack templates. If a stack is added
// or its stack.json changes, the doc must be regenerated — otherwise it silently goes stale.
test("README supported-stacks block is in sync (run `bun run stacks` if this fails)", () => {
	const readme = readFileSync(join(REPO_ROOT, "README.md"), "utf8");
	expect(updateReadme(readme)).toBe(readme);
});

test("every supported stack is listed in the README block", () => {
	const readme = readFileSync(join(REPO_ROOT, "README.md"), "utf8");
	for (const stack of listStacks()) {
		expect(readme).toContain(`\`--stack ${stack}\``);
	}
});

test("updateReadme throws when the stacks markers are missing", () => {
	expect(() => updateReadme("# README\n\nno markers here\n")).toThrow(
		"stacks:start / stacks:end markers not found",
	);
});
