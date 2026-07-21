import {
	chmodSync,
	copyFileSync,
	existsSync,
	mkdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { dirname } from "node:path";

export type Outcome =
	| "created"
	| "updated"
	| "up-to-date"
	| "merged-json"
	| "merged-claude"
	| "new-written";

function ensureDir(file: string): void {
	mkdirSync(dirname(file), { recursive: true });
}

function sameFile(a: string, b: string): boolean {
	return existsSync(b) && readFileSync(a).equals(readFileSync(b));
}

/** Copy src -> dst only if dst is absent. If it exists and differs, leave a *.ai-setup-new copy. */
export function copyIfAbsent(
	src: string,
	dst: string,
	opts: { executable?: boolean } = {},
): Outcome {
	if (existsSync(dst)) {
		if (sameFile(src, dst)) return "up-to-date";
		ensureDir(`${dst}.ai-setup-new`);
		copyFileSync(src, `${dst}.ai-setup-new`);
		if (opts.executable) chmodSync(`${dst}.ai-setup-new`, 0o755);
		return "new-written";
	}
	ensureDir(dst);
	copyFileSync(src, dst);
	if (opts.executable) chmodSync(dst, 0o755);
	return "created";
}

/**
 * Remove a start..end block (inclusive) from text, keeping everything else. Markers are matched
 * only when a line *starts* with them (after leading whitespace), so prose that merely mentions
 * the marker string mid-line is not mistaken for a real block boundary.
 */
function stripBlock(text: string, start: string, end: string): string {
	const out: string[] = [];
	let drop = false;
	for (const line of text.split("\n")) {
		const trimmed = line.trimStart();
		if (trimmed.startsWith(start)) drop = true;
		if (!drop) out.push(line);
		if (trimmed.startsWith(end)) drop = false;
	}
	return out.join("\n");
}

/**
 * Insert/refresh a marked block (given as content, markers included) in a file — create,
 * append, or replace in place. Idempotent.
 */
export function ensureBlock(
	dst: string,
	block: string,
	start: string,
	end: string,
): Outcome {
	const content = block.endsWith("\n") ? block : `${block}\n`;
	if (!existsSync(dst)) {
		ensureDir(dst);
		writeFileSync(dst, content);
		return "created";
	}
	const current = readFileSync(dst, "utf8");
	const kept = stripBlock(current, start, end).replace(/\n+$/, "");
	const next = kept.length ? `${kept}\n\n${content}` : content;
	if (next === current) return "up-to-date";
	writeFileSync(dst, next);
	return "updated";
}

function isObject(x: unknown): x is Record<string, unknown> {
	return typeof x === "object" && x !== null && !Array.isArray(x);
}

/** Recursive object merge where `over` wins on conflicts; `base` fills in missing keys. */
function deepMerge(base: unknown, over: unknown): unknown {
	if (!isObject(base) || !isObject(over))
		return over === undefined ? base : over;
	const out: Record<string, unknown> = { ...base };
	for (const key of Object.keys(over)) {
		out[key] =
			key in base && isObject(base[key]) && isObject(over[key])
				? deepMerge(base[key], over[key])
				: over[key];
	}
	return out;
}

/** Deep-merge template JSON into the target's, with the target's existing values winning. */
export function mergeJson(src: string, dst: string): Outcome {
	if (!existsSync(dst)) {
		ensureDir(dst);
		copyFileSync(src, dst);
		return "created";
	}
	if (sameFile(src, dst)) return "up-to-date";
	const merged = deepMerge(
		JSON.parse(readFileSync(src, "utf8")),
		JSON.parse(readFileSync(dst, "utf8")),
	);
	writeFileSync(dst, `${JSON.stringify(merged, null, 2)}\n`);
	return "merged-json";
}

/** Best-effort merge via the Claude CLI. Overwrites dst with the merged result. */
export function claudeMerge(dst: string, src: string): boolean {
	if (!Bun.which("claude")) return false;
	const prompt =
		"Merge the TEMPLATE config into the EXISTING config file and print ONLY the full merged " +
		"file contents — no explanation, no code fences. Preserve the existing file's values on any " +
		`conflict; add whatever the template has that is missing.\n\nEXISTING:\n${readFileSync(dst, "utf8")}\n\n` +
		`TEMPLATE:\n${readFileSync(src, "utf8")}\n`;
	const res = Bun.spawnSync(["claude", "-p", prompt]);
	if (res.exitCode !== 0) return false;
	const out = res.stdout.toString().trim();
	if (!out) return false;
	writeFileSync(dst, `${out}\n`);
	return true;
}

/** For structured files jq-style merging can't handle (e.g. TOML): claude if available, else *.ai-setup-new. */
export function mergeStructured(src: string, dst: string): Outcome {
	if (!existsSync(dst)) {
		ensureDir(dst);
		copyFileSync(src, dst);
		return "created";
	}
	if (sameFile(src, dst)) return "up-to-date";
	if (claudeMerge(dst, src)) return "merged-claude";
	copyFileSync(src, `${dst}.ai-setup-new`);
	return "new-written";
}
