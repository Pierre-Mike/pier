#!/usr/bin/env bun
/**
 * pier-snapshot — CLI / orchestrator entry point.
 *
 * Subcommands:
 *   now              — discover live zellij sessions and persist a snapshot
 *   list             — print resumable sessions from the registry
 *   restore <name>   — recreate the zellij session and inject `claude --resume`
 *
 * Never kills any process. Restore on a live session is a no-op for the
 * spawn step (zellij --session attaches when the socket exists) and re-injects
 * the resume command.
 *
 * Snapshot dir resolution mirrors scripts/claude-hook-snapshot.ts:
 *   1. $PIER_SNAPSHOT_DIR
 *   2. <repo>/data/snapshots
 *   3. ~/.local/share/pier/snapshots
 */

import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

import {
	defaultSpawner,
	executeRestore,
	listSnapshots,
	type SpawnOnly,
	snapshotNow,
} from "../apps/backend/src/features/sessions/cli-snapshot.ts";

const ZELLIJ_ROOT = process.env["ZELLIJ_SOCKET_DIR"] ?? "/var/z";

function resolveSnapshotDir(): string {
	const fromEnv = process.env["PIER_SNAPSHOT_DIR"];
	if (fromEnv && fromEnv.length > 0) return fromEnv;

	let dir = resolve(import.meta.dir);
	for (let i = 0; i < 6; i++) {
		if (existsSync(join(dir, "data"))) return join(dir, "data", "snapshots");
		const parent = dirname(dir);
		if (parent === dir) break;
		dir = parent;
	}
	return join(homedir(), ".local", "share", "pier", "snapshots");
}

const spawn: SpawnOnly = async (cmd) => {
	const proc = Bun.spawn([...cmd], {
		env: { ...process.env, ZELLIJ_SOCKET_DIR: ZELLIJ_ROOT },
		stdout: "pipe",
		stderr: "pipe",
	});
	const exitCode = await proc.exited;
	return { exitCode };
};

function usage(): never {
	console.error("usage: pier-snapshot <now|list|restore <name>>");
	process.exit(2);
}

async function main(): Promise<number> {
	const args = process.argv.slice(2);
	const sub = args[0];
	const dataDir = resolveSnapshotDir();
	mkdirSync(dataDir, { recursive: true });

	if (sub === "now") {
		const entries = await snapshotNow({
			dataDir,
			zellijRoot: ZELLIJ_ROOT,
			spawner: defaultSpawner,
		});
		console.log(`snapshot ${entries.length} session(s) → ${dataDir}/registry.json`);
		for (const e of entries) {
			console.log(`  ${e.name.padEnd(24)} ${e.status} tab=${e.tabTitle ?? "-"}`);
		}
		return 0;
	}

	if (sub === "list") {
		const all = args.slice(1).includes("--all");
		const { lines } = await listSnapshots(dataDir, { all });
		if (lines.length === 0) {
			console.log(all ? "(registry empty)" : "(no resumable sessions in registry)");
			return 0;
		}
		for (const line of lines) console.log(line);
		return 0;
	}

	if (sub === "restore") {
		const name = args[1];
		if (!name) usage();
		const plan = await executeRestore({
			dataDir,
			sessionName: name,
			spawn,
			zellijRoot: ZELLIJ_ROOT,
			onWarn: (msg) => console.warn(`warning: ${msg}`),
		});
		if (plan.kind === "not-found") {
			console.error(`restore: session "${name}" not found in registry`);
			return 1;
		}
		console.log(`restored: ${plan.entry.name}`);
		if (plan.entry.claudeResumeId) {
			console.log(`  injected: claude --resume ${plan.entry.claudeResumeId}`);
		}
		return 0;
	}

	usage();
}

const code = await main().catch((err) => {
	console.error(`pier-snapshot failed: ${(err as Error).message}`);
	return 1;
});
process.exit(code);
