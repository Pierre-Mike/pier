#!/usr/bin/env bun

// smoke-023-session-cwd.ts
// spec 023 e2e gate: verify resolveProjectCwd is exported and behaves correctly.
// RED: exits 1 until resolveProjectCwd is exported from sessions.repo.ts.

import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveProjectCwd } from "../apps/backend/src/features/sessions/sessions.repo.ts";

const root = mkdtempSync(join(tmpdir(), "smoke-023-"));
const projectId = "smoke-project";
mkdirSync(join(root, projectId));

const exists = await resolveProjectCwd(root, projectId);
if (exists !== join(root, projectId)) {
	console.error(`FAIL: expected ${join(root, projectId)}, got ${exists}`);
	process.exit(1);
}

const missing = await resolveProjectCwd(root, "no-such-dir");
if (missing !== root) {
	console.error(`FAIL: expected fallback ${root}, got ${missing}`);
	process.exit(1);
}

console.log("smoke-023: PASS");
