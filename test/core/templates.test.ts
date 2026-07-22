import { expect, spyOn, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { TEMPLATES_DIR } from "../../src/paths.ts";
import { stackMeta } from "../../src/templates.ts";

test("stackMeta falls back to the stack name and warns when stack.json is invalid JSON", () => {
	// Throwaway layer with garbage stack.json; created and removed synchronously so no other
	// (sequential) test observes it as a stack.
	const layer = "__stackmeta_badjson_test__";
	const dir = join(TEMPLATES_DIR, layer);
	const warn = spyOn(console, "warn").mockImplementation(() => {});
	try {
		mkdirSync(dir, { recursive: true });
		writeFileSync(join(dir, "stack.json"), "{ not valid json");
		expect(stackMeta(layer)).toEqual({
			name: layer,
			label: layer,
			description: "",
		});
		expect(warn).toHaveBeenCalled();
	} finally {
		rmSync(dir, { recursive: true, force: true });
		warn.mockRestore();
	}
});
