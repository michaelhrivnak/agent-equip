#!/usr/bin/env bun
import { existsSync } from "node:fs";
import { resolve } from "node:path";
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
import { install } from "../src/install.ts";
import { installPackage, missingPackages } from "../src/packages.ts";
import { REPO_ROOT } from "../src/paths.ts";
import { listStacks, stackExists, stackMeta } from "../src/templates.ts";

interface InitOptions {
	stack?: string;
	dryRun: boolean;
	yes: boolean;
	projectOnly: boolean;
	force: boolean;
	packages: boolean;
}

const program = new Command();
program
	.name("ai-setup")
	.description("Seed AI-development tooling into a project, per stack")
	.version("0.1.0");

program
	.command("init", { isDefault: true })
	.description("install AI-dev tooling into a target project")
	.argument("[target]", "target project directory", ".")
	.option("-s, --stack <name>", "stack template to install")
	.option("--dry-run", "show what would change without writing", false)
	.option("-y, --yes", "don't prompt (requires --stack)", false)
	.option(
		"--project-only",
		"seed project files only; skip the user-level commit helper",
		false,
	)
	.option(
		"--force",
		"allow installing into the ai-setup repo itself (dogfooding)",
		false,
	)
	.option("--no-packages", "skip the curated per-stack package picker")
	.action(async (targetArg: string, opts: InitOptions) => {
		const target = resolve(targetArg);
		if (!existsSync(target)) fail(`target '${targetArg}' does not exist`);
		if (target === REPO_ROOT && !opts.force) {
			fail(
				"refusing to install ai-setup into itself (pass --force to dogfood)",
			);
		}

		let stack = opts.stack;
		if (!stack) {
			if (opts.yes) fail("--yes requires --stack");
			intro("ai-setup");
			const choice = await select({
				message: "Which stack?",
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

		const report = install({
			target,
			stack,
			dryRun: opts.dryRun,
			commitHelper: !opts.projectOnly,
		});
		for (const f of report.files)
			console.log(`  ${f.outcome.padEnd(12)} ${f.path}`);
		console.log(`  ${report.commitHelper}`);

		// Curated packages run last, after the file/tooling installs.
		if (opts.packages !== false) await handlePackages(target, stack, opts);

		if (!opts.dryRun) {
			note(
				"Open this project in your agent and run  /ai-setup  to finish setup —\n" +
					"it onboards the repo and tailors the pre-commit + Conductor files.\n" +
					"(Claude Code: /ai-setup  ·  other agents: follow .ai-setup/setup.md)",
				"Next step",
			);
		}

		outro(
			opts.dryRun
				? "Dry run — nothing written."
				: `Installed '${stack}' into ${target}`,
		);
	});

program
	.command("list")
	.description("list available stacks")
	.action(() => console.log(listStacks().join("\n")));

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
			`  ${missing.length} recommended package(s) available — run 'ai-setup init' interactively to install.`,
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

function fail(msg: string): never {
	console.error(`ai-setup: ${msg}`);
	process.exit(1);
}

await program.parseAsync();
