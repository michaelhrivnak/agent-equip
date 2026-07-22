import { readFileSync } from "node:fs";
import { join } from "node:path";
import pkg from "../package.json" with { type: "json" };
import { installCommitHelper } from "./commitHelper.ts";
import { type FileHashes, loadManifest, saveManifest } from "./manifest.ts";
import {
	ensureBlock,
	manifestedCopy,
	mergeJson,
	mergeMsbuild,
	type Outcome,
} from "./merge.ts";
import { assembleAgents, composeFiles, composeSkills } from "./templates.ts";

/** Agents whose native adapters agent-equip can emit. `codex` needs no per-agent files — it
 * reads the AGENTS.md skills index — so only `claude` gates a native skill directory today. */
export const KNOWN_AGENTS = ["claude", "codex"] as const;
export type Agent = (typeof KNOWN_AGENTS)[number];

export interface InstallOptions {
	target: string;
	stack: string;
	dryRun?: boolean;
	/** Install the user-level commit helper into the shell rc (default true). */
	commitHelper?: boolean;
	/** Agents to target; gates per-agent native adapters (default: all known agents). */
	agents?: readonly string[];
}

export interface FileAction {
	path: string;
	outcome: Outcome;
}

export interface InstallReport {
	target: string;
	stack: string;
	/** CLI version stamped into the manifest header + AGENTS.md marker on this run. */
	version: string;
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
	prev: FileHashes,
	next: FileHashes,
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
		case "json": {
			const result = mergeJson(src, dst, prev[rel], dryRun);
			if (result.hash !== undefined) next[rel] = result.hash;
			return result.outcome;
		}
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
	const {
		target,
		stack,
		dryRun = false,
		commitHelper = true,
		agents = KNOWN_AGENTS,
	} = opts;
	const files: FileAction[] = [];
	const prev = loadManifest(target).files;
	const next: FileHashes = {};

	const entries = [...composeFiles(stack).entries()].sort((a, b) =>
		a[0].localeCompare(b[0]),
	);
	for (const [rel, src] of entries) {
		if (METADATA.has(rel)) continue;
		// rules/*.md are assembled into AGENTS.md, not seeded as individual files.
		if (rel.startsWith("rules/")) continue;
		// skills/ are emitted below (neutral body + per-agent copies), not copied verbatim.
		if (rel.startsWith("skills/")) continue;
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

	// Skills: one canonical body per skill, always written to the agnostic `.agent-equip/skills/`
	// (referenced by the AGENTS.md skills index). Agents with a native skill format get a copy
	// too — currently just Claude's `.claude/skills/<name>/SKILL.md`. Same markdown, both paths.
	const emit = (targetRel: string, src: string): void => {
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
	};
	for (const skill of composeSkills(stack)) {
		emit(`.agent-equip/skills/${skill.name}.md`, skill.bodyPath);
		if (agents.includes("claude"))
			emit(`.claude/skills/${skill.name}/SKILL.md`, skill.bodyPath);
	}

	// AGENTS.md — canonical, cross-agent instructions assembled from the rules fragments.
	files.push({
		path: "AGENTS.md",
		outcome: ensureBlock(
			join(target, "AGENTS.md"),
			assembleAgents(stack, pkg.version),
			"<!-- agent-equip >>>",
			"<!-- agent-equip <<< -->",
			dryRun,
		),
	});

	// Record what agent-equip wrote (plus the install params), so a later run/update can tell
	// pristine files from forked ones and re-run the same compose+merge non-interactively.
	if (!dryRun)
		saveManifest(target, {
			version: pkg.version,
			stack,
			agents: [...agents],
			files: next,
		});

	const commitHelperMsg = commitHelper
		? installCommitHelper(dryRun)
		: "commit helper: skipped (--project-only)";
	return {
		target,
		stack,
		version: pkg.version,
		commitHelper: commitHelperMsg,
		files,
	};
}
