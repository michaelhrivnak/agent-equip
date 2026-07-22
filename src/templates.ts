import { readFileSync } from "node:fs";
import {
	layerFiles,
	readTemplateFile,
	templateFilePath,
	templateLayerExists,
	templateLayers,
} from "./assets.ts";

export const COMMON = "common";

export interface StackMeta {
	name: string;
	label: string;
	description: string;
}

/** Display metadata for a stack from templates/<stack>/stack.json (falls back to the name). */
export function stackMeta(stack: string): StackMeta {
	const fallback = { name: stack, label: stack, description: "" };
	const raw = readTemplateFile(stack, "stack.json");
	if (raw === null) return fallback;
	try {
		const parsed = JSON.parse(raw) as Partial<StackMeta>;
		return {
			name: stack,
			label: parsed.label ?? stack,
			description: parsed.description ?? "",
		};
	} catch {
		console.warn(
			`ai-setup: templates/${stack}/stack.json is not valid JSON — using the stack name.`,
		);
		return fallback;
	}
}

/** Stack names available under templates/ (everything except the shared `common` layer). */
export function listStacks(): string[] {
	return templateLayers()
		.filter((name) => name !== COMMON)
		.sort();
}

export function stackExists(stack: string): boolean {
	return stack !== COMMON && templateLayerExists(stack);
}

/**
 * Compose the `common` layer with a stack layer into a map of
 * `relative path -> absolute source path`. Stack files override common on identical paths.
 */
export function composeFiles(stack: string): Map<string, string> {
	const files = new Map<string, string>();
	for (const layer of [COMMON, stack]) {
		for (const rel of layerFiles(layer))
			files.set(rel, templateFilePath(layer, rel));
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
