import { readFileSync } from "node:fs";
import { join } from "node:path";
import { installCommitHelper } from "./commitHelper.ts";
import {
	copyIfAbsent,
	ensureBlock,
	mergeJson,
	mergeStructured,
	type Outcome,
} from "./merge.ts";
import { assembleAgents, composeFiles } from "./templates.ts";

export interface InstallOptions {
	target: string;
	stack: string;
	dryRun?: boolean;
	/** Install the user-level commit helper into the shell rc (default true). */
	commitHelper?: boolean;
}

export interface FileAction {
	path: string;
	outcome: Outcome | "would-write";
}

export interface InstallReport {
	target: string;
	stack: string;
	commitHelper: string;
	files: FileAction[];
}

// Stack metadata files — read by the installer, never seeded into the target.
const METADATA = new Set(["packages.json", "stack.json"]);

// Relative paths that must be executable in the target.
const EXECUTABLE = new Set([".ai-setup/precommit", ".conductor/setup.sh"]);

// Source files whose target path differs from their name.
const RENAMES: Record<string, string> = { "gitignore.snippet": ".gitignore" };

export type MergeKind = "claude-md" | "gitignore" | "json" | "toml" | "copy";

/**
 * How a file merges into the target, chosen by type rather than a hardcoded path list — so a
 * new stack's structured config (e.g. a .NET `appsettings.json` or a `pyproject.toml`) merges
 * correctly without editing this file. Marked-block files are explicit; the rest route by
 * extension.
 */
export function strategyFor(rel: string): MergeKind {
	if (rel === "CLAUDE.md") return "claude-md";
	if (rel === ".gitignore") return "gitignore";
	if (rel.endsWith(".json")) return "json";
	if (rel.endsWith(".toml")) return "toml";
	return "copy";
}

function applyStrategy(rel: string, src: string, dst: string): Outcome {
	switch (strategyFor(rel)) {
		case "claude-md":
			return ensureBlock(
				dst,
				readFileSync(src, "utf8"),
				"<!-- ai-setup >>>",
				"<!-- ai-setup <<< -->",
			);
		case "gitignore":
			return ensureBlock(
				dst,
				readFileSync(src, "utf8"),
				"# ai-setup >>>",
				"# ai-setup <<<",
			);
		case "json":
			return mergeJson(src, dst);
		case "toml":
			return mergeStructured(src, dst);
		default:
			return copyIfAbsent(src, dst, { executable: EXECUTABLE.has(rel) });
	}
}

/** Seed the composed common+stack template into the target project. */
export function install(opts: InstallOptions): InstallReport {
	const { target, stack, dryRun, commitHelper = true } = opts;
	const files: FileAction[] = [];

	const entries = [...composeFiles(stack).entries()].sort((a, b) =>
		a[0].localeCompare(b[0]),
	);
	for (const [rel, src] of entries) {
		if (METADATA.has(rel)) continue;
		// rules/*.md are assembled into AGENTS.md, not seeded as individual files.
		if (rel.startsWith("rules/")) continue;
		const targetRel = RENAMES[rel] ?? rel;
		if (dryRun) {
			files.push({ path: targetRel, outcome: "would-write" });
			continue;
		}
		files.push({
			path: targetRel,
			outcome: applyStrategy(targetRel, src, join(target, targetRel)),
		});
	}

	// AGENTS.md — canonical, cross-agent instructions assembled from the rules fragments.
	files.push({
		path: "AGENTS.md",
		outcome: dryRun
			? "would-write"
			: ensureBlock(
					join(target, "AGENTS.md"),
					assembleAgents(stack),
					"<!-- ai-setup >>>",
					"<!-- ai-setup <<< -->",
				),
	});

	const commitHelperMsg = commitHelper
		? installCommitHelper(dryRun)
		: "commit helper: skipped (--project-only)";
	return { target, stack, commitHelper: commitHelperMsg, files };
}
