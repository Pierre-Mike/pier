/**
 * Gate: slice 3 — ensureZellijWeb daemon-guard + stale-upstream cleanup
 *
 * AC7 (stale upstream): Option A — import the proxy's activeBridges registry
 * (slice-1 surface) and assert that when a second downstream WS opens for the
 * same sessionId the previous upstream's close() is called exactly once before
 * the new upstream is installed. Cross-module but the assertion lives in this
 * writable file; the frozen zellij-ws-proxy.test.ts is not touched.
 *
 * AC8 (daemon-guard): ensureZellijWeb must accept injected { probe, spawn }
 * deps so tests assert spawn counts without invoking the real zellij binary.
 * Three sub-cases:
 *   (i)  probe returns true  → spawn never called
 *   (ii) probe returns false → spawn called exactly once
 *   (iii) two concurrent ensureZellijWeb calls → spawn called at most once
 *
 * RED: neither the injectable deps surface on ensureZellijWeb nor the
 * stale-upstream cleanup in the proxy exist yet.
 */

import { beforeEach, describe, expect, it } from "bun:test";
import type { ServerWebSocket } from "bun";
import { __resetZellijAuthForTests, ensureZellijWeb } from "./zellij-auth.ts";
import {
	activeBridges,
	bridgeLog,
	type ZellijWsBridge,
	zellijWsHandlers,
} from "./zellij-ws-proxy.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const noop = (): void => void 0;

const makeFakeUpstream = (): WebSocket & { closeSpy: { callCount: number } } => {
	const closeSpy = { callCount: 0 };
	const ws = {
		readyState: WebSocket.OPEN,
		binaryType: "arraybuffer",
		send: noop,
		close() {
			closeSpy.callCount++;
		},
		onopen: null,
		onmessage: null,
		onclose: null,
		onerror: null,
		closeSpy,
	};
	return ws as unknown as WebSocket & { closeSpy: { callCount: number } };
};

const makeFakeWs = (overrides: Partial<ZellijWsBridge> = {}): ServerWebSocket<ZellijWsBridge> =>
	({
		data: {
			cookie: "test-cookie",
			targetUrl: "ws://localhost:9999/",
			upstream: null,
			upBuffer: [],
			sessionId: "proj-abc",
			...overrides,
		},
		send: () => 0,
		close: noop,
		subscribe: noop,
		unsubscribe: noop,
		publish: () => 0,
		isSubscribed: () => false,
		cork: (fn: () => void) => fn(),
		remoteAddress: "127.0.0.1",
		readyState: WebSocket.OPEN,
		binaryType: "arraybuffer",
	}) as unknown as ServerWebSocket<ZellijWsBridge>;

// ---------------------------------------------------------------------------
// AC8 — ensureZellijWeb injectable deps
// ---------------------------------------------------------------------------

/**
 * The injected-deps overload of ensureZellijWeb that the implementer must add.
 * Signature contract (slice-3 implementer target):
 *
 *   ensureZellijWeb(
 *     zellijUrl: string,
 *     deps?: { probe: (url: string) => Promise<boolean>; spawn: (url: string) => Promise<void> }
 *   ): Promise<void>
 *
 * When deps is provided the function must use deps.probe and deps.spawn
 * instead of the real network/process calls.
 */

describe("ensureZellijWeb — injectable deps guard", () => {
	beforeEach(() => {
		// Clear the inflightSpawn map so a leaked entry from another test
		// (e.g. ws-proxy tests that exercise the real defaultSpawn path)
		// doesn't shadow the injected spawn fn here.
		__resetZellijAuthForTests();
	});

	it("(i) does NOT spawn when probe returns true", async () => {
		let spawnCount = 0;

		await ensureZellijWeb("http://localhost:9999", {
			probe: async (_url: string) => true,
			spawn: async (_url: string) => {
				spawnCount++;
			},
		});

		expect(spawnCount).toBe(0);
	});

	it("(ii) spawns exactly once when probe returns false", async () => {
		let spawnCount = 0;

		await ensureZellijWeb("http://localhost:9999", {
			probe: async (_url: string) => false,
			spawn: async (_url: string) => {
				spawnCount++;
			},
		});

		expect(spawnCount).toBe(1);
	});

	it("(iii) concurrent callers spawn at most once — no double-spawn race", async () => {
		let spawnCount = 0;
		// Both callers see probe=false; only one spawn must be issued.
		const concurrentSpawn = async (_url: string): Promise<void> => {
			// Introduce a tiny async gap to expose races.
			await new Promise<void>((r) => setTimeout(r, 0));
			spawnCount++;
		};

		await Promise.all([
			ensureZellijWeb("http://localhost:9999", {
				probe: async (_url: string) => false,
				spawn: concurrentSpawn,
			}),
			ensureZellijWeb("http://localhost:9999", {
				probe: async (_url: string) => false,
				spawn: concurrentSpawn,
			}),
		]);

		expect(spawnCount).toBeLessThanOrEqual(1);
	});

	it("alternating probe: first caller skips spawn, second spawns once", async () => {
		// probe returns true on first call, false on second — ensures we're not
		// relying on a hardcoded always-true or always-false path.
		let probeCallCount = 0;
		let spawnCount = 0;

		// First call — probe=true, no spawn.
		await ensureZellijWeb("http://localhost:9999", {
			probe: async (_url: string) => {
				probeCallCount++;
				return true;
			},
			spawn: async (_url: string) => {
				spawnCount++;
			},
		});
		expect(spawnCount).toBe(0);

		// Second call — probe=false, spawn once.
		await ensureZellijWeb("http://localhost:9999", {
			probe: async (_url: string) => {
				probeCallCount++;
				return false;
			},
			spawn: async (_url: string) => {
				spawnCount++;
			},
		});
		expect(spawnCount).toBe(1);
		expect(probeCallCount).toBe(2);
	});
});

// ---------------------------------------------------------------------------
// AC7 — stale upstream cleanup on duplicate downstream connect (Option A)
// ---------------------------------------------------------------------------

/**
 * When a second downstream WS opens for the SAME sessionId, the proxy must:
 *   1. Call close() on the previous upstream exactly once.
 *   2. Register the new bridge in activeBridges (the new ws becomes the entry).
 *
 * Implementation contract: zellijWsHandlers.open must detect an existing entry
 * in activeBridges for the same sessionId and call upstream.close() on the
 * stale entry before installing the new upstream. The emitted bridge:close
 * event for the stale bridge must carry a reason that indicates replacement
 * (e.g. "stale-replaced") so the two close causes are distinguished.
 */

describe("zellijWsHandlers.open — stale upstream cleanup", () => {
	beforeEach(() => {
		// Clear activeBridges between tests so state does not leak.
		activeBridges.clear();
	});

	it("closes the previous upstream when a duplicate sessionId connects", () => {
		const staleUpstream = makeFakeUpstream();
		const sessionId = "proj-duplicate";

		// First downstream: open with a real upstream attached.
		const OrigWS = globalThis.WebSocket;
		(globalThis as unknown as Record<string, unknown>)["WebSocket"] = function FakeWS1() {
			return staleUpstream;
		};
		const ws1 = makeFakeWs({ sessionId, upstream: null });
		try {
			zellijWsHandlers.open(ws1);
		} finally {
			globalThis.WebSocket = OrigWS;
		}

		expect(staleUpstream.closeSpy.callCount).toBe(0); // not yet closed

		// Second downstream for the same sessionId.
		const newUpstream = makeFakeUpstream();
		(globalThis as unknown as Record<string, unknown>)["WebSocket"] = function FakeWS2() {
			return newUpstream;
		};
		const ws2 = makeFakeWs({ sessionId, upstream: null });
		try {
			zellijWsHandlers.open(ws2);
		} finally {
			globalThis.WebSocket = OrigWS;
		}

		// The stale upstream must have been closed exactly once.
		expect(staleUpstream.closeSpy.callCount).toBe(1);
	});

	it("activeBridges holds the NEW downstream after replacement", () => {
		const sessionId = "proj-replace";
		const OrigWS = globalThis.WebSocket;

		// Open first bridge.
		(globalThis as unknown as Record<string, unknown>)["WebSocket"] = function FakeWS() {
			return makeFakeUpstream();
		};
		const ws1 = makeFakeWs({ sessionId, upstream: null });
		try {
			zellijWsHandlers.open(ws1);
		} finally {
			globalThis.WebSocket = OrigWS;
		}

		// Open second bridge for same sessionId.
		(globalThis as unknown as Record<string, unknown>)["WebSocket"] = function FakeWS() {
			return makeFakeUpstream();
		};
		const ws2 = makeFakeWs({ sessionId, upstream: null });
		try {
			zellijWsHandlers.open(ws2);
		} finally {
			globalThis.WebSocket = OrigWS;
		}

		// activeBridges must reference ws2 (the replacement), not ws1.
		expect(activeBridges.get(sessionId)).toBe(ws2);
	});

	it("stale close reason is distinct from normal downstream-close reason", () => {
		const collected: Array<{ kind: string; reason?: string }> = [];
		bridgeLog.subscribe((evt) => collected.push(evt));

		const sessionId = "proj-reason-check";
		const OrigWS = globalThis.WebSocket;

		// Open first bridge.
		(globalThis as unknown as Record<string, unknown>)["WebSocket"] = function FakeWS() {
			return makeFakeUpstream();
		};
		const ws1 = makeFakeWs({ sessionId, upstream: null });
		try {
			zellijWsHandlers.open(ws1);
		} finally {
			globalThis.WebSocket = OrigWS;
		}

		// Capture the normal downstream-close reason.
		const ws1Normal = makeFakeWs({ sessionId: "proj-normal", upstream: null });
		zellijWsHandlers.close(ws1Normal);
		const normalCloseEvt = collected.find((e) => e.kind === "bridge:close" && !("stale" in e));
		const normalReason = normalCloseEvt?.reason;

		collected.length = 0;

		// Open second bridge to trigger stale-replacement close for ws1.
		(globalThis as unknown as Record<string, unknown>)["WebSocket"] = function FakeWS() {
			return makeFakeUpstream();
		};
		const ws2 = makeFakeWs({ sessionId, upstream: null });
		try {
			zellijWsHandlers.open(ws2);
		} finally {
			globalThis.WebSocket = OrigWS;
		}

		const staleEvt = collected.find((e) => e.kind === "bridge:close");
		expect(staleEvt).toBeDefined();
		// Must carry a reason; must be distinct from the normal downstream-close reason.
		expect(staleEvt?.reason).toBeDefined();
		expect(staleEvt?.reason).not.toBe(normalReason);
	});
});
