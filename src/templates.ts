import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { TEMPLATES_DIR } from "./paths.ts";

export const COMMON = "common";

export interface StackMeta {
	name: string;
	label: string;
	description: string;
}

/** Display metadata for a stack from templates/<stack>/stack.json (falls back to the name). */
export function stackMeta(stack: string): StackMeta {
	const file = join(TEMPLATES_DIR, stack, "stack.json");
	if (existsSync(file)) {
		const parsed = JSON.parse(readFileSync(file, "utf8")) as Partial<StackMeta>;
		return {
			name: stack,
			label: parsed.label ?? stack,
			description: parsed.description ?? "",
		};
	}
	return { name: stack, label: stack, description: "" };
}

/** Stack names available under templates/ (everything except the shared `common` layer). */
export function listStacks(): string[] {
	return readdirSync(TEMPLATES_DIR)
		.filter(
			(name) =>
				name !== COMMON && statSync(join(TEMPLATES_DIR, name)).isDirectory(),
		)
		.sort();
}

export function stackExists(stack: string): boolean {
	const dir = join(TEMPLATES_DIR, stack);
	return stack !== COMMON && existsSync(dir) && statSync(dir).isDirectory();
}

/** Files under `dir`, as paths relative to it. */
function walk(dir: string, base = dir): string[] {
	const out: string[] = [];
	for (const entry of readdirSync(dir)) {
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) out.push(...walk(full, base));
		else out.push(relative(base, full));
	}
	return out;
}

/**
 * Compose the `common` layer with a stack layer into a map of
 * `relative path -> absolute source path`. Stack files override common on identical paths.
 */
export function composeFiles(stack: string): Map<string, string> {
	const files = new Map<string, string>();
	for (const layer of [COMMON, stack]) {
		const layerDir = join(TEMPLATES_DIR, layer);
		if (!existsSync(layerDir)) continue;
		for (const rel of walk(layerDir)) files.set(rel, join(layerDir, rel));
	}
	return files;
}

const AGENTS_START =
	"<!-- ai-setup >>> (managed by ai-setup — content between these markers may be overwritten on re-install) -->";
const AGENTS_END = "<!-- ai-setup <<< -->";

/**
 * Build the canonical, cross-agent AGENTS.md content (marked block) by concatenating the
 * composed `rules/*.md` fragments (common + stack, stack overrides same-named) under a short
 * precedence preamble. This keeps the rules as small, per-concern source files while emitting
 * a single file every agent can read.
 */
export function assembleAgents(stack: string): string {
	const sections = [...composeFiles(stack).entries()]
		.filter(([rel]) => rel.startsWith("rules/") && rel.endsWith(".md"))
		.sort((a, b) => a[0].localeCompare(b[0]))
		.map(([, src]) => readFileSync(src, "utf8").trim());
	const preamble =
		"Personal or global agent instructions take precedence over the project conventions " +
		"below. On any conflict, follow the personal instruction and say so.";
	return `${AGENTS_START}\n${[preamble, ...sections].join("\n\n")}\n${AGENTS_END}\n`;
}
