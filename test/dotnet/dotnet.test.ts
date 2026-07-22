import { expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { install } from "../../src/install.ts";
import { missingPackages } from "../../src/packages.ts";
import { useSandbox } from "../helpers.ts";

const ctx = useSandbox();

test("dotnet: AGENTS.md merges common rules with the dotnet-test rule; ships precommit + props", () => {
	install({ target: ctx.target, stack: "dotnet", commitHelper: false });
	const agents = readFileSync(join(ctx.target, "AGENTS.md"), "utf8");
	expect(agents).toContain("dotnet test"); // dotnet testing rule
	expect(agents).toContain("# Git"); // from common
	expect(
		readFileSync(join(ctx.target, ".agent-equip/precommit"), "utf8"),
	).toContain("csharpier");
	const props = readFileSync(join(ctx.target, "Directory.Build.props"), "utf8");
	expect(props).toContain("TreatWarningsAsErrors");
	expect(props).toContain("Roslynator.Analyzers");
});

test("stack metadata files (packages.json, stack.json) are not seeded into the target", () => {
	install({ target: ctx.target, stack: "dotnet", commitHelper: false });
	expect(existsSync(join(ctx.target, "packages.json"))).toBe(false);
	expect(existsSync(join(ctx.target, "stack.json"))).toBe(false);
});

test("recommends CSharpier when the local tool manifest is missing it", () => {
	expect(missingPackages(ctx.target, "dotnet").map((p) => p.id)).toContain(
		"csharpier",
	);
});

test("does not recommend CSharpier once it's in the local tool manifest", () => {
	mkdirSync(join(ctx.target, ".config"), { recursive: true });
	writeFileSync(
		join(ctx.target, ".config/dotnet-tools.json"),
		JSON.stringify({ tools: { csharpier: { version: "1.0.0" } } }),
	);
	expect(missingPackages(ctx.target, "dotnet").map((p) => p.id)).not.toContain(
		"csharpier",
	);
});
