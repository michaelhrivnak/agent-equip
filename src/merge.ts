import {
	chmodSync,
	copyFileSync,
	existsSync,
	mkdirSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import { hash } from "./manifest.ts";

export type Outcome =
	| "created"
	| "updated"
	| "up-to-date"
	| "merged-json"
	| "new-written"
	| "forked";

function ensureDir(file: string): void {
	mkdirSync(dirname(file), { recursive: true });
}

function sameFile(src: string, dst: string): boolean {
	return existsSync(dst) && readFileSync(src).equals(readFileSync(dst));
}

function isExecutable(file: string): boolean {
	return (statSync(file).mode & 0o111) !== 0;
}

/** Remove a stale `${dst}.agent-equip-new` once the target no longer needs reconciling. */
function clearArtifact(dst: string): void {
	rmSync(`${dst}.agent-equip-new`, { force: true });
}

export interface ManifestResult {
	outcome: Outcome;
	/** sha to store in the manifest, or `undefined` when this file must not be tracked. */
	hash?: string;
}

// Sentinel manifest value for a forked file. It can never equal a sha256 (64 hex chars), so the
// pristine check never matches it — a forked file stays on the silent path across re-runs.
export const FORK_SENTINEL = "forked";

/**
 * Whole-file "pristine tracks upstream, edited is yours", using the ownership manifest:
 *  - dst absent                       → seed from template; record its hash.
 *  - dst == template                  → up-to-date; record hash (clear any stale artifact).
 *  - no prior hash + dst exists+differs → a pre-existing/foreign file: never overwrite, drop a
 *                                        `${dst}.agent-equip-new` ONCE, and record the fork sentinel so
 *                                        later runs take the silent forked path (no artifact churn).
 *  - dst hash == prior hash (pristine) → refresh from the new template; record the new hash.
 *  - otherwise (forked/sentinel)      → leave it untouched, silently; keep the prior manifest value.
 * Executability derives from the SOURCE file's mode (so a stack stays pure data).
 */
export function manifestedCopy(
	src: string,
	dst: string,
	prevHash: string | undefined,
	dryRun = false,
): ManifestResult {
	const srcBuf = readFileSync(src);
	const exec = isExecutable(src);
	const seed = (): void => {
		ensureDir(dst);
		writeFileSync(dst, srcBuf);
		if (exec) chmodSync(dst, 0o755);
		clearArtifact(dst);
	};

	if (!existsSync(dst)) {
		if (!dryRun) seed();
		return { outcome: "created", hash: hash(srcBuf) };
	}
	const curBuf = readFileSync(dst);
	if (curBuf.equals(srcBuf)) {
		if (!dryRun) {
			if (exec) chmodSync(dst, 0o755);
			clearArtifact(dst);
		}
		return { outcome: "up-to-date", hash: hash(srcBuf) };
	}
	if (prevHash === undefined) {
		if (!dryRun) {
			ensureDir(`${dst}.agent-equip-new`);
			writeFileSync(`${dst}.agent-equip-new`, srcBuf);
			if (exec) chmodSync(`${dst}.agent-equip-new`, 0o755);
		}
		return { outcome: "new-written", hash: FORK_SENTINEL };
	}
	if (hash(curBuf) === prevHash) {
		if (!dryRun) seed();
		return { outcome: "updated", hash: hash(srcBuf) };
	}
	return { outcome: "forked", hash: prevHash };
}

/**
 * Remove EVERY well-formed start..end block (inclusive) from text, so a file that somehow carries
 * duplicate managed blocks converges to one on re-install. Strips ONLY complete blocks (a start
 * with a later end) — a missing/typo'd marker leaves content intact rather than deleting to EOF.
 * Markers match only at the start of a line (after leading space).
 */
function stripBlock(text: string, start: string, end: string): string {
	const lines = text.split("\n");
	let removed = true;
	while (removed) {
		removed = false;
		let startIdx = -1;
		for (let i = 0; i < lines.length; i++) {
			const trimmed = lines[i].trimStart();
			if (startIdx === -1) {
				if (trimmed.startsWith(start)) startIdx = i;
			} else if (trimmed.startsWith(end)) {
				lines.splice(startIdx, i - startIdx + 1);
				removed = true;
				break;
			}
		}
	}
	return lines.join("\n");
}

/** Insert/refresh a marked block (content includes the markers). Idempotent. */
export function ensureBlock(
	dst: string,
	block: string,
	start: string,
	end: string,
	dryRun = false,
): Outcome {
	const content = block.endsWith("\n") ? block : `${block}\n`;
	if (!existsSync(dst)) {
		if (!dryRun) {
			ensureDir(dst);
			writeFileSync(dst, content);
		}
		return "created";
	}
	const current = readFileSync(dst, "utf8");
	const kept = stripBlock(current, start, end).replace(/\n+$/, "");
	const next = kept.length ? `${kept}\n\n${content}` : content;
	if (next === current) return "up-to-date";
	if (!dryRun) writeFileSync(dst, next);
	return "updated";
}

function isObject(x: unknown): x is Record<string, unknown> {
	return typeof x === "object" && x !== null && !Array.isArray(x);
}

/**
 * Deep-merge template JSON into the target on EVERY run: the target's existing values win (scalars
 * and arrays alike — a key the user set is left as-is), objects merge recursively, and keys the
 * template introduces are added. Non-destructive, so re-running is safe. JSON (e.g. settings.json)
 * is not manifest-tracked today — full pristine/fork tracking for it is ROADMAP M4.
 */
function deepMerge(template: unknown, existing: unknown): unknown {
	if (!isObject(template) || !isObject(existing))
		return existing === undefined ? template : existing;
	const out: Record<string, unknown> = { ...template };
	for (const key of Object.keys(existing)) {
		out[key] =
			key in template ? deepMerge(template[key], existing[key]) : existing[key];
	}
	return out;
}

/**
 * Deep-merge template JSON into the target's (existing values win; arrays union). If the target
 * is malformed JSON, never overwrite it — leave a `${dst}.agent-equip-new` instead. Idempotent: an
 * unchanged result is reported up-to-date without rewriting.
 */
export function mergeJson(src: string, dst: string, dryRun = false): Outcome {
	if (!existsSync(dst)) {
		if (!dryRun) {
			ensureDir(dst);
			copyFileSync(src, dst);
		}
		return "created";
	}
	if (sameFile(src, dst)) {
		if (!dryRun) clearArtifact(dst);
		return "up-to-date";
	}
	const current = readFileSync(dst, "utf8");
	let existing: unknown;
	try {
		existing = JSON.parse(current);
	} catch {
		// Target is malformed — do not touch it; leave a reconcile copy.
		if (!dryRun) copyFileSync(src, `${dst}.agent-equip-new`);
		return "new-written";
	}
	const merged = deepMerge(JSON.parse(readFileSync(src, "utf8")), existing);
	const next = `${JSON.stringify(merged, null, 2)}\n`;
	if (next === current) {
		if (!dryRun) clearArtifact(dst);
		return "up-to-date";
	}
	if (!dryRun) writeFileSync(dst, next);
	return "merged-json";
}
