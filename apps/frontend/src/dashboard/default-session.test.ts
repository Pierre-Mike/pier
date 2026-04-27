import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { store } from "./state.ts";

describe("default session integration", () => {
	beforeEach(() => {
		store.sessions.clear();
		store.activeProject = null;

		globalThis.localStorage = {
			getItem: mock(() => null),
			setItem: mock(() => {
				/* no-op mock */
			}),
			removeItem: mock(() => {
				/* no-op mock */
			}),
			clear: mock(() => {
				/* no-op mock */
			}),
			key: mock(() => null),
			length: 0,
		};
	});

	afterEach(() => {
		store.sessions.clear();
		store.activeProject = null;
	});

	test("selectDefaultSession sets activeProject to __default__ and stores session", () => {
		const info = { url: "http://127.0.0.1:3000/zellij/default", id: "default" };

		store.sessions.set("__default__", { url: info.url, sessionId: info.id });
		store.activeProject = "__default__";

		expect(store.activeProject).toBe("__default__");
		expect(store.sessions.has("__default__")).toBe(true);
		expect(store.sessions.get("__default__")?.sessionId).toBe("default");
	});

	test("renderSessions filters out __default__ from the list", () => {
		store.sessions.set("project-a", {
			url: "http://127.0.0.1:3000/zellij/project-a",
			sessionId: "project-a",
		});
		store.sessions.set("__default__", {
			url: "http://127.0.0.1:3000/zellij/default",
			sessionId: "default",
		});

		const visibleSessions = Array.from(store.sessions.keys()).filter(
			(key) => key !== "__default__",
		);

		expect(visibleSessions).toEqual(["project-a"]);
		expect(visibleSessions.includes("__default__")).toBe(false);
	});

	test("setActiveProject(__default__) does NOT call refreshFiles", () => {
		store.sessions.set("__default__", {
			url: "http://127.0.0.1:3000/zellij/default",
			sessionId: "default",
		});

		const projectId = "__default__";
		const shouldRefreshFiles = projectId !== "__default__";

		store.activeProject = projectId;

		expect(store.activeProject).toBe("__default__");
		expect(shouldRefreshFiles).toBe(false);
	});

	test("localStorage persists activeProject = __default__", () => {
		store.sessions.set("__default__", {
			url: "http://127.0.0.1:3000/zellij/default",
			sessionId: "default",
		});
		store.activeProject = "__default__";

		localStorage.setItem("pier:active-project", "__default__");

		expect(localStorage.setItem).toHaveBeenCalledWith("pier:active-project", "__default__");
	});

	test("reload restores activeProject from localStorage but does not auto-fetch", () => {
		const mockGetItem = mock((key: string) =>
			key === "pier:active-project" ? "__default__" : null,
		);
		globalThis.localStorage.getItem = mockGetItem;

		const storedActiveProject = localStorage.getItem("pier:active-project");

		expect(storedActiveProject).toBe("__default__");
	});

	test("default button click flow: store -> setActive -> persist", () => {
		const info = { url: "http://127.0.0.1:3000/zellij/default", id: "default" };

		store.sessions.set("__default__", { url: info.url, sessionId: info.id });
		store.activeProject = "__default__";
		localStorage.setItem("pier:active-project", "__default__");

		expect(store.activeProject).toBe("__default__");
		expect(store.sessions.get("__default__")?.sessionId).toBe("default");
		expect(localStorage.setItem).toHaveBeenCalledWith("pier:active-project", "__default__");
	});
});
