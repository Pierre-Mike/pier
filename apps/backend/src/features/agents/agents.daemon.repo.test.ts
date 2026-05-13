import { describe, expect, test } from "bun:test";
import { Effect } from "effect";
import rosterFixture from "./__fixtures__/roster.fixture.json";
import stateCompleted from "./__fixtures__/state-completed.fixture.json";
import stateNeedsInput from "./__fixtures__/state-needs-input.fixture.json";
import stateWorking from "./__fixtures__/state-working.fixture.json";
import { AgentDaemon, makeAgentDaemonTest } from "./agents.daemon.repo.ts";

describe("AgentDaemon (test layer)", () => {
	test("listAgents returns DaemonAbsent when rosterJson is null", async () => {
		const layer = makeAgentDaemonTest({ rosterJson: null, stateByShortId: {} });
		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const svc = yield* AgentDaemon;
				return yield* svc.listAgents();
			}).pipe(Effect.provide(layer)),
		);
		expect(result).toEqual({ _tag: "DaemonAbsent" });
	});

	test("listAgents returns 3 rows from fixture data", async () => {
		const layer = makeAgentDaemonTest({
			rosterJson: rosterFixture,
			stateByShortId: {
				abcd0001: stateWorking,
				abcd0002: stateNeedsInput,
				abcd0003: stateCompleted,
			},
		});
		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const svc = yield* AgentDaemon;
				return yield* svc.listAgents();
			}).pipe(Effect.provide(layer)),
		);
		expect(Array.isArray(result)).toBe(true);
		if (!Array.isArray(result)) return;
		expect(result).toHaveLength(3);
	});

	test("readRoster returns null when rosterJson is null", async () => {
		const layer = makeAgentDaemonTest({ rosterJson: null, stateByShortId: {} });
		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const svc = yield* AgentDaemon;
				return yield* svc.readRoster();
			}).pipe(Effect.provide(layer)),
		);
		expect(result).toBeNull();
	});

	test("readState returns null for unknown shortId", async () => {
		const layer = makeAgentDaemonTest({ rosterJson: rosterFixture, stateByShortId: {} });
		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const svc = yield* AgentDaemon;
				return yield* svc.readState("unknown-id");
			}).pipe(Effect.provide(layer)),
		);
		expect(result).toBeNull();
	});
});
