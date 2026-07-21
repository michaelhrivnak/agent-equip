import {
	copyFileSync,
	existsSync,
	mkdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { COMMIT_HELPER_SRC } from "./paths.ts";

const MARKER = "# ai-setup: commit helper";

/** Add (or refresh) the source line in a shell rc file. Deduped, idempotent. */
function addSourceLine(rc: string, line: string): void {
	const current = existsSync(rc) ? readFileSync(rc, "utf8") : "";
	const kept = current
		.split("\n")
		.filter((l) => !l.includes(MARKER))
		.join("\n")
		.replace(/\n+$/, "");
	writeFileSync(rc, `${kept.length ? `${kept}\n` : ""}${line}\n`);
}

/** rc files to source the helper from: any that already exist, plus the $SHELL default. */
function targetRcFiles(home: string): string[] {
	const names = new Set<string>();
	for (const name of [".zshrc", ".bashrc"]) {
		if (existsSync(join(home, name))) names.add(name);
	}
	names.add(
		basename(process.env.SHELL ?? "").includes("bash") ? ".bashrc" : ".zshrc",
	);
	return [...names].map((name) => join(home, name));
}

/**
 * Install the user-level `commit` helper: copy commit.sh to ~/.config/ai-setup and source it
 * from the shell rc(s). Stable home path (not the workspace), deduped, idempotent. Honors
 * $HOME/$SHELL so it is testable, and deliberately ignores $ZDOTDIR (integrated terminals
 * repoint it).
 */
export function installCommitHelper(dryRun = false): string {
	const home = process.env.HOME ?? homedir();
	const destDir = join(home, ".config", "ai-setup");
	const dest = join(destDir, "commit.sh");
	const rcFiles = targetRcFiles(home);
	const rcLabel = rcFiles.map((f) => basename(f)).join(", ");

	if (dryRun) {
		return `would install commit helper -> ${dest} (sourced from ${rcLabel})`;
	}

	mkdirSync(destDir, { recursive: true });
	copyFileSync(COMMIT_HELPER_SRC, dest);
	const line = `source "${dest}"  ${MARKER}`;
	for (const rc of rcFiles) addSourceLine(rc, line);
	return `commit helper -> ${dest} (sourced from ${rcLabel})`;
}
