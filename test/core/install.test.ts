import { expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { install, strategyFor } from "../../src/install.ts";
import { listStacks, stackMeta } from "../../src/templates.ts";
import { useSandbox, walk } from "../helpers.ts";

const ctx = useSandbox();

test("fresh install seeds the common layer + assembles AGENTS.md", () => {
	install({ target: ctx.target, stack: "laravel" });
	expect(existsSync(join(ctx.target, "AGENTS.md"))).toBe(true);
	expect(existsSync(join(ctx.target, "CLAUDE.md"))).toBe(true);
	expect(existsSync(join(ctx.target, ".conductor/settings.toml"))).toBe(true);
	expect(readFileSync(join(ctx.target, ".gitignore"), "utf8")).toContain(
		"# ai-setup >>>",
	);
});

test("AGENTS.md is assembled from the rule fragments (not seeded as .claude/rules files)", () => {
	install({ target: ctx.target, stack: "laravel" });
	const agents = readFileSync(join(ctx.target, "AGENTS.md"), "utf8");
	expect(agents).toContain("# Git");
	expect(agents).toContain("# Working style");
	expect(existsSync(join(ctx.target, ".claude/rules"))).toBe(false);
});

test("CLAUDE.md is a thin adapter that imports AGENTS.md", () => {
	install({ target: ctx.target, stack: "laravel" });
	expect(readFileSync(join(ctx.target, "CLAUDE.md"), "utf8")).toContain(
		"@AGENTS.md",
	);
});

test("ships the onboarding prompt and a Claude /onboard command", () => {
	install({ target: ctx.target, stack: "laravel", commitHelper: false });
	expect(existsSync(join(ctx.target, ".ai-setup/onboard.md"))).toBe(true);
	expect(existsSync(join(ctx.target, ".claude/commands/onboard.md"))).toBe(
		true,
	);
});

test("ships the tailoring skills (tune-precommit, tune-conductor)", () => {
	install({ target: ctx.target, stack: "laravel", commitHelper: false });
	expect(
		existsSync(join(ctx.target, ".claude/skills/tune-precommit/SKILL.md")),
	).toBe(true);
	expect(
		existsSync(join(ctx.target, ".claude/skills/tune-conductor/SKILL.md")),
	).toBe(true);
});

test("ships the /ai-setup orchestrator (setup prompt + command)", () => {
	install({ target: ctx.target, stack: "laravel", commitHelper: false });
	expect(existsSync(join(ctx.target, ".ai-setup/setup.md"))).toBe(true);
	expect(existsSync(join(ctx.target, ".claude/commands/ai-setup.md"))).toBe(
		true,
	);
});

test("re-run is idempotent: one block, no *.ai-setup-new", () => {
	install({ target: ctx.target, stack: "laravel" });
	install({ target: ctx.target, stack: "laravel" });
	const claude = readFileSync(join(ctx.target, "CLAUDE.md"), "utf8");
	expect(claude.match(/ai-setup >>>/g)?.length).toBe(1);
	expect(
		walk(ctx.target).filter((f) => f.endsWith(".ai-setup-new")),
	).toHaveLength(0);
});

test("content above the block is preserved on re-install, even if it mentions the marker", () => {
	install({ target: ctx.target, stack: "laravel", commitHelper: false });
	const agentsPath = join(ctx.target, "AGENTS.md");
	// A user's project context that references the marker string mid-line.
	writeFileSync(
		agentsPath,
		`# My Project\n\nDo not touch the <!-- ai-setup >>> block.\n\n${readFileSync(agentsPath, "utf8")}`,
	);
	install({ target: ctx.target, stack: "laravel", commitHelper: false });
	const after = readFileSync(agentsPath, "utf8");
	expect(after).toContain("# My Project");
	expect(after).toContain("Do not touch the <!-- ai-setup >>> block.");
	// user's mention + the one real block marker
	expect(after.match(/ai-setup >>>/g)?.length).toBe(2);
});

test("existing CLAUDE.md preserved + block appended once; settings.json merged (existing wins)", () => {
	writeFileSync(join(ctx.target, "CLAUDE.md"), "# Mine\n\nkeep me\n");
	mkdirSync(join(ctx.target, ".claude"), { recursive: true });
	writeFileSync(
		join(ctx.target, ".claude/settings.json"),
		JSON.stringify(
			{ theme: "light", enabledPlugins: { "mine@x": true } },
			null,
			2,
		),
	);

	install({ target: ctx.target, stack: "laravel" });

	const claude = readFileSync(join(ctx.target, "CLAUDE.md"), "utf8");
	expect(claude).toContain("keep me");
	expect(claude.match(/ai-setup >>>/g)?.length).toBe(1);

	const settings = JSON.parse(
		readFileSync(join(ctx.target, ".claude/settings.json"), "utf8"),
	);
	expect(settings.theme).toBe("light"); // existing scalar kept
	expect(settings.enabledPlugins["mine@x"]).toBe(true); // existing kept
	expect(settings.permissions.allow).toContain("Read"); // template permissions merged in
});

test("existing .ai-setup/precommit is untouched; a *.ai-setup-new is left beside it", () => {
	mkdirSync(join(ctx.target, ".ai-setup"), { recursive: true });
	writeFileSync(
		join(ctx.target, ".ai-setup/precommit"),
		"#!/bin/sh\necho mine\n",
	);
	install({ target: ctx.target, stack: "laravel" });
	expect(
		readFileSync(join(ctx.target, ".ai-setup/precommit"), "utf8"),
	).toContain("echo mine");
	expect(existsSync(join(ctx.target, ".ai-setup/precommit.ai-setup-new"))).toBe(
		true,
	);
});

test("gitignore keeps existing lines and adds the ai-setup block", () => {
	writeFileSync(join(ctx.target, ".gitignore"), "node_modules\n.env\n");
	install({ target: ctx.target, stack: "laravel" });
	const gi = readFileSync(join(ctx.target, ".gitignore"), "utf8");
	expect(gi).toContain("node_modules");
	expect(gi.match(/# ai-setup >>>/g)?.length).toBe(1);
});

test("commit helper installs commit.sh and sources it from ~/.zshrc under zsh", () => {
	install({ target: ctx.target, stack: "laravel" });
	expect(existsSync(join(ctx.home, ".config/ai-setup/commit.sh"))).toBe(true);
	expect(readFileSync(join(ctx.home, ".zshrc"), "utf8")).toContain(
		"# ai-setup: commit helper",
	);
});

test("commit helper autodetects bash and sources from ~/.bashrc", () => {
	process.env.SHELL = "/bin/bash";
	install({ target: ctx.target, stack: "laravel" });
	expect(readFileSync(join(ctx.home, ".bashrc"), "utf8")).toContain(
		"# ai-setup: commit helper",
	);
});

test("--project-only skips the commit helper", () => {
	const report = install({
		target: ctx.target,
		stack: "laravel",
		commitHelper: false,
	});
	expect(report.commitHelper).toContain("skipped");
	expect(existsSync(join(ctx.home, ".zshrc"))).toBe(false);
	expect(existsSync(join(ctx.home, ".bashrc"))).toBe(false);
});

test("dry run writes nothing", () => {
	const report = install({
		target: ctx.target,
		stack: "laravel",
		dryRun: true,
	});
	expect(report.files.every((f) => f.outcome === "would-write")).toBe(true);
	expect(existsSync(join(ctx.target, "CLAUDE.md"))).toBe(false);
	expect(existsSync(join(ctx.home, ".zshrc"))).toBe(false);
});

test("both stacks are available", () => {
	expect(listStacks()).toEqual(["bun-cli", "laravel"]);
});

test("merge strategy is chosen by file type, so new stacks' configs merge (not copied)", () => {
	expect(strategyFor("CLAUDE.md")).toBe("claude-md");
	expect(strategyFor(".gitignore")).toBe("gitignore");
	expect(strategyFor(".claude/settings.json")).toBe("json");
	expect(strategyFor("appsettings.json")).toBe("json"); // future .NET — merged, not copied
	expect(strategyFor("global.json")).toBe("json");
	expect(strategyFor(".conductor/settings.toml")).toBe("toml");
	expect(strategyFor("pyproject.toml")).toBe("toml");
	expect(strategyFor(".ai-setup/precommit")).toBe("copy");
	expect(strategyFor("CLAUDE.local.md.example")).toBe("copy");
});

test("stack metadata drives the picker label/description; unknown falls back to the name", () => {
	expect(stackMeta("laravel").label).toBe("Laravel");
	expect(stackMeta("bun-cli").label).toBe("Bun CLI");
	const unknown = stackMeta("nope");
	expect(unknown.label).toBe("nope");
	expect(unknown.description).toBe("");
});
