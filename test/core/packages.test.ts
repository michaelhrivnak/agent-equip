import { expect, spyOn, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
	installPackage,
	loadPackages,
	type PackageDef,
} from "../../src/packages.ts";
import { TEMPLATES_DIR } from "../../src/paths.ts";
import { useSandbox } from "../helpers.ts";

const ctx = useSandbox();

function pkg(install: string): PackageDef {
	return {
		id: "x",
		name: "X",
		description: "",
		detect: { file: "never" },
		install,
	};
}

test("installPackage returns true when the install command exits 0", () => {
	expect(installPackage(ctx.target, pkg("exit 0"))).toBe(true);
});

test("installPackage returns false when the install command exits non-zero", () => {
	expect(installPackage(ctx.target, pkg("exit 3"))).toBe(false);
});

test("loadPackages returns [] and warns when packages.json is not valid JSON", () => {
	// A throwaway template layer whose packages.json is garbage. Created and torn down
	// synchronously within this test so no other (sequential) test observes it.
	const layer = "__packages_badjson_test__";
	const dir = join(TEMPLATES_DIR, layer);
	const warn = spyOn(console, "warn").mockImplementation(() => {});
	try {
		mkdirSync(dir, { recursive: true });
		writeFileSync(join(dir, "packages.json"), "{ not valid json");
		expect(loadPackages(layer)).toEqual([]);
		expect(warn).toHaveBeenCalled();
	} finally {
		rmSync(dir, { recursive: true, force: true });
		warn.mockRestore();
	}
});
