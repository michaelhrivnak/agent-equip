import { readFileSync } from "node:fs";
import { join } from "node:path";
import { installCommitHelper } from "./commitHelper.ts";
import { loadManifest, type Manifest, saveManifest } from "./manifest.ts";
import {
	ensureBlock,
	manifestedCopy,
	mergeJson,
	mergeMsbuild,
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
	outcome: Outcome;
}

export interface InstallReport {
	target: string;
	stack: string;
	commitHelper: string;
	files: FileAction[];
}

// Stack metadata files — read by the installer, never seeded into the target.
const METADATA = new Set(["packages.json", "stack.json", "agent-tools.json"]);

// Source files whose target path differs from their name.
const RENAMES: Record<string, string> = { "gitignore.snippet": ".gitignore" };

export type MergeKind =
	| "claude-md"
	| "gitignore"
	| "json"
	| "toml"
	| "msbuild"
	| "copy";

/**
 * How a file merges into the target, chosen by type rather than a hardcoded path list — so a
 * new stack's structured config (e.g. a .NET `appsettings.json` or a `pyproject.toml`) merges
 * correctly without editing this file. Marked-block files are explicit; the rest route by
 * extension: JSON deep-merges, MSBuild files (`*.csproj`/`*.props`/`*.targets`) merge, TOML and
 * everything else are whole-file/manifest-owned.
 */
export function strategyFor(rel: string): MergeKind {
	if (rel === "CLAUDE.md") return "claude-md";
	if (rel === ".gitignore") return "gitignore";
	if (rel.endsWith(".json")) return "json";
	if (rel.endsWith(".toml")) return "toml";
	if (
		rel.endsWith(".csproj") ||
		rel.endsWith(".props") ||
		rel.endsWith(".targets")
	)
		return "msbuild";
	return "copy";
}

/**
 * Apply one composed file to the target. Marked-block files refresh their block in place; JSON is
 * deep-merged on first encounter; every other whole file (prompts, skills, commands, precommit,
 * TOML, …) is routed through the ownership manifest ("pristine tracks upstream, edited is yours").
 * Records the manifest hash for manifest-managed files into `next`.
 */
function applyStrategy(
	rel: string,
	src: string,
	dst: string,
	dryRun: boolean,
	prev: Manifest,
	next: Manifest,
): Outcome {
	switch (strategyFor(rel)) {
		case "claude-md":
			return ensureBlock(
				dst,
				readFileSync(src, "utf8"),
				"<!-- agent-equip >>>",
				"<!-- agent-equip <<< -->",
				dryRun,
			);
		case "gitignore":
			return ensureBlock(
				dst,
				readFileSync(src, "utf8"),
				"# agent-equip >>>",
				"# agent-equip <<<",
				dryRun,
			);
		case "json":
			return mergeJson(src, dst, dryRun);
		case "msbuild":
			return mergeMsbuild(src, dst, dryRun);
		default: {
			// copy + toml: whole-file, manifest-owned.
			const result = manifestedCopy(src, dst, prev[rel], dryRun);
			if (result.hash !== undefined) next[rel] = result.hash;
			return result.outcome;
		}
	}
}

/** Seed the composed common+stack template into the target project. */
export function install(opts: InstallOptions): InstallReport {
	const { target, stack, dryRun = false, commitHelper = true } = opts;
	const files: FileAction[] = [];
	const prev = loadManifest(target);
	const next: Manifest = {};

	const entries = [...composeFiles(stack).entries()].sort((a, b) =>
		a[0].localeCompare(b[0]),
	);
	for (const [rel, src] of entries) {
		if (METADATA.has(rel)) continue;
		// rules/*.md are assembled into AGENTS.md, not seeded as individual files.
		if (rel.startsWith("rules/")) continue;
		const targetRel = RENAMES[rel] ?? rel;
		files.push({
			path: targetRel,
			outcome: applyStrategy(
				targetRel,
				src,
				join(target, targetRel),
				dryRun,
				prev,
				next,
			),
		});
	}

	// AGENTS.md — canonical, cross-agent instructions assembled from the rules fragments.
	files.push({
		path: "AGENTS.md",
		outcome: ensureBlock(
			join(target, "AGENTS.md"),
			assembleAgents(stack),
			"<!-- agent-equip >>>",
			"<!-- agent-equip <<< -->",
			dryRun,
		),
	});

	// Record what agent-equip wrote, so the next run can tell pristine files from forked ones.
	if (!dryRun) saveManifest(target, next);

	const commitHelperMsg = commitHelper
		? installCommitHelper(dryRun)
		: "commit helper: skipped (--project-only)";
	return { target, stack, commitHelper: commitHelperMsg, files };
}
