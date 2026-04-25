import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Context, Data, Effect, Layer } from "effect";
import { ConfigService } from "./config.ts";

export type SessionId = string;

export type Session = {
	id: SessionId;
	projectId: string;
	url: string;
	createdAt: number;
	status: "live" | "dead";
};

export class TerminalError extends Data.TaggedError("TerminalError")<{ message: string }> {}
export class TerminalNotFound extends Data.TaggedError("TerminalNotFound")<{ id: string }> {}

export interface TerminalSessions {
	readonly open: (projectId: string) => Effect.Effect<Session, TerminalError, never>;
	readonly close: (id: SessionId) => Effect.Effect<void, TerminalNotFound, never>;
	readonly list: () => Effect.Effect<Session[], never, never>;
	readonly get: (id: SessionId) => Effect.Effect<Session | null, never, never>;
	readonly health: (id: SessionId) => Effect.Effect<boolean, never, never>;
}

export const TerminalSessions = Context.GenericTag<TerminalSessions>("TerminalSessions");

export const makeTerminalSessionsLive = (): Layer.Layer<TerminalSessions, never, ConfigService> =>
	Layer.effect(
		TerminalSessions,
		Effect.gen(function* () {
			const cfg = yield* ConfigService;
			const config = yield* cfg.get();
			const registryPath = join(config.piRoot, "sessions.jsonl");
			const zellijWebUrl = config.zellijWebUrl;
			const registry = new Map<SessionId, Session>();

			yield* Effect.tryPromise(async () => {
				const data = await readFile(registryPath, "utf8");
				for (const line of data.trim().split("\n").filter(Boolean)) {
					const sess = JSON.parse(line) as Session;
					registry.set(sess.id, sess);
				}
			}).pipe(Effect.orElseSucceed(() => undefined));

			const persist = (sess: Session): Effect.Effect<void, never, never> =>
				Effect.tryPromise(async () => {
					await mkdir(join(registryPath, ".."), { recursive: true });
					await writeFile(registryPath, `${JSON.stringify(sess)}\n`, { flag: "a" });
				}).pipe(Effect.orElseSucceed(() => undefined));

			return {
				open: (projectId) =>
					Effect.gen(function* () {
						const id = projectId.replace(/[^a-zA-Z0-9_-]/g, "_");
						const existing = registry.get(id);
						if (existing?.status === "live") return existing;
						const url = `${zellijWebUrl}/${encodeURIComponent(id)}`;
						const sess: Session = {
							id,
							projectId,
							url,
							createdAt: Date.now(),
							status: "live",
						};
						registry.set(id, sess);
						yield* persist(sess);
						return sess;
					}),
				close: (id) =>
					Effect.gen(function* () {
						const sess = registry.get(id);
						if (!sess) return yield* Effect.fail(new TerminalNotFound({ id }));
						sess.status = "dead";
						registry.set(id, sess);
						yield* persist(sess);
					}),
				list: () =>
					Effect.succeed(Array.from(registry.values()).filter((s) => s.status === "live")),
				get: (id) => Effect.succeed(registry.get(id) ?? null),
				health: (id) => Effect.succeed(registry.get(id)?.status === "live" || false),
			};
		}),
	);

export const TerminalSessionsTest: Layer.Layer<TerminalSessions> = Layer.succeed(TerminalSessions, {
	open: (projectId) =>
		Effect.succeed({
			id: projectId.replace(/[^a-zA-Z0-9_-]/g, "_"),
			projectId,
			url: `mem://${projectId}`,
			createdAt: Date.now(),
			status: "live",
		}),
	close: () => Effect.void,
	list: () => Effect.succeed([]),
	get: () => Effect.succeed(null),
	health: () => Effect.succeed(false),
});
