import { expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import pkg from "../../package.json" with { type: "json" };
import { install, strategyFor } from "../../src/install.ts";
import { ensureBlock } from "../../src/merge.ts";
import { assembleAgents, listStacks, stackMeta } from "../../src/templates.ts";
import { useSandbox, walk } from "../helpers.ts";

const ctx = useSandbox();

test("fresh install seeds the common layer + assembles AGENTS.md", () => {
	install({ target: ctx.target, stack: "laravel" });
	expect(existsSync(join(ctx.target, "AGENTS.md"))).toBe(true);
	expect(existsSync(join(ctx.target, "CLAUDE.md"))).toBe(true);
	expect(existsSync(join(ctx.target, ".conductor/settings.toml"))).toBe(true);
	expect(readFileSync(join(ctx.target, ".gitignore"), "utf8")).toContain(
		"# agent-equip >>>",
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
	expect(existsSync(join(ctx.target, ".agent-equip/onboard.md"))).toBe(true);
	expect(existsSync(join(ctx.target, ".claude/commands/onboard.md"))).toBe(
		true,
	);
});

test("ships the tailoring skills as neutral bodies + Claude copies", () => {
	install({ target: ctx.target, stack: "laravel", commitHelper: false });
	// Agnostic canonical bodies — always written.
	expect(
		existsSync(join(ctx.target, ".agent-equip/skills/tune-precommit.md")),
	).toBe(true);
	expect(
		existsSync(join(ctx.target, ".agent-equip/skills/tune-conductor.md")),
	).toBe(true);
	// Claude native copies — default agents include Claude.
	expect(
		existsSync(join(ctx.target, ".claude/skills/tune-precommit/SKILL.md")),
	).toBe(true);
	expect(
		existsSync(join(ctx.target, ".claude/skills/tune-conductor/SKILL.md")),
	).toBe(true);
});

test("ships the new test-driven-development skill", () => {
	install({ target: ctx.target, stack: "laravel", commitHelper: false });
	expect(
		existsSync(
			join(ctx.target, ".claude/skills/test-driven-development/SKILL.md"),
		),
	).toBe(true);
});

test("ships the subagent-dispatch skill", () => {
	install({ target: ctx.target, stack: "laravel", commitHelper: false });
	expect(
		existsSync(join(ctx.target, ".agent-equip/skills/subagent-dispatch.md")),
	).toBe(true);
	expect(
		existsSync(join(ctx.target, ".claude/skills/subagent-dispatch/SKILL.md")),
	).toBe(true);
});

test("AGENTS.md carries the skills index pointing at .agent-equip/skills", () => {
	install({ target: ctx.target, stack: "laravel", commitHelper: false });
	const agents = readFileSync(join(ctx.target, "AGENTS.md"), "utf8");
	expect(agents).toContain("# Skills");
	expect(agents).toContain("`.agent-equip/skills/test-driven-development.md`");
});

test("agent selection gates the Claude adapter; the neutral body ships regardless", () => {
	install({
		target: ctx.target,
		stack: "laravel",
		commitHelper: false,
		agents: ["codex"],
	});
	expect(
		existsSync(
			join(ctx.target, ".agent-equip/skills/test-driven-development.md"),
		),
	).toBe(true);
	expect(
		existsSync(
			join(ctx.target, ".claude/skills/test-driven-development/SKILL.md"),
		),
	).toBe(false);
});

test("ships the /agent-equip orchestrator (setup prompt + command)", () => {
	install({ target: ctx.target, stack: "laravel", commitHelper: false });
	expect(existsSync(join(ctx.target, ".agent-equip/setup.md"))).toBe(true);
	expect(existsSync(join(ctx.target, ".claude/commands/agent-equip.md"))).toBe(
		true,
	);
});

test("manifest records the install header (version, stack, agents) and tracks settings.json", () => {
	install({ target: ctx.target, stack: "laravel", commitHelper: false });
	const m = JSON.parse(
		readFileSync(join(ctx.target, ".agent-equip/manifest.json"), "utf8"),
	);
	expect(m.version).toBe(pkg.version);
	expect(m.stack).toBe("laravel");
	expect(m.agents).toEqual(["claude", "codex"]);
	expect(m.files[".claude/settings.json"]).toBeDefined(); // JSON now manifest-tracked
});

test("AGENTS.md marker carries the version stamp", () => {
	install({ target: ctx.target, stack: "laravel", commitHelper: false });
	expect(readFileSync(join(ctx.target, "AGENTS.md"), "utf8")).toContain(
		`<!-- agent-equip >>> v${pkg.version}`,
	);
});

test("a version bump refreshes the AGENTS block in place — no duplicate marker", () => {
	const dst = join(ctx.target, "AGENTS.md");
	const markers = ["<!-- agent-equip >>>", "<!-- agent-equip <<< -->"] as const;
	ensureBlock(dst, assembleAgents("laravel", "0.0.1"), ...markers);
	ensureBlock(dst, assembleAgents("laravel", "0.0.2"), ...markers);
	const out = readFileSync(dst, "utf8");
	expect(out.match(/agent-equip >>>/g)?.length).toBe(1); // single block
	expect(out).toContain("v0.0.2");
	expect(out).not.toContain("v0.0.1");
});

test("re-run is idempotent: one block, no *.agent-equip-new", () => {
	install({ target: ctx.target, stack: "laravel" });
	install({ target: ctx.target, stack: "laravel" });
	const claude = readFileSync(join(ctx.target, "CLAUDE.md"), "utf8");
	expect(claude.match(/agent-equip >>>/g)?.length).toBe(1);
	expect(
		walk(ctx.target).filter((f) => f.endsWith(".agent-equip-new")),
	).toHaveLength(0);
});

test("content above the block is preserved on re-install, even if it mentions the marker", () => {
	install({ target: ctx.target, stack: "laravel", commitHelper: false });
	const agentsPath = join(ctx.target, "AGENTS.md");
	// A user's project context that references the marker string mid-line.
	writeFileSync(
		agentsPath,
		`# My Project\n\nDo not touch the <!-- agent-equip >>> block.\n\n${readFileSync(agentsPath, "utf8")}`,
	);
	install({ target: ctx.target, stack: "laravel", commitHelper: false });
	const after = readFileSync(agentsPath, "utf8");
	expect(after).toContain("# My Project");
	expect(after).toContain("Do not touch the <!-- agent-equip >>> block.");
	// user's mention + the one real block marker
	expect(after.match(/agent-equip >>>/g)?.length).toBe(2);
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
	expect(claude.match(/agent-equip >>>/g)?.length).toBe(1);

	const settings = JSON.parse(
		readFileSync(join(ctx.target, ".claude/settings.json"), "utf8"),
	);
	expect(settings.theme).toBe("light"); // existing scalar kept
	expect(settings.enabledPlugins["mine@x"]).toBe(true); // existing kept
	expect(settings.permissions.allow).toContain("Read"); // template permissions merged in
});

test("existing .agent-equip/precommit is untouched; a *.agent-equip-new is left beside it", () => {
	mkdirSync(join(ctx.target, ".agent-equip"), { recursive: true });
	writeFileSync(
		join(ctx.target, ".agent-equip/precommit"),
		"#!/bin/sh\necho mine\n",
	);
	install({ target: ctx.target, stack: "laravel" });
	expect(
		readFileSync(join(ctx.target, ".agent-equip/precommit"), "utf8"),
	).toContain("echo mine");
	expect(
		existsSync(join(ctx.target, ".agent-equip/precommit.agent-equip-new")),
	).toBe(true);
});

test("gitignore keeps existing lines and adds the agent-equip block", () => {
	writeFileSync(join(ctx.target, ".gitignore"), "node_modules\n.env\n");
	install({ target: ctx.target, stack: "laravel" });
	const gi = readFileSync(join(ctx.target, ".gitignore"), "utf8");
	expect(gi).toContain("node_modules");
	expect(gi.match(/# agent-equip >>>/g)?.length).toBe(1);
});

test("commit helper installs commit.sh and sources it from ~/.zshrc under zsh", () => {
	install({ target: ctx.target, stack: "laravel" });
	expect(existsSync(join(ctx.home, ".config/agent-equip/commit.sh"))).toBe(
		true,
	);
	expect(readFileSync(join(ctx.home, ".zshrc"), "utf8")).toContain(
		"# agent-equip: commit helper",
	);
});

test("commit helper autodetects bash and sources from ~/.bashrc", () => {
	process.env.SHELL = "/bin/bash";
	install({ target: ctx.target, stack: "laravel" });
	expect(readFileSync(join(ctx.home, ".bashrc"), "utf8")).toContain(
		"# agent-equip: commit helper",
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

test("dry run reports real outcomes but writes nothing", () => {
	const report = install({
		target: ctx.target,
		stack: "laravel",
		dryRun: true,
	});
	// Fresh target → every file would be "created" (a real diff, not a blanket "would-write").
	expect(report.files.every((f) => f.outcome === "created")).toBe(true);
	expect(existsSync(join(ctx.target, "AGENTS.md"))).toBe(false);
	expect(existsSync(join(ctx.target, "CLAUDE.md"))).toBe(false);
	expect(existsSync(join(ctx.home, ".zshrc"))).toBe(false);
});

test("all stacks are available", () => {
	expect(listStacks()).toEqual(["bun-cli", "dotnet", "laravel"]);
});

test("merge strategy is chosen by file type, so new stacks' configs merge (not copied)", () => {
	expect(strategyFor("CLAUDE.md")).toBe("claude-md");
	expect(strategyFor(".gitignore")).toBe("gitignore");
	expect(strategyFor(".claude/settings.json")).toBe("json");
	expect(strategyFor("appsettings.json")).toBe("json"); // future .NET — merged, not copied
	expect(strategyFor("global.json")).toBe("json");
	expect(strategyFor(".conductor/settings.toml")).toBe("toml");
	expect(strategyFor("pyproject.toml")).toBe("toml");
	expect(strategyFor("Directory.Build.props")).toBe("msbuild"); // .NET — merged, not copied
	expect(strategyFor("App.csproj")).toBe("msbuild");
	expect(strategyFor("Directory.Build.targets")).toBe("msbuild");
	expect(strategyFor(".agent-equip/precommit")).toBe("copy");
	expect(strategyFor("CLAUDE.local.md.example")).toBe("copy");
});

test("stack metadata drives the picker label/description; unknown falls back to the name", () => {
	expect(stackMeta("laravel").label).toBe("Laravel");
	expect(stackMeta("bun-cli").label).toBe("Bun CLI");
	const unknown = stackMeta("nope");
	expect(unknown.label).toBe("nope");
	expect(unknown.description).toBe("");
});
