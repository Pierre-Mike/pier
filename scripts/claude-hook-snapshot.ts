#!/usr/bin/env bun
/**
 * Claude Code Stop / Notification hook → snapshot persistence.
 *
 * Registered by .claude/settings.json. Reads one hook event from stdin,
 * builds a SnapshotEntry, and writes it to the pier snapshots dir.
 *
 * Fail-safe: this script MUST exit 0 on any failure path. A non-zero exit
 * is interpreted by Claude Code as "hook blocked," which would interrupt
 * the user's session. We log failures to stderr (visible in Claude's
 * transcript) but never propagate them as a block.
 *
 * Snapshot dir resolution:
 *   1. $PIER_SNAPSHOT_DIR if set
 *   2. <repo>/data/snapshots if run from a pier checkout
 *   3. ~/.local/share/pier/snapshots otherwise
 */

import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

import {
	type HookPayload,
	persistHookSnapshot,
} from "../apps/backend/src/features/sessions/hook-snapshot.ts";

function resolveSnapshotDir(): string {
	const fromEnv = process.env["PIER_SNAPSHOT_DIR"];
	if (fromEnv && fromEnv.length > 0) return fromEnv;

	// Walk up from this script looking for a `data/` sibling (pier checkout)
	let dir = resolve(import.meta.dir);
	for (let i = 0; i < 6; i++) {
		if (existsSync(join(dir, "data"))) return join(dir, "data", "snapshots");
		const parent = dirname(dir);
		if (parent === dir) break;
		dir = parent;
	}

	return join(homedir(), ".local", "share", "pier", "snapshots");
}

async function main(): Promise<void> {
	const raw = await Bun.stdin.text();
	if (!raw.trim()) return;

	let payload: HookPayload;
	try {
		payload = JSON.parse(raw) as HookPayload;
	} catch (err) {
		console.error(`[pier-snapshot-hook] malformed JSON: ${(err as Error).message}`);
		return;
	}

	const dataDir = resolveSnapshotDir();
	mkdirSync(dataDir, { recursive: true });

	const result = await persistHookSnapshot({
		payload,
		env: {
			ZELLIJ_SESSION_NAME: process.env["ZELLIJ_SESSION_NAME"],
			ZELLIJ: process.env["ZELLIJ"],
			ZELLIJ_PANE_ID: process.env["ZELLIJ_PANE_ID"],
		},
		dataDir,
	});
	if (!result.ok) {
		console.error(`[pier-snapshot-hook] persist failed: ${result.error}`);
	}
}

await main().catch((err) => {
	console.error(`[pier-snapshot-hook] uncaught: ${(err as Error).message}`);
});

process.exit(0);
