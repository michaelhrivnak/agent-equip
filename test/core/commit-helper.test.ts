import { expect, test } from "bun:test";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { installCommitHelper } from "../../src/commitHelper.ts";
import { useSandbox } from "../helpers.ts";

const ctx = useSandbox();

const MARKER = "# agent-equip: commit helper";
const dest = () => join(ctx.home, ".config/agent-equip/commit.sh");
const sourceLine = () => `source "${dest()}"  ${MARKER}`;
const zshrc = () => join(ctx.home, ".zshrc");
const bashrc = () => join(ctx.home, ".bashrc");

test("writes exactly the source line to a fresh rc (nothing before or after)", () => {
	process.env.SHELL = "/bin/zsh";
	installCommitHelper();
	// A brand-new rc is exactly the one line + newline — no leading junk, no blank padding.
	expect(readFileSync(zshrc(), "utf8")).toBe(`${sourceLine()}\n`);
	expect(existsSync(dest())).toBe(true); // helper copied to the stable ~/.config path
});

test("returns a message naming the dest and the rc it sourced from", () => {
	process.env.SHELL = "/bin/zsh";
	const msg = installCommitHelper();
	expect(msg).toBe(`commit helper -> ${dest()} (sourced from .zshrc)`);
});

test("preserves the rc's existing lines verbatim, newlines intact, above the appended line", () => {
	process.env.SHELL = "/bin/zsh";
	writeFileSync(zshrc(), "export FOO=1\nalias g=git\n");
	installCommitHelper();
	// Exact result pins line separators too — a `.join("")` regression would fuse the two lines.
	expect(readFileSync(zshrc(), "utf8")).toBe(
		`export FOO=1\nalias g=git\n${sourceLine()}\n`,
	);
});

test("refreshes a stale source line instead of duplicating it (dedup)", () => {
	process.env.SHELL = "/bin/zsh";
	writeFileSync(zshrc(), `alias g=git\nsource "/old/path/commit.sh"  ${MARKER}\n`);
	installCommitHelper();
	const rc = readFileSync(zshrc(), "utf8");
	expect(rc.match(new RegExp(MARKER, "g"))?.length).toBe(1); // exactly one marker
	expect(rc).not.toContain("/old/path/commit.sh"); // stale line removed
	expect(rc).toContain("alias g=git"); // unrelated line kept
	expect(rc).toContain(sourceLine()); // refreshed to the current dest
});

test("both .zshrc and .bashrc get the line when both already exist", () => {
	process.env.SHELL = "/usr/bin/fish"; // unsupported shell — relies on the existing-file rule
	writeFileSync(zshrc(), "# z\n");
	writeFileSync(bashrc(), "# b\n");
	const msg = installCommitHelper();
	expect(readFileSync(zshrc(), "utf8")).toContain(sourceLine());
	expect(readFileSync(bashrc(), "utf8")).toContain(sourceLine());
	expect(msg).toContain(".zshrc, .bashrc");
});

test("an unsupported shell with no rc creates no rc and reports the manual step", () => {
	process.env.SHELL = "/usr/bin/fish";
	const msg = installCommitHelper();
	expect(existsSync(zshrc())).toBe(false); // never fabricate a .zshrc a fish user won't read
	expect(existsSync(bashrc())).toBe(false);
	expect(existsSync(dest())).toBe(true); // helper file still copied
	expect(msg).toBe(
		`commit helper -> ${dest()} (no supported shell rc found — add \`source "${dest()}"\` to your shell config)`,
	);
});

test("dry run with no supported rc reports the manual-step message and writes nothing", () => {
	process.env.SHELL = "/usr/bin/fish";
	const msg = installCommitHelper(true);
	expect(msg).toBe(
		`would install commit helper -> ${dest()} (no supported shell rc found — add \`source "${dest()}"\` to your shell config)`,
	);
	expect(existsSync(dest())).toBe(false); // nothing copied
});

test("dry run writes nothing but reports the dest and rc it would source from", () => {
	process.env.SHELL = "/bin/zsh";
	writeFileSync(zshrc(), "# existing\n");
	const msg = installCommitHelper(true);
	expect(msg).toBe(
		`would install commit helper -> ${dest()} (sourced from .zshrc)`,
	);
	expect(existsSync(dest())).toBe(false); // nothing copied
	expect(readFileSync(zshrc(), "utf8")).toBe("# existing\n"); // rc untouched
});
