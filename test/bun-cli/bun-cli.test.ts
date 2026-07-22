import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { install } from "../../src/install.ts";
import { missingPackages } from "../../src/packages.ts";
import { useSandbox } from "../helpers.ts";

const ctx = useSandbox();

test("bun-cli: AGENTS.md merges common rules with the bun-test testing rule", () => {
	install({ target: ctx.target, stack: "bun-cli", commitHelper: false });
	const agents = readFileSync(join(ctx.target, "AGENTS.md"), "utf8");
	expect(agents).toContain("bun test"); // bun-cli testing rule
	expect(agents).toContain("# Git"); // from common
	expect(
		readFileSync(join(ctx.target, ".agent-equip/precommit"), "utf8"),
	).toContain("bun test");
});

test("bun-cli declares no curated packages", () => {
	expect(missingPackages(ctx.target, "bun-cli")).toEqual([]);
});
