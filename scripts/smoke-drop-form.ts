/**
 * Smoke gate — spec 008: drop.ts must use plain-object form arg, not FormData.
 *
 * RED: drop.ts still passes `form: fd` (a FormData instance) to hc → empty body.
 * GREEN: drop.ts passes `form: { files }` (plain object) → hc appends each File.
 *
 * This script checks the call site in drop.ts directly so it fails fast in
 * CI without needing a browser DOM. The runtime assertion lives in drop.test.ts.
 *
 * Exit 0 when the fix is in place; exit 1 while in RED state.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

const dropPath = join(process.cwd(), "apps/frontend/src/dashboard/drop.ts");
const source = readFileSync(dropPath, "utf-8");

// RED: the buggy pattern — `form: fd` where fd is a FormData instance.
// Object.entries(FormData) yields [], so the body ships empty.
const hasBuggyPattern = /\bform:\s*fd\b/.test(source);

// GREEN: the fixed pattern — `form: { files }`.
// Object.entries({ files }) yields [["files", File[]]], hc appends each File.
const hasFixedPattern = /\bform:\s*\{\s*files\s*\}/.test(source);

if (!hasFixedPattern) {
	console.error(
		"FAIL: drop.ts does not use `form: { files }` — the multipart body will be empty.\n" +
			"Fix: replace the `new FormData() / for...fd.append / form: fd` block\n" +
			"     with `form: { files }` in handleOSFileDrop.",
	);
	if (hasBuggyPattern) {
		console.error("      Found buggy pattern `form: fd` at the call site.");
	}
	process.exit(1);
}

console.log("smoke-drop-form: drop.ts correctly passes `form: { files }` to hc");
process.exit(0);
