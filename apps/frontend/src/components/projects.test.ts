/**
 * spec 036: Show session-alive dot on closed project rows
 *
 * Unit gate — source-text assertions on projects.ts.
 * Tests that renderProjects reads store.aliveSessions and conditionally
 * renders session-alive-dot on closed project rows.
 *
 * RED: these tests fail until the implementer adds aliveSessions to the store
 * and updates renderProjects to use it.
 */
import { describe, expect, test } from "bun:test";

// ---------------------------------------------------------------------------
// Source text (read once; used for scoped substring assertions)
// ---------------------------------------------------------------------------
const projectsSource = await Bun.file(new URL("../dashboard/projects.ts", import.meta.url)).text();

// ---------------------------------------------------------------------------
// Helper: extract a named function body without assuming `export function`
// shape. Same extractor used in dashboard/projects.test.ts for consistency.
// ---------------------------------------------------------------------------
function extractFunctionBody(source: string, name: string): string {
	const pattern = new RegExp(
		`(?:function\\s+${name}\\s*\\(|\\b${name}\\s*=\\s*(?:async\\s*)?(?:\\([^)]*\\)|[a-zA-Z_$][\\w$]*)\\s*=>)[^{]*\\{([\\s\\S]*?)(?=\\n(?:export\\s+)?(?:function|async\\s+function|const)\\s|$)`,
	);
	return pattern.exec(source)?.[1] ?? "";
}

const renderProjectsBody = extractFunctionBody(projectsSource, "renderProjects");

// ---------------------------------------------------------------------------
// spec 036: session-alive dot on closed project rows
// ---------------------------------------------------------------------------

describe("spec 037 — renderProjects: session-alive dot on closed rows", () => {
	// AC 5: renderProjects reads store.aliveSessions
	test("renderProjects body references aliveSessions from store", () => {
		// RED: renderProjects does not yet read aliveSessions.
		expect(renderProjectsBody).toContain("aliveSessions");
	});

	// AC 1 + AC 5: renderProjects conditionally renders session-alive-dot
	test("renderProjects body contains session-alive-dot class reference", () => {
		// RED: renderProjects does not yet render session-alive-dot.
		expect(renderProjectsBody).toContain("session-alive-dot");
	});

	// AC 1: The dot must be inside a DOM construction context (innerHTML or createElement),
	// not just a comment.
	test("renderProjects uses session-alive-dot as a string token in DOM construction", () => {
		// RED: no innerHTML / className reference to session-alive-dot in renderProjects.
		const hasInTemplate =
			renderProjectsBody.includes('"session-alive-dot"') ||
			renderProjectsBody.includes("'session-alive-dot'") ||
			renderProjectsBody.includes("`session-alive-dot`");
		expect(hasInTemplate).toBe(true);
	});

	// AC 5: The dot is conditional — renderProjects must gate it on aliveSessions.
	// A correct implementation will have both tokens close together in the body.
	test("renderProjects session-alive-dot is gated on aliveSessions (proximity check)", () => {
		// RED: neither token exists yet in renderProjects, so this will fail on the first assert.
		const dotIdx = renderProjectsBody.indexOf("session-alive-dot");
		const aliveIdx = renderProjectsBody.indexOf("aliveSessions");
		expect(dotIdx).toBeGreaterThanOrEqual(0);
		expect(aliveIdx).toBeGreaterThanOrEqual(0);
		// Both tokens must appear within 400 chars of each other (same conditional block).
		expect(Math.abs(dotIdx - aliveIdx)).toBeLessThan(400);
	});

	// AC 2: The dot must NOT appear unconditionally — there must be a conditional around it.
	// We check that the body contains a conditional pattern (ternary or if) near the dot.
	test("renderProjects session-alive-dot is inside a conditional expression, not rendered unconditionally", () => {
		// RED: the dot doesn't exist yet at all; this test asserts the shape once it does.
		// We verify by checking for a ternary `?` or `if` near the session-alive-dot token.
		// Accept either ternary (? ... :) or if-block conditional form.
		const dotIdx = renderProjectsBody.indexOf("session-alive-dot");
		expect(dotIdx).toBeGreaterThanOrEqual(0);
		const surrounding = renderProjectsBody.slice(Math.max(0, dotIdx - 200), dotIdx + 200);
		const hasTernary = surrounding.includes("?");
		const hasIfBlock = surrounding.includes("if (") || surrounding.includes("if(");
		expect(hasTernary || hasIfBlock).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// spec 036: DashboardState must declare aliveSessions
// ---------------------------------------------------------------------------

describe("spec 037 — DashboardState.aliveSessions type declaration", () => {
	test("types.ts declares aliveSessions in DashboardState", async () => {
		// RED: DashboardState does not yet have aliveSessions.
		const typesSource = await Bun.file(new URL("../dashboard/types.ts", import.meta.url)).text();
		expect(typesSource).toContain("aliveSessions");
	});

	test("state.ts initialises aliveSessions in the store", async () => {
		// RED: state.ts does not yet initialise aliveSessions.
		const stateSource = await Bun.file(new URL("../dashboard/state.ts", import.meta.url)).text();
		expect(stateSource).toContain("aliveSessions");
	});
});

// ---------------------------------------------------------------------------
// spec 036: refreshProjects must populate aliveSessions
// ---------------------------------------------------------------------------

describe("spec 037 — refreshProjects populates aliveSessions", () => {
	test("refreshProjects body references aliveSessions", () => {
		// RED: refreshProjects does not yet touch aliveSessions.
		const refreshProjectsBody = extractFunctionBody(projectsSource, "refreshProjects");
		expect(refreshProjectsBody).toContain("aliveSessions");
	});

	test("refreshProjects body fetches sessions from the backend", () => {
		// RED: refreshProjects does not yet fetch sessions.
		// Accept either api.api.sessions (Hono RPC) or a direct fetch to /api/sessions.
		const refreshProjectsBody = extractFunctionBody(projectsSource, "refreshProjects");
		const fetchesSessions =
			refreshProjectsBody.includes("sessions") && refreshProjectsBody.includes("api");
		expect(fetchesSessions).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// Regression guards: existing exports and behaviors must remain intact
// ---------------------------------------------------------------------------

describe("spec 037 — regression guards", () => {
	test("filteredProjects is still exported from projects.ts", () => {
		// Regression: filteredProjects must remain exported (spec 022 depends on it).
		expect(projectsSource).toContain("export function filteredProjects");
	});

	test("renderSessions still contains session-alive-dot (spec 035 regression)", () => {
		// Regression: spec 035's dot must not be accidentally removed by this change.
		const renderSessionsBody = extractFunctionBody(projectsSource, "renderSessions");
		expect(renderSessionsBody).toContain("session-alive-dot");
	});

	test("renderSessions session-alive-dot is still gated on sessionId (spec 035 regression)", () => {
		const renderSessionsBody = extractFunctionBody(projectsSource, "renderSessions");
		expect(renderSessionsBody).toContain("sessionId");
	});
});
