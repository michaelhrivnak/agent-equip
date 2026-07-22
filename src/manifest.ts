// Ownership manifest: `.agent-equip/manifest.json` records the sha256 of each whole-file managed
// file AS AGENT-EQUIP LAST WROTE IT. A file whose current bytes still match its manifest hash is
// "pristine" (untouched by the team) and tracks upstream; once edited it diverges and agent-equip
// leaves it alone. Committed with the repo; deterministic key order for byte-stable re-runs.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const MANIFEST_REL = ".agent-equip/manifest.json";
export type Manifest = Record<string, string>;

export function hash(content: Buffer | string): string {
	return createHash("sha256").update(content).digest("hex");
}

export function loadManifest(target: string): Manifest {
	const file = join(target, MANIFEST_REL);
	if (!existsSync(file)) return {};
	try {
		return JSON.parse(readFileSync(file, "utf8")) as Manifest;
	} catch {
		return {};
	}
}

export function saveManifest(target: string, manifest: Manifest): void {
	const ordered: Manifest = {};
	for (const key of Object.keys(manifest).sort()) ordered[key] = manifest[key];
	const file = join(target, MANIFEST_REL);
	mkdirSync(dirname(file), { recursive: true });
	writeFileSync(file, `${JSON.stringify(ordered, null, 2)}\n`);
}
