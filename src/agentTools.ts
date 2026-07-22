import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { readTemplateFile } from "./assets.ts";

/** A marketplace to register alongside a plugin (`.claude/settings.json` extraKnownMarketplaces). */
export interface MarketplaceRef {
	id: string;
	source: unknown;
}

/**
 * An opt-in agent tool declared in templates/<layer>/agent-tools.json. Applied by `type` into the
 * target's JSON: plugin -> .claude/settings.json, mcp -> .mcp.json, hook -> .claude/settings.json.
 */
export interface AgentToolDef {
	id: string;
	name: string;
	/** Short one-liner shown as the picker hint. */
	description: string;
	type: "plugin" | "mcp" | "hook";
	/** Pre-checked in the picker / auto-applied under --yes when true. */
	recommended?: boolean;
	// plugin
	plugin?: string;
	marketplace?: MarketplaceRef;
	// mcp
	server?: { name: string; [key: string]: unknown };
	// hook
	event?: string;
	matcher?: string;
	command?: string;
}

interface HookCommand {
	type: string;
	command: string;
}
interface HookEntry {
	matcher?: string;
	hooks?: HookCommand[];
}
type Json = Record<string, unknown>;

const LAYERS = (stack: string): string[] => ["common", stack];

/** Agent tools declared by the common layer plus the stack (stack overrides common by id). */
export function loadAgentTools(stack: string): AgentToolDef[] {
	const byId = new Map<string, AgentToolDef>();
	for (const layer of LAYERS(stack)) {
		const raw = readTemplateFile(layer, "agent-tools.json");
		if (raw === null) continue;
		let parsed: { tools?: AgentToolDef[] } = {};
		try {
			parsed = JSON.parse(raw);
		} catch {
			console.warn(
				`agent-equip: templates/${layer}/agent-tools.json is not valid JSON — ignoring it.`,
			);
		}
		for (const tool of parsed.tools ?? []) byId.set(tool.id, tool);
	}
	return [...byId.values()];
}

function readJson(file: string): Json {
	if (!existsSync(file)) return {};
	try {
		return JSON.parse(readFileSync(file, "utf8")) as Json;
	} catch {
		return {};
	}
}

/** Read a JSON object; `{}` if absent, `null` if it exists but is malformed (must not clobber). */
function readJsonSafe(file: string): Json | null {
	if (!existsSync(file)) return {};
	try {
		return JSON.parse(readFileSync(file, "utf8")) as Json;
	} catch {
		return null;
	}
}

function writeJson(file: string, data: Json): void {
	mkdirSync(dirname(file), { recursive: true });
	writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
}

function hookMatches(entries: HookEntry[], command?: string): boolean {
	return entries.some((e) => e.hooks?.some((h) => h.command === command));
}

/** Get an object-valued child at `key`, creating an empty one if missing. */
function child(parent: Json, key: string): Json {
	const existing = parent[key];
	if (existing && typeof existing === "object") return existing as Json;
	const created: Json = {};
	parent[key] = created;
	return created;
}

/** Is a tool already configured in the target (so the picker can skip it)? */
export function isConfigured(target: string, tool: AgentToolDef): boolean {
	if (tool.type === "plugin") {
		const settings = readJson(join(target, ".claude/settings.json"));
		const plugins = settings.enabledPlugins as Json | undefined;
		return Boolean(tool.plugin && plugins?.[tool.plugin]);
	}
	if (tool.type === "mcp") {
		const mcp = readJson(join(target, ".mcp.json"));
		const servers = mcp.mcpServers as Json | undefined;
		return Boolean(tool.server && servers && tool.server.name in servers);
	}
	const settings = readJson(join(target, ".claude/settings.json"));
	const hooks = settings.hooks as Record<string, HookEntry[]> | undefined;
	return hookMatches(hooks?.[tool.event ?? ""] ?? [], tool.command);
}

/** Agent tools for a stack that are not yet configured in the target. */
export function missingAgentTools(
	target: string,
	stack: string,
): AgentToolDef[] {
	return loadAgentTools(stack).filter((tool) => !isConfigured(target, tool));
}

function applyPlugin(settings: Json, tool: AgentToolDef): void {
	const plugins = child(settings, "enabledPlugins");
	if (tool.plugin) plugins[tool.plugin] = true;
	if (tool.marketplace) {
		const marketplaces = child(settings, "extraKnownMarketplaces");
		marketplaces[tool.marketplace.id] = { source: tool.marketplace.source };
	}
}

function applyMcp(mcp: Json, tool: AgentToolDef): void {
	if (!tool.server) return;
	const servers = child(mcp, "mcpServers");
	const { name, ...config } = tool.server;
	servers[name] = config;
}

function applyHook(settings: Json, tool: AgentToolDef): void {
	const hooks = child(settings, "hooks");
	const event = tool.event ?? "";
	const existing = hooks[event];
	const entries = Array.isArray(existing) ? (existing as HookEntry[]) : [];
	hooks[event] = entries;
	if (hookMatches(entries, tool.command)) return;
	entries.push({
		matcher: tool.matcher,
		hooks: [{ type: "command", command: tool.command ?? "" }],
	});
}

/**
 * Apply selected tools into the target's JSON, merging with what's already there (object keys
 * merge; hooks array-union with dedup). If a target file exists but is malformed JSON, its tools
 * are skipped with a warning — the file is never overwritten. Writes only files actually touched.
 */
export function applyAgentTools(target: string, tools: AgentToolDef[]): void {
	if (tools.length === 0) return;
	const settingsPath = join(target, ".claude/settings.json");
	const mcpPath = join(target, ".mcp.json");
	const settings = readJsonSafe(settingsPath);
	const mcp = readJsonSafe(mcpPath);
	let settingsDirty = false;
	let mcpDirty = false;

	const skip = (path: string, tool: AgentToolDef) =>
		console.warn(
			`agent-equip: ${path} is not valid JSON — skipping "${tool.name}". Fix it and re-run.`,
		);

	for (const tool of tools) {
		if (tool.type === "mcp") {
			if (mcp === null) skip(mcpPath, tool);
			else {
				applyMcp(mcp, tool);
				mcpDirty = true;
			}
		} else if (settings === null) {
			skip(settingsPath, tool);
		} else {
			if (tool.type === "plugin") applyPlugin(settings, tool);
			else applyHook(settings, tool);
			settingsDirty = true;
		}
	}

	if (settingsDirty && settings) writeJson(settingsPath, settings);
	if (mcpDirty && mcp) writeJson(mcpPath, mcp);
}
