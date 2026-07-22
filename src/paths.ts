import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Repo root is the parent of src/. (When we ship a compiled binary later, swap this for
// an embedded-assets lookup; everything else keys off these constants.)
export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const TEMPLATES_DIR = join(REPO_ROOT, "templates");
export const COMMIT_HELPER_SRC = join(REPO_ROOT, "assets", "commit.sh");
