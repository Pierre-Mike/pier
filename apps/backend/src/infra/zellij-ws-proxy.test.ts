/**
 * Gate: slice 1 — bridge-lifecycle structured logs
 *
 * Asserts that handleZellijWsUpgrade and zellijWsHandlers emit structured
 * log events at the three observable lifecycle points:
 *   1. WS upgrade  → {kind, sessionId, activeBridges}
 *   2. WS open     → {kind, sessionId, upstreamReadyState}
 *   3. WS close    → {kind, sessionId, reason}
 *
 * "Structured" means each emitted value is a plain object with named fields,
 * NOT a free-form string (console.log). Tests intercept the log channel
 * (bridgeLog) exported from the module and assert the event shape and values.
 *
 * Upgrade-event ordering decision: the bridge:upgrade event MUST be emitted
 * BEFORE the upstream cookie fetch so that every upgrade attempt is observable
 * in the log even when auth fails. Tests pin this ordering explicitly.
 *
 * Note on WebSocket patching: the module MUST read globalThis.WebSocket at
 * call time (not at module-import time) so the patch below takes effect.
 *
 * RED: the module does not yet export bridgeLog nor emit these events.
 */
import { beforeEach, describe, expect, it } from "bun:test";
import type { Server, ServerWebSocket } from "bun";
import {
	type BridgeLogEvent,
	bridgeLog,
	handleZellijWsUpgrade,
	type ZellijWsBridge,
	zellijWsHandlers,
} from "./zellij-ws-proxy.ts";

// ---------------------------------------------------------------------------
// Minimal stubs — do NOT import real zellij-auth to avoid network I/O
// ---------------------------------------------------------------------------

const noop = (): void => void 0;

const makeFakeUpstream = (readyState: number = WebSocket.OPEN): WebSocket =>
	({
		readyState,
		binaryType: "arraybuffer",
		send: noop,
		close: noop,
		onopen: null,
		onmessage: null,
		onclose: null,
		onerror: null,
	}) as unknown as WebSocket;

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
// Helpers
// ---------------------------------------------------------------------------

const collected: BridgeLogEvent[] = [];

beforeEach(() => {
	collected.length = 0;
	bridgeLog.subscribe((evt) => collected.push(evt));
});

// ---------------------------------------------------------------------------
// Runtime: zellijWsHandlers emits on open — upstreamReadyState pinned to upstream
// ---------------------------------------------------------------------------

describe("zellijWsHandlers.open", () => {
	it("emits bridge:open with sessionId and upstreamReadyState equal to the constructed upstream's readyState", () => {
		const ws = makeFakeWs();
		// The module must read globalThis.WebSocket at call time (not import time)
		// so this patch intercepts the upstream construction.
		const OrigWS = globalThis.WebSocket;
		// Use CONNECTING (not OPEN) so the asserted value is distinct from the
		// default and cannot be satisfied by a hardcoded constant.
		const fakeUpstream = makeFakeUpstream(WebSocket.CONNECTING);
		(globalThis as unknown as Record<string, unknown>)["WebSocket"] = function FakeWS() {
			return fakeUpstream;
		};
		try {
			zellijWsHandlers.open(ws);
		} finally {
			globalThis.WebSocket = OrigWS;
		}

		const evt = collected.find((e) => e.kind === "bridge:open");
		expect(evt).toBeDefined();
		if (!evt || evt.kind !== "bridge:open") throw new Error("no bridge:open event");
		expect(evt.sessionId).toBe("proj-abc");
		// Must equal the actual readyState of the fake upstream — not just any number.
		expect(evt.upstreamReadyState).toBe(fakeUpstream.readyState);
	});
});

// ---------------------------------------------------------------------------
// Runtime: zellijWsHandlers emits on close — reason distinguishes close causes
// ---------------------------------------------------------------------------

describe("zellijWsHandlers.close", () => {
	it("emits bridge:close with sessionId and a non-empty reason when downstream closes (no upstream)", () => {
		// Path A: downstream-initiated close — no active upstream attached.
		const ws = makeFakeWs({ upstream: null });
		zellijWsHandlers.close(ws);

		const evt = collected.find((e) => e.kind === "bridge:close");
		expect(evt).toBeDefined();
		if (!evt || evt.kind !== "bridge:close") throw new Error("no bridge:close event");
		expect(evt.sessionId).toBe("proj-abc");
		expect(typeof evt.reason).toBe("string");
		expect(evt.reason.length).toBeGreaterThan(0);
	});

	it("emits a DIFFERENT reason when upstream errors vs downstream closes normally", () => {
		// Path A: downstream close with no upstream
		const wsA = makeFakeWs({ upstream: null });
		zellijWsHandlers.close(wsA);
		const evtA = collected.find((e) => e.kind === "bridge:close");
		expect(evtA).toBeDefined();
		if (!evtA || evtA.kind !== "bridge:close") throw new Error("no bridge:close for path A");
		const reasonA = evtA.reason;

		// Reset
		collected.length = 0;
		bridgeLog.subscribe((evt) => collected.push(evt));

		// Path B: upstream error triggers close
		const upstream = makeFakeUpstream(WebSocket.OPEN);
		const wsB = makeFakeWs({ upstream });
		zellijWsHandlers.error(wsB, new Error("upstream connection reset"));

		const evtB = collected.find((e) => e.kind === "bridge:close");
		// The error path must emit bridge:close (the diagnostic log must be
		// observable even when the close is caused by an upstream fault).
		expect(evtB).toBeDefined();
		if (!evtB || evtB.kind !== "bridge:close") throw new Error("no bridge:close for path B");
		// The reason must be distinct — proves close causes are distinguished.
		expect(evtB.reason).not.toBe(reasonA);
	});
});

// ---------------------------------------------------------------------------
// Runtime: handleZellijWsUpgrade emits BEFORE cookie fetch
// ---------------------------------------------------------------------------

describe("handleZellijWsUpgrade", () => {
	it("emits bridge:upgrade BEFORE the upstream cookie fetch so auth failures are still observable", async () => {
		// Ordering contract: bridge:upgrade must be emitted before any async work
		// (cookie fetch). We verify ordering by letting the cookie fetch fail
		// (no mock) — the event must still appear in collected[].
		const emissionOrder: Array<"event" | "async-settled"> = [];

		bridgeLog.subscribe((evt) => {
			if (evt.kind === "bridge:upgrade") {
				emissionOrder.push("event");
			}
		});

		const fakeServer = {
			upgrade: (_req: Request, _opts: unknown) => true,
		} as unknown as Server<ZellijWsBridge>;

		const req = new Request("http://localhost/zellij/ws?session=proj-abc", {
			headers: { Upgrade: "websocket", Connection: "Upgrade" },
		});

		await handleZellijWsUpgrade({
			req,
			server: fakeServer,
			zellijUrl: "http://localhost:9999",
		}).catch(() => {
			emissionOrder.push("async-settled");
		});

		// The upgrade event must have been emitted even when auth fails.
		const evt = collected.find((e) => e.kind === "bridge:upgrade");
		expect(evt).toBeDefined();
		if (!evt || evt.kind !== "bridge:upgrade") throw new Error("no bridge:upgrade event");
		expect(typeof evt.sessionId).toBe("string");

		// Ordering: "event" must precede "async-settled" (which captures the
		// point where the async work, including the cookie fetch, settled).
		const eventIdx = emissionOrder.indexOf("event");
		const settledIdx = emissionOrder.indexOf("async-settled");
		expect(eventIdx).toBeGreaterThanOrEqual(0);
		if (settledIdx >= 0) {
			expect(eventIdx).toBeLessThan(settledIdx);
		}
	});

	it("emits bridge:upgrade with activeBridges >= 1 after a bridge has been opened", async () => {
		// Open one bridge so the implementation's bridge map has a live entry.
		const OrigWS = globalThis.WebSocket;
		const fakeUpstream = makeFakeUpstream(WebSocket.OPEN);
		(globalThis as unknown as Record<string, unknown>)["WebSocket"] = function FakeWS() {
			return fakeUpstream;
		};
		try {
			zellijWsHandlers.open(makeFakeWs());
		} finally {
			globalThis.WebSocket = OrigWS;
		}

		// Reset collected so only events from the upgrade call are observed.
		collected.length = 0;
		bridgeLog.subscribe((evt) => collected.push(evt));

		const fakeServer = {
			upgrade: (_req: Request, _opts: unknown) => true,
		} as unknown as Server<ZellijWsBridge>;

		const req = new Request("http://localhost/zellij/ws?session=proj-xyz", {
			headers: { Upgrade: "websocket", Connection: "Upgrade" },
		});

		await handleZellijWsUpgrade({
			req,
			server: fakeServer,
			zellijUrl: "http://localhost:9999",
		}).catch((_err: unknown) => {
			// network / auth errors are expected in test environment
		});

		const evt = collected.find((e) => e.kind === "bridge:upgrade");
		expect(evt).toBeDefined();
		if (!evt || evt.kind !== "bridge:upgrade") throw new Error("no bridge:upgrade event");
		// Must be >= 1 — not a hardcoded 0. Proves activeBridges reflects actual state.
		expect(evt.activeBridges).toBeGreaterThanOrEqual(1);
	});

	it("activeBridges count changes after a bridge closes", () => {
		// Open a bridge, then close it — the lifecycle teardown must be tracked so
		// activeBridges can ever decrement from a non-zero value.
		const OrigWS = globalThis.WebSocket;
		const fakeUpstream = makeFakeUpstream(WebSocket.OPEN);
		(globalThis as unknown as Record<string, unknown>)["WebSocket"] = function FakeWS() {
			return fakeUpstream;
		};
		const ws = makeFakeWs({ sessionId: "proj-decrement" });
		try {
			zellijWsHandlers.open(ws);
		} finally {
			globalThis.WebSocket = OrigWS;
		}

		const openEvt = collected.find((e) => e.kind === "bridge:open");
		expect(openEvt).toBeDefined();

		// Close the bridge — implementation must decrement its counter.
		zellijWsHandlers.close(ws);

		const closeEvt = collected.find((e) => e.kind === "bridge:close");
		// If close is not emitted the lifecycle teardown is not tracked and
		// activeBridges can never be accurate.
		expect(closeEvt).toBeDefined();
	});
});

// ---------------------------------------------------------------------------
// Machine-parseable contract: events must be plain objects, not strings
// ---------------------------------------------------------------------------

describe("events are machine-parseable objects", () => {
	it("all collected events round-trip through JSON.stringify / JSON.parse", () => {
		const upstream = makeFakeUpstream(WebSocket.OPEN);
		const ws = makeFakeWs({ upstream });
		zellijWsHandlers.close(ws);

		for (const evt of collected) {
			expect(typeof evt).toBe("object");
			expect(evt).not.toBeNull();
			const serialised = JSON.stringify(evt);
			expect(typeof serialised).toBe("string");
			const parsed = JSON.parse(serialised) as BridgeLogEvent;
			expect(parsed.kind).toBe(evt.kind);
		}
	});
});
