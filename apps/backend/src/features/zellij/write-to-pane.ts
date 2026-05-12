/**
 * Shared helper for "write keystrokes to a specific zellij pane."
 *
 * `zellij action write-chars` targets the focused pane of the focused tab.
 * To target a specific pane (e.g. when restoring multiple Claude sessions
 * in the same zellij session, or when an orchestrator dispatches to a
 * specific pane in a multi-pane session), focus that pane first, then
 * write.
 *
 * Used by snapshot restore and (per orchestrator review) the multi-
 * orchestrator routing layer. Keeping it as one helper avoids drift
 * between call sites.
 */

export type SpawnExit = (cmd: readonly string[]) => Promise<{ exitCode: number }>;

export type WriteToPaneArgs = {
	readonly session: string;
	readonly paneId: string;
	readonly text: string;
	readonly spawn: SpawnExit;
};

export type WriteToPaneResult = {
	readonly focusedOk: boolean;
	readonly wroteOk: boolean;
};

/**
 * Focuses the given pane in the given session, then writes `text`. Returns
 * which step succeeded — the caller decides whether a partial failure is
 * recoverable (restore typically wants to abort and log; the orchestrator
 * router may want to retry).
 *
 * Never throws on a non-zero exit code from zellij — returns the flags
 * instead. Callers that need to throw can inspect the result.
 */
export async function writeToPane(args: WriteToPaneArgs): Promise<WriteToPaneResult> {
	const focusExit = await args.spawn([
		"zellij",
		"--session",
		args.session,
		"action",
		"focus-pane-id",
		args.paneId,
	]);
	const focusedOk = focusExit.exitCode === 0;
	if (!focusedOk) {
		return { focusedOk: false, wroteOk: false };
	}

	const writeExit = await args.spawn([
		"zellij",
		"--session",
		args.session,
		"action",
		"write-chars",
		args.text,
	]);
	return { focusedOk: true, wroteOk: writeExit.exitCode === 0 };
}
