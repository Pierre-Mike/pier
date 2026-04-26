/**
 * Gate for kind:code — runs the test file(s) pointed at by `gate:`.
 */

export async function checkCode(paths: string[]): Promise<{ pass: boolean; message: string }> {
	const proc = Bun.spawn(["bun", "test", ...paths], {
		stdout: "inherit",
		stderr: "inherit",
	});
	const exitCode = await proc.exited;
	return {
		pass: exitCode === 0,
		message:
			exitCode === 0
				? `tests pass (${paths.length} file(s))`
				: `tests failed (${paths.join(", ")})`,
	};
}
