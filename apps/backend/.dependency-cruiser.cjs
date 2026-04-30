/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
	forbidden: [
		{
			name: "core-tier-is-pure",
			comment:
				"*.core.ts within a feature must not import siblings' repo/routes/migration tiers, " +
				"and must not import platform infra adapters. Pure functions only.",
			severity: "error",
			from: { path: "src/features/[^/]+/[^/]+\\.core\\.ts$" },
			to: {
				path: "src/(features/[^/]+/[^/]+\\.(repo|routes|migration|fixture)\\.ts$|platform/(effect-handler|bindings|sandbox-app|security|cloudflared|sse-bus))",
			},
		},
		{
			name: "no-cross-feature-imports",
			comment:
				"Features must not import each other directly. Compose at api.ts or share via platform/. " +
				"Cross-cutting services (e.g. ConfigService, sse-bus, cloudflared) live in platform/, not in a feature.",
			severity: "error",
			from: { path: "^src/features/([^/]+)/" },
			// Known couplings allow-listed (tracked for follow-up refactor):
			//   1. projects/projects.drop.routes.ts → sessions/sessions.repo.ts
			//      (drop writes the dropped path into the user's open terminal session)
			//   2. projects/projects.blob.routes.ts → artifacts/artifacts.blob-server.repo.ts
			//      (project file viewer reuses the artifact blob server)
			//   3. settings/settings.routes.ts → zellij/zellij.auth.repo.ts
			//      (settings exposes the read-only zellij watcher token via Effect Layer DI)
			//   4. zellij/zellij.auth.repo.ts → sessions/sessions.repo.ts
			//      (zellij CLI is invoked with ZELLIJ_SOCKET_DIR — owned by sessions)
			to: {
				path: "^src/features/(?!$1/)[^/]+/",
				pathNot:
					"^src/features/sessions/sessions\\.repo\\.ts$|^src/features/artifacts/artifacts\\.blob-server\\.repo\\.ts$|^src/features/zellij/zellij\\.auth\\.repo\\.ts$",
			},
		},
		{
			name: "platform-has-no-feature-deps",
			comment:
				"platform/ is feature-agnostic infrastructure — never imports features/. " +
				"Type-only imports are still imports here; if platform truly needs a shared type, " +
				"promote the type into platform/. " +
				"Carve-out: platform/sse-bus.ts publishes ArtifactKind + PiEvent — data-shape " +
				"types that legitimately live with their producers in *.core.ts. A future " +
				"refactor may extract platform/event-types.ts; until then the bus stays single-file.",
			severity: "error",
			from: { path: "src/platform/", pathNot: "src/platform/sse-bus\\.ts$" },
			to: { path: "src/features/" },
		},
		{
			name: "fixtures-only-from-tests",
			comment: "*.fixture.ts is for tests only; production code must not import it.",
			severity: "error",
			from: { path: "src/.+\\.fixture\\.ts$", pathNot: "\\.test\\.ts$" },
			to: { path: "src/" },
		},
		{
			name: "effect-handler-stays-pure-glue",
			comment:
				"platform/effect-handler.ts is the Effect runtime adapter. " +
				"It must not import features or feature-specific repos.",
			severity: "error",
			from: { path: "src/platform/effect-handler\\.ts$" },
			to: { path: "src/features/" },
		},
	],
	options: {
		doNotFollow: { path: "node_modules" },
		tsPreCompilationDeps: true,
		enhancedResolveOptions: {
			extensions: [".ts", ".tsx", ".js", ".jsx"],
		},
	},
};
