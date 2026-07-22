import { afterEach, beforeEach, expect, test } from "bun:test";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { REPO_ROOT } from "../../src/paths.ts";

const BIN = join(REPO_ROOT, "bin", "agent-equip.ts");
let sandbox: string;
let target: string;
let home: string;

beforeEach(() => {
	sandbox = mkdtempSync(join(tmpdir(), "agent-equip-cli-"));
	target = join(sandbox, "proj");
	home = join(sandbox, "home");
	mkdirSync(join(target, ".git"), { recursive: true }); // look like a git repo
	mkdirSync(home, { recursive: true });
});

afterEach(() => rmSync(sandbox, { recursive: true, force: true }));

/** Run the CLI as a child process (stdout piped → child sees a non-TTY). */
function run(args: string[]) {
	const res = Bun.spawnSync(["bun", BIN, ...args], {
		env: { ...process.env, HOME: home, SHELL: "/bin/zsh" },
	});
	return {
		code: res.exitCode,
		stdout: res.stdout.toString(),
		stderr: res.stderr.toString(),
	};
}

test("`list` prints the available stacks", () => {
	const res = run(["list"]);
	expect(res.code).toBe(0);
	expect(res.stdout).toContain("laravel");
	expect(res.stdout).toContain("bun-cli");
});

test("a non-interactive install does NOT auto-write third-party agent tools", () => {
	const res = run(["init", target, "--stack", "laravel", "--project-only"]);
	expect(res.code, res.stderr).toBe(0);

	const settings = JSON.parse(
		readFileSync(join(target, ".claude/settings.json"), "utf8"),
	);
	expect(settings.enabledPlugins).toBeUndefined(); // picker was not silently applied
	expect(settings.permissions).toBeDefined(); // baseline permissions still seeded
	expect(existsSync(join(target, ".mcp.json"))).toBe(false);
	expect(res.stdout).toContain("agent tool(s) available"); // notice only
});

test("`init --dry-run` writes nothing to the target", () => {
	const res = run(["init", target, "--stack", "laravel", "--dry-run"]);
	expect(res.code, res.stderr).toBe(0);
	expect(existsSync(join(target, "AGENTS.md"))).toBe(false);
	expect(existsSync(join(target, "CLAUDE.md"))).toBe(false);
});

test("`init` without --stack in a non-TTY fails fast instead of hanging", () => {
	const res = run(["init", target]);
	expect(res.code).toBe(1);
	expect(res.stderr).toContain("non-interactive: pass --stack");
	expect(existsSync(join(target, "AGENTS.md"))).toBe(false); // failed before any write
});

test("`init` fails cleanly when the target does not exist", () => {
	const res = run(["init", join(sandbox, "nope"), "--stack", "laravel"]);
	expect(res.code).toBe(1);
	expect(res.stderr).toContain("does not exist");
});

test("`update` before any install fails and points to init", () => {
	const res = run(["update", target]);
	expect(res.code).toBe(1);
	expect(res.stderr).toContain("run 'agent-equip init' first");
});

test("`update` reuses the installed stack/agents and reports up-to-date right after init", () => {
	run(["init", target, "--stack", "laravel", "--project-only"]);
	const res = run(["update", target, "--project-only"]); // no --stack — read from manifest
	expect(res.code, res.stderr).toBe(0);
	expect(res.stdout).toContain("already up to date");
});

test("`update` still reports up-to-date when a permanently forked file exists (forked ≠ changed)", () => {
	run(["init", target, "--stack", "laravel", "--project-only"]);
	// Fork a whole-file managed file — it reports `forked` on every subsequent run.
	writeFileSync(
		join(target, ".agent-equip/precommit"),
		"#!/bin/sh\necho mine\n",
	);
	const res = run(["update", target, "--project-only"]);
	expect(res.code, res.stderr).toBe(0);
	expect(res.stdout).toContain("already up to date");
	expect(res.stdout).toContain("kept your local edits");
});

test("`update` rejects a manifest that lists an unknown agent", () => {
	run(["init", target, "--stack", "laravel", "--project-only"]);
	const mp = join(target, ".agent-equip/manifest.json");
	const m = JSON.parse(readFileSync(mp, "utf8"));
	m.agents = ["bogus"];
	writeFileSync(mp, `${JSON.stringify(m, null, 2)}\n`);
	const res = run(["update", target, "--project-only"]);
	expect(res.code).toBe(1);
	expect(res.stderr).toContain("unknown agent");
});

test("`update` refuses to run inside the agent-equip repo without --force", () => {
	const res = run(["update", REPO_ROOT]);
	expect(res.code).toBe(1);
	expect(res.stderr).toContain("refusing to update agent-equip into itself");
});

test("`update` surfaces a hand-edited settings.json but preserves the edit", () => {
	run(["init", target, "--stack", "laravel", "--project-only"]);
	const sp = join(target, ".claude/settings.json");
	const settings = JSON.parse(readFileSync(sp, "utf8"));
	settings.myCustomKey = 42;
	writeFileSync(sp, `${JSON.stringify(settings, null, 2)}\n`);

	const res = run(["update", target, "--project-only"]);
	expect(res.code, res.stderr).toBe(0);
	expect(res.stdout).toContain("kept your local edits");
	expect(res.stdout).toContain(".claude/settings.json");

	const after = JSON.parse(readFileSync(sp, "utf8"));
	expect(after.myCustomKey).toBe(42); // preserved
	expect(after.permissions).toBeDefined(); // template still present
});
