#!/usr/bin/env bun

// smoke-035-session-cwd-project.ts
// spec 036 e2e gate: verify resolveProjectCwd always returns
// join(projectsRoot, projectId) regardless of whether the directory exists.
// RED: exits 1 until resolveProjectCwd is fixed to remove the fallback.

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveProjectCwd } from "../apps/backend/src/features/sessions/sessions.repo.ts";

const root = mkdtempSync(join(tmpdir(), "smoke-035-"));

// Case 1: project directory does NOT exist on disk.
// New contract: must return join(root, projectId), not root.
const missing = await resolveProjectCwd(root, "new-project");
const expectedMissing = join(root, "new-project");
if (missing !== expectedMissing) {
	console.error(`FAIL (missing dir): expected ${expectedMissing}, got ${missing}`);
	console.error("  resolveProjectCwd still falls back to projectsRoot when directory is missing.");
	process.exit(1);
}

// Case 2: project directory exists on disk (unchanged contract).
import { mkdirSync } from "node:fs";

mkdirSync(join(root, "existing-project"));
const existing = await resolveProjectCwd(root, "existing-project");
const expectedExisting = join(root, "existing-project");
if (existing !== expectedExisting) {
	console.error(`FAIL (existing dir): expected ${expectedExisting}, got ${existing}`);
	process.exit(1);
}

console.log("smoke-035: PASS");
