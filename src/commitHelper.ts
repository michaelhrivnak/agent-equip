import {
	copyFileSync,
	existsSync,
	mkdirSync,
	readFileSync,
	renameSync,
	writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { commitHelperPath } from "./assets.ts";

const MARKER = "# ai-setup: commit helper";

/** Add (or refresh) the source line in a shell rc file. Deduped, idempotent, atomic. */
function addSourceLine(rc: string, line: string): void {
	const current = existsSync(rc) ? readFileSync(rc, "utf8") : "";
	const kept = current
		.split("\n")
		.filter((l) => !l.includes(MARKER))
		.join("\n")
		.replace(/\n+$/, "");
	const next = `${kept.length ? `${kept}\n` : ""}${line}\n`;
	const tmp = `${rc}.ai-setup.tmp`;
	writeFileSync(tmp, next);
	renameSync(tmp, rc); // atomic: readers never see a truncated rc
}

/**
 * rc files to source the helper from: any `.zshrc`/`.bashrc` that already exists, plus the one
 * for the current $SHELL if it's bash or zsh. An unsupported shell (e.g. fish) only ever touches
 * an rc that already exists — we never create a `.zshrc` a fish user would not read.
 */
function targetRcFiles(home: string): string[] {
	const names = new Set<string>();
	for (const name of [".zshrc", ".bashrc"]) {
		if (existsSync(join(home, name))) names.add(name);
	}
	const shell = basename(process.env.SHELL ?? "");
	if (shell.includes("bash")) names.add(".bashrc");
	else if (shell.includes("zsh")) names.add(".zshrc");
	return [...names].map((name) => join(home, name));
}

/**
 * Install the user-level `commit` helper: copy commit.sh to ~/.config/ai-setup and source it
 * from the shell rc(s). Stable home path (not the workspace), deduped, idempotent. Honors
 * $HOME/$SHELL so it is testable (uses `||` so an empty $HOME falls back to the real home),
 * and deliberately ignores $ZDOTDIR (integrated terminals repoint it).
 */
export function installCommitHelper(dryRun = false): string {
	const home = process.env.HOME || homedir();
	const destDir = join(home, ".config", "ai-setup");
	const dest = join(destDir, "commit.sh");
	const rcFiles = targetRcFiles(home);
	const rcLabel = rcFiles.map((f) => basename(f)).join(", ");
	const noRc = `no supported shell rc found — add \`source "${dest}"\` to your shell config`;

	if (dryRun) {
		return rcFiles.length
			? `would install commit helper -> ${dest} (sourced from ${rcLabel})`
			: `would install commit helper -> ${dest} (${noRc})`;
	}

	mkdirSync(destDir, { recursive: true });
	copyFileSync(commitHelperPath, dest);
	if (rcFiles.length === 0) return `commit helper -> ${dest} (${noRc})`;

	const line = `source "${dest}"  ${MARKER}`;
	for (const rc of rcFiles) addSourceLine(rc, line);
	return `commit helper -> ${dest} (sourced from ${rcLabel})`;
}
