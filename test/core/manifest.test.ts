import { expect, test } from "bun:test";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { hash } from "../../src/manifest.ts";
import { manifestedCopy } from "../../src/merge.ts";
import { useSandbox } from "../helpers.ts";

const ctx = useSandbox();

/** Write a template source file in the sandbox and return its path. */
function tpl(name: string, content: string): string {
	const p = join(ctx.target, name);
	writeFileSync(p, content);
	return p;
}

test("absent target is seeded and its hash recorded", () => {
	const src = tpl("src-v1", "v1\n");
	const dst = join(ctx.target, "out");
	const r = manifestedCopy(src, dst, undefined);
	expect(r.outcome).toBe("created");
	expect(readFileSync(dst, "utf8")).toBe("v1\n");
	expect(r.hash).toBe(hash("v1\n"));
});

test("pristine target (matches last-written hash) is refreshed to the new template", () => {
	const dst = join(ctx.target, "out");
	writeFileSync(dst, "v1\n"); // what agent-equip wrote before
	const srcV2 = tpl("src-v2", "v2\n"); // template has since changed
	const r = manifestedCopy(srcV2, dst, hash("v1\n"));
	expect(r.outcome).toBe("updated");
	expect(readFileSync(dst, "utf8")).toBe("v2\n"); // update flowed
	expect(r.hash).toBe(hash("v2\n"));
});

test("forked target (edited since last write) is left untouched, hash preserved", () => {
	const dst = join(ctx.target, "out");
	writeFileSync(dst, "team edit\n"); // human changed it
	const srcV2 = tpl("src-v2", "v2\n");
	const r = manifestedCopy(srcV2, dst, hash("v1\n")); // prior hash was v1, current differs
	expect(r.outcome).toBe("forked");
	expect(readFileSync(dst, "utf8")).toBe("team edit\n"); // untouched
	expect(existsSync(`${dst}.agent-equip-new`)).toBe(false); // silent, no churn
	expect(r.hash).toBe(hash("v1\n")); // baseline kept
});

test("pre-existing foreign file is never overwritten; leaves a *.agent-equip-new and records the fork sentinel", () => {
	const dst = join(ctx.target, "out");
	writeFileSync(dst, "theirs\n");
	const src = tpl("src-v1", "v1\n");
	const r = manifestedCopy(src, dst, undefined);
	expect(r.outcome).toBe("new-written");
	expect(readFileSync(dst, "utf8")).toBe("theirs\n"); // untouched
	expect(readFileSync(`${dst}.agent-equip-new`, "utf8")).toBe("v1\n");
	expect(r.hash).toBe("forked"); // sentinel → future runs go silent
});

test("with the fork sentinel recorded, a later run is silent and does not recreate the artifact", () => {
	const dst = join(ctx.target, "out");
	writeFileSync(dst, "theirs\n");
	const src = tpl("src-v1", "v1\n");
	const first = manifestedCopy(src, dst, undefined);
	expect(first.hash).toBe("forked");
	expect(existsSync(`${dst}.agent-equip-new`)).toBe(true);

	rmSync(`${dst}.agent-equip-new`); // user reviews and removes the reconcile copy

	const second = manifestedCopy(src, dst, first.hash); // sentinel is the prior hash now
	expect(second.outcome).toBe("forked");
	expect(second.hash).toBe("forked");
	expect(existsSync(`${dst}.agent-equip-new`)).toBe(false); // NOT recreated
});

test("dry run computes the outcome but writes nothing", () => {
	const src = tpl("src-v1", "v1\n");
	const dst = join(ctx.target, "out");
	const r = manifestedCopy(src, dst, undefined, true);
	expect(r.outcome).toBe("created");
	expect(existsSync(dst)).toBe(false);
});
