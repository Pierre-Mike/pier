import { Effect } from "effect";
import type { DispatchConfig } from "./dispatcher.ts";
import { make_engine } from "./engine.ts";
import { make_gh_cli } from "./gh-cli.ts";
import { make_prompt_for } from "./prompt.ts";
import type { WorkerId } from "./state.ts";
import { make_store } from "./store.ts";
import { default_config as default_worktree_cfg } from "./worktree.ts";

const cfg: DispatchConfig = {
	backend: process.env["PIER_ORCH_BACKEND"] === "cloud" ? "cloud" : "local",
	poll_interval_ms: Number(process.env["PIER_ORCH_POLL_MS"] ?? 60_000),
	max_concurrent: Number(process.env["PIER_ORCH_MAX_CONCURRENT"] ?? 4),
	stall_timeout_ms: Number(process.env["PIER_ORCH_STALL_MS"] ?? 600_000),
};

const SNAPSHOT_PATH = process.env["PIER_ORCH_SNAPSHOT"] ?? ".claude/orchestrator/state.json";

const self_worker = (process.env["PIER_WORKER_ID"] ?? crypto.randomUUID()) as WorkerId;

const program = Effect.gen(function* () {
	const store = yield* make_store(SNAPSHOT_PATH);
	const gh = make_gh_cli(self_worker);
	const worktree_cfg = default_worktree_cfg(process.cwd());
	const prompt_for = make_prompt_for(gh);
	const engine = make_engine({ store, gh, cfg, self_worker, worktree_cfg, prompt_for });

	yield* Effect.log(`orchestrator up backend=${cfg.backend} worker=${self_worker}`);
	while (true) {
		yield* engine.poll.pipe(Effect.catchAllCause((c) => Effect.log(`poll error: ${c}`)));
		yield* Effect.sleep(`${cfg.poll_interval_ms} millis`);
	}
});

if (import.meta.main) {
	Effect.runPromise(program as Effect.Effect<never>).catch((e) => {
		console.error(e);
		process.exit(1);
	});
}
