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
			`agent-equip: templates/${stack}/stack.json is not valid JSON — using the stack name.`,
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

export interface SkillMeta {
	/** Skill slug (its directory name), e.g. `test-driven-development`. */
	name: string;
	/** The `description:` frontmatter — the trigger text agents use to decide relevance. */
	description: string;
	/** Absolute source path of the canonical `skill.md` body. */
	bodyPath: string;
}

/** Pull `name`/`description` out of a `skill.md`'s YAML frontmatter (single-line values). */
function parseSkillFrontmatter(text: string): {
	name: string;
	description: string;
} {
	const fm = text.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? "";
	return {
		name: fm.match(/^name:\s*(.+)$/m)?.[1].trim() ?? "",
		description: fm.match(/^description:\s*(.+)$/m)?.[1].trim() ?? "",
	};
}

/**
 * Compose the agent-agnostic skills from `templates/<layer>/skills/<name>/skill.md` across the
 * common + stack layers. A stack skill overrides a common one of the same name (composeFiles
 * already resolves the path collision). Sorted by name for stable output.
 */
export function composeSkills(stack: string): SkillMeta[] {
	const skills: SkillMeta[] = [];
	for (const [rel, src] of composeFiles(stack)) {
		const name = rel.match(/^skills\/([^/]+)\/skill\.md$/)?.[1];
		if (!name) continue;
		const { description } = parseSkillFrontmatter(readFileSync(src, "utf8"));
		skills.push({ name, description, bodyPath: src });
	}
	return skills.sort((a, b) => a.name.localeCompare(b.name));
}

const AGENTS_START =
	"<!-- agent-equip >>> (managed by agent-equip — content between these markers may be overwritten on re-install) -->";
const AGENTS_END = "<!-- agent-equip <<< -->";

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
	const skillsIndex = buildSkillsIndex(stack);
	const body = [preamble, ...sections, skillsIndex].filter(Boolean).join("\n\n");
	return `${AGENTS_START}\n${body}\n${AGENTS_END}\n`;
}

/**
 * The agent-agnostic "## Skills" index. Skill bodies live in `.agent-equip/skills/` and are
 * loaded on demand — this pointer list lets any AGENTS.md-reading agent (Codex, etc.) discover
 * a skill by its description and open the file only when a task matches. Empty string when the
 * stack ships no skills (so the section is omitted entirely).
 */
function buildSkillsIndex(stack: string): string {
	const skills = composeSkills(stack);
	if (skills.length === 0) return "";
	const lines = skills.map(
		(s) =>
			`- **${s.name}** — ${s.description} Read \`.agent-equip/skills/${s.name}.md\` before acting.`,
	);
	return [
		"# Skills",
		"On-demand skill instructions. When a task matches a skill's description, read that " +
			"skill's file before proceeding.",
		lines.join("\n"),
	].join("\n\n");
}
