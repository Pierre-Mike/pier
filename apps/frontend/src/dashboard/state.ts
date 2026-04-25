/**
 * Dashboard state initialization
 */
import { createStore } from "./store";
import type { DashboardState } from "./types";

export const store = createStore<DashboardState>(
	{
		projects: [],
		activeProject: null,
		projectFilter: "",
		projectHighlight: 0,
		sessions: new Map(),
		files: [],
		activeFilePath: null,
		fileFilter: "",
		expandedDirs: new Set(),
		projectsWithEvents: new Set(),
		logs: [],
		logsHistory: [],
		logsHistoryScope: null,
		logsHistoryLoading: false,
		logsMax: 4000,
		logsFilter: "",
		logsProject: "",
		logsSession: "",
		logsTab: "all",
		logsFollow: true,
		logsOpen: false,
		logsHasNew: false,
		logsExpanded: new Set(),
		toolUseMap: new Map(),
	},
	{
		validators: {
			activeProject: (val: unknown) => {
				const v = val as string | null;
				if (v !== null && !store.sessions.has(v)) {
					throw new Error(`activeProject ${v} not in sessions`);
				}
			},
		},
		// biome-ignore lint/suspicious/noConsole: Error logging
		onError: (err: Error) => console.error("Store invariant violation:", err),
	},
);
