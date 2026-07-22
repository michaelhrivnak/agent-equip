import { expect, test } from "bun:test";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { install } from "../../src/install.ts";
import { missingPackages } from "../../src/packages.ts";
import { useSandbox } from "../helpers.ts";

const ctx = useSandbox();

test("laravel: AGENTS.md includes the Pest testing rule; ships precommit + Pest codifying override", () => {
	install({ target: ctx.target, stack: "laravel", commitHelper: false });
	expect(readFileSync(join(ctx.target, "AGENTS.md"), "utf8")).toContain("Pest");
	expect(existsSync(join(ctx.target, ".agent-equip/precommit"))).toBe(true);
	const skill = join(
		ctx.target,
		".agent-equip/skills/codifying-existing-behavior.md",
	);
	expect(existsSync(skill)).toBe(true);
	// The laravel layer overrides the generic common skill — the Pest-specific body wins.
	expect(readFileSync(skill, "utf8")).toContain("Pest conventions");
});

test("stack metadata files (packages.json, stack.json) are not seeded into the target", () => {
	install({ target: ctx.target, stack: "laravel", commitHelper: false });
	expect(existsSync(join(ctx.target, "packages.json"))).toBe(false);
	expect(existsSync(join(ctx.target, "stack.json"))).toBe(false);
});

test("recommends curated packages missing from the target (e.g. Boost)", () => {
	writeFileSync(
		join(ctx.target, "composer.json"),
		JSON.stringify({ require: {} }),
	);
	expect(missingPackages(ctx.target, "laravel").map((p) => p.id)).toContain(
		"boost",
	);
});

test("does not recommend a curated package already present", () => {
	writeFileSync(
		join(ctx.target, "composer.json"),
		JSON.stringify({ require: { "laravel/boost": "^1.0" } }),
	);
	expect(missingPackages(ctx.target, "laravel").map((p) => p.id)).not.toContain(
		"boost",
	);
});
