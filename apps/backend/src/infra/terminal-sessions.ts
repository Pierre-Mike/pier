import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Context, Data, Effect, Layer } from "effect";
import { ConfigService } from "./config.ts";
import { ProjectsService } from "./projects.ts";

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

export interface ZellijSpawnService {
	readonly spawn: (args: string[], opts: { cwd: string }) => Effect.Effect<void, never, never>;
}

export const ZellijSpawn = Context.GenericTag<ZellijSpawnService>("ZellijSpawn");

export const makeTerminalSessionsLive = (): Layer.Layer<
	TerminalSessions,
	never,
	ProjectsService | ZellijSpawnService
> =>
	Layer.effect(
		TerminalSessions,
		Effect.gen(function* () {
			const maybeCfg = yield* Effect.serviceOption(ConfigService);
			const registry = new Map<SessionId, Session>();
			const projects = yield* ProjectsService;
			const zellijSpawn = yield* ZellijSpawn;

			// Config is only needed for registry persistence and proxy URL.
			// When absent (e.g. in tests), skip persistence and use a placeholder URL.
			let registryPath: string | null = null;
			let proxyBase: string = "http://127.0.0.1:8081/zellij";

			if (maybeCfg._tag === "Some") {
				const config = yield* maybeCfg.value.get();
				registryPath = join(config.piRoot, "sessions.jsonl");
				proxyBase = `http://127.0.0.1:${config.appPort}/zellij`;
			}

			if (registryPath !== null) {
				const rp = registryPath;
				yield* Effect.tryPromise(async () => {
					const data = await readFile(rp, "utf8");
					for (const line of data.trim().split("\n").filter(Boolean)) {
						const sess = JSON.parse(line) as Session;
						// Recompute URL on load — older entries may point at the now-bypassed
						// zellij web URL, but the URL is derived from id and the proxy base.
						sess.url = `${proxyBase}/${encodeURIComponent(sess.id)}`;
						registry.set(sess.id, sess);
					}
				}).pipe(Effect.orElseSucceed(() => undefined));
			}

			const persist = (sess: Session): Effect.Effect<void, never, never> => {
				if (registryPath === null) return Effect.void;
				const rp = registryPath;
				return Effect.tryPromise(async () => {
					await mkdir(join(rp, ".."), { recursive: true });
					await writeFile(rp, `${JSON.stringify(sess)}\n`, { flag: "a" });
				}).pipe(Effect.orElseSucceed(() => undefined));
			};

			return {
				open: (projectId) =>
					Effect.gen(function* () {
						// Sanitize for zellij (alnum/underscore/dash) and clamp to 20
						// chars: zellij rejects session names beyond ~22 chars.
						const id = projectId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 20);
						const existing = registry.get(id);
						if (existing?.status === "live") return existing;

						// Resolve project path from ProjectsService.
						const allProjects = yield* projects.list();
						const project = allProjects.find((p) => p.id === projectId);
						if (!project) {
							return yield* Effect.fail(
								new TerminalError({ message: `Project not found: ${projectId}` }),
							);
						}

						// Spawn a named zellij session with the project's path as cwd.
						yield* zellijSpawn.spawn(["zellij", "--session", id], { cwd: project.path });

						const url = `${proxyBase}/${encodeURIComponent(id)}`;
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
			id: projectId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 20),
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

export const makeZellijSpawnLive = (): Layer.Layer<ZellijSpawnService> =>
	Layer.succeed(ZellijSpawn, {
		spawn: (args, opts) =>
			Effect.promise(async () => {
				// zellij is a TUI and panics without a real PTY. Use Bun's terminal
				// option to give it one, wait for the session to register, then
				// send the default detach hotkey (Ctrl+O d) so the named session
				// persists in the zellij server after our PTY closes.
				const proc = Bun.spawn(args, {
					cwd: opts.cwd,
					terminal: {
						cols: 80,
						rows: 24,
						data: () => {
							// Discard zellij's PTY output — we only spawn to register the session.
						},
					},
				});
				await new Promise((r) => setTimeout(r, 1500));
				proc.terminal?.write("\x0f");
				await new Promise((r) => setTimeout(r, 100));
				proc.terminal?.write("d");
				await new Promise((r) => setTimeout(r, 300));
				proc.terminal?.close();
				await proc.exited;
			}),
	});
