/**
 * Reports the state of every active spec: ready, blocked, or in-progress.
 * State is computed from the filesystem — never stored.
 */

import { isReady, listActiveSpecs, listArchivedIds, unresolvedDeps } from "./_lib";

function main(): void {
	const archived = listArchivedIds();
	const active = listActiveSpecs();

	if (active.length === 0) {
		console.log("no active specs.");
		return;
	}

	console.log("active specs:");
	for (const spec of active) {
		const blockers = unresolvedDeps(spec, archived);
		const state = isReady(spec, archived) ? "READY" : `BLOCKED-BY: ${blockers.join(", ")}`;
		console.log(
			`  [${state}] ${spec.frontmatter.id} — ${spec.frontmatter.title} (${spec.frontmatter.kind})`,
		);
	}
}

main();
