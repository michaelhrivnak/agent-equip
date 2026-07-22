#!/usr/bin/env bun
// Regenerates the "Supported stacks" list in README.md from the stack templates, so the doc never
// drifts from what `agent-equip list` actually offers. Single source of truth: each stack's
// templates/<stack>/stack.json (label + description). Run via `bun run stacks`; a drift test keeps
// the committed README honest.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT } from "../src/paths.ts";
import { listStacks, stackMeta } from "../src/templates.ts";

const START = "<!-- stacks:start";
const END = "<!-- stacks:end -->";

/** The markdown bullet list of supported stacks, in `agent-equip list` order. */
export function renderStacks(): string {
	return listStacks()
		.map((s) => {
			const meta = stackMeta(s);
			return `- **${meta.label}** — ${meta.description} (\`--stack ${s}\`)`;
		})
		.join("\n");
}

/** Replace the content between the stacks markers in README text. Throws if markers are missing. */
export function updateReadme(readme: string): string {
	const lines = readme.split("\n");
	const startIdx = lines.findIndex((l) => l.trimStart().startsWith(START));
	const endIdx = lines.findIndex((l) => l.trimStart().startsWith(END));
	if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
		throw new Error("stacks:start / stacks:end markers not found in README.md");
	}
	return [
		...lines.slice(0, startIdx + 1),
		renderStacks(),
		...lines.slice(endIdx),
	].join("\n");
}

const README = join(REPO_ROOT, "README.md");

if (import.meta.main) {
	const updated = updateReadme(readFileSync(README, "utf8"));
	writeFileSync(README, updated);
	console.log(`updated Supported stacks block → README.md`);
}
