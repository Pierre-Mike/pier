/**
 * Gate for kind:workflow — runs the smoke script(s) pointed at by `gate:`.
 */

export async function checkWorkflow(paths: string[]): Promise<{ pass: boolean; message: string }> {
	for (const path of paths) {
		const proc = Bun.spawn(["bun", path], { stdout: "inherit", stderr: "inherit" });
		const exitCode = await proc.exited;
		if (exitCode !== 0) {
			return { pass: false, message: `workflow smoke failed: ${path}` };
		}
	}
	return { pass: true, message: `${paths.length} workflow smoke(s) pass` };
}
