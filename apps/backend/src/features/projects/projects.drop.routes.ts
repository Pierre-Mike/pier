import { Effect, Layer } from "effect";
import type { Context } from "hono";
import { Hono } from "hono";
import { ConfigTest, defaultConfigLayer } from "../../platform/config.repo.ts";
import { type AppBindings, defineRoute } from "../../platform/effect-handler.ts";
import type { RouteModule } from "../../platform/route-types.ts";
import {
	makeTerminalSessionsLive,
	TerminalSessions,
	TerminalSessionsTest,
} from "../sessions/sessions.repo.ts";
import { makeRepoServiceLive, makeRepoServiceTest, RepoService } from "./projects.files.repo.ts";

const shellQuote = (s: string): string => {
	if (/^[A-Za-z0-9_\-./~]+$/.test(s)) return s;
	return `'${s.replace(/'/g, "'\\''")}'`;
};

export const dropHandler = (
	c: Context<{ Bindings: AppBindings }>,
): Effect.Effect<Response, never, RepoService | TerminalSessions> =>
	Effect.gen(function* () {
		const idRaw = c.req.param("id");
		const id = idRaw ?? "";
		let bodyRaw: Record<string, unknown>;
		try {
			bodyRaw = (yield* Effect.promise(() => c.req.parseBody({ all: true }))) as Record<
				string,
				unknown
			>;
		} catch {
			return c.json({ error: "bad form body" }, 400);
		}
		const raw = bodyRaw["files"] ?? bodyRaw["file"] ?? [];
		const files = (Array.isArray(raw) ? raw : [raw]).filter((x): x is File => x instanceof File);
		if (files.length === 0) return c.json({ error: "no files" }, 400);
		const repo = yield* RepoService;
		const result = yield* repo.saveDropped({ projectId: id, files });
		const text = `${result.map((f) => shellQuote(f.path)).join(" ")} `;
		const terminal = yield* TerminalSessions;
		const { injected } = yield* terminal.writeChars({ projectId: id, text });
		return c.json({ files: result, injected }, 200);
	}).pipe(
		Effect.catchAll((err) =>
			Effect.succeed(
				c.json(
					{
						error:
							typeof err === "object" &&
							err !== null &&
							"message" in err &&
							typeof err.message === "string"
								? err.message
								: "save failed",
					},
					400,
				),
			),
		),
	);

const makeDeps = () =>
	Layer.mergeAll(
		Layer.provide(makeRepoServiceLive(), defaultConfigLayer),
		Layer.provide(makeTerminalSessionsLive(), defaultConfigLayer),
	);

const app = new Hono<{ Bindings: AppBindings }>().post(
	"/api/projects/:id/drop",
	defineRoute({ deps: makeDeps, handler: dropHandler }),
);

const testDeps = Layer.merge(
	Layer.provide(makeRepoServiceTest(new Map()), ConfigTest),
	TerminalSessionsTest,
);

const testApp = new Hono<{ Bindings: AppBindings }>().post(
	"/api/projects/:id/drop",
	defineRoute({ deps: testDeps, handler: dropHandler }),
);

export const projectsDropRoute = { app, testApp } satisfies RouteModule<typeof app>;
