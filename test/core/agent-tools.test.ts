import { expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
	type AgentToolDef,
	applyAgentTools,
	isConfigured,
	loadAgentTools,
	missingAgentTools,
} from "../../src/agentTools.ts";
import { install } from "../../src/install.ts";
import { useSandbox } from "../helpers.ts";

const ctx = useSandbox();

const byId = (id: string): AgentToolDef => {
	const tool = loadAgentTools("bun-cli").find((t) => t.id === id);
	if (!tool) throw new Error(`no such tool: ${id}`);
	return tool;
};

const readSettings = (): Record<string, unknown> =>
	JSON.parse(readFileSync(join(ctx.target, ".claude/settings.json"), "utf8"));

function seedSettings(data: unknown): void {
	mkdirSync(join(ctx.target, ".claude"), { recursive: true });
	writeFileSync(
		join(ctx.target, ".claude/settings.json"),
		JSON.stringify(data, null, 2),
	);
}

test("recommends caveman and rtk when the target has nothing configured", () => {
	const ids = missingAgentTools(ctx.target, "bun-cli").map((t) => t.id);
	expect(ids).toContain("caveman");
	expect(ids).toContain("rtk");
});

test("does not recommend a plugin that is already enabled", () => {
	seedSettings({ enabledPlugins: { "caveman@caveman": true } });
	const ids = missingAgentTools(ctx.target, "bun-cli").map((t) => t.id);
	expect(ids).not.toContain("caveman");
});

test("does not recommend a hook that is already present", () => {
	seedSettings({
		hooks: {
			PreToolUse: [
				{
					matcher: "Bash",
					hooks: [
						{
							type: "command",
							command:
								"if command -v rtk >/dev/null 2>&1; then rtk hook claude; fi",
						},
					],
				},
			],
		},
	});
	const ids = missingAgentTools(ctx.target, "bun-cli").map((t) => t.id);
	expect(ids).not.toContain("rtk");
});

test("applying a plugin writes enabledPlugins and its marketplace", () => {
	applyAgentTools(ctx.target, [byId("caveman")]);
	const settings = readSettings() as {
		enabledPlugins: Record<string, boolean>;
		extraKnownMarketplaces: Record<string, unknown>;
	};
	expect(settings.enabledPlugins["caveman@caveman"]).toBe(true);
	expect(settings.extraKnownMarketplaces.caveman).toEqual({
		source: { source: "github", repo: "JuliusBrussee/caveman" },
	});
});

test("applying the rtk hook writes the guarded command", () => {
	applyAgentTools(ctx.target, [byId("rtk")]);
	const settings = readSettings() as {
		hooks: { PreToolUse: { hooks: { command: string }[] }[] };
	};
	const command = settings.hooks.PreToolUse[0].hooks[0].command;
	expect(command).toContain("command -v rtk");
	expect(command).toContain("rtk hook claude");
});

test("applying a hook unions with an existing distinct hook and dedups on re-apply", () => {
	seedSettings({
		hooks: {
			PreToolUse: [
				{
					matcher: "Write",
					hooks: [{ type: "command", command: "echo existing" }],
				},
			],
		},
	});
	applyAgentTools(ctx.target, [byId("rtk")]);
	let entries = (readSettings() as { hooks: { PreToolUse: unknown[] } }).hooks
		.PreToolUse;
	expect(entries).toHaveLength(2); // existing + rtk

	applyAgentTools(ctx.target, [byId("rtk")]);
	entries = (readSettings() as { hooks: { PreToolUse: unknown[] } }).hooks
		.PreToolUse;
	expect(entries).toHaveLength(2); // no duplicate
});

test("applying an mcp tool writes mcpServers to .mcp.json", () => {
	const tool: AgentToolDef = {
		id: "example",
		name: "Example",
		description: "example server",
		type: "mcp",
		server: { name: "example", command: "example-server", args: ["--stdio"] },
	};
	applyAgentTools(ctx.target, [tool]);
	const mcp = JSON.parse(
		readFileSync(join(ctx.target, ".mcp.json"), "utf8"),
	) as { mcpServers: Record<string, unknown> };
	expect(mcp.mcpServers.example).toEqual({
		command: "example-server",
		args: ["--stdio"],
	});
	// isConfigured detects it on the .mcp.json we just wrote
	expect(isConfigured(ctx.target, tool)).toBe(true);
});

test("agent-tools.json manifest is not seeded into the target", () => {
	install({ target: ctx.target, stack: "bun-cli", commitHelper: false });
	expect(existsSync(join(ctx.target, "agent-tools.json"))).toBe(false);
});
