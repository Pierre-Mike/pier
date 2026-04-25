import { readFileSync } from "node:fs";
import { join } from "node:path";

/** Contents of the root AGENTS.md, used by documentation contract tests. */
export const agentsDoc = readFileSync(join(import.meta.dir, "../../../../../AGENTS.md"), "utf-8");
