/**
 * Unit tests for getZellijReadOnlyToken() — slice 1 gate (RED).
 *
 * The function does not exist yet; every test below will fail until the
 * spec-implementer adds `getZellijReadOnlyToken` to zellij-auth.ts.
 *
 * Test strategy:
 *   - mock.module replaces node:fs/promises so no real disk I/O occurs.
 *   - Bun.spawn is replaced with a stub via Object.defineProperty so no
 *     real `zellij` binary is required.
 *   - __resetZellijAuthForTests() is called in beforeEach to clear module
 *     state between cases.
 */
import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

// --- fs/promises mock setup ------------------------------------------------
// We intercept readFile / writeFile / mkdir at the module level so the real
// implementation never touches disk during tests.

let mockReadFileImpl: (path: string, enc: string) => Promise<string> = () =>
	Promise.reject(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));
let mockWriteFileCalls: Array<{ path: string; content: string; mode: number }> = [];

type WriteFileArgs = { path: string; content: string; opts: { mode: number } };
const mockWriteFile = ({ path, content, opts }: WriteFileArgs): Promise<void> => {
	mockWriteFileCalls.push({ path, content, mode: opts.mode });
	return Promise.resolve();
};

mock.module("node:fs/promises", () => ({
	readFile: (path: string, enc: string) => mockReadFileImpl(path, enc),
	// biome-ignore lint/complexity/useMaxParams: mirrors node:fs/promises writeFile signature
	writeFile: (path: string, content: string, opts: { mode: number }) =>
		mockWriteFile({ path, content, opts }),
	mkdir: (_path: string, _opts: unknown) => Promise.resolve(undefined),
}));

// --- subject import (after mock.module registration) ----------------------
// We import the full module namespace. getZellijReadOnlyToken is the symbol
// under test; it does NOT exist yet — accessing it yields `undefined` at
// runtime, causing each assertion below to fail (RED).
import * as ZellijAuth from "./zellij-auth.ts";

// Narrow alias — intentionally typed as `unknown` so TypeScript accepts the
// absent export without `any`.  The `expect(typeof fn).toBe("function")`
// guards below surface the missing export as a test failure, not a type error.
const getZellijReadOnlyToken: unknown = (ZellijAuth as Record<string, unknown>)[
	"getZellijReadOnlyToken"
];

// --- Bun.spawn stub -------------------------------------------------------
type SpawnStub = {
	stdout: ReadableStream<Uint8Array>;
	stderr: ReadableStream<Uint8Array>;
	exited: Promise<number>;
};

type SpawnImpl = (cmd: string[], opts: unknown) => SpawnStub;

const originalSpawn = Bun.spawn.bind(Bun);

const patchSpawn = (impl: SpawnImpl): void => {
	// biome-ignore lint/suspicious/noExplicitAny: test-only stub
	(Bun as any).spawn = impl;
};
const restoreSpawn = (): void => {
	// biome-ignore lint/suspicious/noExplicitAny: test-only restore
	(Bun as any).spawn = originalSpawn;
};

const makeTokenStream = (text: string): ReadableStream<Uint8Array> => {
	const enc = new TextEncoder();
	return new ReadableStream({
		start(controller) {
			controller.enqueue(enc.encode(text));
			controller.close();
		},
	});
};

const makeSpawnOk = (stdout: string): SpawnStub => ({
	stdout: makeTokenStream(stdout),
	stderr: makeTokenStream(""),
	exited: Promise.resolve(0),
});

// --------------------------------------------------------------------------

beforeEach(() => {
	// reset disk mock — no file present by default
	mockReadFileImpl = () => Promise.reject(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));
	mockWriteFileCalls = [];
	restoreSpawn();
	ZellijAuth.__resetZellijAuthForTests();
});

afterEach(() => {
	restoreSpawn();
	ZellijAuth.__resetZellijAuthForTests();
});

// --------------------------------------------------------------------------
// AC-1: reads from disk when the file is present.
// --------------------------------------------------------------------------
describe("getZellijReadOnlyToken — reads from disk when file is present", () => {
	it("returns the token stored in ~/.config/pier/zellij-readonly-token", async () => {
		expect(typeof getZellijReadOnlyToken).toBe("function");

		const storedToken = "ro_tok_abc123";
		mockReadFileImpl = (path: string) => {
			if (path.endsWith("zellij-readonly-token")) return Promise.resolve(`${storedToken}\n`);
			return Promise.reject(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));
		};

		const fn = getZellijReadOnlyToken as () => Promise<string>;
		const result = await fn();
		expect(result).toBe(storedToken);
	});
});

// --------------------------------------------------------------------------
// AC-2: mints via CLI when no file exists.
// --------------------------------------------------------------------------
describe("getZellijReadOnlyToken — mints via CLI when no file exists", () => {
	it("calls `zellij web --create-read-only-token` and returns the parsed token", async () => {
		expect(typeof getZellijReadOnlyToken).toBe("function");

		const mintedToken = "ro_tok_minted999";
		patchSpawn(
			// biome-ignore lint/suspicious/noExplicitAny: test-only
			(_cmd: string[], _opts: any) => makeSpawnOk(`token_0:  ${mintedToken}\n`),
		);

		const fn = getZellijReadOnlyToken as () => Promise<string>;
		const result = await fn();
		expect(result).toBe(mintedToken);
	});

	it("passes --create-read-only-token (not --create-token) to zellij", async () => {
		expect(typeof getZellijReadOnlyToken).toBe("function");

		const seenArgs: string[][] = [];
		patchSpawn(
			// biome-ignore lint/suspicious/noExplicitAny: test-only
			(cmd: string[], _opts: any) => {
				seenArgs.push(cmd);
				return makeSpawnOk("token_0:  ro_tok_flag_check\n");
			},
		);

		const fn = getZellijReadOnlyToken as () => Promise<string>;
		await fn();
		expect(seenArgs[0]).toContain("--create-read-only-token");
		expect(seenArgs[0]).not.toContain("--create-token");
	});
});

// --------------------------------------------------------------------------
// AC-3: caches across calls — only one in-flight mint.
// --------------------------------------------------------------------------
describe("getZellijReadOnlyToken — caches across concurrent calls", () => {
	it("returns the same token on subsequent calls without re-minting", async () => {
		expect(typeof getZellijReadOnlyToken).toBe("function");

		let spawnCount = 0;
		patchSpawn(
			// biome-ignore lint/suspicious/noExplicitAny: test-only
			(_cmd: string[], _opts: any) => {
				spawnCount++;
				return makeSpawnOk("token_0:  ro_tok_cached\n");
			},
		);

		const fn = getZellijReadOnlyToken as () => Promise<string>;
		const [a, b, c] = await Promise.all([fn(), fn(), fn()]);
		expect(a).toBe("ro_tok_cached");
		expect(b).toBe("ro_tok_cached");
		expect(c).toBe("ro_tok_cached");
		// Only one mint despite three concurrent callers.
		expect(spawnCount).toBe(1);
	});

	it("returns cached value on second sequential call without spawning", async () => {
		expect(typeof getZellijReadOnlyToken).toBe("function");

		let spawnCount = 0;
		patchSpawn(
			// biome-ignore lint/suspicious/noExplicitAny: test-only
			(_cmd: string[], _opts: any) => {
				spawnCount++;
				return makeSpawnOk("token_0:  ro_tok_seq\n");
			},
		);

		const fn = getZellijReadOnlyToken as () => Promise<string>;
		await fn();
		await fn();
		expect(spawnCount).toBe(1);
	});
});

// --------------------------------------------------------------------------
// AC-4: token file is written with mode 0600.
// --------------------------------------------------------------------------
describe("getZellijReadOnlyToken — writes token file with mode 0600", () => {
	it("persists the minted token with octal 0o600 permissions", async () => {
		expect(typeof getZellijReadOnlyToken).toBe("function");

		patchSpawn(
			// biome-ignore lint/suspicious/noExplicitAny: test-only
			(_cmd: string[], _opts: any) => makeSpawnOk("token_0:  ro_tok_mode\n"),
		);

		const fn = getZellijReadOnlyToken as () => Promise<string>;
		await fn();

		const write = mockWriteFileCalls.find((c) => c.path.endsWith("zellij-readonly-token"));
		expect(write).toBeDefined();
		expect(write?.mode).toBe(0o600);
	});
});

// --------------------------------------------------------------------------
// AC-5: separate cache + separate disk path from getZellijToken().
// --------------------------------------------------------------------------
describe("getZellijReadOnlyToken — separate cache and disk path from getZellijToken", () => {
	it("reads from zellij-readonly-token, not zellij-token", async () => {
		expect(typeof getZellijReadOnlyToken).toBe("function");

		const readPaths: string[] = [];
		mockReadFileImpl = (path: string) => {
			readPaths.push(path);
			return Promise.reject(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));
		};
		patchSpawn(
			// biome-ignore lint/suspicious/noExplicitAny: test-only
			(_cmd: string[], _opts: any) => makeSpawnOk("token_0:  ro_tok_path\n"),
		);

		const fn = getZellijReadOnlyToken as () => Promise<string>;
		await fn();

		const roPath = readPaths.find((p) => p.endsWith("zellij-readonly-token"));
		const rwPath = readPaths.find(
			(p) => p.endsWith("zellij-token") && !p.endsWith("zellij-readonly-token"),
		);
		expect(roPath).toBeDefined();
		expect(rwPath).toBeUndefined();
	});

	it("resetting module state does not bleed between getZellijToken and getZellijReadOnlyToken caches", async () => {
		expect(typeof getZellijReadOnlyToken).toBe("function");

		// Seed a disk token for the RW path.
		mockReadFileImpl = (path: string) => {
			if (path.endsWith("zellij-token") && !path.endsWith("zellij-readonly-token"))
				return Promise.resolve("rw_tok_existing\n");
			if (path.endsWith("zellij-readonly-token")) return Promise.resolve("ro_tok_existing\n");
			return Promise.reject(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));
		};

		const roFn = getZellijReadOnlyToken as () => Promise<string>;
		const roResult = await roFn();
		const rwResult = await ZellijAuth.getZellijToken();

		expect(roResult).toBe("ro_tok_existing");
		expect(rwResult).toBe("rw_tok_existing");
		// Tokens must differ — separate caches, separate disk paths.
		expect(roResult).not.toBe(rwResult);
	});
});
