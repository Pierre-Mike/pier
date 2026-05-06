import { Effect, Layer } from "effect";
import { ClaimContended, type GhAdapter, GhAdapterTag, GhError, NotFound } from "./gh-adapter.ts";
import {
	IN_PROGRESS_LABEL,
	type IssueId,
	type IssueRef,
	type Outcome,
	type WorkerId,
	worker_label,
} from "./state.ts";

interface GhIssueJson {
	readonly number: number;
	readonly title: string;
	readonly state: string;
	readonly labels: ReadonlyArray<{ readonly name: string }>;
}

const ALL_ROUTING = ["auto:local", "auto:cloud"] as const;

const run = (args: ReadonlyArray<string>) =>
	Effect.gen(function* () {
		const proc = Bun.spawn(["gh", ...args], { stdout: "pipe", stderr: "pipe" });
		const [exit, stdout, stderr] = yield* Effect.tryPromise({
			try: () =>
				Promise.all([
					proc.exited,
					new Response(proc.stdout).text(),
					new Response(proc.stderr).text(),
				]),
			catch: (e) => new GhError(args.join(" "), String(e)),
		});
		if (exit !== 0) {
			if (/Could not resolve|HTTP 404|not found/i.test(stderr)) {
				return yield* Effect.fail(new GhError(args.join(" "), `__NOT_FOUND__: ${stderr}`));
			}
			return yield* Effect.fail(new GhError(args.join(" "), stderr));
		}
		return stdout;
	});

const parse_issue = (j: GhIssueJson): IssueRef => ({
	id: String(j.number) as IssueId,
	identifier: `#${j.number}`,
	title: j.title,
	state: j.state.toUpperCase() === "OPEN" ? "open" : "closed",
	labels: new Set(j.labels.map((l) => l.name)),
});

const fetch_candidates: GhAdapter["fetch_candidates"] = (filter) =>
	Effect.gen(function* () {
		const stdout = yield* run([
			"issue",
			"list",
			"--label",
			"aligned",
			"--label",
			filter.routing,
			"--state",
			"open",
			"--json",
			"number,title,state,labels",
			"--limit",
			"100",
		]);
		const parsed = yield* Effect.try({
			try: () => JSON.parse(stdout) as ReadonlyArray<GhIssueJson>,
			catch: (e) => new GhError("issue list (parse)", String(e)),
		});
		return parsed.map(parse_issue);
	});

const view: GhAdapter["view"] = (issue) =>
	Effect.gen(function* () {
		const stdout = yield* run(["issue", "view", issue, "--json", "number,title,state,labels"]).pipe(
			Effect.mapError((e): GhError | NotFound =>
				e.stderr.startsWith("__NOT_FOUND__") ? new NotFound(issue) : e,
			),
		);
		const j = yield* Effect.try({
			try: () => JSON.parse(stdout) as GhIssueJson,
			catch: (e) => new GhError("issue view (parse)", String(e)),
		});
		return parse_issue(j);
	});

const fetch_body: GhAdapter["fetch_body"] = (issue) =>
	Effect.gen(function* () {
		const stdout = yield* run(["issue", "view", issue, "--json", "body"]).pipe(
			Effect.mapError((e): GhError | NotFound =>
				e.stderr.startsWith("__NOT_FOUND__") ? new NotFound(issue) : e,
			),
		);
		const j = yield* Effect.try({
			try: () => JSON.parse(stdout) as { body: string },
			catch: (e) => new GhError("issue view body (parse)", String(e)),
		});
		return j.body;
	});

const find_pr_by_branch: GhAdapter["find_pr_by_branch"] = (branch) =>
	Effect.gen(function* () {
		const stdout = yield* run([
			"pr",
			"list",
			"--head",
			branch,
			"--state",
			"all",
			"--json",
			"number,state,mergedAt",
			"--limit",
			"1",
		]);
		const arr = yield* Effect.try({
			try: () =>
				JSON.parse(stdout) as ReadonlyArray<{
					number: number;
					state: string;
					mergedAt: string | null;
				}>,
			catch: (e) => new GhError("pr list (parse)", String(e)),
		});
		const first = arr[0];
		if (!first) return null;
		const upper = first.state.toUpperCase();
		const state: "OPEN" | "MERGED" | "CLOSED" =
			upper === "MERGED" ? "MERGED" : upper === "OPEN" ? "OPEN" : "CLOSED";
		return {
			number: first.number,
			state,
			merged: state === "MERGED" || first.mergedAt !== null,
		};
	});

const remove_routing_labels = (issue: IssueId) =>
	Effect.forEach(
		ALL_ROUTING,
		(label) => run(["issue", "edit", issue, "--remove-label", label]).pipe(Effect.ignore),
		{ concurrency: 1 },
	);

const claim: GhAdapter["claim"] = (issue, worker) =>
	Effect.gen(function* () {
		yield* run([
			"issue",
			"edit",
			issue,
			"--add-label",
			IN_PROGRESS_LABEL,
			"--add-label",
			worker_label(worker),
		]);
		yield* remove_routing_labels(issue);
		const fresh = yield* view(issue).pipe(
			Effect.catchTag("NotFound", () => Effect.fail(new ClaimContended(issue))),
		);
		const ours = worker_label(worker);
		const others = [...fresh.labels].filter((l) => l.startsWith("worker:") && l !== ours);
		if (others.length > 0) {
			const winner = [ours, ...others].sort()[0] ?? ours;
			if (winner !== ours) {
				yield* run(["issue", "edit", issue, "--remove-label", ours]).pipe(Effect.ignore);
				return yield* Effect.fail(new ClaimContended(issue));
			}
			yield* Effect.forEach(
				others,
				(o) => run(["issue", "edit", issue, "--remove-label", o]).pipe(Effect.ignore),
				{ concurrency: 1 },
			);
		}
	});

const release =
	(self_worker: WorkerId): GhAdapter["release"] =>
	(issue, outcome) =>
		Effect.gen(function* () {
			const removes: string[] = [
				"--remove-label",
				IN_PROGRESS_LABEL,
				"--remove-label",
				worker_label(self_worker),
			];
			const adds: string[] = outcome ? ["--add-label", outcome satisfies Outcome] : [];
			yield* run(["issue", "edit", issue, ...removes, ...adds]);
		});

const comment: GhAdapter["comment"] = (issue, body) =>
	run(["issue", "comment", issue, "--body", body]).pipe(Effect.asVoid);

const close: GhAdapter["close"] = (issue) => run(["issue", "close", issue]).pipe(Effect.asVoid);

const set_slice_label: GhAdapter["set_slice_label"] = (req) => {
	const args = ["issue", "edit", req.issue, "--add-label", `slice:${req.slice_id}:${req.to}`];
	if (req.from) {
		args.push("--remove-label", `slice:${req.slice_id}:${req.from}`);
	}
	return run(args).pipe(Effect.asVoid);
};

export const make_gh_cli = (self_worker: WorkerId): GhAdapter => ({
	fetch_candidates,
	claim,
	release: release(self_worker),
	view,
	fetch_body,
	find_pr_by_branch,
	comment,
	close,
	set_slice_label,
});

export const GhCliLive = (self_worker: WorkerId) =>
	Layer.succeed(GhAdapterTag, make_gh_cli(self_worker));
