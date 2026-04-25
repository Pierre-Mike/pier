/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
	forbidden: [
		{
			name: "no-effect-handler-to-core-or-infra",
			comment:
				"shell/effect-handler.ts is pure infrastructure glue (Effect runtime adapter). " +
				"It must not import business logic from core/ or I/O adapters from infra/. " +
				"Violation: a PR adding `import ... from '../core/...'` inside effect-handler.ts fails CI.",
			severity: "error",
			from: { path: "src/backend/shell/effect-handler\\.ts$" },
			to: { path: "src/backend/(core|infra)/" },
		},
		{
			name: "no-core-to-shell-or-infra",
			comment:
				"core/ contains pure business logic with no side effects. " +
				"It must not depend on shell/ orchestrators or infra/ I/O adapters. " +
				"Violation: a PR adding `import ... from '../infra/...'` inside core/ fails CI.",
			severity: "error",
			from: { path: "src/backend/core/" },
			to: { path: "src/backend/(shell|infra)/" },
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
