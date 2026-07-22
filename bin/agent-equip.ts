#!/usr/bin/env node
import { existsSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import {
	cancel,
	confirm,
	intro,
	isCancel,
	log,
	multiselect,
	note,
	outro,
	select,
} from "@clack/prompts";
import { Command } from "commander";
import pkg from "../package.json" with { type: "json" };
import { applyAgentTools, missingAgentTools } from "../src/agentTools.ts";
import {
	type Agent,
	type InstallReport,
	install,
	KNOWN_AGENTS,
} from "../src/install.ts";
import { loadManifest, manifestPath, restampFiles } from "../src/manifest.ts";
import { installPackage, missingPackages } from "../src/packages.ts";
import { REPO_ROOT } from "../src/paths.ts";
import { listStacks, stackExists, stackMeta } from "../src/templates.ts";

interface InitOptions {
	stack?: string;
	agents?: string;
	dryRun: boolean;
	yes: boolean;
	projectOnly: boolean;
	force: boolean;
	packages: boolean;
	agentTools: boolean;
}

const AGENT_OPTIONS = [
	{ value: "claude", label: "Claude Code", hint: ".claude/skills + commands" },
	{ value: "codex", label: "Codex CLI", hint: "reads AGENTS.md" },
];

const program = new Command();
program
	.name("agent-equip")
	.description("Seed AI-development tooling into a project, per stack")
	.version(pkg.version);

program
	.command("init", { isDefault: true })
	.description("install AI-dev tooling into a target project")
	.argument("[target]", "target project directory", ".")
	.option("-s, --stack <name>", "stack template to install")
	.option(
		"--agents <list>",
		"agents to target, comma-separated (default: all; known: claude,codex)",
	)
	.option("--dry-run", "show what would change without writing", false)
	.option("-y, --yes", "don't prompt (requires --stack)", false)
	.option(
		"--project-only",
		"seed project files only; skip the user-level commit helper",
		false,
	)
	.option(
		"--force",
		"allow installing into the agent-equip repo itself (dogfooding)",
		false,
	)
	.option("--no-packages", "skip the curated per-stack package picker")
	.option("--no-agent-tools", "skip the agent-tools picker (plugins/MCP/hooks)")
	.action(async (targetArg: string, opts: InitOptions) => {
		const target = resolve(targetArg);
		if (!existsSync(target)) fail(`target '${targetArg}' does not exist`);
		if (!statSync(target).isDirectory())
			fail(`target '${targetArg}' is not a directory`);
		if (!existsSync(join(target, ".git")))
			console.error(`agent-equip: note: ${target} is not a git repository`);
		if (target === REPO_ROOT && !opts.force) {
			fail(
				"refusing to install agent-equip into itself (pass --force to dogfood)",
			);
		}

		if (!opts.yes) {
			intro("agent-equip");
			note(
				"Seeds cross-agent instructions (AGENTS.md) plus on-demand skills and\n" +
					"adapters for the agents you pick, a `commit` helper, and Conductor\n" +
					"scaffolding — tailored to your stack and merged safely into files you\n" +
					"already have.\n\n" +
					"When it finishes, run /agent-equip in your agent to onboard the project.",
				"What this does",
			);
		}

		let stack = opts.stack;
		if (!stack) {
			if (opts.yes) fail("--yes requires --stack");
			if (!process.stdout.isTTY)
				fail("non-interactive: pass --stack (and optionally --yes)");
			const choice = await select({
				message: "Which stack is this project?",
				options: listStacks().map((s) => {
					const meta = stackMeta(s);
					return { value: s, label: meta.label, hint: meta.description };
				}),
			});
			if (isCancel(choice)) {
				cancel("Cancelled.");
				process.exit(1);
			}
			stack = choice;
		}
		if (!stackExists(stack))
			fail(`unknown stack '${stack}'. Available: ${listStacks().join(", ")}`);

		const agents = await resolveAgents(opts);

		const report = install({
			target,
			stack,
			agents,
			dryRun: opts.dryRun,
			commitHelper: !opts.projectOnly,
		});
		printReport(report);

		// Curated packages run last, after the file/tooling installs.
		if (opts.packages !== false) await handlePackages(target, stack, opts);
		if (opts.agentTools !== false) await handleAgentTools(target, stack, opts);

		// The agent-tools picker writes .claude/settings.json / .mcp.json AFTER install saved the
		// manifest — re-stamp their hashes to the post-picker bytes so only later human edits diverge.
		if (!opts.dryRun)
			restampFiles(target, [".claude/settings.json", ".mcp.json"]);

		if (!opts.dryRun) {
			note(
				"Open this project in your agent and run  /agent-equip  to finish setup —\n" +
					"it onboards the repo and tailors the pre-commit + Conductor files.\n" +
					"(Claude Code: /agent-equip  ·  other agents: follow .agent-equip/setup.md)",
				"Next step",
			);
		}

		outro(
			opts.dryRun
				? "Dry run — nothing written."
				: `Installed '${stack}' into ${target}`,
		);
	});

interface UpdateOptions {
	stack?: string;
	dryRun: boolean;
	projectOnly: boolean;
}

program
	.command("update")
	.description(
		"refresh agent-equip's managed files to the current templates (reads the installed stack/agents)",
	)
	.argument("[target]", "target project directory", ".")
	.option(
		"-s, --stack <name>",
		"override the stack (needed for a pre-versioned install)",
	)
	.option("--dry-run", "show what would change without writing", false)
	.option(
		"--project-only",
		"seed project files only; skip the user-level commit helper",
		false,
	)
	.action((targetArg: string, opts: UpdateOptions) => {
		const target = resolve(targetArg);
		if (!existsSync(target)) fail(`target '${targetArg}' does not exist`);
		if (!statSync(target).isDirectory())
			fail(`target '${targetArg}' is not a directory`);
		if (!existsSync(manifestPath(target)))
			fail("not installed here — run 'agent-equip init' first");

		const manifest = loadManifest(target);
		const stack = opts.stack ?? manifest.stack;
		if (!stack)
			fail(
				"manifest has no stack (pre-versioned install) — re-run 'agent-equip init' or pass --stack",
			);
		if (!stackExists(stack))
			fail(`unknown stack '${stack}'. Available: ${listStacks().join(", ")}`);
		const agents = manifest.agents ?? [...KNOWN_AGENTS];
		const from = manifest.version ? `v${manifest.version}` : "unknown";
		console.error(`agent-equip: updating with agents: ${agents.join(", ")}`);

		const report = install({
			target,
			stack,
			agents,
			dryRun: opts.dryRun,
			commitHelper: !opts.projectOnly,
		});

		const changed = report.files.filter((f) => f.outcome !== "up-to-date");
		if (from === `v${report.version}` && changed.length === 0)
			console.log(`  already up to date at v${report.version}`);
		else console.log(`  ${from} → v${report.version}`);
		printReport(report);

		outro(
			opts.dryRun
				? "Dry run — nothing written."
				: `Updated '${stack}' in ${target}`,
		);
	});

program
	.command("list")
	.description("list available stacks")
	.action(() => console.log(listStacks().join("\n")));

/** Print the per-file outcomes + commit-helper line, gathering forked files under a note. */
function printReport(report: InstallReport): void {
	for (const f of report.files) {
		const hint =
			f.outcome === "new-written" ? `  → review ${f.path}.agent-equip-new` : "";
		console.log(`  ${f.outcome.padEnd(12)} ${f.path}${hint}`);
	}
	console.log(`  ${report.commitHelper}`);
	const forked = report.files.filter((f) => f.outcome === "forked");
	if (forked.length)
		console.log(
			`  kept your local edits (not overwritten): ${forked.map((f) => f.path).join(", ")}`,
		);
}

/** Offer to install the stack's curated packages that are missing from the target. */
async function handlePackages(
	target: string,
	stack: string,
	opts: InitOptions,
): Promise<void> {
	const missing = missingPackages(target, stack);
	if (missing.length === 0) return;

	if (opts.dryRun) {
		for (const p of missing)
			console.log(`  would offer  ${p.name} — ${p.install}`);
		return;
	}
	if (opts.yes || !process.stdout.isTTY) {
		console.log(
			`  ${missing.length} recommended package(s) available — run 'agent-equip init' interactively to install.`,
		);
		return;
	}

	const selected = await multiselect({
		message:
			"Recommended packages for this stack (space to toggle, enter to confirm):",
		required: false,
		options: missing.map((p) => ({
			value: p.id,
			label: p.name,
			hint: p.description,
		})),
	});
	if (isCancel(selected) || selected.length === 0) return;

	const chosen = missing.filter((p) => selected.includes(p.id));
	const proceed = await confirm({
		message: `Run these commands in ${target}?\n${chosen.map((p) => `    ${p.install}`).join("\n")}`,
	});
	if (isCancel(proceed) || !proceed) return;

	for (const p of chosen) {
		log.step(`${p.name}: ${p.install}`);
		if (!installPackage(target, p))
			log.warn(`${p.name} install failed (non-zero exit)`);
	}
}

/** Offer agent tools (plugins / MCP servers / hooks) not yet configured in the target. */
async function handleAgentTools(
	target: string,
	stack: string,
	opts: InitOptions,
): Promise<void> {
	const missing = missingAgentTools(target, stack);
	if (missing.length === 0) return;

	if (opts.dryRun) {
		for (const t of missing)
			console.log(`  would offer  ${t.name} (${t.type}) — ${t.description}`);
		return;
	}
	// Non-interactive (--yes or piped): do NOT silently write third-party plugins/marketplaces
	// into the target's committed config — just note they're available (matches the package picker).
	if (opts.yes || !process.stdout.isTTY) {
		console.log(
			`  ${missing.length} agent tool(s) available — run 'agent-equip init' interactively to enable them.`,
		);
		return;
	}

	const selected = await multiselect({
		message: "Agent tools to enable (space to toggle, enter to confirm):",
		required: false,
		initialValues: missing.filter((t) => t.recommended).map((t) => t.id),
		options: missing.map((t) => ({
			value: t.id,
			label: t.name,
			hint: t.description,
		})),
	});
	if (isCancel(selected) || selected.length === 0) return;

	const chosen = missing.filter((t) => selected.includes(t.id));
	applyAgentTools(target, chosen);
	for (const t of chosen) log.step(`enabled ${t.name}`);
}

/** Resolve which agents to target: explicit --agents, else prompt, else default to all. */
async function resolveAgents(opts: InitOptions): Promise<Agent[]> {
	let chosen: string[];
	if (opts.agents !== undefined) {
		chosen = opts.agents
			.split(",")
			.map((a) => a.trim())
			.filter(Boolean);
	} else if (opts.yes || !process.stdout.isTTY) {
		chosen = [...KNOWN_AGENTS];
	} else {
		const selected = await multiselect({
			message: "Which agents do you use? (space to toggle, enter to confirm)",
			required: true,
			initialValues: [...KNOWN_AGENTS],
			options: AGENT_OPTIONS,
		});
		if (isCancel(selected)) {
			cancel("Cancelled.");
			process.exit(1);
		}
		chosen = selected;
	}

	const unknown = chosen.filter(
		(a) => !(KNOWN_AGENTS as readonly string[]).includes(a),
	);
	if (unknown.length)
		fail(
			`unknown agent(s): ${unknown.join(", ")}. Known: ${KNOWN_AGENTS.join(", ")}`,
		);
	return chosen as Agent[];
}

function fail(msg: string): never {
	console.error(`agent-equip: ${msg}`);
	process.exit(1);
}

await program.parseAsync();
