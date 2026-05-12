/**
 * Smoke gate for spec 047: Add Zellij session snapshot registry.
 *
 * Verifies the following contracts end-to-end:
 *
 * Part 1 — snapshotSession writes registry.json with all required fields.
 * Part 2 — Second snapshotSession call for same name overwrites entry only.
 * Part 3 — history.ndjson line count matches call count.
 * Part 4 — Atomicity: registry.json.tmp does not exist after write.
 * Part 5 — listResumable returns only active/crashed sessions with claudeResumeId.
 * Part 6 — listResumable returns empty array on missing registry.
 * Part 7 — unit tests pass.
 *
 * RED: exits 1 — snapshot.ts does not exist, all parts fail.
 * GREEN: exits 0 — all contracts satisfied after implementation.
 */

import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = process.cwd();
const SNAPSHOT_MODULE = join(ROOT, "apps/backend/src/features/sessions/snapshot.ts");

function fail(part: string, msg: string): never {
	console.error(`[smoke-047] FAIL ${part}: ${msg}`);
	process.exit(1);
}

function pass(part: string, msg: string): void {
	console.log(`[smoke-047] ok   ${part}: ${msg}`);
}

// ---------------------------------------------------------------------------
// Guard: module must exist
// ---------------------------------------------------------------------------

if (!existsSync(SNAPSHOT_MODULE)) {
	fail("guard", `snapshot.ts not found at ${SNAPSHOT_MODULE} — implementation missing`);
}

// Dynamic import — will throw on RED (module missing), pass on GREEN
const { snapshotSession, listResumable } = (await import(SNAPSHOT_MODULE)) as {
	snapshotSession: (dataDir: string, entry: unknown) => Promise<void>;
	listResumable: (
		dataDir: string,
	) => Promise<Array<{ name: string; claudeResumeId: string | null; status: string }>>;
};

// ---------------------------------------------------------------------------
// Shared temp dir for this smoke run
// ---------------------------------------------------------------------------

const dataDir = mkdtempSync(join(tmpdir(), "smoke-047-"));
mkdirSync(dataDir, { recursive: true });

try {
	// ---------------------------------------------------------------------------
	// Part 1: snapshotSession writes registry.json with required fields
	// ---------------------------------------------------------------------------

	const entry1 = {
		name: "smoke-session-a",
		tabTitle: "Claude Code — smoke",
		cwd: "/tmp/smoke-pier",
		transcriptPath: "/tmp/smoke.jsonl",
		claudeResumeId: "smoke_resume_id_1",
		lastPrompt: "Initial smoke prompt",
		status: "active" as const,
		updatedAt: new Date(),
	};

	await snapshotSession(dataDir, entry1);

	const raw1 = await readFile(join(dataDir, "registry.json"), "utf-8");
	const parsed1 = JSON.parse(raw1) as Record<string, Record<string, unknown>>;
	const stored1 = parsed1["smoke-session-a"];

	if (!stored1) fail("Part 1", "registry.json missing 'smoke-session-a' entry");
	for (const field of [
		"name",
		"tabTitle",
		"cwd",
		"transcriptPath",
		"claudeResumeId",
		"lastPrompt",
		"status",
		"updatedAt",
	]) {
		if (!(field in stored1)) fail("Part 1", `registry entry missing required field: ${field}`);
	}
	if (stored1["name"] !== "smoke-session-a")
		fail("Part 1", `name mismatch: ${String(stored1["name"])}`);
	if (stored1["claudeResumeId"] !== "smoke_resume_id_1")
		fail("Part 1", "claudeResumeId not stored correctly");

	pass("Part 1", "registry.json written with all required fields");

	// ---------------------------------------------------------------------------
	// Part 2: Second call overwrites entry, other entries intact
	// ---------------------------------------------------------------------------

	const entryB = {
		name: "smoke-session-b",
		tabTitle: "Other session",
		cwd: "/tmp/other",
		transcriptPath: null,
		claudeResumeId: "smoke_resume_id_2",
		lastPrompt: "Other prompt",
		status: "crashed" as const,
		updatedAt: new Date(),
	};
	await snapshotSession(dataDir, entryB);

	const entry1Updated = { ...entry1, lastPrompt: "Updated prompt" };
	await snapshotSession(dataDir, entry1Updated);

	const raw2 = await readFile(join(dataDir, "registry.json"), "utf-8");
	const parsed2 = JSON.parse(raw2) as Record<string, Record<string, unknown>>;

	if (parsed2["smoke-session-a"]?.["lastPrompt"] !== "Updated prompt")
		fail("Part 2", "entry not updated on second call");
	if (!parsed2["smoke-session-b"]) fail("Part 2", "smoke-session-b was lost after upsert");
	if (Object.keys(parsed2).length !== 2)
		fail("Part 2", `expected 2 entries, got ${Object.keys(parsed2).length}`);

	pass("Part 2", "second call overwrites correctly, other entries preserved");

	// ---------------------------------------------------------------------------
	// Part 3: history.ndjson line count matches call count
	// ---------------------------------------------------------------------------

	// We've made 3 calls so far (entry1, entryB, entry1Updated)
	const histRaw = await readFile(join(dataDir, "history.ndjson"), "utf-8");
	const lines = histRaw.trim().split("\n").filter(Boolean);
	if (lines.length !== 3) fail("Part 3", `expected 3 history lines, got ${lines.length}`);

	for (const line of lines) {
		const obj = JSON.parse(line) as Record<string, unknown>;
		if (!obj["ts"]) fail("Part 3", `history line missing 'ts': ${line}`);
		if (!obj["name"]) fail("Part 3", `history line missing 'name': ${line}`);
	}

	pass("Part 3", `history.ndjson has ${lines.length} lines with ts+name`);

	// ---------------------------------------------------------------------------
	// Part 4: atomicity — tmp file absent after write
	// ---------------------------------------------------------------------------

	if (existsSync(join(dataDir, "registry.json.tmp"))) {
		fail("Part 4", "registry.json.tmp still exists after write — not atomic");
	}

	pass("Part 4", "registry.json.tmp absent — write is atomic");

	// ---------------------------------------------------------------------------
	// Part 5: listResumable returns active/crashed with non-null claudeResumeId
	// ---------------------------------------------------------------------------

	// Current registry: smoke-session-a (active, has resumeId), smoke-session-b (crashed, has resumeId)
	// Add an unknown-status and a null-resumeId session
	await snapshotSession(dataDir, {
		name: "smoke-session-c",
		tabTitle: "Unknown",
		cwd: "/tmp/c",
		transcriptPath: null,
		claudeResumeId: "id_c",
		lastPrompt: "noop",
		status: "unknown" as const,
		updatedAt: new Date(),
	});
	await snapshotSession(dataDir, {
		name: "smoke-session-d",
		tabTitle: "No resume",
		cwd: "/tmp/d",
		transcriptPath: null,
		claudeResumeId: null,
		lastPrompt: "noop",
		status: "active" as const,
		updatedAt: new Date(),
	});

	const resumable = await listResumable(dataDir);
	const resumableNames = resumable.map((e) => e.name).sort();

	if (!resumableNames.includes("smoke-session-a"))
		fail("Part 5", "smoke-session-a (active, has resumeId) not in listResumable result");
	if (!resumableNames.includes("smoke-session-b"))
		fail("Part 5", "smoke-session-b (crashed, has resumeId) not in listResumable result");
	if (resumableNames.includes("smoke-session-c"))
		fail("Part 5", "smoke-session-c (unknown status) should NOT be resumable");
	if (resumableNames.includes("smoke-session-d"))
		fail("Part 5", "smoke-session-d (null claudeResumeId) should NOT be resumable");

	pass(
		"Part 5",
		`listResumable returned ${resumable.length} correct sessions: ${resumableNames.join(", ")}`,
	);

	// ---------------------------------------------------------------------------
	// Part 6: listResumable on missing registry returns empty array
	// ---------------------------------------------------------------------------

	const emptyDir = mkdtempSync(join(tmpdir(), "smoke-047-empty-"));
	try {
		const result = await listResumable(emptyDir);
		if (!Array.isArray(result) || result.length !== 0) {
			fail("Part 6", `expected [], got ${JSON.stringify(result)}`);
		}
	} finally {
		rmSync(emptyDir, { recursive: true, force: true });
	}

	pass("Part 6", "listResumable returns [] on missing registry");

	// ---------------------------------------------------------------------------
	// Part 7: unit tests pass
	// ---------------------------------------------------------------------------

	const testPath = join(ROOT, "apps/backend/src/features/sessions/snapshot.test.ts");
	const proc = Bun.spawn(["bun", "test", testPath], {
		stdout: "inherit",
		stderr: "inherit",
		cwd: ROOT,
	});
	const exitCode = await proc.exited;
	if (exitCode !== 0) {
		fail("Part 7", "bun test on snapshot.test.ts exited non-zero");
	}

	pass("Part 7", "snapshot.test.ts passes");

	// ---------------------------------------------------------------------------
	// All checks passed
	// ---------------------------------------------------------------------------
	console.log("[smoke-047] PASS — all Zellij session snapshot registry contracts verified");
	process.exit(0);
} finally {
	rmSync(dataDir, { recursive: true, force: true });
}
