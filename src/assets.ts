// The single seam for reading the packaged template payload off disk. Every template/asset
// access goes through here (plus paths.ts) so a future compiled binary can swap disk reads for
// embedded assets in ONE place. No other module should construct TEMPLATES_DIR paths.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { COMMIT_HELPER_SRC, TEMPLATES_DIR } from "./paths.ts";

/** Template layer directory names under templates/ (directories only). */
export function templateLayers(): string[] {
	return readdirSync(TEMPLATES_DIR).filter((name) =>
		statSync(join(TEMPLATES_DIR, name)).isDirectory(),
	);
}

/** Does a template layer directory exist? */
export function templateLayerExists(layer: string): boolean {
	const dir = join(TEMPLATES_DIR, layer);
	return existsSync(dir) && statSync(dir).isDirectory();
}

/** Read a file within a template layer; `null` if it doesn't exist. */
export function readTemplateFile(layer: string, rel: string): string | null {
	const file = join(TEMPLATES_DIR, layer, rel);
	if (!existsSync(file)) return null;
	return readFileSync(file, "utf8");
}

/** Absolute source path of a file within a template layer (for callers that copy/read it). */
export function templateFilePath(layer: string, rel: string): string {
	return join(TEMPLATES_DIR, layer, rel);
}

/** Files under a template layer, as paths relative to the layer root (empty if the layer is absent). */
export function layerFiles(layer: string): string[] {
	const dir = join(TEMPLATES_DIR, layer);
	if (!existsSync(dir)) return [];
	return walk(dir, dir);
}

function walk(dir: string, base: string): string[] {
	const out: string[] = [];
	for (const entry of readdirSync(dir)) {
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) out.push(...walk(full, base));
		else out.push(relative(base, full));
	}
	return out;
}

/** Absolute path of the packaged commit.sh helper. */
export const commitHelperPath = COMMIT_HELPER_SRC;
