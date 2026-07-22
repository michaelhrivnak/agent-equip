// Ownership manifest: `.agent-equip/manifest.json` records the sha256 of each whole-file managed
// file AS AGENT-EQUIP LAST WROTE IT. A file whose current bytes still match its manifest hash is
// "pristine" (untouched by the team) and tracks upstream; once edited it diverges and agent-equip
// leaves it alone. A header records the install params (`version`, `stack`, `agents`) so `update`
// can re-run the same compose+merge non-interactively. Committed with the repo; deterministic key
// order for byte-stable re-runs.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const MANIFEST_REL = ".agent-equip/manifest.json";

/** Per-file record: relative path -> sha256 hex of the bytes agent-equip last wrote (or "forked"). */
export type FileHashes = Record<string, string>;

/** The manifest document: an install-params header plus the per-file hashes. */
export interface Manifest {
	version?: string;
	stack?: string;
	agents?: string[];
	files: FileHashes;
}

export function hash(content: Buffer | string): string {
	return createHash("sha256").update(content).digest("hex");
}

/** Absolute path of a target's manifest file. */
export function manifestPath(target: string): string {
	return join(target, MANIFEST_REL);
}

/**
 * Read the manifest, migrating the pre-v2 flat form (`{ "<rel>": "<hash>" }`, no header) into the
 * `{ files }` shape so old installs upgrade transparently. Absent/malformed → an empty document.
 */
export function loadManifest(target: string): Manifest {
	const file = manifestPath(target);
	if (!existsSync(file)) return { files: {} };
	try {
		const parsed = JSON.parse(readFileSync(file, "utf8")) as unknown;
		if (parsed && typeof parsed === "object" && "files" in parsed)
			return parsed as Manifest;
		// Pre-v2 flat manifest: the whole object is the file map.
		return { files: (parsed ?? {}) as FileHashes };
	} catch {
		return { files: {} };
	}
}

export function saveManifest(target: string, manifest: Manifest): void {
	const files: FileHashes = {};
	for (const key of Object.keys(manifest.files).sort())
		files[key] = manifest.files[key];
	const ordered: Manifest = {
		version: manifest.version,
		stack: manifest.stack,
		agents: manifest.agents,
		files,
	};
	const file = manifestPath(target);
	mkdirSync(dirname(file), { recursive: true });
	writeFileSync(file, `${JSON.stringify(ordered, null, 2)}\n`);
}

/**
 * Re-hash `rels` from their current on-disk bytes and store them in the manifest. Used after the
 * agent-tools picker writes `.claude/settings.json` / `.mcp.json` — those files change AFTER the
 * install saved the manifest, so their recorded hash must be re-stamped to the post-picker bytes.
 * Absent files are skipped. No-op paths still round-trip safely (idempotent).
 */
export function restampFiles(target: string, rels: string[]): void {
	const manifest = loadManifest(target);
	let changed = false;
	for (const rel of rels) {
		const file = join(target, rel);
		if (!existsSync(file)) continue;
		manifest.files[rel] = hash(readFileSync(file));
		changed = true;
	}
	if (changed) saveManifest(target, manifest);
}
