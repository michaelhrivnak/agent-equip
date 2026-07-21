import { afterEach, beforeEach } from "bun:test";
import { mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface Sandbox {
	sandbox: string;
	target: string;
	home: string;
}

/**
 * Register an isolated sandbox around each test: a temp target project dir and a fake $HOME,
 * with a deterministic $SHELL. Returns a ref that beforeEach refreshes; afterEach restores the
 * env and cleans up. Tests may override process.env.SHELL inline to exercise shell autodetect.
 */
export function useSandbox(shell = "/bin/zsh"): Sandbox {
	const ref: Sandbox = { sandbox: "", target: "", home: "" };
	let prevHome: string | undefined;
	let prevShell: string | undefined;

	beforeEach(() => {
		ref.sandbox = mkdtempSync(join(tmpdir(), "ai-setup-"));
		ref.target = join(ref.sandbox, "proj");
		ref.home = join(ref.sandbox, "home");
		mkdirSync(ref.target, { recursive: true });
		mkdirSync(ref.home, { recursive: true });
		prevHome = process.env.HOME;
		prevShell = process.env.SHELL;
		process.env.HOME = ref.home;
		process.env.SHELL = shell;
	});

	afterEach(() => {
		process.env.HOME = prevHome;
		process.env.SHELL = prevShell;
		rmSync(ref.sandbox, { recursive: true, force: true });
	});

	return ref;
}

/** All files (recursively) under dir. */
export function walk(dir: string): string[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
		e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
	);
}
