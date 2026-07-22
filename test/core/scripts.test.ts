import { expect, test } from "bun:test";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { COMMIT_HELPER_SRC, TEMPLATES_DIR } from "../../src/paths.ts";

/** The commit helper plus every template precommit / setup.sh we ship. */
function shellScripts(): string[] {
	const scripts = [COMMIT_HELPER_SRC];
	for (const layer of readdirSync(TEMPLATES_DIR)) {
		for (const rel of [".ai-setup/precommit", ".conductor/setup.sh"]) {
			const file = join(TEMPLATES_DIR, layer, rel);
			if (existsSync(file)) scripts.push(file);
		}
	}
	return scripts;
}

test("every shipped shell script parses under bash -n", () => {
	const scripts = shellScripts();
	expect(scripts.length).toBeGreaterThan(1); // sanity: we actually found some
	for (const file of scripts) {
		const res = Bun.spawnSync(["bash", "-n", file]);
		expect(res.exitCode, `${file}\n${res.stderr.toString()}`).toBe(0);
	}
});
