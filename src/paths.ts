import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Root that holds the template payload: templates/ + assets/.
//  - dev: this module is src/paths.ts, so the parent of its directory is the repo root.
//  - published package: the code is bundled to dist/agent-equip.js, so the same "parent of my
//    directory" resolves to the package root (dist/.. === package/), where templates/ + assets/
//    are shipped alongside dist/.
// One expression covers both because it keys off this module's own location at runtime.
export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const TEMPLATES_DIR = join(REPO_ROOT, "templates");
export const COMMIT_HELPER_SRC = join(REPO_ROOT, "assets", "commit.sh");
