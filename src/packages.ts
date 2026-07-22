import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { readTemplateFile } from "./assets.ts";

export interface PackageDef {
	id: string;
	name: string;
	description: string;
	/** Present when `file` exists (and contains `contains`, if given). */
	detect: { file: string; contains?: string };
	/** Shell command run in the target project to install the package. */
	install: string;
}

/** Curated packages a stack declares in templates/<stack>/packages.json (or [] if none). */
export function loadPackages(stack: string): PackageDef[] {
	const raw = readTemplateFile(stack, "packages.json");
	if (raw === null) return [];
	try {
		const parsed = JSON.parse(raw) as { packages?: PackageDef[] };
		return parsed.packages ?? [];
	} catch {
		console.warn(
			`agent-equip: templates/${stack}/packages.json is not valid JSON — ignoring it.`,
		);
		return [];
	}
}

/** Is a curated package already present in the target project? */
export function isInstalled(target: string, pkg: PackageDef): boolean {
	const file = join(target, pkg.detect.file);
	if (!existsSync(file)) return false;
	if (pkg.detect.contains === undefined) return true;
	return readFileSync(file, "utf8").includes(pkg.detect.contains);
}

/** Curated packages for a stack that are not yet present in the target. */
export function missingPackages(target: string, stack: string): PackageDef[] {
	return loadPackages(stack).filter((pkg) => !isInstalled(target, pkg));
}

/** Run a package's install command in the target project. Returns true on success. */
export function installPackage(target: string, pkg: PackageDef): boolean {
	// `shell: true` runs the command line via the platform shell (like `sh -c`), inheriting our
	// stdio so the user sees progress. `status` is the exit code (null if killed by a signal).
	const res = spawnSync(pkg.install, {
		cwd: target,
		stdio: "inherit",
		shell: true,
	});
	return res.status === 0;
}
