import { expect, test } from "bun:test";
import { templateLayerExists } from "../../src/assets.ts";

test("templateLayerExists is true for a real template layer", () => {
	expect(templateLayerExists("common")).toBe(true);
});

test("templateLayerExists is false for a missing layer", () => {
	expect(templateLayerExists("no-such-layer")).toBe(false);
});
